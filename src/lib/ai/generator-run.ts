import { createLogger } from "@/lib/logger";
import {
    FALLBACK_GENERATOR_MODEL,
    getProvider,
    PRIMARY_GENERATOR_MODEL,
} from "./registry";
import type { GenerationParams, LLMResponse } from "./types";

const log = createLogger("ai/generator-run");

/**
 * Generator model chain: LiteLLM gateway (AI_MODEL) primary, OpenRouter
 * transport fallback. The fallback only joins the chain when
 * OPENROUTER_API_KEY is configured.
 */
export function getGeneratorModelChain(): string[] {
  if (!process.env.ZAI_API_KEY?.trim()) {
    throw new Error("No generator LLM configured. Set ZAI_API_KEY (Z.AI Coding Plan).");
  }
  const chain = [PRIMARY_GENERATOR_MODEL];
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    chain.push(FALLBACK_GENERATOR_MODEL);
  }
  return chain;
}

export function resolveGeneratorModel(): string {
  return getGeneratorModelChain()[0]!;
}

/** Stream from the first configured generator model, falling back on failure. */
export async function* streamGeneratorWithFallback(
  params: GenerationParams & { model?: string },
): AsyncGenerator<string> {
  const models = params.model
    ? [params.model, ...getGeneratorModelChain().filter((m) => m !== params.model)]
    : getGeneratorModelChain();
  let lastError: unknown;
  let yielded = false;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const provider = getProvider(model);
    try {
      for await (const chunk of provider.streamResponse({ ...params, model })) {
        yielded = true;
        yield chunk;
      }
      return;
    } catch (err) {
      // A partial stream already reached the client — falling back now would
      // concatenate two responses into one unparseable output.
      if (yielded) throw err;
      lastError = err;
      const hasFallback = i < models.length - 1;
      if (hasFallback) {
        log.warn(
          `Generator stream failed for ${model}, falling back to ${models[i + 1]}`,
          err,
        );
      }
    }
  }

  throw lastError ?? new Error("Generator stream failed");
}

/** Non-streaming chat generation with model fallback. */
export async function generateChatWithFallback(
  params: GenerationParams & { model?: string },
): Promise<LLMResponse> {
  const primary = params.model ?? PRIMARY_GENERATOR_MODEL;
  const models = [
    primary,
    ...getGeneratorModelChain().filter((model) => model !== primary),
  ];

  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const provider = getProvider(model);
    try {
      return await provider.generateResponse({ ...params, model });
    } catch (err) {
      lastError = err;
      const hasFallback = i < models.length - 1;
      if (hasFallback) {
        log.warn(
          `Chat generation failed for ${model}, falling back to ${models[i + 1]}`,
          err,
        );
      }
    }
  }

  throw lastError ?? new Error("Chat generation failed");
}
