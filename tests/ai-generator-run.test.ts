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
  "OPENROUTER_API_KEY",
  "AI_API_KEY",
  "AI_MODEL",
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

test("getGeneratorModelChain returns only the gateway model regardless of other provider keys", () => {
  withEnv(
    {
      AI_API_KEY: "test-ai",
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: "test-gemini",
      KIMI_API_KEY: "test-kimi",
      MINIMAX_API_KEY: "test-minimax",
      AI_MODEL: undefined,
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), ["minimax-m3.1"]);
      assert.equal(resolveGeneratorModel(), "minimax-m3.1");
    },
  );
});

test("getGeneratorModelChain honors AI_MODEL override", () => {
  withEnv(
    {
      AI_API_KEY: "test-ai",
      AI_MODEL: "custom-gateway-model",
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), ["custom-gateway-model"]);
      assert.equal(resolveGeneratorModel(), "custom-gateway-model");
    },
  );
});

test("getGeneratorModelChain appends OpenRouter fallback when OPENROUTER_API_KEY is set", () => {
  withEnv(
    {
      OPENAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      KIMI_API_KEY: undefined,
      MINIMAX_API_KEY: undefined,
      AI_API_KEY: "test-ai",
      AI_MODEL: undefined,
      OPENROUTER_API_KEY: "test-openrouter",
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), [
        "minimax-m3.1",
        "meta/muse-spark-1.3-contributor",
      ]);
    },
  );
});

test("getGeneratorModelChain requires AI_API_KEY even when other keys exist", () => {
  withEnv(
    {
      OPENAI_API_KEY: "test-openai",
      MINIMAX_API_KEY: "test-minimax",
      AI_API_KEY: undefined,
    },
    () => {
      assert.throws(() => getGeneratorModelChain(), /AI_API_KEY/);
    },
  );
});
