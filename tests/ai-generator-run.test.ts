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
  "ZAI_API_KEY",
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

test("getGeneratorModelChain returns only the GLM primary regardless of other provider keys", () => {
  withEnv(
    {
      ZAI_API_KEY: "test-zai",
      AI_API_KEY: "test-ai",
      OPENAI_API_KEY: "test-openai",
      GEMINI_API_KEY: "test-gemini",
      KIMI_API_KEY: "test-kimi",
      MINIMAX_API_KEY: "test-minimax",
      OPENROUTER_API_KEY: undefined,
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), ["glm-5.3-flash"]);
      assert.equal(resolveGeneratorModel(), "glm-5.3-flash");
    },
  );
});

test("getGeneratorModelChain ignores AI_MODEL override (gateway is not the generator primary)", () => {
  withEnv(
    {
      ZAI_API_KEY: "test-zai",
      AI_API_KEY: "test-ai",
      AI_MODEL: "custom-gateway-model",
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), ["glm-5.3-flash"]);
      assert.equal(resolveGeneratorModel(), "glm-5.3-flash");
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
      AI_API_KEY: undefined,
      AI_MODEL: undefined,
      OPENROUTER_API_KEY: "test-openrouter",
      ZAI_API_KEY: "test-zai",
    },
    () => {
      assert.deepEqual(getGeneratorModelChain(), [
        "glm-5.3-flash",
        "meta/muse-spark-1.3-contributor",
      ]);
    },
  );
});

test("getGeneratorModelChain requires ZAI_API_KEY even when other keys exist", () => {
  withEnv(
    {
      OPENAI_API_KEY: "test-openai",
      MINIMAX_API_KEY: "test-minimax",
      AI_API_KEY: "test-ai",
      ZAI_API_KEY: undefined,
    },
    () => {
      assert.throws(() => getGeneratorModelChain(), /ZAI_API_KEY/);
    },
  );
});
