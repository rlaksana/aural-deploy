import {
  INTERVIEW_FIT_SHAPE_HINT,
  OVERALL_SHAPE_HINT,
  RESUME_FIT_SHAPE_HINT,
} from "../candidate-analysis-schema";
import { getPromptLanguageName } from "../language-name";
import type { LLMMessage } from "../types";

export type CandidateAnalysisSection = "resumeFit" | "interviewFit" | "overall";

export interface CandidateEvaluation {
  question: string;
  score: number;
  evaluation: string;
  highlights?: string[];
  improvements?: string[];
}

export interface CandidateAnalysisInput {
  interviewTitle: string;
  /** interviews.jobDescription — may be empty; jdBlock() handles the fallback. */
  jdText: string;
  objective: string | null;
  criteria: { name: string; description?: string; weight?: number }[] | null;
  resumeText: string;
  evaluations: CandidateEvaluation[];
  language?: string | null;
}

// aggregate-analysis precedent: bound long inputs so prompts stay small.
const MAX_RESUME_CHARS = 8_000;
const MAX_EVALUATION_CHARS = 1_000;
const MAX_BULLETS = 4;

function weightLabel(weight: unknown): string {
  const w = typeof weight === "number" && Number.isFinite(weight) ? weight : 1;
  return w !== 1 ? ` (weight ${w}x — contributes ${w}x as much to the overall score)` : "";
}

/** Single place handling an empty JD — all three sections reuse it. */
function jdBlock(input: CandidateAnalysisInput): string {
  if (input.jdText.trim().length > 0) {
    return `Job Description:\n${input.jdText.trim()}`;
  }
  const lines = [
    "Job Description: (not provided — assess fit against the interview title, objective, and assessment criteria below)",
    `Interview: "${input.interviewTitle}"`,
  ];
  if (input.objective) {
    lines.push(`Objective: "${input.objective}"`);
  }
  if (input.criteria && input.criteria.length > 0) {
    lines.push(
      `Assessment Criteria:\n${input.criteria
        .map((c) => `- ${c.name}${weightLabel(c.weight)}${c.description ? `: ${c.description}` : ""}`)
        .join("\n")}`,
    );
  }
  return lines.join("\n");
}

function renderResume(input: CandidateAnalysisInput): string {
  return `Candidate Resume:\n${input.resumeText.slice(0, MAX_RESUME_CHARS)}`;
}

function renderEvaluations(input: CandidateAnalysisInput): string {
  return `Interview Results (per-question evaluation):\n${input.evaluations
    .map((e) => {
      const strengths = (e.highlights ?? []).slice(0, MAX_BULLETS);
      const improvements = (e.improvements ?? []).slice(0, MAX_BULLETS);
      return (
        `Q: ${e.question} [score ${e.score}/10]\n` +
        `Evaluation: ${e.evaluation.slice(0, MAX_EVALUATION_CHARS)}\n` +
        `Strengths: ${strengths.length > 0 ? strengths.map((h) => `- ${h}`).join(" ") : "-"}\n` +
        `Improvements: ${improvements.length > 0 ? improvements.map((h) => `- ${h}`).join(" ") : "-"}`
      );
    })
    .join("\n\n")}`;
}

const SECTION_ROLE: Record<CandidateAnalysisSection, string> = {
  resumeFit:
    "You are an expert technical recruiter. Assess how well this candidate's resume matches the job: relevant experience, skills, seniority, and domain fit.",
  interviewFit:
    "You are an expert technical recruiter. Assess how well the candidate's interview answers demonstrate the capabilities the job requires: answer quality, depth, and relevance against the job's demands.",
  overall:
    "You are an expert technical recruiter. Synthesize the resume fit AND the interview performance into a final hiring verdict. verdict must be exactly one of STRONG_HIRE | HIRE | CONDITIONAL | NO_HIRE.",
};

const SECTION_SHAPE_HINT: Record<CandidateAnalysisSection, string> = {
  resumeFit: RESUME_FIT_SHAPE_HINT,
  interviewFit: INTERVIEW_FIT_SHAPE_HINT,
  overall: OVERALL_SHAPE_HINT,
};

/**
 * One prompt per section. resumeFit sees JD+resume; interviewFit sees
 * JD+evaluations; overall sees JD+resume+evaluations (all raw inputs —
 * sections run in parallel, none feeds another).
 */
export function buildCandidateAnalysisPrompt(
  section: CandidateAnalysisSection,
  input: CandidateAnalysisInput,
): LLMMessage[] {
  const blocks = [jdBlock(input)];
  if (section === "resumeFit" || section === "overall") {
    blocks.push(renderResume(input));
  }
  if (section === "interviewFit" || section === "overall") {
    blocks.push(renderEvaluations(input));
  }

  const languageName = getPromptLanguageName(input.language ?? undefined);
  const languageInstruction = languageName
    ? `\n\nIMPORTANT: Write the ENTIRE analysis (summary, strengths, gaps${section === "overall" ? ", recommendation" : ""}) in ${languageName}. Do NOT mix languages.`
    : "";

  const systemPrompt = `${SECTION_ROLE[section]}

${blocks.join("\n\n")}${languageInstruction}

Provide the analysis as VALID JSON ONLY (use only standard ASCII double-quotes, never Unicode smart quotes, no markdown fences):
${SECTION_SHAPE_HINT[section]}`;

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Please provide the ${section} analysis JSON.` },
  ];
}
