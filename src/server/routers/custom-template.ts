import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getOrgMembership, hasProjectAccess, protectedProcedure, router } from "../trpc";

/**
 * Org-wide reusable interview templates. A template is a snapshot of an
 * existing interview (config + questions) stored as one jsonb payload, so
 * editing the source interview never mutates the template.
 */

const configSchema = z.object({
  objective: z.string().optional(),
  aiTone: z.string().optional(),
  followUpDepth: z.string().optional(),
  assessmentCriteria: z
    .array(z.object({ name: z.string(), description: z.string() }))
    .optional(),
  chatEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  timeLimitMinutes: z.number().nullable().optional(),
  language: z.string().optional(),
  questions: z.array(z.record(z.string(), z.unknown())).optional(),
});

/** The user's first org, same resolution rule as resolveDefaultProject. */
async function userOrgId(supabase: Parameters<typeof getOrgMembership>[0], userId: string) {
  const { data: membership } = await supabase
    .from("organization_members")
    .select("workspaceId")
    .eq("userId", userId)
    .limit(1)
    .single();
  return membership?.workspaceId ?? null;
}

export const customTemplateRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const orgId = await userOrgId(ctx.supabase, ctx.user.id);
    if (!orgId) return { templates: [] };

    const { data } = await ctx.supabase
      .from("custom_templates")
      .select("id, title, description, config, \"createdAt\", \"createdBy\"")
      .eq("organizationId", orgId)
      .order("createdAt", { ascending: false });

    return {
      templates: (data ?? []).map((row) => {
        const parsed = configSchema.safeParse(row.config);
        const config = parsed.success ? parsed.data : {};
        return {
          id: row.id as string,
          title: row.title as string,
          description: (row.description as string | null) ?? "",
          questionCount: config.questions?.length ?? 0,
          timeLimitMinutes: config.timeLimitMinutes ?? null,
          createdBy: row.createdBy as string,
        };
      }),
    };
  }),

  /** Snapshot an existing interview into an org-wide template. */
  createFromInterview: protectedProcedure
    .input(
      z.object({
        interviewId: z.string(),
        title: z.string().trim().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: interview } = await ctx.supabase
        .from("interviews")
        .select(
          "*, questions(*)",
        )
        .eq("id", input.interviewId)
        .order("order", { referencedTable: "questions", ascending: true })
        .single();

      if (!interview) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });
      }

      const hasAccess = await hasProjectAccess(
        ctx.supabase,
        (interview as { projectId: string }).projectId,
        ctx.user.id,
      );
      if (!hasAccess) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No access to project" });
      }

      const { data: project } = await ctx.supabase
        .from("projects")
        .select("organizationId")
        .eq("id", (interview as { projectId: string }).projectId)
        .single();
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const iv = interview as {
        title: string;
        description: string | null;
        objective: string | null;
        aiTone: string;
        followUpDepth: string;
        assessmentCriteria: unknown;
        chatEnabled: boolean;
        voiceEnabled: boolean;
        videoEnabled: boolean;
        timeLimitMinutes: number | null;
        language: string;
        questions: Record<string, unknown>[];
      };

      const { error } = await ctx.supabase.from("custom_templates").insert({
        organizationId: project.organizationId,
        createdBy: ctx.user.id,
        title: input.title ?? iv.title,
        description: iv.description,
        config: {
          objective: iv.objective,
          aiTone: iv.aiTone,
          followUpDepth: iv.followUpDepth,
          assessmentCriteria: iv.assessmentCriteria,
          chatEnabled: iv.chatEnabled,
          voiceEnabled: iv.voiceEnabled,
          videoEnabled: iv.videoEnabled,
          timeLimitMinutes: iv.timeLimitMinutes,
          language: iv.language,
          questions: iv.questions,
        },
      });

      if (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }

      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { data: row } = await ctx.supabase
        .from("custom_templates")
        .select("organizationId")
        .eq("id", input.id)
        .single();

      // Not found and not-a-member read identically so ids from other orgs
      // cannot be probed.
      if (
        !row ||
        !(await getOrgMembership(ctx.supabase, row.organizationId, ctx.user.id))
      ) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      await ctx.supabase.from("custom_templates").delete().eq("id", input.id);
      return { ok: true };
    }),
});
