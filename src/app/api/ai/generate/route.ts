import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { resolveGeneratorModel, streamGeneratorWithFallback } from "@/lib/ai/generator-run";
import { generatedInterviewSchema, generateRequestSchema } from "@/lib/ai/generated-schema";
import { repairStructured } from "@/lib/ai/repair";
import { aiWindowStatus } from "@/lib/ai/ai-window";
import { aiJobDedupeKey, enqueueAiJob } from "@/lib/ai/ai-jobs";
import { checkAiRateLimit } from "@/lib/api-rate-limit-ai";

const log = createLogger("api/ai/generate");

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const rateLimited = checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const rawBody: unknown = await req.json().catch(() => null);
  const parsedBody = generateRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsedBody.error.flatten() }),
      { status: 400 },
    );
  }
  const { description, durationMinutes, language, jobDescription, resumeText } = parsedBody.data;

  // Heavy batch generation runs only inside the AI operating window
  // (17:00–07:00 WIB); outside it the request is queued for the cron runner.
  const window = aiWindowStatus();
  if (!window.open) {
    await enqueueAiJob({
      kind: "GENERATE_INTERVIEW",
      userId: user.id,
      dedupeKey: aiJobDedupeKey([
        "GENERATE_INTERVIEW",
        user.id,
        description,
        durationMinutes ?? "",
        language ?? "",
        jobDescription ?? "",
        resumeText ?? "",
      ]),
      payload: { request: parsedBody.data },
    });
    return new Response(
      `data: ${JSON.stringify({ type: "queued", nextRunAt: window.nextBoundaryAt })}\n\n`,
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  const messages = (await import("@/lib/ai/prompts/generator")).buildGeneratorPrompt(
    description,
    durationMinutes,
    language,
    jobDescription,
    resumeText,
  );

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

      const collectLlmContent = async (streamToClient: boolean) => {
        let inThink = false;
        let fullContent = "";
        for await (const chunk of streamGeneratorWithFallback({
          messages,
          temperature: 0.7,
          maxTokens: 8192,
          model: resolveGeneratorModel(),
        })) {
          let remaining = chunk;
          while (remaining.length > 0) {
            if (inThink) {
              const endIdx = remaining.indexOf("</think>");
              if (endIdx >= 0) {
                const thinkText = remaining.slice(0, endIdx);
                if (thinkText && streamToClient) enqueue(sse({ type: "thinking", text: thinkText }));
                inThink = false;
                remaining = remaining.slice(endIdx + "</think>".length);
              } else {
                if (streamToClient) enqueue(sse({ type: "thinking", text: remaining }));
                remaining = "";
              }
            } else {
              const startIdx = remaining.indexOf("<think>");
              if (startIdx >= 0) {
                const before = remaining.slice(0, startIdx);
                if (before) {
                  fullContent += before;
                  if (streamToClient) enqueue(sse({ type: "content", text: before }));
                }
                inThink = true;
                remaining = remaining.slice(startIdx + "<think>".length);
              } else {
                fullContent += remaining;
                if (streamToClient) enqueue(sse({ type: "content", text: remaining }));
                remaining = "";
              }
            }
          }
        }
        return fullContent;
      };

      try {
        const fullContent = await collectLlmContent(true);
        const generated = await repairStructured({
          raw: fullContent,
          schema: generatedInterviewSchema,
          label: "generate",
        });
        enqueue(sse({ type: "done", data: generated }));
      } catch (error) {
        log.error("Interview generation error:", error);
        enqueue(sse({ type: "error", message: "Failed to generate interview" }));
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