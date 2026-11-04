import { aiJobDedupeKey, enqueueAiJob } from "@/lib/ai/ai-jobs";
import { generateSessionSummaryCore } from "@/lib/ai/session-summary";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluationsAreCanonical } from "@/lib/session-score";
import { NextResponse } from "next/server";

const log = createLogger("api/ai/summarize");

/**
 * Summary generation for the reports-tab buttons (regenerate all / single
 * candidate) and batch backfills. Delegates to the same shared pipeline as
 * session completion — regenerating must go through identical canonical
 * question guards and merge semantics, never a divergent copy.
 */
export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, skipExisting, force } = await req.json();

  try {
    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select(
        "id, summary, insights, interview:interviews!inner(userId, questions(text, order))",
      )
      .eq("id", sessionId)
      .order("order", { referencedTable: "interviews.questions", ascending: true })
      .single();

    if (
      !session ||
      (session.interview as unknown as { userId: string }).userId !== user.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const questions =
      (session.interview as unknown as { questions?: { text: string }[] })
        .questions ?? [];
    const evals = (
      session.insights as { questionEvaluations?: unknown } | null
    )?.questionEvaluations;
    // A report is finished when its evaluation list is the canonical
    // one-per-question list AND every entry carries a score — a list of the
    // right shape whose questions are still ungraded is not finished.
    const evaluationsHealthy =
      questions.length === 0 || evaluationsAreCanonical(evals, questions);

    // Batch callers set skipExisting so a run never pays for reports that are
    // already correct: skip when a summary exists AND the stored evaluations
    // are healthy. force overrides everything — used by the single-candidate
    // regenerate action for a deliberate full rebuild.
    if (skipExisting && !force && !!session.summary && evaluationsHealthy) {
      return NextResponse.json({ skipped: true });
    }

    // A broken or missing evaluation list must be rebuilt even when the
    // caller did not ask for a force: the summary writer skips sessions that
    // already have a summary, so a partially graded report would never be
    // repaired otherwise.
    const forceRebuild = !!force || !skipExisting || !evaluationsHealthy;
    // Vercel functions die at 60s mid-LLM-call (Hobby cap) with no error
    // marker — queue for the VPS drainer instead of running inline there.
    if (process.env.VERCEL === "1") {
      await enqueueAiJob({
        kind: "SUMMARY",
        dedupeKey: aiJobDedupeKey(["SUMMARY", sessionId, String(forceRebuild)]),
        payload: { sessionId, force: forceRebuild },
      });
      return NextResponse.json({ queued: true });
    }
    await generateSessionSummaryCore(sessionId, { force: forceRebuild });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("Summary generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
