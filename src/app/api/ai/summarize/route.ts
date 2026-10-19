import { generateSessionSummaryCore } from "@/lib/ai/session-summary";
import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
      .select("id, interview:interviews!inner(userId)")
      .eq("id", sessionId)
      .single();

    if (
      !session ||
      (session.interview as unknown as { userId: string }).userId !== user.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Batch callers set skipExisting so re-running a backfill never
    // re-generates summaries that already exist. force overrides that —
    // used by the reports-tab regenerate action to rebuild stale summaries.
    if (skipExisting && !force) {
      const { data: current } = await supabaseAdmin
        .from("sessions")
        .select("summary")
        .eq("id", sessionId)
        .single();
      if (current?.summary) return NextResponse.json({ skipped: true });
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
