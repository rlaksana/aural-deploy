import { z } from "zod";
import { QUESTION_TYPES } from "./generated-schema";

export const parsedQuestionSchema = z
  .object({
    text: z.string().min(1),
    type: z.enum(QUESTION_TYPES).default("OPEN_ENDED"),
    description: z.string().nullable().optional(),
    timeLimitSeconds: z.number().int().nullable().optional(),
    isRequired: z.boolean().optional().default(true),
    options: z
      .object({
        options: z.array(z.string().min(1)),
        allowMultiple: z.boolean().optional(),
      })
      .nullable()
      .optional(),
    starterCode: z
      .object({ language: z.string().min(1), code: z.string() })
      .nullable()
      .optional(),
    category: z.string().optional(),
    assesses: z.string().optional(),
  })
  .transform((q) => {
    // Sanitize type & options invariants if LLM misclassified options
    let type = q.type;
    let options = q.options;

    if (options && options.options.length >= 2) {
      if (type !== "SINGLE_CHOICE" && type !== "MULTIPLE_CHOICE") {
        type = options.allowMultiple ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";
      }
    } else {
      if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
        type = "OPEN_ENDED";
      }
      options = null;
    }

    if (type !== "CODING") {
      q.starterCode = null;
    }

    return {
      text: q.text,
      type,
      description: q.description || q.assesses || q.category || undefined,
      timeLimitSeconds: q.timeLimitSeconds ?? null,
      isRequired: q.isRequired,
      options: options ? { options: options.options, allowMultiple: options.allowMultiple } : undefined,
      starterCode: q.starterCode ?? undefined,
    };
  });

export const parseQuestionsResponseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(parsedQuestionSchema).min(1).max(100),
});

export const parseQuestionsRequestSchema = z.object({
  text: z.string().trim().min(10).max(50_000),
  language: z.string().min(2).max(8).optional(),
});

export type ParsedQuestionExtracted = z.infer<typeof parsedQuestionSchema>;
