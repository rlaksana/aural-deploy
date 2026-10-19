import assert from "node:assert/strict";
import test from "node:test";
import { extractJson } from "../src/lib/ai/extract-json";

test("parses plain JSON and JSON wrapped in prose or markdown fences", () => {
  assert.deepEqual(extractJson('{"summary":"ok"}'), { summary: "ok" });
  assert.deepEqual(
    extractJson('Here is your report:\n{"summary":"ok"}\nHope this helps!'),
    { summary: "ok" },
  );
  assert.deepEqual(extractJson('```json\n{"summary":"ok"}\n```'), { summary: "ok" });
});

test("normalises smart quotes to parseable ASCII", () => {
  const parsed = extractJson('{"summary":"the “best” answer"}');
  assert.equal(parsed.summary, 'the "best" answer');
});

test("repairs unescaped newlines and interior quotes inside string values", () => {
  const parsed = extractJson(
    '{"summary":"line one\nline two: he said "hi" today"}',
  );
  // The repaired value keeps the full sentence, not a truncated fragment.
  assert.match(String(parsed.summary), /line one/);
  assert.match(String(parsed.summary), /he said "hi" today/);
});

test("throws when the response contains no JSON object", () => {
  assert.throws(() => extractJson("no structured content here"), /No JSON object/);
});
