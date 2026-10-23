import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "@/lib/id";
import { appOrigin, assertSamePosition, buildInviteUrl } from "@/lib/position-invite";
import { sendInterviewInvite } from "@/lib/email";
import {
  assertMinRole,
  filterAccessibleProjectIds,
  getEffectiveProjectRole,
  getOrgMembership,
  hasProjectAccess,
  protectedProcedure,
  router,
  type MemberRole,
} from "../trpc";
import { verifyInterviewAccess } from "./candidate";

/* ------------------------------------------------------------------ */
/*  Helper: verify position access via org membership (mirrors         */
/*  verifyInterviewAccess; owner-only RLS is only the floor —          */
/*  ctx.supabase is service-role).                                     */
/* ------------------------------------------------------------------ */

export async function verifyPositionAccess(
  supabase: Parameters<typeof getOrgMembership>[0],
  positionId: string,
  userId: string,
): Promise<{ role: MemberRole; organizationId: string }> {
  const { data: position } = await supabase
    .from("job_positions")
    .select("projectId, project:projects!inner(organizationId)")
    .eq("id", positionId)
    .single();

  if (!position) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
  }

  const project = position.project as unknown as { organizationId: string };

  const membership = await getOrgMembership(supabase, project.organizationId, userId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
  }

  const projAccess = await hasProjectAccess(supabase, position.projectId, userId);
  if (!projAccess) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
  }

  const role = await getEffectiveProjectRole(supabase, position.projectId, userId, membership.role);
  return { role, organizationId: project.organizationId };
}

/**
 * Copy-on-create JD prefill for interviews created under a position:
 * jobPositionId persists as-is; jobDescription defaults from the position
 * when the caller does not pass one. Every creation entry point
 * (AI generator / manual / template) resolves through this.
 */
export async function resolvePositionPrefill(
  supabase: Parameters<typeof getOrgMembership>[0],
  userId: string,
  jobPositionId?: string,
  jobDescription?: string,
): Promise<{ jobPositionId: string | null; jobDescription: string | null }> {
  if (!jobPositionId) {
    return { jobPositionId: null, jobDescription: jobDescription ?? null };
  }
  const { role } = await verifyPositionAccess(supabase, jobPositionId, userId);
  assertMinRole(role, "MEMBER");
  const { data: position } = await supabase
    .from("job_positions")
    .select("jobDescription")
    .eq("id", jobPositionId)
    .single();
  return {
    jobPositionId,
    jobDescription: jobDescription ?? position?.jobDescription ?? null,
  };
}

const bankCandidateFields = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  resumeText: z.string().optional(),
  resumeFileName: z.string().optional(),
});

// '' emails violate the partial unique index — coerce to NULL (candidate.ts idiom).
function coerceEmail(email: string | undefined | null): string | null {
  return email?.trim().toLowerCase() || null;
}

function bankName(name: string | undefined, resumeFileName: string | undefined): string {
  return name?.trim() || resumeFileName?.replace(/\.[^.]+$/, "") || "Kandidat";
}

