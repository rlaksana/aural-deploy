import assert from "node:assert/strict";
import test from "node:test";

import {
  getGeneratorModelChain,
  resolveGeneratorModel,
} from "../src/lib/ai/generator-run";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "KIMI_API_KEY",
  "MINIMAX_API_KEY",
] as const;

function withEnv(
  nextEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  fn: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    const value = nextEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("getGeneratorModelChain returns only MiniMax-M3 regardless of other provider keys", () => {
  withEnv(
    {
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: "test-gemini",
      KIMI_API_KEY: "test-kimi",
      MINIMAX_API_KEY: "test-minimax",
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), ["MiniMax-M3"]);
      assert.equal(resolveGeneratorModel(), "MiniMax-M3");
    },
  );
});

test("getGeneratorModelChain still requires MINIMAX_API_KEY even when other keys exist", () => {
  withEnv(
    {
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: undefined,
      KIMI_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
    },
    () => {
      assert.throws(() => getGeneratorModelChain(), /MINIMAX_API_KEY/);
    },
  );
});
