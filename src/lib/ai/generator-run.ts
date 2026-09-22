import { createLogger } from "@/lib/logger";
import {
    getProvider,
    PRIMARY_GENERATOR_MODEL,
} from "./registry";
import type { GenerationParams, LLMResponse } from "./types";

const log = createLogger("ai/generator-run");

/** Generator model chain: MiniMax-M3 only. */
export function getGeneratorModelChain(): string[] {
  if (!process.env.MINIMAX_API_KEY?.trim()) {
    throw new Error("No generator LLM configured. Set MINIMAX_API_KEY.");
  }
  return ["MiniMax-M3"];
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

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const provider = getProvider(model);
    try {
      for await (const chunk of provider.streamResponse({ ...params, model })) {
        yield chunk;
      }
      return;
    } catch (err) {
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
