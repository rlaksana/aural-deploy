import { TRPCError } from "@trpc/server";

/** The separation invariant: an invite must stay inside one position. */
export function assertSamePosition(
  positionId: string,
  interviewPositionId: string | null,
): void {
  if (interviewPositionId !== positionId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Interview is not part of this position",
    });
  }
}

/** Invite links use the same shape the dashboard builds client-side. */
export function buildInviteUrl(origin: string, inviteToken: string): string {
  return `${origin.replace(/\/$/, "")}/i/invite/${inviteToken}`;
}

/** Server-side origin — NEXT_PUBLIC_APP_URL is the documented canonical app URL. */
export function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
}
