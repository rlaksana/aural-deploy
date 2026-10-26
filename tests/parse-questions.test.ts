import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestionsResponseSchema, parseQuestionsRequestSchema } from "../src/lib/ai/parse-questions-schema";

test("parseQuestionsResponseSchema transforms and cleans extracted questions", () => {
  const raw = {
    title: "Business Consultant Interview",
    questions: [
      {
        text: "Ceritakan pengalaman profesional B2B sales Anda.",
        type: "OPEN_ENDED",
        assesses: "Kedalaman pengalaman B2B sales",
      },
      {
        text: "Posisi ini bekerja secara on-site di Kemayoran. Bagaimana kesesuaian Anda?",
        type: "SINGLE_CHOICE",
        options: {
          options: [
            "Sesuai dan saya dapat bekerja on-site",
            "Saya lebih membutuhkan pengaturan hybrid",
          ],
        },
      },
    ],
  };

  const parsed = parseQuestionsResponseSchema.safeParse(raw);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.questions.length, 2);
    assert.equal(parsed.data.questions[0].type, "OPEN_ENDED");
    assert.equal(parsed.data.questions[0].description, "Kedalaman pengalaman B2B sales");
    assert.equal(parsed.data.questions[1].type, "SINGLE_CHOICE");
    assert.equal(parsed.data.questions[1].options?.options.length, 2);
  }
});

test("parseQuestionsResponseSchema fixes misclassified options to choice types", () => {
  const raw = {
    questions: [
      {
        text: "Select option",
        type: "OPEN_ENDED",
        options: { options: ["A", "B"] },
      },
    ],
  };

  const parsed = parseQuestionsResponseSchema.safeParse(raw);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.questions[0].type, "SINGLE_CHOICE");
  }
});

test("parseQuestionsResponseSchema accepts optional criteria and defaults description", () => {
  const raw = {
    title: "System Consultant",
    questions: [{ text: "Q1", type: "OPEN_ENDED" }],
    criteria: [
      { name: "HR & Payroll Functional Knowledge", description: "Covers questions 1-3" },
      { name: "Process Mapping" },
    ],
  };

  const parsed = parseQuestionsResponseSchema.safeParse(raw);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.criteria?.length, 2);
    assert.equal(parsed.data.criteria?.[0].name, "HR & Payroll Functional Knowledge");
    assert.equal(parsed.data.criteria?.[1].description, "");
  }
});

test("parseQuestionsResponseSchema stays valid without criteria (backward compat)", () => {
  const raw = {
    questions: [{ text: "Q1", type: "OPEN_ENDED" }],
  };
  assert.equal(parseQuestionsResponseSchema.safeParse(raw).success, true);
});

test("parseQuestionsRequestSchema validates bounds", () => {
  assert.equal(parseQuestionsRequestSchema.safeParse({ text: "too short" }).success, false);
  assert.equal(parseQuestionsRequestSchema.safeParse({ text: "This is a long enough text to parse questions from." }).success, true);
});

test("answer key survives the parse transform", () => {
  const raw = {
    questions: [
      {
        text: "Pilih pernyataan yang tepat",
        type: "MULTIPLE_CHOICE",
        options: {
          options: ["A text", "B text", "C text"],
          allowMultiple: true,
          correctIndices: [0, 2],
        },
      },
      {
        text: "Jelaskan perbedaan synchronous dan asynchronous.",
        type: "OPEN_ENDED",
        expectedAnswer: "Menyebut blocking/non-blocking dan contoh penggunaan.",
      },
    ],
  };

  const parsed = parseQuestionsResponseSchema.safeParse(raw);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.questions[0].options?.correctIndices, [0, 2]);
    assert.equal(
      parsed.data.questions[1].expectedAnswer,
      "Menyebut blocking/non-blocking dan contoh penggunaan.",
    );
  }
});
