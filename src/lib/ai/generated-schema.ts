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

/** One questionEvaluation entry. Loose on purpose: unknown fields (extra UI
 *  fields like highlights/improvements wording) must survive validation, and a
 *  null/absent score is LEGAL here — it means "not graded" and is rejected by
 *  the merge + pendingGrading gate, never fabricated by the repair model. */
const summaryEvalEntry = z.looseObject({
  index: z.number().optional(),
  question: z.string().optional(),
  score: z.union([z.number(), z.string()]).nullish(),
  evaluation: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional(),
});

const summaryCriteriaEntry = z.looseObject({
  name: z.string().optional(),
  score: z.union([z.number(), z.string()]).nullish(),
});

/**
 * Session summary/report structure. Strict ONLY on the load-bearing format
 * contract (exactly one evaluation per interview question); loose everywhere
 * else so healthy output passes with zero repair calls. Handed to
 * repairStructured: a parse/validation failure sends the raw model output to
 * the OpenRouter repair model for FORMAT-ONLY repair — never a main-model
 * re-run, never fabricated scores. The evaluation count must equal
 * `questionCount` because that is exactly what the prompt instructs; any
 * other count is a format violation a repair model can see.
 */
export function buildSummaryReportSchema(questionCount: number) {
  return z.looseObject({
    summary: z.string().optional(),
    themes: z.array(z.string()).optional(),
    sentiment: z.record(z.string(), z.unknown()).optional(),
    keyInsights: z.array(z.string()).optional(),
    notableQuotes: z.array(z.string()).optional(),
    toneAnalysis: z.record(z.string(), z.unknown()).optional(),
    questionEvaluations:
      questionCount > 0
        ? z.array(summaryEvalEntry).length(questionCount)
        : z.array(summaryEvalEntry).optional(),
    criteriaEvaluations: z.array(summaryCriteriaEntry).optional(),
    researchFindings: z.array(z.record(z.string(), z.unknown())).optional(),
  });
}

/**
 * Compact required-shape description handed to the repair model alongside
 * summary output so it can fix structure without inventing content.
 */
export const SUMMARY_REPORT_SHAPE_HINT = `Required top-level fields: "summary" (string), "themes" (string[]), "sentiment" ({overall: "positive"|"neutral"|"negative", details: string}), "keyInsights" (string[]), "questionEvaluations" (array with EXACTLY ONE entry per interview question, in question order) — plus optional "notableQuotes" (string[]), "toneAnalysis" ({overall, details, segments}), "criteriaEvaluations" (array of {name: string, score: number, reasoning: string}), "researchFindings". Each questionEvaluations entry: {"index": that question's 1-based number (integer), "question": the question text, "score": number 1-10, "evaluation": string, "highlights": string[], "improvements": string[]}. NEVER invent or alter scores and never add entries beyond what the raw output contains — fix structure and syntax only, and complete a cut-off last entry from its own fragments.`;

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
          // Pass through so the refine LLM can preserve existing answer keys
          // and rubrics instead of regenerating them blind.
          expectedAnswer: z.string().nullable().optional(),
          options: z
              .object({
                options: z.array(z.string()),
                allowMultiple: z.boolean().optional(),
                correctIndices: z.array(z.number().int()).optional(),
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