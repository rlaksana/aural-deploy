import { supabaseAdmin } from "@/lib/supabase/admin";
import { canonicalizeInsights } from "@/lib/interview-report";
import { buildCriteriaWeights, getSessionOverallScore } from "@/lib/session-score";
import { DimensionBars } from "@/components/interview/dimension-bars";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, CircleDot } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Public per-candidate report, reachable from the shared aggregate report
 * rows. Access is gated by the same share token as /r/{token}: the session
 * must belong to the interview the token resolves to, so session ids from
 * other interviews can't be probed through this route.
 */

type CriteriaEvaluation = { name: string; score: number; reasoning?: string };
type QuestionEvaluation = {
  question: string;
  score: number;
  evaluation?: string;
  highlights?: string[];
  improvements?: string[];
};
type SessionInsights = {
  keyInsights?: unknown;
  criteriaEvaluations?: unknown;
  questionEvaluations?: unknown;
  adjustments?: {
    overallScore?: number;
    criteriaScores?: Record<string, number>;
    note?: string;
  };
  dimensionScores?: unknown;
  bands?: unknown;
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toCriteria(value: unknown): CriteriaEvaluation[] {
  return asArray(value).filter(
    (v): v is CriteriaEvaluation =>
      !!v &&
      typeof (v as CriteriaEvaluation).name === "string" &&
      typeof (v as CriteriaEvaluation).score === "number",
  );
}

function toQuestions(value: unknown): QuestionEvaluation[] {
  return asArray(value).filter(
    (v): v is QuestionEvaluation =>
      !!v &&
      typeof (v as QuestionEvaluation).question === "string" &&
      typeof (v as QuestionEvaluation).score === "number",
  );
}

function toKeyInsights(value: unknown): string[] {
  return asArray(value).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

function scoreTone(score: number): string {
  return score >= 7
    ? "text-green-700 dark:text-green-400"
    : score >= 4
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400";
}

export default async function PublicSessionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session?: string | string[] }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const sessionId = Array.isArray(sp.session) ? sp.session[0] : sp.session;
  if (!sessionId) notFound();

  const { data: link } = await supabaseAdmin
    .from("interview_report_links")
    .select("interviewId")
    .eq("token", token)
    .maybeSingle();
  if (!link) notFound();
  const interviewId = (link as { interviewId: string }).interviewId;

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select(
      "id, status, participantName, participantEmail, summary, insights, totalDurationSeconds, \"reportStatus\", interview:interviews!inner(title, kind, assessmentCriteria, questions(text))",
    )
    .eq("id", sessionId)
    .eq("interviewId", interviewId)
    .maybeSingle();
  if (!session) notFound();

  // Draft→finalize gate: AI-judged kinds are hidden until the recruiter
  // finalizes them — a DRAFT session must not be reachable by URL guessing.
  const s = session as unknown as {
    reportStatus?: string | null;
    interview: { kind?: string } | null;
  };
  const kind = s.interview?.kind ?? "INTERVIEW";
  if (
    (kind === "INTERVIEW" || kind === "ASSESSMENT") &&
    s.reportStatus === "DRAFT"
  ) {
    notFound();
  }

  const interview = session.interview as unknown as
    | {
        title: string;
        assessmentCriteria?: { name: string; description: string; weight?: number }[] | null;
        questions?: { text: string }[];
      }
    | null;
  const insights = (session.insights ?? null) as SessionInsights | null;
  // Recruiter overrides replace the AI criteria scores at display time.
  const criteria = toCriteria(insights?.criteriaEvaluations).map((c) => ({
    ...c,
    score: insights?.adjustments?.criteriaScores?.[c.name] ?? c.score,
  }));
  // Canonicalized: follow-up entries miscounted as questions never show here.
  const questions = toQuestions(
    (
      canonicalizeInsights(insights, interview?.questions) as SessionInsights | null
    )?.questionEvaluations,
  );
  const keyInsights = toKeyInsights(insights?.keyInsights);
  const overall = getSessionOverallScore(
    {
      questionEvaluations: questions,
      criteriaEvaluations: criteria,
      adjustments: insights?.adjustments,
    },
    interview?.questions?.length,
    buildCriteriaWeights(interview?.assessmentCriteria),
  );
  const isAdjusted =
    !!insights?.adjustments &&
    (insights.adjustments.overallScore != null ||
      (!!insights.adjustments.criteriaScores &&
        Object.keys(insights.adjustments.criteriaScores).length > 0));
  // Public share link: never fall back to the email — a forwarded link must
  // not leak candidate contact details.
  const name = session.participantName || "Anonymous";

  return (
    <div className="mx-auto min-h-screen w-full max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Candidate Report
          </p>
          <h1 className="truncate text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">
            {interview?.title ?? "Interview"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {overall !== null && (
            <span className={`text-3xl font-bold ${scoreTone(overall)}`}>
              {overall.toFixed(1)}
              <span className="text-base text-muted-foreground">/10</span>
            </span>
          )}
          {isAdjusted && (
            <span
              className="rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-600"
              title="Recruiter-adjusted score"
            >
              adjusted
            </span>
          )}
          <Badge
            variant={session.status === "COMPLETED" ? "default" : "secondary"}
          >
            {session.status}
          </Badge>
        </div>
      </div>

      <Link
        href={`/r/${token}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to full report
      </Link>

      {session.summary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {session.summary}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Report not generated yet for this candidate.
          </CardContent>
        </Card>
      )}

      {criteria.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criteria Evaluation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {criteria.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium">
                    {c.name}
                    {insights?.adjustments?.criteriaScores?.[c.name] != null && (
                      <span
                        className="ml-2 rounded border border-amber-500/50 px-1 text-[10px] text-amber-600"
                        title="Recruiter-adjusted score"
                      >
                        adjusted
                      </span>
                    )}
                  </p>
                  <span className={`text-sm font-semibold ${scoreTone(c.score)}`}>
                    {c.score.toFixed(1)}
                  </span>
                </div>
                {typeof c.reasoning === "string" && c.reasoning && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {c.reasoning}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(insights?.dimensionScores ?? insights?.bands) != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dimension Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <DimensionBars scores={insights?.dimensionScores} bands={insights?.bands} />
          </CardContent>
        </Card>
      )}

      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Question-by-Question Evaluation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {questions.map((q, i) => (
              <div key={i} className="space-y-1.5 border-b pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm font-medium">
                    Q{i + 1}. {q.question}
                  </p>
                  <span className={`shrink-0 text-sm font-semibold ${scoreTone(q.score)}`}>
                    {q.score.toFixed(1)}
                  </span>
                </div>
                {typeof q.evaluation === "string" && q.evaluation && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {q.evaluation}
                  </p>
                )}
                {(q.highlights?.length ?? 0) > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {q.highlights!.map((h, j) => <li key={j}>{h}</li>)}
                  </ul>
                )}
                {(q.improvements?.length ?? 0) > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                    {q.improvements!.map((h, j) => <li key={j}>{h}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {keyInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {keyInsights.map((k, i) => <li key={i}>{k}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <CircleDot className="h-3 w-3 text-green-600" />
        Shared via{" "}
        <Link href="/" className="underline">
          Aural
        </Link>
      </p>
    </div>
  );
}
