import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous candidates authorize session writes with the per-session
 * accessToken handed out at creation (migrations/013); sessions predating the
 * column keep the legacy id-as-capability posture. Same rule as
 * src/server/routers/session.ts.
 */
export async function sessionTokenValid(
  supabase: SupabaseClient,
  sessionId: string,
  token: string | null | undefined,
): Promise<boolean> {
  const { data } = await supabase
    .from("sessions")
    .select("accessToken")
    .eq("id", sessionId)
    .single();
  if (!data) return false;
  const stored = (data as { accessToken?: string | null }).accessToken;
  return !stored || stored === token;
}
