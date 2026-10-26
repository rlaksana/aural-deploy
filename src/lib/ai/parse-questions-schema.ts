import { z } from "zod";
import { QUESTION_TYPES } from "./generated-schema";

export const parsedQuestionSchema = z
  .object({
    text: z.string().min(1),
    type: z.enum(QUESTION_TYPES).default("OPEN_ENDED"),
    description: z.string().nullable().optional(),
    expectedAnswer: z.string().nullable().optional(),
    timeLimitSeconds: z.number().int().nullable().optional(),
    isRequired: z.boolean().optional().default(true),
    options: z
      .object({
        options: z.array(z.string().min(1)),
        allowMultiple: z.boolean().optional(),
        correctIndices: z.array(z.number().int()).optional(),
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
      expectedAnswer: q.expectedAnswer ?? undefined,
      timeLimitSeconds: q.timeLimitSeconds ?? null,
      isRequired: q.isRequired,
      options: options ? { options: options.options, allowMultiple: options.allowMultiple, correctIndices: options.correctIndices } : undefined,
      starterCode: q.starterCode ?? undefined,
    };
  });

export const parsedCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
});

export const parseQuestionsResponseSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  questions: z.array(parsedQuestionSchema).min(1).max(100),
  criteria: z.array(parsedCriterionSchema).max(10).optional(),
});

/** Required-shape description for the repair model (see repair.ts). */
export const PARSE_QUESTIONS_SHAPE_HINT = `Required field: "questions" (array of 1-100 objects, each {"text": string (required), "type": "OPEN_ENDED"|"SINGLE_CHOICE"|"MULTIPLE_CHOICE"|"CODING"|"WHITEBOARD"|"RESEARCH", "description"?: string, "expectedAnswer"?: string|null, "options"?: {options: string[] (min 2), allowMultiple?: boolean, correctIndices?: number[]}|null, "starterCode"?: {language: string, code: string}|null, "isRequired"?: boolean}). Optional: "title" (string), "description" (string), "criteria" (array of {name: string, description: string}).`;

export const parseQuestionsRequestSchema = z.object({
  text: z.string().trim().min(10).max(50_000),
  language: z.string().min(2).max(8).optional(),
  // Present when invoked from an existing interview's Parse Text dialog —
  // enables deferred execution that appends questions server-side.
  interviewId: z.string().optional(),
});

export type ParsedQuestionExtracted = z.infer<typeof parsedQuestionSchema>;
export type ParsedCriterionExtracted = z.infer<typeof parsedCriterionSchema>;
