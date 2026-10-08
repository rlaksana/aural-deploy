import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gradeQuiz, gradeSelection } from "../src/lib/quiz-grading";
import { getSessionOverallScore } from "../src/lib/session-score";

const QUESTIONS = [
  {
    id: "q1",
    text: "Capital of Indonesia?",
    type: "SINGLE_CHOICE",
    options: { options: ["Jakarta", "Bandung", "Surabaya"], correctIndices: [0] },
  },
  {
    id: "q2",
    text: "Which are prime?",
    type: "MULTIPLE_CHOICE",
    options: { options: ["2", "3", "4", "5"], correctIndices: [0, 1, 3] },
  },
  {
    id: "q3",
    text: "Explain recursion.",
    type: "OPEN_ENDED",
    options: null,
  },
];

test("single choice is all-or-nothing", () => {
  assert.equal(gradeSelection([0], QUESTIONS[0]), 10);
  assert.equal(gradeSelection([1], QUESTIONS[0]), 0);
  // No answer counts wrong.
  assert.equal(gradeSelection([], QUESTIONS[0]), 0);
});

test("multiple choice gets proportional credit", () => {
  // 2 of 3 correct options → round(2/3*10) = 7.
  assert.equal(gradeSelection([0, 1], QUESTIONS[1]), 7);
  assert.equal(gradeSelection([0, 1, 3], QUESTIONS[1]), 10);
  assert.equal(gradeSelection([2], QUESTIONS[1]), 0);
});

test("questions without an answer key are ungraded", () => {
  assert.equal(gradeSelection([0], QUESTIONS[2]), null);
});

test("gradeQuiz produces score-shaped evaluations compatible with session-score", () => {
  const result = gradeQuiz(QUESTIONS, [
    { questionId: "q1", content: "Selected option A" },
    { questionId: "q2", content: "Selected options: A, B" },
    { questionId: "q3", content: "It calls itself." },
  ]);

  assert.equal(result.total, 2); // open question has no key → excluded
  assert.equal(result.totalCorrect, 1); // only the all-correct single choice
  assert.equal(result.questionEvaluations.length, 2);
  assert.deepEqual(
    result.questionEvaluations.map((q) => [q.question, q.score, q.correct]),
    [
      ["Capital of Indonesia?", 10, true],
      ["Which are prime?", 7, false],
    ],
  );

  // The insights shape feeds the existing overall-score math.
  const overall = getSessionOverallScore({
    questionEvaluations: result.questionEvaluations,
  });
  assert.ok(overall !== null && overall > 0);
});

test("missing answers count wrong", () => {
  const result = gradeQuiz(QUESTIONS, [{ questionId: "q3", content: "hello" }]);
  assert.equal(result.total, 2);
  assert.equal(result.totalCorrect, 0);
  assert.deepEqual(
    result.questionEvaluations.map((q) => q.score),
    [0, 0],
  );
});

test("Indonesian selection protocol is graded identically", () => {
  const result = gradeQuiz([QUESTIONS[0]], [
    { questionId: "q1", content: "Memilih opsi A" },
  ]);
  assert.equal(result.totalCorrect, 1);
});
