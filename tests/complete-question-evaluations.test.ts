import assert from "node:assert/strict";
import test from "node:test";

import { completeQuestionEvaluations } from "../src/lib/session-score";

const QUESTIONS = [{ text: "What is your stack?" }, { text: "Describe a bug you fixed" }];

test("fills zero-score evaluations for unanswered questions in interview order", () => {
  const result = completeQuestionEvaluations(
    [{ question: "what is your stack?", score: 8, evaluation: "good" }],
    QUESTIONS,
    "id",
  );

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((e) => e.question),
    ["What is your stack?", "Describe a bug you fixed"],
  );
  assert.equal(result[0].score, 8);
  assert.equal(result[1].score, 0);
  assert.equal(result[1].evaluation, "Pertanyaan tidak dijawab");
});

test("keeps extra evaluation fields and drops follow-up question evaluations", () => {
  const result = completeQuestionEvaluations(
    [
      { question: "Describe a bug you fixed", score: 7, highlights: ["root cause"] },
      { question: "Follow-up: which tools?", score: 9 },
    ],
    QUESTIONS,
    "en",
  );

  assert.equal(result.length, 2);
  assert.equal(result[1].score, 7);
  assert.deepEqual(result[1].highlights, ["root cause"]);
  assert.ok(result.every((e) => e.question !== "Follow-up: which tools?"));
});

test("all-paraphrased evaluations fall back to positional clamp (legacy behavior)", () => {
  const result = completeQuestionEvaluations(
    [
      { question: "totally different wording one", score: 6 },
      { question: "totally different wording two", score: 4 },
    ],
    QUESTIONS,
    "en",
  );

  assert.deepEqual(
    result.map((e) => e.score),
    [6, 4],
  );
});

test("invalid scores are replaced with zero", () => {
  const result = completeQuestionEvaluations(
    [{ question: "What is your stack?", score: null }],
    QUESTIONS,
    "en",
  );

  assert.equal(result[0].score, 0);
  assert.equal(result[1].score, 0);
});

test("an answered question with no evaluation becomes a pending marker, not a false zero", () => {
  const questions = [
    { text: "What is your stack?", id: "q1" },
    { text: "Describe a bug you fixed", id: "q2" },
  ];
  const result = completeQuestionEvaluations(
    [{ question: "What is your stack?", score: 8, evaluation: "good" }],
    questions,
    "en",
    new Set(["q1", "q2"]),
  );

  // Answered but not graded yet: score null + pendingGrading, never a false 0.
  assert.equal(result[1].score, null);
  assert.equal(result[1].pendingGrading, true);
  assert.equal(result[1].evaluation, "Not graded yet");
});
