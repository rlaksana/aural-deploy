import { z } from "zod";

export const QUESTION_TYPES = [
  "OPEN_ENDED",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "CODING",
  "WHITEBOARD",
  "RESEARCH",
] as const;

const languageCode = z.string().min(2).max(8);
const positiveInt = z.number().int().positive();

const generatedQuestionSchema = z
  .object({
    order: positiveInt.optional(),
    text: z.string().min(1),
    description: z.string().nullable().optional(),
    expectedAnswer: z.string().nullable().optional(),
    type: z.enum(QUESTION_TYPES),
    timeLimitSeconds: z.number().int().nullable().optional(),
    isRequired: z.boolean().optional().default(true),
    options: z
      .object({
        options: z.array(z.string().min(1)).min(2).max(6),
        allowMultiple: z.boolean().optional(),
        correctIndices: z.array(z.number().int()).optional(),
      })
      .nullable()
      .optional(),
    starterCode: z
      .object({ language: z.string().min(1), code: z.string() })
      .nullable()
      .optional(),
  })
  .superRefine((q, ctx) => {
    const needsOptions =
      q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE";
    if (needsOptions) {
      if (!q.options || q.options.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["options"],
          message: `${q.type} requires at least 2 options`,
        });
      }
    } else if (q.options) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: `${q.type} must not include options`,
      });
    }

    if (q.type === "CODING") {
      if (!q.starterCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["starterCode"],
          message: "CODING requires a starterCode object",
        });
      }
    } else if (q.starterCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["starterCode"],
        message: `${q.type} must not include starterCode`,
      });
    }
  });

const assessmentCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
});

export const generatedInterviewSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  objective: z.string().min(1),
  assessmentCriteria: z.array(assessmentCriterionSchema).min(1).max(10),
  estimatedDurationMinutes: positiveInt,
  questions: z.array(generatedQuestionSchema).min(1).max(25),
  recommendedSettings: z
    .object({
      aiName: z.string().min(1).max(40),
    })
    // Cosmetic label only — a repaired/truncated output that omits it falls
    // back to the product default instead of failing validation.
    .default({ aiName: "Aural" }),
});

/**
 * Compact required-shape description handed to the repair model so it can
 * complete structurally missing fields (schema-conforming defaults) instead
 * of returning output that fails validation again.
 */
export const GENERATED_INTERVIEW_SHAPE_HINT = `Required top-level fields: "title" (string), "description" (string), "objective" (string), "assessmentCriteria" (array of 1-10 objects {name: string, description: string}), "estimatedDurationMinutes" (positive integer), "questions" (array of 1-25 objects), "recommendedSettings" ({aiName: string}) — use a minimal value like {"aiName":"Aural"} if absent from the raw output. Each question object: {"text": string (required), "type": "OPEN_ENDED"|"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"CODING"|"WHITEBOARD"|"RESEARCH" (required), "description": string|null, "expectedAnswer": string|null, "options": {options: string[] (min 2), allowMultiple: boolean, correctIndices: number[]}|null, "starterCode": {language: string, code: string}|null, "timeLimitSeconds": number|null, "isRequired": boolean}. CODING questions require starterCode; SINGLE_CHOICE/MULTIPLE_CHOICE require options.`;

export type GeneratedInterviewValidated = z.infer<typeof generatedInterviewSchema>;
export type GeneratedQuestionValidated = z.infer<typeof generatedQuestionSchema>;

/** Request body accepted by /api/ai/generate and /api/ai/refine. */
export const generateRequestSchema = z.object({
  description: z.string().trim().min(1).max(2_000),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  language: languageCode.default("id"),
  jobDescription: z.string().max(15_000).optional(),
  resumeText: z.string().max(15_000).optional(),
  // Captured at enqueue time so a queued-generation executor can create the
  // interview server-side without the client's review step.
  projectId: z.string().optional(),
  settings: z
    .object({
      chatEnabled: z.boolean().default(true),
      voiceEnabled: z.boolean().default(false),
      videoEnabled: z.boolean().default(false),
      aiTone: z
        .enum(["CASUAL", "PROFESSIONAL", "FORMAL", "FRIENDLY"])
        .default("PROFESSIONAL"),
      followUpDepth: z.enum(["LIGHT", "MODERATE", "DEEP"]).default("MODERATE"),
      antiCheatingEnabled: z.boolean().default(false),
      timeLimitMinutes: z.number().int().min(1).optional(),
    })
    .optional(),
});

export const refineRequestSchema = z.object({
  interview: z.object({
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    objective: z.string().nullable().optional(),
    assessmentCriteria: z.array(assessmentCriterionSchema).optional(),
    questions: z
      .array(
        z.object({
          text: z.string(),
          type: z.string(),
          options: z
              .object({
                options: z.array(z.string()),
                allowMultiple: z.boolean().optional(),
              })
              .nullable()
              .optional(),
          starterCode: z
              .object({ language: z.string(), code: z.string() })
              .nullable()
              .optional(),
          description: z.string().nullable().optional(),
          timeLimitSeconds: z.number().nullable().optional(),
          isRequired: z.boolean().optional(),
        })
      )
      .min(1)
      .max(25),
  }),
  feedback: z.string().trim().min(1).max(1_000),
  language: languageCode.default("id"),
  jobDescription: z.string().max(15_000).optional(),
  resumeText: z.string().max(15_000).optional(),
});