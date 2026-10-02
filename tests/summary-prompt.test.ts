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
