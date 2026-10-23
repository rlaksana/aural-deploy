import assert from "node:assert/strict";
import test from "node:test";

import {
  candidateAnalysisSchema,
  overallAnalysisSchema,
} from "../src/lib/ai/candidate-analysis-schema";
import { buildCandidateAnalysisPrompt } from "../src/lib/ai/prompts/candidate-analysis";
import { resolveResumeSource } from "../src/lib/candidate-analysis-resolve";

const validSection = { score: 7, summary: "ok", strengths: ["a"], gaps: ["b"] };
const validOverall = { ...validSection, verdict: "HIRE", recommendation: "hire" };
const validAnalysis = {
  resumeFit: validSection,
  interviewFit: validSection,
  overall: validOverall,
};

const baseInput = {
  interviewTitle: "Screening Teknis",
  jdText: "Build web apps with React.",
  objective: "Hire a strong frontend engineer",
  criteria: [{ name: "Frontend", weight: 2 }],
  resumeText: "Resume text",
  evaluations: [
    {
      question: "Q1?",
      score: 8,
      evaluation: "Good answer",
      highlights: ["x"],
      improvements: ["y"],
    },
  ],
  language: "id",
};

test("candidateAnalysisSchema accepts a valid 3-section analysis", () => {
  assert.equal(candidateAnalysisSchema.safeParse(validAnalysis).success, true);
});

test("candidateAnalysisSchema rejects out-of-range scores, bad verdicts, empty summaries", () => {
  assert.equal(
    candidateAnalysisSchema.safeParse({ ...validAnalysis, resumeFit: { ...validSection, score: 0 } }).success,
    false,
  );
  assert.equal(
    candidateAnalysisSchema.safeParse({ ...validAnalysis, interviewFit: { ...validSection, score: 11 } }).success,
    false,
  );
  assert.equal(overallAnalysisSchema.safeParse({ ...validOverall, verdict: "MAYBE" }).success, false);
  assert.equal(overallAnalysisSchema.safeParse({ ...validOverall, summary: "" }).success, false);
});

test("resumeFit sees JD+resume only; interviewFit sees JD+evaluations; overall sees all", () => {
  const text = (section: "resumeFit" | "interviewFit" | "overall") =>
    buildCandidateAnalysisPrompt(section, baseInput)[0]!.content as string;

  const resumeFit = text("resumeFit");
  const interviewFit = text("interviewFit");
  const overall = text("overall");

  assert.match(resumeFit, /Candidate Resume/);
  assert.doesNotMatch(resumeFit, /Interview Results/);

  assert.match(interviewFit, /Interview Results/);
  assert.doesNotMatch(interviewFit, /Candidate Resume/);

  assert.match(overall, /Interview Results/);
  assert.match(overall, /Candidate Resume/);
});

test("prompts embed the interview language and the verdict enum contract", () => {
  const resumeFit = buildCandidateAnalysisPrompt("resumeFit", baseInput)[0]!.content as string;
  const overall = buildCandidateAnalysisPrompt("overall", baseInput)[0]!.content as string;
  assert.match(resumeFit, /Indonesian \(Bahasa Indonesia\)/);
  assert.match(overall, /STRONG_HIRE \| HIRE \| CONDITIONAL \| NO_HIRE/);
});

test("empty JD falls back to title/objective/criteria", () => {
  const prompt = buildCandidateAnalysisPrompt("resumeFit", {
    ...baseInput,
    jdText: "   ",
  })[0]!.content as string;
  assert.match(prompt, /not provided/);
  assert.match(prompt, /Screening Teknis/);
  assert.match(prompt, /Hire a strong frontend engineer/);
  assert.match(prompt, /Assessment Criteria:/);
});

test("long resume and evaluations are truncated to budget", () => {
  const tailMarker = "TAIL_MARKER_BEYOND_BUDGET";
  const resumeFit = buildCandidateAnalysisPrompt("resumeFit", {
    ...baseInput,
    resumeText: `${"x".repeat(8500)}${tailMarker}`,
  })[0]!.content as string;
  assert.doesNotMatch(resumeFit, /TAIL_MARKER_BEYOND_BUDGET/);

  const interviewFit = buildCandidateAnalysisPrompt("interviewFit", {
    ...baseInput,
    evaluations: [
      { question: "Q", score: 5, evaluation: `${"e".repeat(1200)}${tailMarker}` },
    ],
  })[0]!.content as string;
  assert.doesNotMatch(interviewFit, /TAIL_MARKER_BEYOND_BUDGET/);
});

test("resolveResumeSource prefers upload, then bank, else null", () => {
  assert.deepEqual(resolveResumeSource({ uploadResumeText: "u", bankResumeText: "b" }), {
    resumeText: "u",
    resumeFileName: null,
    origin: "upload",
  });
  assert.deepEqual(resolveResumeSource({ bankResumeText: "b", bankResumeFileName: "b.pdf" }), {
    resumeText: "b",
    resumeFileName: "b.pdf",
    origin: "bank",
  });
  assert.equal(resolveResumeSource({ uploadResumeText: "   ", bankResumeText: "b" })?.origin, "bank");
  assert.equal(resolveResumeSource({}), null);
});
