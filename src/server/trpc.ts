import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { type Context } from "./context";

const FRIENDLY_MESSAGES: Partial<Record<string, string>> = {
  FORBIDDEN: "You don't have permission to perform this action. Please contact your admin for access.",
  UNAUTHORIZED: "You need to sign in to continue.",
  NOT_FOUND: "The requested resource was not found.",
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const hasCustomMessage = error.message !== error.code;
    return {
      ...shape,
      message: hasCustomMessage
        ? error.message
        : FRIENDLY_MESSAGES[error.code] ?? shape.message,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const enforceUserIsAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/* ------------------------------------------------------------------ */
/*  RBAC helpers — implementation lives in ./rbac (kept free of        */
/*  supabase/env imports so it stays unit-testable).                   */
/* ------------------------------------------------------------------ */

export {
  hasMinRole,
  assertMinRole,
  getOrgMembership,
  hasProjectAccess,
  getEffectiveProjectRole,
  filterAccessibleProjectIds,
} from "./rbac";
export type { MemberRole } from "./rbac";
