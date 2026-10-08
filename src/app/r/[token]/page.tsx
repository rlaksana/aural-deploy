import { ReportView } from "@/components/interview/report-view";
import { SurveyAggregateView } from "@/components/interview/survey-aggregate-view";
import {
  buildReportRows,
  buildSurveyAggregate,
  fetchReportEntries,
} from "@/lib/interview-report";
import { AutoRefresh } from "./auto-refresh";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CircleDot } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type InterviewKindRow = {
  title: string;
  kind?: string;
  questions?: { id: string; text: string; type: string; options: { correctIndices?: number[] } | null }[];
};

/**
 * Public report for an interview, resolved by share token.
 * Server-rendered; a client poller refreshes it so newly completed
 * candidates appear without reloading.
 *
 * Interviews show the per-candidate row table; survey/quiz/form kinds show
 * the cross-respondent aggregate ONLY — the row table would leak
 * respondents' open-text answers through a public token.
 */
export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data: link } = await supabaseAdmin
    .from("interview_report_links")
    .select("interviewId")
    .eq("token", token)
    .maybeSingle();

  if (!link) notFound();

  const interviewId = (link as { interviewId: string }).interviewId;

  const { data: interviewRow } = await supabaseAdmin
    .from("interviews")
    .select("title, kind, aiAnalysis, questions(id, text, type, options)")
    .eq("id", interviewId)
    .order("order", { referencedTable: "questions", ascending: true })
    .single();

  const entries = await fetchReportEntries(supabaseAdmin, interviewId);
  const report = buildReportRows(
    interviewRow?.title ?? "Interview",
    entries,
  );

  const row = interviewRow as unknown as
    | (InterviewKindRow & { aiAnalysis?: { text: string; generatedAt: string } | null })
    | null;
  const isInterviewKind = (row?.kind ?? "INTERVIEW") === "INTERVIEW";
  let aggregate = undefined;
  if (!isInterviewKind) {
    // Public-safe aggregate: tallies, averages, and correct rates only —
    // open-text answers and respondent names never leave the owner's view.
    const full = buildSurveyAggregate(entries, row?.questions ?? []);
    aggregate = {
      respondentCount: full.respondentCount,
      // Public-safe shape: tallies/averages/correct rates only, no textAnswers.
      questions: full.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        tally: q.tally,
        average: q.average,
        correctRate: q.correctRate,
      })),
    };
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {isInterviewKind ? "Interview Report" : "Results"}
          </p>
          <h1 className="text-2xl font-bold">{report.interviewTitle}</h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5 text-green-600" />
          Live — updates automatically
        </div>
      </div>
      <AutoRefresh seconds={30} />
      {aggregate ? (
        <SurveyAggregateView aggregate={aggregate} />
      ) : (
        <ReportView
          data={report}
          sessionBasePath={`/r/${token}/session`}
        />
      )}
      <p className="text-center text-xs text-muted-foreground">
        Shared via{" "}
        <Link href="/" className="underline">
          Aural
        </Link>
      </p>
    </div>
  );
}
