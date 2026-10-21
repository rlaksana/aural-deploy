import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { repairStructured, AiRepairError } from "../src/lib/ai/repair";
import { REPAIR_MODEL } from "../src/lib/ai/registry";
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

 test("REPAIR_MODEL is the OpenRouter slug, not the Z.AI look-alike", () => {
  assert.equal(REPAIR_MODEL, "z-ai/glm-5.3-flash");
  assert.notEqual(REPAIR_MODEL, "glm-5.3-flash");
});
