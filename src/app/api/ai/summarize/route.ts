import { generateSessionSummaryCore } from "@/lib/ai/session-summary";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { evaluationsAreCanonical } from "@/lib/session-score";
import { NextResponse } from "next/server";
import { authorizeSummarizeForSession } from "./logic";

const log = createLogger("api/ai/summarize");

// One summary is a 30–60s GLM call; 300s is the Fluid compute Hobby ceiling.
export const maxDuration = 300;

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
    // Report management via the shared org/project RBAC, derived from the
    // session's own interview (MEMBER+ required; grant denials keep a
    // uniform 404, role shortfalls return an informative 403). Authorized on
    // the light lookup first so denied callers never pay the questions join.
    const access = await authorizeSummarizeForSession(supabaseAdmin, sessionId, user.id);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select(
        "id, summary, insights, interview:interviews!inner(questions(text, order))",
      )
      .eq("id", sessionId)
      .order("order", { referencedTable: "interviews.questions", ascending: true })
      .single();
    // Fail-closed on lookup errors, but never let a transient DB failure
    // masquerade silently as a missing session.
    if (sessionError) log.error("Session lookup failed:", sessionError);

    if (!session) {
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
