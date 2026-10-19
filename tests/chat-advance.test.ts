import assert from "node:assert/strict";
import test from "node:test";
import { resolveChatAdvance } from "../src/lib/chat-advance";
import type { LLMMessage } from "../src/lib/ai/types";

const QUESTIONS = [
  { id: "q1", text: "Tell me about your REST API experience" },
  { id: "q2", text: "Explain your database indexing strategy" },
];

function history(...entries: { role: "user" | "assistant"; content: string }[]): LLMMessage[] {
  return entries.map((e) => ({ role: e.role, content: e.content }));
}

const midConversation = history(
  { role: "assistant", content: "Welcome!" },
  { role: "user", content: "I have built REST APIs for years." },
);

const llm = (content: string) => ({
  responseContent: content,
  detFlow: null,
  choiceFlow: null,
  manualNavigation: false,
  currentQuestionIndex: 0,
  questions: QUESTIONS,
  conversationHistory: midConversation,
});

test("plain LLM text mid-question does not advance or complete", () => {
  const r = resolveChatAdvance(llm("Great, can you tell me more about that?"));
  assert.equal(r.questionAdvanced, false);
  assert.equal(r.isComplete, false);
  assert.equal(r.cleanContent, "Great, can you tell me more about that?");
  assert.equal(r.markerComplete, false);
  assert.equal(r.advancedWithoutMarker, false);
});

test("[NEXT_QUESTION] mid-conversation advances and the marker is stripped", () => {
  const r = resolveChatAdvance(
    llm("Thanks. Let's move on. [NEXT_QUESTION] So, explain your database indexing strategy."),
  );
  assert.equal(r.questionAdvanced, true);
  assert.equal(r.isComplete, false);
  assert.doesNotMatch(r.cleanContent, /\[NEXT_QUESTION\]/);
  assert.match(r.cleanContent, /database indexing/);
  assert.equal(r.advancedWithoutMarker, false);
});

test("[NEXT_QUESTION] in the greeting (empty history) is suppressed", () => {
  const r = resolveChatAdvance({
    ...llm("Hello! [NEXT_QUESTION] First question: tell me about REST."),
    conversationHistory: [],
  });
  assert.equal(r.questionAdvanced, false);
  // The marker is still stripped so the transcript stays clean.
  assert.doesNotMatch(r.cleanContent, /\[NEXT_QUESTION\]/);
});

test("manualNavigation suppresses advancement even with the marker", () => {
  const r = resolveChatAdvance({
    ...llm("Moving on. [NEXT_QUESTION] Next up: indexing."),
    manualNavigation: true,
  });
  assert.equal(r.questionAdvanced, false);
});

test("[INTERVIEW_COMPLETE] off the last question is suppressed", () => {
  // Long conversation, but only on question 1 of 2.
  const long = history(
    ...Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `exchange ${i}`,
    })),
  );
  const r = resolveChatAdvance({
    ...llm("Wonderful. [INTERVIEW_COMPLETE]"),
    currentQuestionIndex: 0,
    conversationHistory: long,
  });
  assert.equal(r.markerComplete, true);
  assert.equal(r.isComplete, false);
  assert.doesNotMatch(r.cleanContent, /\[INTERVIEW_COMPLETE\]/);
});

test("[INTERVIEW_COMPLETE] on the last question without enough back-and-forth is suppressed", () => {
  // Last question (index 1) needs history >= 2*2-1 = 3; only 2 present.
  const short = history(
    { role: "assistant", content: "Next question" },
    { role: "user", content: "B-tree everywhere." },
  );
  const r = resolveChatAdvance({
    ...llm("Thanks so much. [INTERVIEW_COMPLETE]"),
    currentQuestionIndex: 1,
    conversationHistory: short,
  });
  assert.equal(r.isComplete, false);
});

test("[INTERVIEW_COMPLETE] on the last question with enough back-and-forth completes", () => {
  const enough = history(
    { role: "assistant", content: "Next question" },
    { role: "user", content: "B-tree everywhere." },
    { role: "assistant", content: "Why?" },
    { role: "user", content: "Because lookups." },
    { role: "assistant", content: "Interesting." },
  );
  const r = resolveChatAdvance({
    ...llm("Perfect. [INTERVIEW_COMPLETE]"),
    currentQuestionIndex: 1,
    conversationHistory: enough,
  });
  assert.equal(r.isComplete, true);
  assert.equal(r.questionAdvanced, false);
});

test("deterministic flow completion bypasses the premature-completion guard", () => {
  const r = resolveChatAdvance({
    responseContent: "Terima kasih! Itu adalah pertanyaan terakhir.",
    detFlow: { content: "x", questionAdvanced: false, isComplete: true },
    choiceFlow: null,
    manualNavigation: false,
    currentQuestionIndex: 0,
    questions: QUESTIONS,
    // Would fail the back-and-forth guard, but detFlow is exempt.
    conversationHistory: history({ role: "user", content: "Selected option A" }),
  });
  assert.equal(r.isComplete, true);
});

test("choice flow advance is honored; its completion still faces the guard", () => {
  const advanced = resolveChatAdvance({
    responseContent: "Terima kasih sudah berbagi. Kita lanjut ke pertanyaan berikutnya.",
    detFlow: null,
    choiceFlow: { content: "x", questionAdvanced: true, isComplete: false },
    manualNavigation: false,
    currentQuestionIndex: 0,
    questions: QUESTIONS,
    conversationHistory: midConversation,
  });
  assert.equal(advanced.questionAdvanced, true);

  const complete = resolveChatAdvance({
    responseContent: "Wawancara sudah selesai.",
    detFlow: null,
    choiceFlow: { content: "x", questionAdvanced: false, isComplete: true },
    manualNavigation: false,
    currentQuestionIndex: 1,
    questions: QUESTIONS,
    // Guard still applies: too little back-and-forth.
    conversationHistory: history({ role: "user", content: "Karena A." }),
  });
  assert.equal(complete.isComplete, false);
});

test("move-on fallback: verbal transition naming the next question advances without a marker", () => {
  const r = resolveChatAdvance({
    ...llm("So, tell me about your database indexing strategy and how you choose indexes."),
    conversationHistory: history(
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "next question please" },
    ),
  });
  assert.equal(r.questionAdvanced, true);
  assert.equal(r.advancedWithoutMarker, true);
});

test("move-on fallback does not fire when the response ignores the next question", () => {
  const r = resolveChatAdvance({
    ...llm("Great answer."),
    conversationHistory: history(
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "skip this" },
    ),
  });
  assert.equal(r.questionAdvanced, false);
  assert.equal(r.advancedWithoutMarker, false);
});

test("manualNavigation also blocks the move-on fallback", () => {
  const r = resolveChatAdvance({
    ...llm("So, tell me about your database indexing strategy and how you choose indexes."),
    manualNavigation: true,
    conversationHistory: history(
      { role: "assistant", content: "Welcome!" },
      { role: "user", content: "next question please" },
    ),
  });
  assert.equal(r.questionAdvanced, false);
});

test("empty provider response is a safe no-op", () => {
  const r = resolveChatAdvance(llm(""));
  assert.equal(r.questionAdvanced, false);
  assert.equal(r.isComplete, false);
  assert.equal(r.cleanContent, "");
});
