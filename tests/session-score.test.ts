import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluationsAreCanonical,
  getSessionOverallScore,
  mergeDeterministicWithLlm,
  usesQuestionEvaluationScore,
} from "../src/lib/session-score";

test("getSessionOverallScore prefers question-by-question evaluations", () => {
  const insights = {
    questionEvaluations: [{ score: 8 }, { score: 6 }],
    criteriaEvaluations: [{ score: 10 }, { score: 10 }],
  };

  assert.equal(getSessionOverallScore(insights), 7);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore falls back to criteria for legacy sessions", () => {
  const insights = {
    criteriaEvaluations: [{ score: 9 }, { score: 7 }],
  };

  assert.equal(getSessionOverallScore(insights), 8);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});

test("getSessionOverallScore parses numeric strings and ignores invalid values", () => {
  const insights = {
    questionEvaluations: [
      { score: "9.5" },
      { score: "invalid" },
      { score: null },
    ],
    criteriaEvaluations: [{ score: 2 }],
  };

  assert.equal(getSessionOverallScore(insights), 9.5);
  assert.equal(usesQuestionEvaluationScore(insights), true);
});

test("getSessionOverallScore returns null when no valid scores exist", () => {
  const insights = {
    questionEvaluations: [{ score: null }, { score: "NaN" }],
    criteriaEvaluations: [],
  };

  assert.equal(getSessionOverallScore(insights), null);
  assert.equal(usesQuestionEvaluationScore(insights), false);
});

test("caps stored evaluations at the interview's question count", () => {
  // Legacy over-grown data: follow-ups stored as extra question entries.
  const insights = {
    questionEvaluations: [
      { score: 8 },
      { score: 6 },
      { score: 9 },
      { score: 7 },
      { score: 5 },
      { score: 5 },
      { score: 4 },
      { score: 4 },
      { score: 3 },
      { score: 3 }, // canonical 10 questions end here
      { score: 9 },
      { score: 9 }, // follow-up entries must not inflate
    ],
  };

  // (8+6+9+7+5+5+4+4+3+3)/10 = 5.4 — the trailing 9s are ignored.
  assert.equal(getSessionOverallScore(insights, 10), 5.4);
});

test("evaluationsAreCanonical accepts only the exact one-per-question list", () => {
  const questions = [{ text: "What is REST?" }, { text: "Explain indexes." }];

  assert.equal(
    evaluationsAreCanonical(
      [
        { question: "Q1: What is REST?", score: 8 },
        { question: "Explain indexes.", score: 5 },
      ],
      questions,
    ),
    true,
  );
  // Wrong count — follow-ups stored as extra questions.
  assert.equal(
    evaluationsAreCanonical(
      [
        { question: "What is REST?", score: 8 },
        { question: "follow-up: why?", score: 9 },
        { question: "Explain indexes.", score: 5 },
      ],
      questions,
    ),
    false,
  );
  // Missing evaluations entirely.
  assert.equal(evaluationsAreCanonical(undefined, questions), false);
  // A canonical question replaced by something unmatched.
  assert.equal(
    evaluationsAreCanonical(
      [
        { question: "What is REST?", score: 8 },
        { question: "Something else entirely", score: 5 },
      ],
      questions,
    ),
    false,
  );
  // Empty question list with no evaluations is trivially canonical.
  assert.equal(evaluationsAreCanonical(undefined, []), false);
});

test("counts unanswered questions as zero when totalQuestions is given", () => {
  const insights = {
    questionEvaluations: [{ score: 8 }],
    criteriaEvaluations: [{ score: 10 }],
  };

  // One answered question (8/10) against 10 total questions.
  assert.equal(getSessionOverallScore(insights, 10), 0.8);
  // Without a total, legacy average-of-answered behavior is preserved.
  assert.equal(getSessionOverallScore(insights), 8);
  // Invalid/missing scores contribute 0 to the sum.
  assert.equal(getSessionOverallScore({ questionEvaluations: [{ score: "x" }] }, 5), 0);
});

test("mergeDeterministicWithLlm grades unkeyed questions from the LLM, keyed stay deterministic", () => {
  const questions = [{ text: "Pick a framework" }, { text: "Explain indexes." }];
  // Quiz grading only covers the keyed choice question.
  const deterministic = [{ question: "Pick a framework", score: 10, correct: true }];
  const llm = [
    { question: "Pick a framework", score: 4, evaluation: "weak pick" },
    { question: "Explain indexes.", score: 7, evaluation: "solid answer" },
  ];

  const merged = mergeDeterministicWithLlm(deterministic, llm, questions, "en");
  // Keyed: deterministic grade wins even when the LLM disagrees.
  assert.deepEqual(merged[0], { question: "Pick a framework", score: 10, correct: true });
  // Unkeyed open-ended: LLM evaluation replaces the false "Not answered" fill.
  assert.equal(merged[1].score, 7);
  assert.equal(merged[1].evaluation, "solid answer");
});

test("mergeDeterministicWithLlm keeps the Not-answered fill when the LLM has nothing", () => {
  const questions = [{ text: "Explain indexes." }];
  const merged = mergeDeterministicWithLlm(
    [],
    [{ question: "something else entirely", score: 9 }],
    questions,
    "en",
  );
  assert.deepEqual(merged, [
    { question: "Explain indexes.", score: 0, evaluation: "Not answered" },
  ]);
});
