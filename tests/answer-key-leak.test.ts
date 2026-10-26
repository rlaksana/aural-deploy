import assert from "node:assert/strict";
import test from "node:test";
import { stripAnswerKey } from "../src/lib/quiz-grading";

test("stripAnswerKey removes expectedAnswer and correctIndices, keeps option labels", () => {
  const row = {
    id: "q1",
    text: "Pick one",
    type: "SINGLE_CHOICE",
    description: "helper text",
    expectedAnswer: "B is correct because...",
    options: { options: ["A", "B", "C"], allowMultiple: false, correctIndices: [1] },
  };

  const stripped = stripAnswerKey(row);
  assert.equal("expectedAnswer" in stripped, false);
  assert.equal("correctIndices" in (stripped.options as Record<string, unknown>), false);
  // The chat UI renders option labels from the stripped payload.
  assert.deepEqual((stripped.options as { options: string[] }).options, ["A", "B", "C"]);
  assert.equal((stripped.options as { allowMultiple: boolean }).allowMultiple, false);
  assert.equal(stripped.text, "Pick one");
  assert.equal(stripped.description, "helper text");
});

test("stripAnswerKey passes null options through and tolerates missing fields", () => {
  const bare = { id: "q2", text: "Open", type: "OPEN_ENDED" };
  assert.deepEqual(stripAnswerKey(bare), { ...bare, options: null });

  const coding = {
    id: "q3",
    text: "Coding",
    type: "CODING",
    options: null,
    expectedAnswer: "Reference solution...",
  };
  const nullOptions = stripAnswerKey(coding);
  assert.equal(nullOptions.options, null);
  assert.equal("expectedAnswer" in nullOptions, false);
});
