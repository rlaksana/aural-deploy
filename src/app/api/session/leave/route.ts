import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionTokenValid } from "@/lib/session-access";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const sessionId = body?.sessionId;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    if (!(await sessionTokenValid(supabaseAdmin, sessionId, body?.sessionToken))) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 403 });
    }

    const { data: session } = await supabaseAdmin
      .from("sessions")
      .select("activitySegments")
      .eq("id", sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const segments = (session.activitySegments as { enteredAt: string; leftAt: string | null }[]) ?? [];
    const now = new Date().toISOString();

    const updated = segments.map((s) =>
      s.leftAt === null ? { ...s, leftAt: now } : s,
    );

    await supabaseAdmin
      .from("sessions")
      .update({ activitySegments: updated, lastActivityAt: now })
      .eq("id", sessionId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
