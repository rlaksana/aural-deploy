import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Guards against test-registry drift: every *.test.ts in tests/ (except the
// playwright E2E file, which runs via test:functional) must be listed in the
// test:web script, and the script must not reference files that no longer
// exist. Both drift directions have already happened (2026-11-05 audit).
const testsDir = dirname(fileURLToPath(import.meta.url));

test("test:web script lists exactly the test files on disk", () => {
  const pkg = JSON.parse(readFileSync(join(testsDir, "..", "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const listed = pkg.scripts["test:web"]
    .split(/\s+/)
    .filter((token) => token.startsWith("tests/"))
    .sort();
  const onDisk = readdirSync(testsDir)
    .filter((name) => name.endsWith(".test.ts") && name !== "functional.test.ts")
    .map((name) => `tests/${name}`)
    .sort();
  assert.deepEqual(listed, onDisk);
});
