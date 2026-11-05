import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { repairStructured, AiRepairError, autoCloseJson, recoverTruncated } from "../src/lib/ai/repair";
import { REPAIR_MODEL } from "../src/lib/ai/registry";
import { buildSummaryReportSchema } from "../src/lib/ai/generated-schema";
import type { LLMMessage } from "../src/lib/ai/types";

const schema = z.object({ name: z.string() });

/** Spy generate: records calls, replies from a script of raw strings. */
function spyGenerate(replies: string[]) {
  const calls: LLMMessage[][] = [];
  const generate = async (messages: LLMMessage[]) => {
    calls.push(messages);
    if (calls.length > replies.length) {
      throw new Error("unexpected extra repair call");
    }
    return { content: replies[calls.length - 1] };
  };
  return { calls, generate };
}

test("valid JSON passes without any repair call", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '{"name":"Budi"}',
    schema,
    label: "t",
    generate,
  });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 0);
});

test("markdown-fenced JSON is fixed deterministically, no repair call", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '```json\n{"name":"Budi"}\n```',
    schema,
    label: "t",
    generate,
  });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 0);
});

test("unparseable non-JSON raw goes to the repair model with the ORIGINAL raw", async () => {
  const raw = "Sorry, I cannot produce JSON for this request."; // no object at all
  const { calls, generate } = spyGenerate(['{"name":"Budi"}']);
  const result = await repairStructured({ raw, schema, label: "t", generate });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 1);
  const promptText = calls[0].map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
  assert.ok(promptText.includes(raw), "repair prompt must contain the original raw output");
  assert.ok(promptText.includes("not parseable JSON"));
});

test("schema failure goes to the repair model with validation issues", async () => {
  const { calls, generate } = spyGenerate(['{"name":"Budi"}']);
  const result = await repairStructured({
    raw: '{"name":123}',
    schema,
    label: "t",
    generate,
  });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 1);
  assert.ok(
    JSON.stringify(calls[0]).includes("name"),
    "validation issues must name the failing path",
  );
});

test("first repair attempt fails, second succeeds — exactly 2 calls", async () => {
  const { calls, generate } = spyGenerate(["not json at all", '{"name":"Budi"}']);
  const result = await repairStructured({ raw: '{"name":123}', schema, label: "t", generate });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 2);
  // The second attempt must see the first attempt's output.
  const secondUser = calls[1]!.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  assert.ok(secondUser.includes("not json at all"), "attempt 2 must include attempt 1's output");
});

test("failed repair throws AiRepairError after at most TWO repair calls", async () => {
  const { calls, generate } = spyGenerate(["not json at all", "still not json"]);
  await assert.rejects(
    repairStructured({ raw: '{"name":123}', schema, label: "t", generate }),
    AiRepairError,
  );
  assert.equal(calls.length, 2, "never a third repair attempt");
});

test("repair output that still fails validation throws AiRepairError", async () => {
  const { generate } = spyGenerate(['{"name":456}', '{"name":789}']);
  await assert.rejects(
    repairStructured({ raw: '{"name":123}', schema, label: "t", generate }),
    /failed validation/,
  );
});


test("truncated JSON recovers deterministically with ZERO repair calls", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '{"name":"Budi","note":"partial strin',
    schema,
    label: "t",
    generate,
  });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 0, "truncation must not reach the repair model");
});

test("dangling key with colon is dropped during truncation recovery", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '{"name":"Budi","next":',
    schema,
    label: "t",
    generate,
  });
  assert.deepEqual(result, { name: "Budi" });
  assert.equal(calls.length, 0);
});

test("recovery keeps earlier array items from a cut-off array", async () => {
  const listSchema = z.object({ items: z.array(z.object({ name: z.string() })).min(1) });
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '{"items":[{"name":"a"},{"name":"b"},{"name":"c',
    schema: listSchema,
    label: "t",
    generate,
  });
  // The cut-off last item is completed from its own fragment; earlier items
  // survive untouched and the repair model is never called.
  assert.deepEqual(result, { items: [{ name: "a" }, { name: "b" }, { name: "c" }] });
  assert.equal(calls.length, 0);
});

test("invalid escape sequence is doubled deterministically, content preserved", async () => {
  const noteSchema = z.object({ name: z.string(), note: z.string() });
  const { calls, generate } = spyGenerate([]);
  // Raw contains a literal backslash + M inside the string — an illegal JSON escape.
  const result = await repairStructured({
    raw: '{"name":"Budi","note":"AGESFUEL\\Memperlakukan"}',
    schema: noteSchema,
    label: "t",
    generate,
  });
  assert.equal(result.note, "AGESFUEL\\Memperlakukan");
  assert.equal(calls.length, 0);
});

test("truncated raw with an invalid escape recovers with ZERO repair calls", async () => {
  const { calls, generate } = spyGenerate([]);
  // Mirrors a real gateway failure: valid escape-free content up to a stray
  // \M mid-array, then the output is cut off mid-element.
  const result = await repairStructured({
    raw: '{"items":[{"name":"ok"},{"name":"AGESFUEL\\Memper',
    schema: z.object({ items: z.array(z.object({ name: z.string() })).min(1) }),
    label: "t",
    generate,
  });
  // The truncated last item keeps its own surviving fragment; nothing is invented.
  assert.deepEqual(result, { items: [{ name: "ok" }, { name: "AGESFUEL\\Memper" }] });
  assert.equal(calls.length, 0);
});

 test("REPAIR_MODEL is the OpenRouter slug, not the Z.AI look-alike", () => {
  assert.equal(REPAIR_MODEL, "z-ai/glm-5.3-flash");
  assert.notEqual(REPAIR_MODEL, "glm-5.3-flash");
});

