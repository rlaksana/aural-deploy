import { type LLMProvider } from "./types";
import { LiteLLMProvider } from "./providers/litellm";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { KimiProvider } from "./providers/kimi";
import { MinimaxProvider } from "./providers/minimax";
import { OpenRouterProvider } from "./providers/openrouter";
import { ZaiProvider } from "./providers/zai";

const providers = new Map<string, LLMProvider>();

function registerProvider(provider: LLMProvider) {
  providers.set(provider.id, provider);
}

// LiteLLM registers FIRST so its model name wins the getProvider scan order
// (e.g. AI_MODEL matching another provider's listed model must route here).
registerProvider(new LiteLLMProvider());
registerProvider(new OpenAIProvider());
registerProvider(new GeminiProvider());
registerProvider(new KimiProvider());
registerProvider(new MinimaxProvider());
registerProvider(new OpenRouterProvider());
registerProvider(new ZaiProvider());

/** Resolve the right provider for a given model name or provider id. */
export function getProvider(idOrModel?: string | null): LLMProvider {
  if (idOrModel) {
    if (providers.has(idOrModel)) return providers.get(idOrModel)!;
    const allProviders = Array.from(providers.values());
    for (const p of allProviders) {
      if (p.models.some((m: string) => m.toLowerCase() === idOrModel.toLowerCase())) {
        return p;
      }
    }
  }
  // Default fallback order: openai → gemini → kimi → minimax → openrouter
  if (process.env.OPENAI_API_KEY) return providers.get("openai")!;
  if (process.env.GEMINI_API_KEY) return providers.get("gemini")!;
  if (process.env.KIMI_API_KEY) return providers.get("kimi")!;
  if (process.env.MINIMAX_API_KEY) return providers.get("minimax")!;
  if (process.env.OPENROUTER_API_KEY) return providers.get("openrouter")!;
  throw new Error("No LLM provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, KIMI_API_KEY, MINIMAX_API_KEY, or OPENROUTER_API_KEY.");
}

export function listProviders(): LLMProvider[] {
  return Array.from(providers.values());
}

/**
 * Primary text-LLM for the report/generator pipelines: Z.AI GLM Coding Plan
 * glm-5.3-flash (since 2026-10-22; measured 52s vs MiniMax 147s on a
 * generator-sized request). Do NOT set AI_MODEL to this value — the LiteLLM
 * provider registers first and would capture the routing.
 * The LiteLLM gateway (AI_MODEL) remains the transport for the
 * live-interviewer chat route.
 */
export const PRIMARY_TEXT_MODEL = "glm-5.3-flash";

export const REPORT_MODEL = PRIMARY_TEXT_MODEL;

export const GENERATOR_MODEL = PRIMARY_TEXT_MODEL;

export const PRIMARY_GENERATOR_MODEL = GENERATOR_MODEL;

/** Transport-error resilience fallback on OpenRouter. */
export const FALLBACK_GENERATOR_MODEL = "meta/muse-spark-1.3-contributor";

/** Dedicated JSON-repair model on OpenRouter (NOT the Z.AI glm-5.3-flash). */
export const REPAIR_MODEL = "z-ai/glm-5.3-flash";
