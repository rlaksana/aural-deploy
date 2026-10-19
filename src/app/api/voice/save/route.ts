import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sessionTokenValid } from "@/lib/session-access";
import { generateSessionSummary } from "@/lib/ai/session-summary";
import {
  handleVoiceSave,
  type ActivitySegment,
  type CompletionSession,
  type ProgressSession,
  type VoiceSaveOps,
  type VoiceSavePayload,
} from "./logic";

const log = createLogger("api/voice/save");
const voiceSaveOps: VoiceSaveOps = {
  async insertMessages(sessionId, messages) {
    await supabaseAdmin.from("messages").insert(
      messages.map((m) => ({
        sessionId,
        role: m.role === "user" ? ("USER" as const) : ("ASSISTANT" as const),
        content: m.content,
        contentType: "TEXT" as const,
        questionId: m.questionId || null,
        wordCount: m.content.split(/\s+/).length,
        transcription: m.source === "chat" ? "chat" : null,
      })),
    );
  },
  async loadSessionForCompletion(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(
        `*, interview:interviews!inner(title, objective, language, userId, projectId, assessmentCriteria, questions(text, order, type))`,
      )
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as CompletionSession | null) ?? null;
  },
  async loadActivitySegments(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select("activitySegments")
      .eq("id", sessionId)
      .single();
    return ((data?.activitySegments as ActivitySegment[]) ?? []);
  },
  async closeOpenSegments(sessionId, now) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select("activitySegments")
      .eq("id", sessionId)
      .single();
    const segments = ((data?.activitySegments as ActivitySegment[]) ?? []);
    const closed = segments.map((s) =>
      s.leftAt === null ? { ...s, leftAt: now } : s,
    );
    await supabaseAdmin
      .from("sessions")
      .update({ activitySegments: closed })
      .eq("id", sessionId);
    return closed;
  },
  async loadMessageTimestamps(sessionId) {
    const { data } = await supabaseAdmin
      .from("messages")
      .select("timestamp")
      .eq("sessionId", sessionId)
      .order("timestamp", { ascending: true });

    return (data ?? []).map((r) => r.timestamp as string);
  },
  async loadSessionForProgress(sessionId) {
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(`*, interview:interviews!inner(questions(*))`)
      .eq("id", sessionId)
      .order("order", {
        referencedTable: "interviews.questions",
        ascending: true,
      })
      .single();

    return (data as ProgressSession | null) ?? null;
  },
  async updateSession(sessionId, payload) {
    await supabaseAdmin.from("sessions").update(payload).eq("id", sessionId);
  },
  generateSummary: (sessionId: string) => generateSessionSummary(sessionId),
  log,
  now: () => new Date(),
};

/**
 * POST /api/voice/save
 * Save voice interview messages, optionally complete the session,
 * and fire-and-forget an AI summary/analysis so the interviewee isn't blocked.
 */
export async function POST(req: Request) {
  const payload = (await req.json()) as VoiceSavePayload;
  if (
    payload.sessionId &&
    !(await sessionTokenValid(supabaseAdmin, payload.sessionId, payload.sessionToken))
  ) {
    return NextResponse.json({ error: "Invalid session token" }, { status: 403 });
  }
  const result = await handleVoiceSave(payload, voiceSaveOps);
  return NextResponse.json(result.body, { status: result.status });
}
