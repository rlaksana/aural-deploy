import { createHmac } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionTokenValid } from "@/lib/session-access";
import { NextResponse } from "next/server";

/**
 * Mint a short-lived HMAC ticket for the voice relay (verified in
 * server/voice-relay.ts against the shared VOICE_RELAY_SECRET). Interview
 * tickets are bound to a validated session; mic-test tickets are deliberately
 * unauthenticated — shortcut: anonymous mic checks have no session to bind
 * to, so the ticket only blocks blind relay scanning; revisit when the mic
 * check moves inside an authenticated flow.
 */
export async function POST(req: Request) {
  const secret = process.env.VOICE_RELAY_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Relay auth disabled" }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  let id: string;
  let ttlMs: number;
  if (body?.purpose === "mic-test") {
    id = "mic-test";
    ttlMs = 30 * 60 * 1000;
  } else {
    const { sessionId, sessionToken } = body ?? {};
    if (typeof sessionId !== "string" || !sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    if (!(await sessionTokenValid(supabaseAdmin, sessionId, sessionToken))) {
      return NextResponse.json({ error: "Invalid session token" }, { status: 403 });
    }
    id = sessionId;
    ttlMs = 4 * 60 * 60 * 1000;
  }

  const expMs = Date.now() + ttlMs;
  const sig = createHmac("sha256", secret).update(`${id}.${expMs}`).digest("hex");
  return NextResponse.json({ ticket: `${id}.${expMs}.${sig}` });
}
