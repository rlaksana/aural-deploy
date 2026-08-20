import assert from "node:assert/strict";
import test from "node:test";

import {
  generatedInterviewSchema,
  generateRequestSchema,
  refineRequestSchema,
} from "../src/lib/ai/generated-schema";
import {
  buildGeneratorPrompt,
  buildImprovePrompt,
} from "../src/lib/ai/prompts/generator";
import { getPromptLanguageName } from "../src/lib/ai/language-name";

test("getPromptLanguageName maps known codes to human names", () => {
  assert.equal(getPromptLanguageName("id"), "Indonesian (Bahasa Indonesia)");
  assert.equal(getPromptLanguageName("en"), "English");
  assert.equal(getPromptLanguageName("zh"), "Chinese (Simplified)");
  assert.equal(getPromptLanguageName("fr"), "French");
  assert.equal(getPromptLanguageName("es"), "Spanish");
  // Unknown codes fall through verbatim.
  assert.equal(getPromptLanguageName("xx"), "xx");
});

test("buildGeneratorPrompt embeds human language name, not the code", () => {
  const messages = buildGeneratorPrompt(
    "Hire a senior frontend engineer",
    20,
    "id",
    undefined,
    undefined,
  );
  const text = messages[0].content;
  assert.equal(typeof text, "string");
  assert.match(text as string, /Indonesian \(Bahasa Indonesia\)/);
  assert.doesNotMatch(text as string, /written in id\b/);
});

test("generatedInterviewSchema rejects invalid question options", () => {
  const invalid = {
    title: "Senior frontend",
    description: "Frontend interview",
    objective: "Evaluate fit",
    assessmentCriteria: [{ name: "Skill", description: "Coding skill" }],
    estimatedDurationMinutes: 30,
    questions: [
      {
        order: 1,
        text: "Pick one",
        type: "SINGLE_CHOICE",
        // missing options
        isRequired: true,
      },
    ],
    recommendedSettings: { aiName: "Ada" },
  };
  const result = generatedInterviewSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("generatedInterviewSchema rejects coding question without starterCode", () => {
  const invalid = {
    title: "Algorithms",
    description: "Algorithms",
    objective: "Solve",
    assessmentCriteria: [{ name: "Skill", description: "Coding skill" }],
    estimatedDurationMinutes: 30,
    questions: [
      {
        order: 1,
        text: "Reverse a list",
        type: "CODING",
        isRequired: true,
      },
    ],
    recommendedSettings: { aiName: "Ada" },
  };
  const result = generatedInterviewSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("generatedInterviewSchema accepts a valid structured interview", () => {
  const valid = {
    title: "Senior frontend",
    description: "Frontend interview",
    objective: "Evaluate fit",
    assessmentCriteria: [{ name: "Skill", description: "Coding skill" }],
    estimatedDurationMinutes: 30,
    questions: [
      {
        order: 1,
        text: "Pick one",
        type: "SINGLE_CHOICE",
        isRequired: true,
        options: { options: ["A", "B"], allowMultiple: false },
      },
      {
        order: 2,
        text: "Reverse a list",
        type: "CODING",
        isRequired: true,
        starterCode: { language: "python", code: "def reverse(lst):\n    pass" },
      },
    ],
    recommendedSettings: { aiName: "Ada" },
  };
  const result = generatedInterviewSchema.safeParse(valid);
  assert.equal(result.success, true);
});

test("generateRequestSchema caps oversized payloads", () => {
  const huge = "x".repeat(20_000);
  const result = generateRequestSchema.safeParse({
    description: "ok",
    jobDescription: huge,
  });
  assert.equal(result.success, false);
});

test("refineRequestSchema requires at least one question", () => {
  const result = refineRequestSchema.safeParse({
    interview: {
      title: "Senior frontend",
      description: "Frontend interview",
      objective: "Evaluate fit",
      assessmentCriteria: [{ name: "Skill", description: "Coding skill" }],
      questions: [],
    },
    feedback: "make it harder",
  });
  assert.equal(result.success, false);
});

test("buildImprovePrompt preserves language instruction when language is non-en", () => {
  const messages = buildImprovePrompt(
    {
      title: "Senior frontend",
      description: "Frontend interview",
      objective: "Evaluate fit",
      assessmentCriteria: [],
      questions: [{ text: "q1", type: "OPEN_ENDED" }],
    },
    "make it harder",
    "id",
    undefined,
    undefined,
  );
  assert.equal(typeof messages[0].content, "string");
  assert.match(messages[0].content as string, /Indonesian \(Bahasa Indonesia\)/);
});