export const positionRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1),
        jobDescription: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: project } = await ctx.supabase
        .from("projects")
        .select("id, organizationId")
        .eq("id", input.projectId)
        .single();
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const membership = await getOrgMembership(ctx.supabase, project.organizationId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
      }
      const projAccess = await hasProjectAccess(ctx.supabase, project.id, ctx.user.id);
      if (!projAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
      }
      const effectiveRole = await getEffectiveProjectRole(ctx.supabase, project.id, ctx.user.id, membership.role);
      assertMinRole(effectiveRole, "MEMBER");

      const { data: position, error } = await ctx.supabase
        .from("job_positions")
        .insert({
          title: input.title,
          jobDescription: input.jobDescription ?? null,
          projectId: input.projectId,
          userId: ctx.user.id,
        })
        .select()
        .single();
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return position;
    }),

  list: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
          limit: z.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;

      if (input?.organizationId) {
        const membership = await getOrgMembership(ctx.supabase, input.organizationId, ctx.user.id);
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this organization" });
        }
      }

      let query = ctx.supabase
        .from("job_positions")
        .select("*")
        .order("updatedAt", { ascending: false })
        .limit(limit + 1);

      if (input?.projectId) {
        const projAccess = await hasProjectAccess(ctx.supabase, input.projectId, ctx.user.id);
        if (!projAccess) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project" });
        }
        query = query.eq("projectId", input.projectId);
      } else {
        const orgIds = input?.organizationId
          ? [input.organizationId]
          : (
              (
                await ctx.supabase
                  .from("organization_members")
                  .select("workspaceId")
                  .eq("userId", ctx.user.id)
              ).data ?? []
            ).map((m: { workspaceId: string }) => m.workspaceId);
        if (orgIds.length === 0) return { positions: [], nextCursor: undefined };

        const { data: allProjects } = await ctx.supabase
          .from("projects")
          .select("id")
          .in("organizationId", orgIds);
        const allProjIds = (allProjects ?? []).map((p: { id: string }) => p.id);
        const accessibleProjIds = await filterAccessibleProjectIds(ctx.supabase, allProjIds, ctx.user.id);
        if (accessibleProjIds.length === 0) return { positions: [], nextCursor: undefined };
        query = query.in("projectId", accessibleProjIds);
      }

      if (input?.cursor) {
        const { data: cursorRow } = await ctx.supabase
          .from("job_positions")
          .select("updatedAt")
          .eq("id", input.cursor)
          .single();
        if (cursorRow) {
          query = query.lte("updatedAt", (cursorRow as { updatedAt: string }).updatedAt);
        }
      }

      const { data: raw } = await query;
      const rows = (raw ?? []) as { id: string }[];

      let nextCursor: string | undefined;
      if (rows.length > limit) {
        nextCursor = rows[limit - 1]!.id;
      }
      return { positions: rows.slice(0, limit), nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyPositionAccess(ctx.supabase, input.id, ctx.user.id);

      const { data: position } = await ctx.supabase
        .from("job_positions")
        .select("*")
        .eq("id", input.id)
        .single();
      if (!position) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      }

      const { data: interviews } = await ctx.supabase
        .from("interviews")
        .select("id, title, kind, language, createdAt")
        .eq("jobPositionId", input.id)
        .order("createdAt", { ascending: true });

      return { position, interviews: interviews ?? [] };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        jobDescription: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyPositionAccess(ctx.supabase, input.id, ctx.user.id);
      assertMinRole(role, "MEMBER");

      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.jobDescription !== undefined) patch.jobDescription = input.jobDescription;

      const { data: position, error } = await ctx.supabase
        .from("job_positions")
        .update(patch)
        .eq("id", input.id)
        .select()
        .single();
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return position;
    }),

  // Cascade deletes the whole resume bank; interviews survive standalone
  // (jobPositionId SET NULL). The UI must hard-confirm this.
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyPositionAccess(ctx.supabase, input.id, ctx.user.id);
      assertMinRole(role, "MEMBER");
      const { error } = await ctx.supabase.from("job_positions").delete().eq("id", input.id);
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { success: true };
    }),

  addCandidate: protectedProcedure
    .input(bankCandidateFields.extend({ jobPositionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyPositionAccess(ctx.supabase, input.jobPositionId, ctx.user.id);
      assertMinRole(role, "MEMBER");

      const { data: row, error } = await ctx.supabase
        .from("position_candidates")
        .insert({
          jobPositionId: input.jobPositionId,
          name: bankName(input.name, input.resumeFileName),
          email: coerceEmail(input.email),
          resumeText: input.resumeText ?? null,
          resumeFileName: input.resumeFileName ?? null,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A candidate with this email already exists in this position",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return row;
    }),

  bulkAddCandidates: protectedProcedure
    .input(
      z.object({
        jobPositionId: z.string(),
        candidates: z.array(bankCandidateFields).min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { role } = await verifyPositionAccess(ctx.supabase, input.jobPositionId, ctx.user.id);
      assertMinRole(role, "MEMBER");

      const seen = new Set<string>();
      const deduped = input.candidates.filter((c) => {
        const email = c.email?.trim().toLowerCase();
        if (!email) return true;
        if (seen.has(email)) return false;
        seen.add(email);
        return true;
      });

      const rows = deduped.map((c) => ({
        jobPositionId: input.jobPositionId,
        name: bankName(c.name, c.resumeFileName),
        email: coerceEmail(c.email),
        resumeText: c.resumeText ?? null,
        resumeFileName: c.resumeFileName ?? null,
      }));
      if (rows.length === 0) {
        return { created: 0, total: 0 };
      }

      const { data, error } = await ctx.supabase
        .from("position_candidates")
        .insert(rows)
        .select();
      if (error) {
        if (error.code === "23505") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more candidates already exist in this position (duplicate email)",
          });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { created: data?.length ?? 0, total: deduped.length };
    }),

  // Two plain queries (bank rows + junction links) instead of one mega-join,
  // mirroring how candidate.list splits linked vs walk-in.
  listCandidates: protectedProcedure
    .input(z.object({ jobPositionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyPositionAccess(ctx.supabase, input.jobPositionId, ctx.user.id);

      const { data: candidates } = await ctx.supabase
        .from("position_candidates")
        .select("*")
        .eq("jobPositionId", input.jobPositionId)
        .order("createdAt", { ascending: true });

      const { data: invites } = await ctx.supabase
        .from("position_candidate_interviews")
        .select(
          `positionCandidateId, interviewId, candidateId,
           positionCandidate:position_candidates!inner(id),
           candidate:candidates(id, name, email, sessionId, session:sessions(id, status, candidateAnalysis)),
           interview:interviews(id, title)`,
        )
        .eq("positionCandidate.jobPositionId", input.jobPositionId);

      return { candidates: candidates ?? [], invites: invites ?? [] };
    }),

  removeCandidate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: row } = await ctx.supabase
        .from("position_candidates")
        .select("jobPositionId")
        .eq("id", input.id)
        .single();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bank candidate not found" });
      }
      const { role } = await verifyPositionAccess(ctx.supabase, row.jobPositionId, ctx.user.id);
      assertMinRole(role, "MEMBER");
      const { error } = await ctx.supabase.from("position_candidates").delete().eq("id", input.id);
      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { success: true };
    }),

  invite: protectedProcedure
    .input(z.object({ positionCandidateId: z.string(), interviewId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: pc } = await ctx.supabase
        .from("position_candidates")
        .select("id, jobPositionId, name, email")
        .eq("id", input.positionCandidateId)
        .single();
      if (!pc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bank candidate not found" });
      }
      const { role: posRole } = await verifyPositionAccess(ctx.supabase, pc.jobPositionId, ctx.user.id);
      assertMinRole(posRole, "MEMBER");
      const { role: intRole } = await verifyInterviewAccess(ctx.supabase, input.interviewId, ctx.user.id);
      assertMinRole(intRole, "MEMBER");

      const { data: interviewRow } = await ctx.supabase
        .from("interviews")
        .select("id, title, language, jobPositionId")
        .eq("id", input.interviewId)
        .single();
      if (!interviewRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }
      assertSamePosition(pc.jobPositionId, interviewRow.jobPositionId);

      const { data: positionRow } = await ctx.supabase
        .from("job_positions")
        .select("title")
        .eq("id", pc.jobPositionId)
        .single();

      // Idempotent re-invite: an existing junction row with a live candidate
      // re-sends the same invite link instead of minting a new token.
      let candidateId: string | null = null;
      let inviteToken: string | null = null;
      const { data: existing } = await ctx.supabase
        .from("position_candidate_interviews")
        .select("candidateId")
        .eq("positionCandidateId", input.positionCandidateId)
        .eq("interviewId", input.interviewId)
        .maybeSingle();
      if (existing?.candidateId) {
        const { data: cand } = await ctx.supabase
          .from("candidates")
          .select("id, inviteToken")
          .eq("id", existing.candidateId)
          .single();
        if (cand) {
          candidateId = cand.id;
          inviteToken = cand.inviteToken;
        }
      }

      if (!candidateId || !inviteToken) {
        inviteToken = nanoid(12);
        const { data: cand, error } = await ctx.supabase
          .from("candidates")
          .insert({
            interviewId: input.interviewId,
            name: pc.name,
            email: pc.email || null,
            inviteToken,
          })
          .select("id")
          .single();
        if (error) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        }
        candidateId = cand.id;
        const { error: jErr } = await ctx.supabase
          .from("position_candidate_interviews")
          .upsert(
            {
              positionCandidateId: input.positionCandidateId,
              interviewId: input.interviewId,
              candidateId,
            },
            { onConflict: "positionCandidateId,interviewId" },
          );
        if (jErr) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: jErr.message });
        }
      }

      const inviteUrl = buildInviteUrl(appOrigin(), inviteToken);

      // Email is non-fatal: send failure still returns the copyable link.
      let emailSent = false;
      if (pc.email) {
        const result = await sendInterviewInvite({
          to: pc.email,
          candidateName: pc.name,
          interviewTitle: interviewRow.title,
          positionTitle: positionRow?.title,
          inviteUrl,
          language: interviewRow.language,
        });
        emailSent = result.sent;
      }

      return { candidateId, inviteToken, inviteUrl, emailSent };
    }),
});
