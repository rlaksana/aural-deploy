import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  generateRequestSchema,
} from "../src/lib/ai/generated-schema";

test("create_interview_with_questions RPC falls back to 'id', not 'en'", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "009_interview_rpc_language_default_id.sql"),
    "utf8",
  );
  assert.match(sql, /COALESCE\(p_interview->>'language', 'id'\)/);
  assert.doesNotMatch(sql, /COALESCE\(p_interview->>'language', 'en'\)/);
});

test("interviews column default is 'id' (migration 008)", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase", "migrations", "008_interview_language_default_id.sql"),
    "utf8",
  );
  assert.match(sql, /ALTER COLUMN language SET DEFAULT 'id'/);
});

test("AI generate schema defaults language to id when omitted", () => {
  const parsed = generateRequestSchema.parse({ description: "Senior engineer screen" });
  assert.equal(parsed.language, "id");
});
