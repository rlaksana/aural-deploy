import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolveChoiceQuestionFlow } from "../src/lib/choice-question-flow";
import type { LLMMessage } from "../src/lib/ai/types";

const QUESTIONS = [
  { type: "OPEN_ENDED" },
  { type: "SINGLE_CHOICE" },
  { type: "MULTIPLE_CHOICE" },
  { type: "OPEN_ENDED" },
];

function makeHistory(
  entries: Array<{ role: "user" | "assistant"; content: string }>,
): LLMMessage[] {
  return entries.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}

test("non-choice questions are ignored by the deterministic flow", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: makeHistory([
      { role: "user", content: "I worked on Foo thing at Bar Inc." },
    ]),
  });
  assert.equal(result, null);
});

test("choice question selection triggers a rationale prompt and does not advance", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 1,
    conversationHistory: makeHistory([
      { role: "user", content: "Selected option B" },
    ]),
  });
  assert.ok(result, "expected deterministic flow result");
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, false);
  assert.match(result.content, /why/i);
});

test("choice question rationale after selection forces advance", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 1,
    conversationHistory: makeHistory([
      { role: "user", content: "Selected option C" },
      { role: "assistant", content: "Got it. Why did you pick that?" },
      { role: "user", content: "abcd" },
    ]),
  });
  assert.ok(result, "expected deterministic flow result");
  assert.equal(result.questionAdvanced, true);
  assert.equal(result.isComplete, false);
});

test("multi-letter selection is recognized as a choice selection", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 2,
    conversationHistory: makeHistory([
      { role: "user", content: "Selected options: A, C" },
    ]),
  });
  assert.ok(result, "expected deterministic flow result");
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, false);
  assert.match(result.content, /why/i);
});

test("rationale on the last choice question completes the interview", () => {
  const result = resolveChoiceQuestionFlow({
    questions: [
      { type: "OPEN_ENDED" },
      { type: "SINGLE_CHOICE" },
    ],
    currentQuestionIndex: 1,
    conversationHistory: makeHistory([
      { role: "user", content: "Selected option A" },
      { role: "assistant", content: "Got it. Why?" },
      { role: "user", content: "x" },
    ]),
  });
  assert.ok(result, "expected deterministic flow result");
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, true);
});

test("rationale without prior selection is ignored (no false complete)", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 1,
    conversationHistory: makeHistory([
      { role: "user", content: "I really like option A because it..." },
    ]),
  });
  assert.equal(result, null);
});

test("rationale text is accepted regardless of length or content", () => {
  const result = resolveChoiceQuestionFlow({
    questions: QUESTIONS,
    currentQuestionIndex: 1,
    conversationHistory: makeHistory([
      { role: "user", content: "Selected option A" },
      { role: "assistant", content: "Why?" },
      { role: "user", content: "." },
    ]),
  });
  assert.ok(result, "expected deterministic flow result");
  assert.equal(result.questionAdvanced, true);
  assert.equal(result.isComplete, false);
});
