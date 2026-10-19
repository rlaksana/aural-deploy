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

    // Batch callers set skipExisting so a run never pays for reports that are
    // already correct: skip when a summary exists AND the stored evaluations
    // are the canonical one-per-question list (broken or missing evaluations
    // are repaired even without force). force overrides everything — used by
    // the single-candidate regenerate action for a deliberate full rebuild.
    if (skipExisting && !force) {
      const questions =
        (session.interview as unknown as { questions?: { text: string }[] })
          .questions ?? [];
      const evals = (
        session.insights as { questionEvaluations?: unknown } | null
      )?.questionEvaluations;
      const healthy =
        !!session.summary &&
        (questions.length === 0 || evaluationsAreCanonical(evals, questions));
      if (healthy) return NextResponse.json({ skipped: true });
    }

    await generateSessionSummaryCore(sessionId, {
      force: !!force || !skipExisting,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("Summary generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
