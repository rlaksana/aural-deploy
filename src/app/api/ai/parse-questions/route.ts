import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { resolveGeneratorModel, streamGeneratorWithFallback } from "@/lib/ai/generator-run";
import { parseQuestionsRequestSchema, parseQuestionsResponseSchema } from "@/lib/ai/parse-questions-schema";
import { checkAiRateLimit } from "@/lib/api-rate-limit-ai";
import { getPromptLanguageName } from "@/lib/ai/language-name";

const log = createLogger("api/ai/parse-questions");

function parseJsonSafe(raw: string): unknown {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI response as JSON");
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    let repaired = jsonMatch[0].replace(/,\s*$/, "");
    const opens = (repaired.match(/\[/g) || []).length - (repaired.match(/\]/g) || []).length;
    const braces = (repaired.match(/\{/g) || []).length - (repaired.match(/\}/g) || []).length;
    for (let i = 0; i < opens; i++) repaired += "]";
    for (let i = 0; i < braces; i++) repaired += "}";
    return JSON.parse(repaired);
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const rateLimited = checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const rawBody: unknown = await req.json().catch(() => null);
  const parsedBody = parseQuestionsRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsedBody.error.flatten() }),
      { status: 400 },
    );
  }

  const { text, language } = parsedBody.data;
  const targetLanguage = getPromptLanguageName(language) || "the original language of the text";

  const messages = [
    {
      role: "system" as const,
      content: `You are an expert document parser specializing in extracting interview questions from unformatted or structured text (Gists, PDFs, job specs, list of questions, interview scripts, Markdown notes).

TASK:
Extract all interview questions from the user's raw text.
For each question:
1. Extract the exact question prompt ("text").
2. Determine question type: "OPEN_ENDED", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "CODING", "WHITEBOARD", or "RESEARCH".
3. Extract any choice options if present (Options: A, B, C, D) as an array of option strings under "options.options".
4. Extract helper text / evaluation guidance ("assesses", "description", or "category") into "description".
5. If the document has a main title or topic, extract it as "title".
6. If the document has an overall summary or description, extract it as "description".

LANGUAGE INSTRUCTION: Preserve the text content in ${targetLanguage}. Do not translate unless explicitly requested.

OUTPUT FORMAT (JSON only, no markdown wrappers):
{
  "title": "string (optional document title)",
  "description": "string (optional summary)",
  "questions": [
    {
      "text": "string (the question prompt)",
      "type": "OPEN_ENDED" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "CODING" | "WHITEBOARD" | "RESEARCH",
      "description": "string (optional background/evaluation criteria)",
      "options": { "options": ["Option A text", "Option B text"], "allowMultiple": false } | null,
      "starterCode": { "language": "string", "code": "string" } | null
    }
  ]
}`,
    },
    {
      role: "user" as const,
      content: `Extract all interview questions from the following text:\n\n---\n${text}\n---`,
    },
  ];

  const encoder = new TextEncoder();
  const sse = (obj: Record<string, unknown>) =>
    encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const enqueue = (data: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      const MAX_RETRIES = 2;

      const collectLlmContent = async () => {
        let fullContent = "";
        for await (const chunk of streamGeneratorWithFallback({
          messages,
          temperature: 0.2,
          maxTokens: 8192,
          model: resolveGeneratorModel(),
        })) {
          fullContent += chunk;
          enqueue(sse({ type: "content", text: chunk }));
        }
        return fullContent;
      };

      try {
        let extracted: unknown = null;
        let lastError: unknown;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            const fullContent = await collectLlmContent();
            const raw = parseJsonSafe(fullContent);
            const validated = parseQuestionsResponseSchema.safeParse(raw);
            if (!validated.success) {
              throw new Error(
                `Parsing output failed validation: ${validated.error.issues
                  .slice(0, 3)
                  .map((i) => i.message)
                  .join("; ")}`,
              );
            }
            extracted = validated.data;
            break;
          } catch (error) {
            lastError = error;
            if (attempt < MAX_RETRIES) {
              log.warn(`Extract questions attempt ${attempt + 1} failed, retrying...`, error);
              enqueue(sse({ type: "status", message: `Output malformed, retrying parse (${attempt + 2}/${MAX_RETRIES + 1})…` }));
            }
          }
        }

        if (!extracted) {
          throw lastError ?? new Error("Failed to parse questions after retries");
        }

        enqueue(sse({ type: "done", data: extracted }));
      } catch (error) {
        log.error("Parse questions error:", error);
        enqueue(sse({ type: "error", message: "Failed to extract questions from text" }));
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
