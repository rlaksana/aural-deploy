import { TRPCError } from "@trpc/server";
import { createLogger } from "@/lib/logger";
import { getOrgMembership, hasMinRole } from "@/server/rbac";
import { verifyInterviewAccess } from "@/server/routers/candidate";

const log = createLogger("api/ai/summarize");

export type SummarizeAccess =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Report management for /api/ai/summarize uses the shared org/project RBAC
 * the tRPC routers use, requiring at least MEMBER on the interview's project
 * (VIEWER stays read-only). Grant denials — unknown session/interview,
 * foreign org, no project grant — return a uniform 404 with no existence
 * oracle (operator directive); the specific cause goes to the server log
 * only, so triage never depends on what the client can see.
 */
function deny(
  status: number,
  error: string,
  cause: Record<string, unknown>,
): SummarizeAccess {
  log.warn("Summarize access denied", { ...cause, status, error });
  return { ok: false, status, error };
}

export async function authorizeReportManager(
  supabase: Parameters<typeof getOrgMembership>[0],
  interviewId: string,
  userId: string,
): Promise<SummarizeAccess> {
  let role;
  try {
    const access = await verifyInterviewAccess(supabase, interviewId, userId);
    role = access.role;
  } catch (error) {
    if (error instanceof TRPCError) {
      // Uniform 404 to the client; the distinguishing cause (unknown
      // interview, foreign org, no project grant) goes to the server log.
      return deny(404, "Not found", {
        interviewId,
        userId,
        trpcCode: error.code,
        detail: error.message,
      });
    }
    throw error;
  }
  if (!hasMinRole(role, "MEMBER")) {
    return deny(
      403,
      `You need at least MEMBER permission to perform this action. Your current role is ${role}.`,
      { interviewId, userId },
    );
  }
  return { ok: true };
}

/**
 * Session-id entry point for the route: derives the interview from the
 * sessions row itself, so the HTTP layer never holds its own
 * session-vs-interview id plumbing.
 */
export async function authorizeSummarizeForSession(
  supabase: Parameters<typeof getOrgMembership>[0],
  sessionId: string,
  userId: string,
): Promise<SummarizeAccess> {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("interviewId")
    .eq("id", sessionId)
    .single();
  if (error) log.error("Session lookup failed", error);
  if (!session) {
    return deny(404, "Not found", { sessionId, userId });
  }
  const interviewId = (session as { interviewId: string }).interviewId;
  return authorizeReportManager(supabase, interviewId, userId);
}