// ── Summary report schema (the repairStructured contract for /api/ai/summarize)

const healthySummary = JSON.stringify({
  summary: "Kandidat menjawab terstruktur.",
  themes: ["kepemimpinan"],
  sentiment: { overall: "positive", details: "terlibat" },
  keyInsights: ["pernah memimpin tim kecil"],
  questionEvaluations: [
    { index: 1, question: "Ceritakan proyek", score: 8, evaluation: "jelas", highlights: ["detail"], improvements: ["kedalaman"] },
    { index: 2, question: "Konflik dengan rekan", score: null, evaluation: "belum dinilai" },
  ],
});

test("summary report: healthy output (including a null score) passes with zero repair calls", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: healthySummary,
    schema: buildSummaryReportSchema(2),
    label: "summary-report",
    generate,
  });
  assert.equal(calls.length, 0);
  // Loose passthrough keeps the UI fields validation does not declare.
  assert.equal(result.questionEvaluations?.[0]?.improvements?.[0], "kedalaman");
});

test("summary report: malformed score type goes to the OpenRouter repair model", async () => {
  const { calls, generate } = spyGenerate([healthySummary]);
  const result = await repairStructured({
    raw: '{"summary":"x","questionEvaluations":[{"index":1,"question":"Q","score":{"value":8}},{"index":2,"question":"Q2","score":7}]}',
    schema: buildSummaryReportSchema(2),
    label: "summary-report",
    generate,
  });
  assert.equal(calls.length, 1, "format repair, never a main-model re-run");
  assert.equal(result.questionEvaluations?.[0]?.score, 8);
});

test("summary report: evaluation count must equal the question count", async () => {
  const oneEntry = JSON.stringify({
    summary: "x",
    questionEvaluations: [{ index: 1, question: "Q1", score: 8 }],
  });
  const { calls, generate } = spyGenerate([healthySummary]);
  const result = await repairStructured({
    raw: oneEntry,
    schema: buildSummaryReportSchema(2),
    label: "summary-report",
    generate,
  });
  assert.equal(calls.length, 1);
  assert.ok(
    JSON.stringify(calls[0]).includes("2"),
    "validation issues must tell the repair model the expected count",
  );
  assert.equal(result.questionEvaluations?.length, 2);
});

test("summary report: questionless session accepts any evaluation list shape", async () => {
  const { calls, generate } = spyGenerate([]);
  const result = await repairStructured({
    raw: '{"summary":"x","questionEvaluations":[]}',
    schema: buildSummaryReportSchema(0),
    label: "summary-report",
    generate,
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(result.questionEvaluations, []);
});

// ── autoCloseJson unit behavior (the deterministic closer recoverTruncated leans on)

test("autoCloseJson preserves a valid \\uXXXX escape byte-for-byte", () => {
  const closed = autoCloseJson('{"a":"\\u0041');
  assert.equal(JSON.parse(closed!).a, "A");
});

test("autoCloseJson doubles a broken \\u escape instead of dropping bytes", () => {
  // "\u00" lacks the required 4 hex digits — the backslash is doubled so the
  // original characters survive as literal text.
  const closed = autoCloseJson('{"a":"x\\u00');
  assert.equal(JSON.parse(closed!).a, "x\\u00");
});

test("autoCloseJson drops a lone trailing backslash and closes the string", () => {
  const closed = autoCloseJson('{"a":"x\\');
  assert.deepEqual(JSON.parse(closed!), { a: "x" });
});

test("autoCloseJson closes a string cut off mid-value", () => {
  assert.equal(autoCloseJson('{"a":"open strin'), '{"a":"open strin"}');
});

test("autoCloseJson strips a dangling trailing comma", () => {
  assert.equal(autoCloseJson('{"a":"x",'), '{"a":"x"}');
});

test("autoCloseJson strips a dangling colon with no value", () => {
  assert.equal(autoCloseJson('{"a":"x":'), '{"a":"x"}');
});

test("autoCloseJson drops a dangling key left without its value", () => {
  assert.equal(autoCloseJson('{"a":"x","b":'), '{"a":"x"}');
});

test("autoCloseJson reduces a first-key-without-value to an empty object", () => {
  assert.deepEqual(JSON.parse(autoCloseJson('{"b":')!), {});
});

test("autoCloseJson closes nested brackets in reverse order", () => {
  // Trailing comma and both open containers: the exact shape of a mid-array cut.
  assert.deepEqual(JSON.parse(autoCloseJson('[{"a":[1,')!), [{ a: [1] }]);
});

test("autoCloseJson returns null on a bracket mismatch it cannot close as-is", () => {
  assert.equal(autoCloseJson("[}"), null);
});

test("recoverTruncated returns null when no prefix can satisfy the schema", () => {
  // Fully parseable but wrong type: no cut point can produce a valid object.
  assert.equal(recoverTruncated('{"name":123}', schema), null);
  assert.equal(recoverTruncated("no object at all", schema), null);
});
