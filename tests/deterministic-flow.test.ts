import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getKindNoun,
  isDeterministicKind,
  resolveDeterministicFlow,
  validateAnswer,
} from "../src/lib/deterministic-flow";
import type { LLMMessage } from "../src/lib/ai/types";

const QUESTIONS = [
  { type: "SINGLE_CHOICE", text: "How satisfied are you?" },
  { type: "OPEN_ENDED", text: "Anything else to add?" },
];

function history(
  entries: Array<{ role: "user" | "assistant"; content: string }>,
): LLMMessage[] {
  return entries.map((entry) => ({ role: entry.role, content: entry.content }));
}

test("INTERVIEW kind and missing kind are ignored by the deterministic flow", () => {
  assert.equal(resolveDeterministicFlow({
    kind: "INTERVIEW",
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "Selected option A" }]),
  }), null);
  assert.equal(resolveDeterministicFlow({
    kind: undefined,
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "Selected option A" }]),
  }), null);
});

test("isDeterministicKind gates only the non-interview kinds", () => {
  assert.equal(isDeterministicKind("INTERVIEW"), false);
  assert.equal(isDeterministicKind(undefined), false);
  for (const kind of ["SURVEY", "QUIZ", "FORM", "ASSESSMENT"]) {
    assert.equal(isDeterministicKind(kind), true);
  }
});

test("empty history yields a greeting without advancing", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: [],
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, false);
  assert.ok(result.content.length > 0);
});

test("choice selection acks and advances without a rationale probe", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "Selected option B" }]),
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, true);
  assert.equal(result.isComplete, false);
  assert.doesNotMatch(result.content, /why|kenapa/i);
});

test("Indonesian selection protocol is accepted for id sessions", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "Memilih opsi: A, C" }]),
    language: "id",
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, true);
});

test("free text on a choice question re-asks instead of advancing", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: QUESTIONS,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "sangat puas sekali" }]),
    language: "id",
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, false);
  assert.match(result.content, /pilih/i);
});

test("free text on an open-ended question advances", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: QUESTIONS,
    currentQuestionIndex: 1,
    conversationHistory: history([{ role: "user", content: "Tidak ada." }]),
    language: "id",
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, true);
});

test("answering the last question completes the session", () => {
  const result = resolveDeterministicFlow({
    kind: "SURVEY",
    questions: [{ type: "SINGLE_CHOICE", text: "Q1" }],
    currentQuestionIndex: 0,
    conversationHistory: history([
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "Selected option A" },
    ]),
  });
  assert.ok(result);
  assert.equal(result.questionAdvanced, false);
  assert.equal(result.isComplete, true);
});

test("currentQuestionIndex is clamped and kind nouns localize", () => {
  const result = resolveDeterministicFlow({
    kind: "QUIZ",
    questions: QUESTIONS,
    currentQuestionIndex: 99,
    conversationHistory: history([{ role: "user", content: "Selected option A" }]),
  });
  assert.ok(result);
  assert.equal(result.isComplete, true);

  assert.equal(getKindNoun("id", "SURVEY"), "survei");
  assert.equal(getKindNoun("en", undefined), "interview");
});

test("validateAnswer enforces SHORT_TEXT field rules", () => {
  const lang = "en" as const;
  // No rules — anything accepted.
  assert.equal(validateAnswer(undefined, "hello", lang), null);
  assert.equal(validateAnswer({}, "", lang), null);

  // required
  const required = { required: true };
  assert.match(validateAnswer(required, "  ", lang) ?? "", /required/i);
  assert.equal(validateAnswer(required, "ok", lang), null);

  // minLength / maxLength
  assert.match(validateAnswer({ minLength: 5 }, "abc", lang) ?? "", /short/i);
  assert.equal(validateAnswer({ minLength: 3 }, "abc", lang), null);
  assert.match(validateAnswer({ maxLength: 3 }, "abcdef", lang) ?? "", /long/i);

  // number + min/max
  assert.match(validateAnswer({ inputType: "number", min: 1, max: 10 }, "abc", lang) ?? "", /format/i);
  assert.match(validateAnswer({ inputType: "number", min: 1 }, "0", lang) ?? "", /small/i);
  assert.match(validateAnswer({ max: 10 }, "11", lang) ?? "", /large/i);
  assert.equal(validateAnswer({ inputType: "number", min: 1, max: 10 }, "5", lang), null);

  // email / date
  assert.match(validateAnswer({ inputType: "email" }, "not-an-email", lang) ?? "", /email/i);
  assert.equal(validateAnswer({ inputType: "email" }, "a@b.co", lang), null);
  assert.match(validateAnswer({ inputType: "date" }, "31/12/2026", lang) ?? "", /date/i);
  assert.equal(validateAnswer({ inputType: "date" }, "2026-12-31", lang), null);

  // pattern (invalid regex is skipped, not fatal)
  assert.match(validateAnswer({ pattern: "^\\d{4}$" }, "12", lang) ?? "", /format/i);
  assert.equal(validateAnswer({ pattern: "^\\d{4}$" }, "1234", lang), null);
  assert.equal(validateAnswer({ pattern: "(" }, "anything", lang), null);
});

test("invalid SHORT_TEXT answers re-ask without advancing; valid ones advance", () => {
  const formQuestions = [
    { type: "SHORT_TEXT", text: "What is your email?", validationRules: { inputType: "email", required: true } },
    { type: "SHORT_TEXT", text: "Anything else?" },
  ];

  const invalid = resolveDeterministicFlow({
    kind: "FORM",
    questions: formQuestions,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "bukan email" }]),
    language: "id",
  });
  assert.ok(invalid);
  assert.equal(invalid.questionAdvanced, false);
  assert.match(invalid.content, /email/i);

  const valid = resolveDeterministicFlow({
    kind: "FORM",
    questions: formQuestions,
    currentQuestionIndex: 0,
    conversationHistory: history([{ role: "user", content: "budi@example.com" }]),
    language: "id",
  });
  assert.ok(valid);
  assert.equal(valid.questionAdvanced, true);
  assert.equal(valid.isComplete, false);
});
