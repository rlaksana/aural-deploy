import { z } from "zod";
import type { ZodType } from "zod";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import {
  generateChatWithFallback,
  resolveGeneratorModel,
} from "@/lib/ai/generator-run";
import { repairStructured } from "@/lib/ai/repair";
import { checkAiRateLimit } from "@/lib/api-rate-limit-ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canonicalizeInsights } from "@/lib/interview-report";
import { resolveResumeSource } from "@/lib/candidate-analysis-resolve";
import {
  INTERVIEW_FIT_SHAPE_HINT,
  OVERALL_SHAPE_HINT,
  RESUME_FIT_SHAPE_HINT,
  sectionAnalysisSchema,
  overallAnalysisSchema,
  type StoredCandidateAnalysis,
} from "@/lib/ai/candidate-analysis-schema";
import {
  buildCandidateAnalysisPrompt,
  type CandidateAnalysisInput,
  type CandidateAnalysisSection,
  type CandidateEvaluation,
} from "@/lib/ai/prompts/candidate-analysis";
import { getOrgMembership, hasProjectAccess } from "@/server/trpc";

const log = createLogger("api/ai/candidate-analysis");

const bodySchema = z.object({
  sessionId: z.string().min(1),
  resumeText: z.string().optional(),
  resumeFileName: z.string().optional(),
});

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function runSection<T extends { score: number }>(
  key: CandidateAnalysisSection,
  schema: ZodType<T>,
  shapeHint: string,
  input: CandidateAnalysisInput,
  signal: AbortSignal,
  emit: (obj: Record<string, unknown>) => void,
): Promise<T> {
  emit({ type: "section", key, status: "started" });
  const response = await generateChatWithFallback({
    messages: buildCandidateAnalysisPrompt(key, input),
    temperature: 0.3,
    maxTokens: 2048,
    model: resolveGeneratorModel(),
    signal,
  });
  const value = await repairStructured({
    raw: response.content,
    schema,
    label: `candidate-analysis/${key}`,
    shapeHint,
  });
  emit({ type: "section", key, status: "done", score: value.score });
  return value;
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return json(401, "Unauthorized");

  const rateLimited = checkAiRateLimit(user.id);
  if (rateLimited) return rateLimited;

  const parsedBody = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) return json(400, "Invalid request");
  const { sessionId, resumeText, resumeFileName } = parsedBody.data;

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select(
      `id, status, insights, interview:interviews!inner(userId, title, objective, jobDescription, language, assessmentCriteria, questions(text, order), project:projects!inner(organizationId, id))`,
    )
    .eq("id", sessionId)
    .single();

  if (!session) return json(404, "Session not found");

  // PostgREST types embedded resources loosely — pin the expected row shape.
  const row = session as unknown as {
    id: string;
    status: string;
    insights: unknown;
    interview: {
      userId: string;
      title: string;
      objective: string | null;
      jobDescription: string | null;
      language: string | null;
      assessmentCriteria: { name: string; description?: string; weight?: number }[] | null;
      questions?: { text: string; order?: number }[];
      project: { organizationId: string; id: string };
    };
  };
  const interview = row.interview;

  // Org/project access parity with analysis.getSessionSummary — the read
  // path lets org members view results, so the write path must too.
  const membership = await getOrgMembership(
    supabaseAdmin,
    interview.project.organizationId,
    user.id,
  );
  if (!membership) return json(403, "You are not a member of this organization");
  const projAccess = await hasProjectAccess(supabaseAdmin, interview.project.id, user.id);
  if (!projAccess) return json(403, "You do not have access to this project");

  if (row.status !== "COMPLETED") return json(400, "Session is not completed");

  // Bank resolution: candidates row (via sessionId) → junction → position_candidates.
  let bankResumeText: string | null = null;
  let bankResumeFileName: string | null = null;
  const { data: candRow } = await supabaseAdmin
    .from("candidates")
    .select("id")
    .eq("sessionId", sessionId)
    .maybeSingle();
  if (candRow) {
    const { data: link } = await supabaseAdmin
      .from("position_candidate_interviews")
      .select("bank:position_candidates(resumeText, resumeFileName)")
      .eq("candidateId", candRow.id)
      .maybeSingle();
    const bank = link?.bank as
      | { resumeText: string | null; resumeFileName: string | null }
      | null
      | undefined;
    bankResumeText = bank?.resumeText ?? null;
    bankResumeFileName = bank?.resumeFileName ?? null;
  }

  const source = resolveResumeSource({
    uploadResumeText: resumeText,
    uploadResumeFileName: resumeFileName,
    bankResumeText,
    bankResumeFileName,
  });
  if (!source) return json(400, "Upload the candidate resume first");

  const insights = canonicalizeInsights(row.insights, interview.questions ?? []) as {
    questionEvaluations?: CandidateEvaluation[];
  };
  const evaluations = (insights.questionEvaluations ?? []) as {
    question: string;
    score: number;
    evaluation: string;
    highlights?: string[];
    improvements?: string[];
  }[];
  if (evaluations.length === 0) {
    return json(400, "Generate the interview report first");
  }

  // Snapshot the winning resume onto the session: a manual upload survives
  // a later generation failure, and later bank edits never mutate analyses.
  await supabaseAdmin
    .from("sessions")
    .update({ resumeText: source.resumeText, resumeFileName: source.resumeFileName })
    .eq("id", sessionId);

  const input: CandidateAnalysisInput = {
    interviewTitle: interview.title,
    jdText: interview.jobDescription ?? "",
    objective: interview.objective,
    criteria: interview.assessmentCriteria,
    resumeText: source.resumeText,
    evaluations,
    language: interview.language,
  };
  const jdAvailable = !!interview.jobDescription?.trim();

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
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const emit = (obj: Record<string, unknown>) => enqueue(sse(obj));

      try {
        // Three parallel calls — wall clock ≈ the slowest single section,
        // each safely under the 240s provider timeout.
        const [resumeFit, interviewFit, overall] = await Promise.all([
          runSection("resumeFit", sectionAnalysisSchema, RESUME_FIT_SHAPE_HINT, input, req.signal, emit),
          runSection("interviewFit", sectionAnalysisSchema, INTERVIEW_FIT_SHAPE_HINT, input, req.signal, emit),
          runSection("overall", overallAnalysisSchema, OVERALL_SHAPE_HINT, input, req.signal, emit),
        ]);

        const analysis: StoredCandidateAnalysis = {
          generatedAt: new Date().toISOString(),
          language: interview.language ?? "id",
          jdSource: jdAvailable ? "jobDescription" : "fallback",
          resumeFit,
          interviewFit,
          overall,
        };
        const { error: updateError } = await supabaseAdmin
          .from("sessions")
          .update({ candidateAnalysis: analysis })
          .eq("id", sessionId);
        if (updateError) throw new Error(updateError.message);

        emit({ type: "done", data: analysis });
      } catch (err) {
        log.error("candidate analysis failed", err);
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Analysis failed",
        });
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
