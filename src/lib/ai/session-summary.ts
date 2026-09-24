import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import { extractJson } from "@/lib/ai/extract-json";
import { createLogger } from "@/lib/logger";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { REPORT_MODEL } from "@/lib/ai/registry";
import { generateChatWithFallback } from "@/lib/ai/generator-run";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("ai/session-summary");

// ponytail: in-process dedupe only — concurrent serverless instances could still
// double-generate; move the lock into Postgres (advisory lock / status column) if that shows up.
const inFlight = new Map<string, Promise<void>>();

/**
 * Generate and persist the AI summary/insights for a session. Idempotent:
 * returns immediately when a summary already exists or one is currently being
 * generated for the same session, so multiple completion paths (voice save,
 * chat complete, safety-net) can all call it without double LLM runs.
 */
export function generateSessionSummary(sessionId: string): Promise<void> {
  const existing = inFlight.get(sessionId);
  if (existing) return existing;

  const job = run(sessionId).finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, job);
  return job;
}

async function run(sessionId: string): Promise<void> {
  try {
    const { data: interviewSession } = await supabaseAdmin
      .from("sessions")
      .select(
        `summary, interview:interviews!inner(title, objective, language, assessmentCriteria, questions(text, order, type)), messages(*)`,
      )
      .eq("id", sessionId)
      .order("order", { referencedTable: "interviews.questions", ascending: true })
      .order("timestamp", { referencedTable: "messages", ascending: true })
      .single();

    if (!interviewSession) {
      log.info(`Session ${sessionId} not found, skipping summary`);
      return;
    }
    // Already summarized (summary and insights are written together) — nothing to do.
    if (interviewSession.summary) return;

    const interview = interviewSession.interview as unknown as {
      title: string;
      objective: string | null;
      language: string;
      assessmentCriteria: { name: string; description: string }[] | null;
      questions: { text: string; order: number; type?: string }[];
    };

    const msgs = (interviewSession.messages ?? []) as {
      contentType: string;
      whiteboardData: Record<string, unknown> | null;
      whiteboardImageUrl: string | null;
      role: string;
      content: string;
    }[];

    if (msgs.length === 0) {
      log.info(`Session ${sessionId} has no messages, skipping summary`);
      return;
    }

    const whiteboardDrawingsRaw = msgs
      .filter((m) => m.contentType === "WHITEBOARD" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Drawing",
        imageDataUrl: m.whiteboardImageUrl ?? null,
      }));

    const whiteboardDrawings = await Promise.all(
      whiteboardDrawingsRaw.map(async (d) => ({
        ...d,
        imageDataUrl: d.imageDataUrl
          ? await svgDataUrlToPng(d.imageDataUrl)
          : null,
      })),
    );

    const codeSnippetsInput = msgs
      .filter((m) => m.contentType === "CODE" && m.whiteboardData)
      .map((m) => ({
        label: (m.whiteboardData?.label as string) || "Untitled Snippet",
        code: (m.whiteboardData?.code as string) || "",
        language: (m.whiteboardData?.language as string) || "plaintext",
      }))
      .filter((s) => s.code.trim().length > 0);

    const textMessages = msgs
      .filter((m) => m.contentType === "TEXT")
      .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));
    const drawingsInput =
      whiteboardDrawings.length > 0 ? whiteboardDrawings : null;
    const codeInput = codeSnippetsInput.length > 0 ? codeSnippetsInput : null;

    const messages = buildSummaryPrompt(
      interview.title,
      textMessages,
      interview.objective,
      interview.assessmentCriteria,
      interview.questions,
      interview.language,
      drawingsInput,
      codeInput,
    );

    let response;
    try {
      response = await generateChatWithFallback({
        messages,
        temperature: 0.3,
        maxTokens: 8192,
        model: REPORT_MODEL,
      });
    } catch (err) {
      const isVisionError =
        err instanceof Error &&
        /image.*not supported|vision.*not supported|does not support.*image/i.test(
          err.message,
        );
      if (isVisionError && drawingsInput?.some((d) => d.imageDataUrl)) {
        log.info("Model does not support images, retrying text-only");
        const textOnlyDrawings = drawingsInput.map((d) => ({
          ...d,
          imageDataUrl: null,
        }));
        const fallbackMessages = buildSummaryPrompt(
          interview.title,
          textMessages,
          interview.objective,
          interview.assessmentCriteria,
          interview.questions,
          interview.language,
          textOnlyDrawings,
          codeInput,
        );
        response = await generateChatWithFallback({
          messages: fallbackMessages,
          temperature: 0.3,
          maxTokens: 8192,
          model: REPORT_MODEL,
        });
      } else {
        throw err;
      }
    }

    const parsed = extractJson(response.content);

    const insightsData: Record<string, unknown> = {
      keyInsights: parsed.keyInsights ?? [],
    };
    if (parsed.criteriaEvaluations) {
      insightsData.criteriaEvaluations = parsed.criteriaEvaluations;
    }
    if (parsed.questionEvaluations) {
      insightsData.questionEvaluations = parsed.questionEvaluations;
    }
    if (parsed.researchFindings) {
      insightsData.researchFindings = parsed.researchFindings;
    }
    if (parsed.toneAnalysis) {
      insightsData.toneAnalysis = parsed.toneAnalysis;
    }

    await supabaseAdmin
      .from("sessions")
      .update({
        summary: String(parsed.summary ?? ""),
        themes: (parsed.themes as string[]) ?? [],
        sentiment: parsed.sentiment ?? null,
        insights: insightsData,
      })
      .eq("id", sessionId);

    const themeCount = Array.isArray(parsed.themes) ? parsed.themes.length : 0;
    const qEvalCount = Array.isArray(parsed.questionEvaluations)
      ? parsed.questionEvaluations.length
      : 0;
    log.info(
      `Summary generated for session ${sessionId}: ` +
        `${themeCount} themes, ${qEvalCount} question evaluations`,
    );
  } catch (error) {
    log.error(`Summary generation failed for session ${sessionId}:`, error);
  }
}
