import { svgDataUrlToPng } from "@/lib/ai/convert-svg";
import {
  buildSummaryReportSchema,
  SUMMARY_REPORT_SHAPE_HINT,
} from "@/lib/ai/generated-schema";
import { createLogger } from "@/lib/logger";
import { withAnswerKeys } from "@/lib/answer-keys";
import { buildSummaryPrompt } from "@/lib/ai/prompts/summary";
import { REPORT_MODEL } from "@/lib/ai/registry";
import { generateChatWithFallback } from "@/lib/ai/generator-run";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  completeQuestionEvaluations,
  mergeDeterministicWithLlm,
} from "@/lib/session-score";
import { repairStructured } from "@/lib/ai/repair";

const log = createLogger("ai/session-summary");

// ponytail: in-process dedupe only — concurrent serverless instances could still
// double-generate; move the lock into Postgres (advisory lock / status column) if that shows up.
const inFlight = new Map<string, Promise<void>>();

/**
 * Injectable dependencies (test seam, VoiceSaveOps precedent): production
 * callers use the default and never pass anything.
 */
export type SummaryDeps = {
  supabase: typeof supabaseAdmin;
  generate: typeof generateChatWithFallback;
  repair: typeof repairStructured;
};

const defaultDeps: SummaryDeps = {
  supabase: supabaseAdmin,
  generate: generateChatWithFallback,
  repair: repairStructured,
};

/**
 * §5.3 (2026-11-19 incident): Vercel's hard 300s kill left nothing persisted
 * — no summary, no failure marker, so a dead run was indistinguishable from a
 * running one. An internal deadline that fires BEFORE the platform kill lets
 * the failure state reach the DB (summaryStartedAt / summaryFailedAt); the
 * 30s of headroom covers the final sessions-row update under the 300s Fluid
 * ceiling.
 */
const SUMMARY_INTERNAL_DEADLINE_MS = 270_000;

async function persistInsightsMarker(
  deps: SummaryDeps,
  sessionId: string,
  insights: Record<string, unknown>,
): Promise<void> {
  try {
    await deps.supabase.rpc("merge_session_insights", {
      p_session_id: sessionId,
      p_insights: insights,
    });
  } catch {
    // The marker is diagnostic only — never mask the original error path.
  }
}

