import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canRunLanguage,
  runCode,
  summarizeRunForChat,
} from "../src/lib/code-runner";

describe("canRunLanguage", () => {
  it("accepts the browser-runnable languages", () => {
    for (const language of ["javascript", "typescript", "python"]) {
      assert.equal(canRunLanguage(language), true, language);
    }
  });

  it("rejects languages that need a server-side runner", () => {
    for (const language of ["java", "cpp", "c", "go", "rust", "sql", "html"]) {
      assert.equal(canRunLanguage(language), false, language);
    }
  });
});

describe("runCode", () => {
  it("rejects unsupported languages without spawning a worker", async () => {
    await assert.rejects(
      () => runCode("public static void main() {}", "java"),
      /cannot run in the browser/,
    );
  });
});

describe("summarizeRunForChat", () => {
  it("splits streams and flags failure", () => {
    const summary = summarizeRunForChat(
      {
        lines: [
          { stream: "stdout", line: "hello" },
          { stream: "stderr", line: "Traceback…" },
        ],
      },
      "python",
    );
    assert.deepEqual(summary, {
      language: "python",
      ok: false,
      stdout: "hello",
      stderr: "Traceback…",
    });
  });

  it("caps oversized output", () => {
    const summary = summarizeRunForChat(
      { lines: [{ stream: "stdout", line: "x".repeat(5000) }] },
      "javascript",
    );
    assert.equal(summary.stdout.length, 2000);
    assert.equal(summary.ok, true);
  });
});
