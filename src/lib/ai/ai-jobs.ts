import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { aiWindowStatus } from "./ai-window";
import { generateChatWithFallback, resolveGeneratorModel } from "./generator-run";
import { repairStructured } from "./repair";
import { generatedInterviewSchema } from "./generated-schema";
import { parseQuestionsResponseSchema, type parseQuestionsRequestSchema } from "./parse-questions-schema";
import type { z } from "zod";
import type { generateRequestSchema, refineRequestSchema } from "./generated-schema";
import { buildGeneratorPrompt, buildImprovePrompt } from "./prompts/generator";
import { buildParseQuestionsMessages } from "./prompts/parse-questions";
import { generateAndCacheSurveyAnalysis } from "./aggregate-analysis";
import { generateSessionSummaryCore } from "./session-summary";
import { interviewRouter } from "@/server/routers/interview";
import { questionRouter } from "@/server/routers/question";

const log = createLogger("ai/ai-jobs");

export type AiJobKind =
  | "GENERATE_INTERVIEW"
  | "REFINE"
  | "PARSE_QUESTIONS"
  | "SUMMARY"
  | "ANALYSIS";

export type GenerateJobRequest = z.infer<typeof generateRequestSchema>;
export type RefineJobRequest = z.infer<typeof refineRequestSchema>;
export type ParseJobRequest = z.infer<typeof parseQuestionsRequestSchema>;

export interface AiJobRow {
  id: string;
  kind: AiJobKind;
  status: string;
  userId: string | null;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Stable per-entity dedupe key so repeated out-of-window clicks don't pile up. */
export function aiJobDedupeKey(parts: unknown[]): string {
  return createHash("sha256")
    .update(parts.map((p) => String(p ?? "")).join("|"))
    .digest("hex")
    .slice(0, 40);
}

/** Insert a QUEUED job; a pending duplicate (same kind+key) is a no-op. */
export async function enqueueAiJob(input: {
  kind: AiJobKind;
  dedupeKey: string;
  userId?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_jobs").insert({
    kind: input.kind,
    userId: input.userId ?? null,
    dedupeKey: input.dedupeKey,
    payload: input.payload,
  });
  // Partial unique index (kind, dedupeKey) WHERE status pending — a live
  // duplicate means the job is already queued.
  if (error && error.code !== "23505") throw error;
}

/** Service-role caller ctx — ctx.supabase is always service-role in this app. */
function jobCallerCtx(userId: string) {
  return {
    user: { id: userId } as unknown as User,
    supabase: supabaseAdmin,
  };
}