function withDeadline<T>(
  promise: Promise<T>,
  deadlineAt: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} exceeded the internal summary deadline`)),
      Math.max(0, deadlineAt - Date.now()),
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Generate and persist the AI summary/insights for a session. Idempotent:
 * returns immediately when a summary already exists or one is currently being
 * generated for the same session, so multiple completion paths (voice save,
 * chat complete, safety-net) can all call it without double LLM runs.
 *
 * Runs inline — callers schedule it through next/server after() so the
 * invocation survives past the response. Callers must host this on a route
 * whose maxDuration covers one LLM call (~30–60s on GLM).
 */
export async function generateSessionSummary(
  sessionId: string,
  deps: SummaryDeps = defaultDeps,
): Promise<void> {
  const existing = inFlight.get(sessionId);
  if (existing) return existing;

  const job = generateSessionSummaryCore(sessionId, {}, deps)
    .then(() => undefined)
    .catch(async (error) => {
      log.error(`Summary generation failed for session ${sessionId}:`, error);
      // Best-effort marker so a backfill can find permanently failed
      // summaries; a failure here must not mask the original error path.
      // (generateSessionSummaryCore persists its own markers — this catch is
      // the safety net for errors raised outside its deadline-guarded calls.)
      try {
        await deps.supabase.rpc("merge_session_insights", {
          p_session_id: sessionId,
          p_insights: {
            summaryFailedAt: new Date().toISOString(),
            summaryFailedReason:
              error instanceof Error ? error.message.slice(0, 300) : "unknown error",
          },
        });
      } catch {
        // ignore — the marker is diagnostic only
      }
    })
    .finally(() => inFlight.delete(sessionId));
  inFlight.set(sessionId, job);
  return job;
}

/**
 * Single generation pipeline shared by completion paths and the
 * /api/ai/summarize route (regenerate buttons / batch backfill). Throws on
 * failure so the route can surface a 500; `force` rebuilds even when a
 * summary already exists. Returns "generated" or "skipped".
 */
export async function generateSessionSummaryCore(
  sessionId: string,
  opts: { force?: boolean; timeoutMs?: number } = {},
  deps: SummaryDeps = defaultDeps,
): Promise<{ status: "generated" | "skipped" }> {
  const { data: interviewSession } = await deps.supabase
    .from("sessions")
    .select(
      // expectedAnswer stays out of the questions select — keys are merged
      // from the RLS-deny key table right after the row cast below.
      `summary, insights, interview:interviews!inner(title, objective, language, kind, assessmentCriteria, questions(id, text, order, type)), messages(*)`,
    )
    .eq("id", sessionId)
    .order("order", { referencedTable: "interviews.questions", ascending: true })
    .order("timestamp", { referencedTable: "messages", ascending: true })
    .single();

  if (!interviewSession) {
    log.info(`Session ${sessionId} not found, skipping summary`);
    return { status: "skipped" };
  }
  // Already summarized (summary and insights are written together) — nothing
  // to do unless the caller explicitly wants a rebuild.
  if (interviewSession.summary && !opts.force) return { status: "skipped" };

    const interview = interviewSession.interview as unknown as {
      title: string;
      objective: string | null;
      language: string;
      kind?: string;
      assessmentCriteria: { name: string; description: string }[] | null;
      questions: { id: string; text: string; order: number; type?: string; expectedAnswer?: string | null }[];
    };

    // Merge answer keys so the grading prompt still receives the rubric.
    interview.questions = await withAnswerKeys(interview.questions, deps.supabase);

    const msgs = (interviewSession.messages ?? []) as {
      contentType: string;
      whiteboardData: Record<string, unknown> | null;
      whiteboardImageUrl: string | null;
      role: string;
      content: string;
      questionId?: string | null;
    }[];

    if (msgs.length === 0) {
      log.info(`Session ${sessionId} has no messages, skipping summary`);
      return { status: "skipped" };
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
      // Synthetic navigation markers (role SYSTEM) are pipeline control
      // messages, not transcript speech — the LLM must never see them.
      .filter((m) => m.contentType === "TEXT" && m.role !== "SYSTEM")
      .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));
    // Questions with a stored USER answer are "answered" even when the LLM
    // never evaluated them: they become pending markers, not false zeros.
    const answeredIds = new Set(
      msgs
        .filter((m) => m.role === "USER" && m.questionId)
        .map((m) => m.questionId as string),
    );
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
      interview.kind,
    );

    const deadlineAt = Date.now() + (opts.timeoutMs ?? SUMMARY_INTERNAL_DEADLINE_MS);
    // Record the attempt BEFORE the LLM call so even a hard platform kill
    // leaves a start trace in insights (§5.3).
    await persistInsightsMarker(deps, sessionId, {
      summaryStartedAt: new Date().toISOString(),
    });
    const persistFailure = async (err: unknown) => {
      await persistInsightsMarker(deps, sessionId, {
        summaryFailedAt: new Date().toISOString(),
        summaryFailedReason:
          err instanceof Error ? err.message.slice(0, 300) : "unknown error",
      });
    };
    const deadlineGenerate = async (args: Parameters<SummaryDeps["generate"]>[0]) => {
      try {
        return await withDeadline(deps.generate(args), deadlineAt, "Report LLM call");
      } catch (err) {
        await persistFailure(err);
        throw err;
      }
    };

    let response;
    try {
      response = await deadlineGenerate({
        messages,
        temperature: 0.3,
        maxTokens: 16384,
        model: REPORT_MODEL,
        // reasoning_effort "high" (the provider default) blows past the 300s
        // Fluid compute ceiling on long transcripts — the call gets killed
        // and the session silently never gets a summary. "low" keeps the
        // report call inside the budget (same override the live chat uses).
        reasoningEffort: "low",
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
          interview.kind,
        );
        response = await deadlineGenerate({
          messages: fallbackMessages,
          temperature: 0.3,
          maxTokens: 16384,
          model: REPORT_MODEL,
          reasoningEffort: "low",
        });
      } else {
        throw err;
      }
    }

    // A parse/validation failure is a FORMAT error, not a content error: the
    // raw output goes to the OpenRouter repair model (format only, never a
    // main-model re-run). Unsalvageable output throws and the gate below
    // keeps a partial result from ever being persisted.
    let parsed;
    try {
      parsed = await withDeadline(
        deps.repair({
          raw: response.content,
          schema: buildSummaryReportSchema(interview.questions.length),
          label: "summary-report",
          shapeHint: SUMMARY_REPORT_SHAPE_HINT,
        }),
        deadlineAt,
        "Repair call",
      );
    } catch (err) {
      await persistFailure(err);
      throw err;
    }

    const insightsData: Record<string, unknown> = {
      keyInsights: parsed.keyInsights ?? [],
    };

    // Deterministic scores (quiz grading) are the source of truth — the AI
    // narrative layers on top without replacing them.
    const existingEvaluations = (
      interviewSession.insights as { questionEvaluations?: unknown[] } | null
    )?.questionEvaluations;
    let questionEvaluations: unknown[] | undefined = undefined;
    if (Array.isArray(existingEvaluations) && existingEvaluations.length > 0) {
      // Deterministic quiz scores win for keyed questions; unkeyed ones
      // (open-ended) fall back to the LLM's evaluation instead of a false
      // "Not answered". Legacy over-grown lists are canonicalized either way.
      questionEvaluations = mergeDeterministicWithLlm(
        existingEvaluations,
        Array.isArray(parsed.questionEvaluations) ? parsed.questionEvaluations : [],
        interview.questions,
        interview.language,
        answeredIds,
      );
    } else if (Array.isArray(parsed.questionEvaluations)) {
      questionEvaluations = completeQuestionEvaluations(
        parsed.questionEvaluations,
        interview.questions,
        interview.language,
        answeredIds,
      );
    }
    if (questionEvaluations) {
      insightsData.questionEvaluations = questionEvaluations;
    }
    if (parsed.criteriaEvaluations) {
      insightsData.criteriaEvaluations = parsed.criteriaEvaluations;
    }
    if (parsed.researchFindings) {
      insightsData.researchFindings = parsed.researchFindings;
    }
    if (parsed.toneAnalysis) {
      insightsData.toneAnalysis = parsed.toneAnalysis;
    }

    // Root-cause gate: a persisted report never carries grading gaps. Writing
    // a partial merge and returning "generated" is what left answered
    // questions stuck as "-" in Reports. A run that cannot grade every
    // answered question fails loudly (the wrapper marks summaryFailedAt, the
    // route returns 500) instead of saving a result the skip-valid logic then
    // treats as finished.
    const pendingCount = (questionEvaluations ?? []).filter(
      (e) => (e as { pendingGrading?: unknown })?.pendingGrading === true,
    ).length;
    if (pendingCount > 0) {
      throw new Error(
        `Summary incomplete for session ${sessionId}: ${pendingCount} answered question(s) still ungraded after merge — refusing to persist`,
      );
    }

    await deps.supabase
      .from("sessions")
      .update({
        summary: String(parsed.summary ?? ""),
        themes: (parsed.themes as string[]) ?? [],
        sentiment: parsed.sentiment ?? null,
      })
      .eq("id", sessionId);

    // Merge (not overwrite) so quiz grades written by another serverless
    // instance during the LLM call are not silently dropped.
    await deps.supabase.rpc("merge_session_insights", {
      p_session_id: sessionId,
      p_insights: insightsData,
    });

    const themeCount = Array.isArray(parsed.themes) ? parsed.themes.length : 0;
    const qEvalCount = questionEvaluations?.length ?? 0;
    log.info(
      `Summary generated for session ${sessionId}: ` +
        `${themeCount} themes, ${qEvalCount} question evaluations`,
    );

  return { status: "generated" };
}
