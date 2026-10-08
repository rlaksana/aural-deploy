import { nanoid } from "@/lib/id";
import { generateSurveyAnalysis } from "@/lib/ai/aggregate-analysis";
import {
  buildReportRows,
  buildSurveyAggregate,
  fetchReportEntries,
  type InterviewReport,
  type SurveyAggregate,
} from "@/lib/interview-report";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../trpc";
import { verifyInterviewAccess } from "./candidate";

type InterviewKindRow = {
  title: string;
  kind?: string;
  questions?: { id: string; text: string; type: string; options: { correctIndices?: number[] } | null }[];
};

/** Aggregate section for non-interview kinds (undefined for interviews). */
function buildAggregateIfNonInterview(
  interviewRow: InterviewKindRow | null,
  entries: Parameters<typeof buildSurveyAggregate>[0],
): SurveyAggregate | undefined {
  const kind = interviewRow?.kind ?? "INTERVIEW";
  if (kind === "INTERVIEW") return undefined;
  return buildSurveyAggregate(entries, interviewRow?.questions ?? []);
}

export const reportRouter = router({
  /** Aggregate report + current share-link token (null when none). */
  get: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .query(async ({ ctx, input }) => {
      const interview = await verifyInterviewAccess(
        ctx.supabase,
        input.interviewId,
        ctx.user.id,
      );

      const [{ data: interviewRow }, { data: link }] = await Promise.all([
        ctx.supabase
          .from("interviews")
          .select("title, kind, aiAnalysis, questions(id, text, type, options)")
          .eq("id", input.interviewId)
          .order("order", { referencedTable: "questions", ascending: true })
          .single(),
        ctx.supabase
          .from("interview_report_links")
          .select("token")
          .eq("interviewId", input.interviewId)
          .maybeSingle(),
      ]);

      const entries = await fetchReportEntries(
        ctx.supabase,
        input.interviewId,
      );
      const row = interviewRow as unknown as
        | (InterviewKindRow & { aiAnalysis?: { text: string; generatedAt: string } | null })
        | null;
      const report = buildReportRows(row?.title ?? "Interview", entries);

      return {
        report,
        aggregate: buildAggregateIfNonInterview(row, entries),
        aiAnalysis: row?.aiAnalysis ?? null,
        linkToken: (link as { token: string } | null)?.token ?? null,
        role: interview.role,
      };
    }),

  /** (Re)generate the AI cross-respondent analysis and cache it. */
  generateAnalysis: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyInterviewAccess(ctx.supabase, input.interviewId, ctx.user.id);

      const { data: interviewRow } = await ctx.supabase
        .from("interviews")
        .select("title, kind, language, questions(id, text, type, options)")
        .eq("id", input.interviewId)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      const row = interviewRow as unknown as
        | (InterviewKindRow & { language?: string })
        | null;
      const kind = row?.kind ?? "INTERVIEW";
      if (kind === "INTERVIEW") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "AI analysis is only available for survey/quiz/form kinds",
        });
      }

      const entries = await fetchReportEntries(ctx.supabase, input.interviewId);
      const aggregate = buildSurveyAggregate(entries, row?.questions ?? []);

      const text = await generateSurveyAnalysis(
        row?.title ?? "Untitled",
        kind,
        aggregate,
        row?.language,
      );

      const aiAnalysis = { text, generatedAt: new Date().toISOString() };
      await ctx.supabase
        .from("interviews")
        .update({ aiAnalysis })
        .eq("id", input.interviewId);

      return { aiAnalysis };
    }),

  /** Create (or replace) the single share link for this interview. */
  createLink: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyInterviewAccess(ctx.supabase, input.interviewId, ctx.user.id);

      const token = nanoid(24);
      // One link per interview: replace any existing row (unique index backs this up).
      await ctx.supabase
        .from("interview_report_links")
        .delete()
        .eq("interviewId", input.interviewId);

      const { error } = await ctx.supabase
        .from("interview_report_links")
        .insert({ interviewId: input.interviewId, token });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { token };
    }),

  deleteLink: protectedProcedure
    .input(z.object({ interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyInterviewAccess(ctx.supabase, input.interviewId, ctx.user.id);

      await ctx.supabase
        .from("interview_report_links")
        .delete()
        .eq("interviewId", input.interviewId);

      return { success: true };
    }),

  /** Public: resolve a share token to the aggregate report. */
  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const { data: link } = await ctx.supabase
        .from("interview_report_links")
        .select("interviewId")
        .eq("token", input.token)
        .maybeSingle();

      if (!link) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report link not found" });
      }

      const interviewId = (link as { interviewId: string }).interviewId;

      const { data: interviewRow } = await ctx.supabase
        .from("interviews")
        .select("title, kind, questions(id, text, type, options)")
        .eq("id", interviewId)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      const row = interviewRow as unknown as InterviewKindRow | null;
      const entries = await fetchReportEntries(ctx.supabase, interviewId);
      const report: InterviewReport = buildReportRows(
        row?.title ?? "Interview",
        entries,
      );

      // Non-interview kinds share a public-safe aggregate ONLY: no row table
      // and no textAnswers (open-text answers + respondent names would leak
      // through a public token).
      const isInterviewKind = (row?.kind ?? "INTERVIEW") === "INTERVIEW";
      const fullAggregate = buildAggregateIfNonInterview(row, entries);
      return {
        report: isInterviewKind ? report : { ...report, rows: [] },
        aggregate: fullAggregate
          ? {
              respondentCount: fullAggregate.respondentCount,
              questions: fullAggregate.questions.map((q) => ({
                id: q.id,
                text: q.text,
                type: q.type,
                tally: q.tally,
                average: q.average,
                correctRate: q.correctRate,
              })),
            }
          : undefined,
      };
    }),
});
