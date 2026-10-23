import { z } from "zod";

/**
 * Per-candidate deep analysis (JD × resume, JD × interview answers,
 * JD × both combined). Each of the three parallel LLM calls emits ONE
 * section — smaller output means fewer truncations and a repairable
 * object. The persisted wrapper is assembled in code, never by the model.
 */

const sectionShape = {
  score: z.number().min(1).max(10),
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
};

export const sectionAnalysisSchema = z.object(sectionShape);

export const overallAnalysisSchema = z.object({
  ...sectionShape,
  verdict: z.enum(["STRONG_HIRE", "HIRE", "CONDITIONAL", "NO_HIRE"]),
  recommendation: z.string().min(1),
});

export const candidateAnalysisSchema = z.object({
  resumeFit: sectionAnalysisSchema,
  interviewFit: sectionAnalysisSchema,
  overall: overallAnalysisSchema,
});

export type SectionAnalysis = z.infer<typeof sectionAnalysisSchema>;
export type OverallAnalysis = z.infer<typeof overallAnalysisSchema>;
export type CandidateAnalysis = z.infer<typeof candidateAnalysisSchema>;

/** Shape persisted into sessions."candidateAnalysis" after all 3 sections pass. */
export interface StoredCandidateAnalysis {
  generatedAt: string;
  language: string;
  jdSource: "jobDescription" | "fallback";
  resumeFit: SectionAnalysis;
  interviewFit: SectionAnalysis;
  overall: OverallAnalysis;
}

export const RESUME_FIT_SHAPE_HINT = `{
  "score": 7,
  "summary": "assessment of how well the resume matches the job",
  "strengths": ["relevant experience/skill that fits the job"],
  "gaps": ["requirement the resume does not evidence"]
}`;

export const INTERVIEW_FIT_SHAPE_HINT = `{
  "score": 7,
  "summary": "assessment of how well the interview answers demonstrate the job's required capabilities",
  "strengths": ["answer quality that supports the job fit"],
  "gaps": ["capability the answers did not evidence"]
}`;

export const OVERALL_SHAPE_HINT = `{
  "score": 7,
  "summary": "synthesis of resume fit and interview performance",
  "strengths": ["strongest cross-cutting evidence"],
  "gaps": ["biggest cross-cutting risk"],
  "verdict": "STRONG_HIRE" | "HIRE" | "CONDITIONAL" | "NO_HIRE",
  "recommendation": "final hiring recommendation with reasoning"
}`;
