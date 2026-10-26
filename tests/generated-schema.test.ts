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

test("refineRequestSchema preserves answer keys and rubrics", () => {
  const result = refineRequestSchema.safeParse({
    interview: {
      title: "Payroll",
      questions: [
        {
          text: "Pick the mandatory runs",
          type: "MULTIPLE_CHOICE",
          expectedAnswer: "A and C are mandatory.",
          options: { options: ["A", "B", "C"], correctIndices: [0, 2] },
        },
        {
          text: "Explain REST",
          type: "OPEN_ENDED",
          expectedAnswer: "Statelessness, resources, uniform interface.",
        },
      ],
    },
    feedback: "add one more question",
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.interview.questions[0].expectedAnswer, "A and C are mandatory.");
    assert.deepEqual(result.data.interview.questions[0].options?.correctIndices, [0, 2]);
    assert.equal(result.data.interview.questions[1].expectedAnswer, "Statelessness, resources, uniform interface.");
  }
});

test("buildImprovePrompt surfaces existing answer keys and rubrics", () => {
  const messages = buildImprovePrompt(
    {
      title: "Payroll",
      questions: [
        {
          text: "Pick the mandatory runs",
          type: "MULTIPLE_CHOICE",
          expectedAnswer: "A and C are mandatory.",
          options: { options: ["A", "B", "C"], correctIndices: [0, 2] },
        },
      ],
    },
    "add one more question",
  );
  const system = messages[0].content as string;
  const user = messages[1].content as string;
  assert.match(user, /Current expectedAnswer\/rubric: A and C are mandatory\./);
  assert.match(user, /Current answer key \(zero-based option indexes\): 0, 2/);
  assert.match(system, /Preserve each question's existing "expectedAnswer"/);
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

const BASE = {
  title: "T",
  description: "D",
  objective: "O",
  assessmentCriteria: [{ name: "S", description: "Skill" }],
  estimatedDurationMinutes: 30,
  recommendedSettings: { aiName: "Ada" },
};

const parseQuestion = (question: Record<string, unknown>) =>
  generatedInterviewSchema.safeParse({ ...BASE, questions: [question] });

test("non-choice types must not carry options or starterCode; choice types must carry options", () => {
  // OPEN_ENDED with options → reject.
  assert.equal(
    parseQuestion({ order: 1, text: "Tell", type: "OPEN_ENDED", options: { options: ["A", "B"] } })
      .success,
    false,
  );
  // SHORT_TEXT with starterCode → reject.
  assert.equal(
    parseQuestion({
      order: 1,
      text: "Name",
      type: "SHORT_TEXT",
      starterCode: { language: "py", code: "x = 1" },
    }).success,
    false,
  );
  // Choice with too few / too many options → reject.
  assert.equal(
    parseQuestion({ order: 1, text: "Pick", type: "SINGLE_CHOICE", options: { options: ["A"] } })
      .success,
    false,
  );
  assert.equal(
    parseQuestion({
      order: 1,
      text: "Pick",
      type: "SINGLE_CHOICE",
      options: { options: ["1", "2", "3", "4", "5", "6", "7"] },
    }).success,
    false,
  );
  // Boundary option counts (2 and 6) are accepted.
  assert.equal(
    parseQuestion({ order: 1, text: "Pick", type: "SINGLE_CHOICE", options: { options: ["A", "B"] } })
      .success,
    true,
  );
  assert.equal(
    parseQuestion({
      order: 1,
      text: "Pick",
      type: "MULTIPLE_CHOICE",
      options: { options: ["1", "2", "3", "4", "5", "6"], allowMultiple: true },
    }).success,
    true,
  );
});

test("structural bounds: question count, question order, language default", () => {
  const question = { order: 1, text: "q", type: "OPEN_ENDED" };
  // 0 and 26 questions are out of bounds.
  assert.equal(generatedInterviewSchema.safeParse({ ...BASE, questions: [] }).success, false);
  assert.equal(
    generatedInterviewSchema.safeParse({
      ...BASE,
      questions: Array.from({ length: 26 }, (_, i) => ({ ...question, text: `q${i}` })),
    }).success,
    false,
  );
  // order must be a positive integer.
  assert.equal(parseQuestion({ ...question, order: 0 }).success, false);
  // generateRequestSchema defaults language to "id".
  const gen = generateRequestSchema.safeParse({ description: "hire a dev" });
  assert.equal(gen.success, true);
  if (gen.success) assert.equal(gen.data.language, "id");
});

test("answer key fields survive generation parsing", () => {
  const result = parseQuestion({
    order: 1,
    text: "Pick the correct process",
    type: "MULTIPLE_CHOICE",
    expectedAnswer: "Options A and C are the two mandatory payroll runs.",
    options: { options: ["A", "B", "C"], allowMultiple: true, correctIndices: [0, 2] },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.questions[0].expectedAnswer, "Options A and C are the two mandatory payroll runs.");
    assert.deepEqual(result.data.questions[0].options?.correctIndices, [0, 2]);
  }
  // OPEN_ENDED carries expectedAnswer without options.
  const open = parseQuestion({
    order: 2,
    text: "Explain REST",
    type: "OPEN_ENDED",
    expectedAnswer: "Statelessness, resources, uniform interface.",
  });
  assert.equal(open.success, true);
  if (open.success) assert.equal(open.data.questions[0].expectedAnswer, "Statelessness, resources, uniform interface.");
});