async function executeAiJob(
  job: AiJobRow,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const userId = job.userId ?? "";

  switch (job.kind) {
    case "GENERATE_INTERVIEW": {
      const request = job.payload.request as GenerateJobRequest;
      const messages = buildGeneratorPrompt(
        request.description,
        request.durationMinutes,
        request.language,
        request.jobDescription,
        request.resumeText,
      );
      const response = await generateChatWithFallback({
        messages,
        temperature: 0.7,
        maxTokens: 8192,
        model: resolveGeneratorModel(),
        signal,
      });
      const generated = await repairStructured({
        raw: response.content,
        schema: generatedInterviewSchema,
        label: "queued-generate",
      });
      const settings = request.settings;
      const caller = interviewRouter.createCaller(jobCallerCtx(userId));
      const interview = (await caller.createWithQuestions({
        projectId: request.projectId,
        title: generated.title,
        description: generated.description,
        objective: generated.objective,
        assessmentCriteria: generated.assessmentCriteria,
        chatEnabled: settings?.chatEnabled ?? true,
        voiceEnabled: settings?.voiceEnabled ?? false,
        videoEnabled: settings?.videoEnabled ?? false,
        aiTone: settings?.aiTone ?? "PROFESSIONAL",
        followUpDepth: settings?.followUpDepth ?? "MODERATE",
        antiCheatingEnabled: settings?.antiCheatingEnabled ?? false,
        timeLimitMinutes: settings?.timeLimitMinutes ?? generated.estimatedDurationMinutes,
        language: request.language,
        aiName: generated.recommendedSettings.aiName,
        questions: generated.questions.map((q) => ({
          text: q.text,
          type: q.type,
          description: q.description ?? null,
          options: q.options ?? null,
          starterCode: q.starterCode ?? null,
          timeLimitSeconds: q.timeLimitSeconds ?? null,
          isRequired: q.isRequired ?? true,
        })),
      })) as { id: string };
      return { interviewId: interview.id };
    }

    case "REFINE": {
      const request = job.payload.request as RefineJobRequest;
      const messages = buildImprovePrompt(
        request.interview,
        request.feedback,
        request.language,
        request.jobDescription,
        request.resumeText,
      );
      const response = await generateChatWithFallback({
        messages,
        temperature: 0.7,
        maxTokens: 8192,
        model: resolveGeneratorModel(),
        signal,
      });
      const refined = await repairStructured({
        raw: response.content,
        schema: generatedInterviewSchema,
        label: "queued-refine",
      });
      // Stored for one-click loading back into the generator draft.
      return { generated: refined };
    }

    case "PARSE_QUESTIONS": {
      const request = job.payload.request as ParseJobRequest;
      const interviewId = request.interviewId;
      if (!interviewId) {
        throw new Error("PARSE_QUESTIONS job requires interviewId");
      }
      const response = await generateChatWithFallback({
        messages: buildParseQuestionsMessages(request.text, request.language),
        temperature: 0.2,
        maxTokens: 8192,
        model: resolveGeneratorModel(),
        signal,
      });
      const parsed = await repairStructured({
        raw: response.content,
        schema: parseQuestionsResponseSchema,
        label: "queued-parse-questions",
      });
      const { data: existingRows } = await supabaseAdmin
        .from("questions")
        .select("text")
        .eq("interviewId", interviewId);
      const existing = new Set(
        (existingRows ?? []).map((r: { text: string }) => r.text.toLowerCase().trim()),
      );
      const caller = questionRouter.createCaller(jobCallerCtx(userId));
      let added = 0;
      for (const q of parsed.questions) {
        if (existing.has(q.text.toLowerCase().trim())) continue;
        await caller.create({
          interviewId,
          text: q.text,
          type: q.type,
          description: q.description ?? null,
          isRequired: q.isRequired ?? true,
          options: q.options ?? null,
          starterCode: q.starterCode ?? null,
        });
        added++;
      }
      return { added, skipped: parsed.questions.length - added };
    }

    case "SUMMARY": {
      const { sessionId, force } = job.payload as { sessionId: string; force?: boolean };
      const result = await generateSessionSummaryCore(sessionId, { force: !!force });
      return result;
    }

    case "ANALYSIS": {
      const { interviewId } = job.payload as { interviewId: string };
      return await generateAndCacheSurveyAnalysis(interviewId);
    }
  }
}

export interface AiJobRunStats {
  claimed: number;
  done: number;
  requeued: number;
  failed: number;
}

/**
 * Drain due jobs while the AI operating window is open. Budgeted per
 * invocation: stop claiming at 240s wall-clock or <90s before window close,
 * and hand each LLM call an AbortSignal that fires one minute before the
 * 07:00 WIB hard stop. Jobs aborted by the window go back to QUEUED.
 */
export async function runDueAiJobs(): Promise<AiJobRunStats> {
  const stats: AiJobRunStats = { claimed: 0, done: 0, requeued: 0, failed: 0 };
  if (!aiWindowStatus().open) return stats;
  const startedAt = Date.now();

  for (;;) {
    const window = aiWindowStatus();
    if (!window.open || window.msUntilBoundary < 90_000) break;
    if (Date.now() - startedAt > 240_000) break;

    const { data: claimedRows, error } = await supabaseAdmin.rpc("claim_ai_jobs", {
      p_limit: 1,
      p_lock_minutes: 10,
    });
    if (error) {
      log.error("claim_ai_jobs failed:", error);
      break;
    }
    const job = (claimedRows as AiJobRow[] | null)?.[0];
    if (!job) break;
    stats.claimed++;

    const signal = AbortSignal.timeout(Math.max(60_000, window.msUntilBoundary - 60_000));
    try {
      const result = await executeAiJob(job, signal);
      await supabaseAdmin
        .from("ai_jobs")
        .update({ status: "DONE", result, error: null, updatedAt: new Date().toISOString() })
        .eq("id", job.id);
      stats.done++;
      log.info(`ai_job ${job.kind} ${job.id} done`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (signal.aborted) {
        await supabaseAdmin
          .from("ai_jobs")
          .update({ status: "QUEUED", lockedUntil: null, updatedAt: new Date().toISOString() })
          .eq("id", job.id);
        stats.requeued++;
        log.warn(`ai_job ${job.kind} ${job.id} aborted by window close, requeued`);
        break;
      }
      await supabaseAdmin
        .from("ai_jobs")
        .update({ status: "FAILED", error: message, updatedAt: new Date().toISOString() })
        .eq("id", job.id);
      stats.failed++;
      log.error(`ai_job ${job.kind} ${job.id} failed: ${message}`);
    }
  }

  return stats;
}
