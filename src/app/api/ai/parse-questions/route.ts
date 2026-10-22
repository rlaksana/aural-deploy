import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { resolveGeneratorModel, streamGeneratorWithFallback } from "@/lib/ai/generator-run";
import { parseQuestionsRequestSchema, parseQuestionsResponseSchema, PARSE_QUESTIONS_SHAPE_HINT } from "@/lib/ai/parse-questions-schema";
import { buildParseQuestionsMessages } from "@/lib/ai/prompts/parse-questions";
import { repairStructured } from "@/lib/ai/repair";
import { checkAiRateLimit } from "@/lib/api-rate-limit-ai";

const log = createLogger("api/ai/parse-questions");

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

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

  const messages = buildParseQuestionsMessages(text, language);

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

      const collectLlmContent = async () => {
        let inThink = false;
        let fullContent = "";
        for await (const chunk of streamGeneratorWithFallback({
          messages,
          temperature: 0.2,
          maxTokens: 16384,
          model: resolveGeneratorModel(),
        })) {
          let remaining = chunk;
          while (remaining.length > 0) {
            if (inThink) {
              const endIdx = remaining.indexOf("</think>");
              if (endIdx >= 0) {
                inThink = false;
                remaining = remaining.slice(endIdx + "</think>".length);
              } else {
                remaining = "";
              }
            } else {
              const startIdx = remaining.indexOf("<think>");
              if (startIdx >= 0) {
                const before = remaining.slice(0, startIdx);
                if (before) {
                  fullContent += before;
                  enqueue(sse({ type: "content", text: before }));
                }
                inThink = true;
                remaining = remaining.slice(startIdx + "<think>".length);
              } else {
                fullContent += remaining;
                enqueue(sse({ type: "content", text: remaining }));
                remaining = "";
              }
            }
          }
        }
        return fullContent;
      };

      try {
        const fullContent = await collectLlmContent();
        const extracted = await repairStructured({
          raw: fullContent,
          schema: parseQuestionsResponseSchema,
          label: "parse-questions",
          shapeHint: PARSE_QUESTIONS_SHAPE_HINT,
        });
        enqueue(sse({ type: "done", data: extracted }));
      } catch (error) {
        log.error("Parse questions error:", error);
        enqueue(sse({ type: "error", message: "Failed to extract questions from text" }));
      } finally {
        close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
