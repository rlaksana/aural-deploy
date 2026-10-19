import assert from "node:assert/strict";
import test from "node:test";
import { buildSummaryPrompt } from "../src/lib/ai/prompts/summary";
import { MinimaxProvider } from "../src/lib/ai/providers/minimax";

test("buildSummaryPrompt returns system and user messages", () => {
  const messages = buildSummaryPrompt(
    "Business Consultant Assessment",
    [{ role: "user", content: "Jawaban saya mengenai HRIS..." }],
    "Assess candidate",
    [{ name: "Technical", description: "Tech skills" }],
    [{ text: "HRIS question", order: 1 }],
    "id",
    null,
    null,
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[1].role, "user");
  assert.match(String(messages[1].content), /analyze the interview transcript/i);

  // Regression: language "id" used to resolve to the English display name and the
  // report prompt literally ordered the model to write the report in English.
  const system = String(messages[0].content);
  assert.match(system, /in Indonesian \(Bahasa Indonesia\)/);
  assert.doesNotMatch(system, /in English/);
});

test("MinimaxProvider appends user message when messages only contain system prompt", () => {
  const provider = new MinimaxProvider();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openAiMsgs = (provider as any).toOpenAIMessages([
    { role: "system", content: "System prompt only" },
  ]);

  assert.equal(openAiMsgs.length, 2);
  assert.equal(openAiMsgs[0].role, "system");
  assert.equal(openAiMsgs[1].role, "user");
  assert.equal(openAiMsgs[1].content, "Please proceed with the task as instructed.");
});

test("per-question fence: evaluations demanded only for canonical listed questions", () => {
  const withQuestions = buildSummaryPrompt(
    "T",
    [{ role: "user", content: "answer" }],
    null,
    null,
    [
      { text: "What is REST?", order: 1, type: "OPEN_ENDED" },
      { text: "Explain indexes.", order: 2, type: "RESEARCH" },
    ],
    "en",
    null,
    null,
  );
  const system = String(withQuestions[0].content);
  // The follow-up fence must be present verbatim.
  assert.match(system, /EXACTLY ONE entry per interview question/);
  assert.match(system, /Never create entries for follow-up/);
  // Types tag each listed question; RESEARCH gets its findings instruction.
  assert.match(system, /\[OPEN_ENDED\] What is REST\?/);
  assert.match(system, /research finding/);

  // Without questions there must be no evaluation instruction at all.
  const without = buildSummaryPrompt(
    "T",
    [{ role: "user", content: "answer" }],
    null,
    null,
    null,
    "en",
    null,
    null,
  );
  assert.doesNotMatch(String(without[0].content), /questionEvaluations/);
});

test("non-interview kinds get the analyst framing, not interviewer grading", () => {
  const messages = buildSummaryPrompt(
    "Survey",
    [{ role: "user", content: "answer" }],
    null,
    null,
    null,
    "en",
    null,
    null,
    "SURVEY",
  );
  const system = String(messages[0].content);
  assert.match(system, /response analyst/);
  assert.match(system, /not a job interview/);
});
