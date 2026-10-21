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

test("unparseable raw goes to the repair model with the ORIGINAL raw", async () => {
  const raw = '{"name":"Budi"'; // unterminated brace — extractJson cannot close it
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

test("failed repair throws AiRepairError after exactly ONE repair call", async () => {
  const { calls, generate } = spyGenerate(["not json at all"]);
  await assert.rejects(
    repairStructured({ raw: '{"name":123}', schema, label: "t", generate }),
    AiRepairError,
  );
  assert.equal(calls.length, 1, "never a second repair attempt");
});

test("repair output that still fails validation throws AiRepairError", async () => {
  const { generate } = spyGenerate(['{"name":456}']);
  await assert.rejects(
    repairStructured({ raw: '{"name":123}', schema, label: "t", generate }),
    /failed validation/,
  );
});

test("REPAIR_MODEL is the OpenRouter slug, not the Z.AI look-alike", () => {
  assert.equal(REPAIR_MODEL, "z-ai/glm-5.3-flash");
  assert.notEqual(REPAIR_MODEL, "glm-5.3-flash");
});
