import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

/** Strip `<think>…</think>` reasoning blocks GLM models can emit. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

/**
 * Z.AI (GLM) Coding Plan API — OpenAI-compatible Chat Completions.
 * Requires the Coding Plan subscription key; the regular pay-as-you-go key
 * must not be used with this endpoint. GLM-5.3-Flash always thinks;
 * reasoning_effort controls depth ("low" keeps report generation fast).
 */
export class ZaiProvider implements LLMProvider {
  id = "zai";
  name = "Z.AI";
  models = ["glm-5.3-flash"];
  defaultModel = "glm-5.3-flash";

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.ZAI_API_KEY ?? "",
      baseURL: process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4",
    });
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    return messages.filter((m) =>
      typeof m.content === "string" ? m.content.trim().length > 0 : m.content.length > 0,
    ) as ChatCompletionMessageParam[];
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: params.model ?? this.defaultModel,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      // GLM-5.3-Flash thinks by default; cap the depth for structured output.
      ...({ thinking: { type: "enabled" }, reasoning_effort: "low" }),
    });

    const choice = response.choices[0];
    return {
      content: stripThinking(choice.message.content ?? ""),
      finishReason: choice.finish_reason ?? "stop",
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }

  async *streamResponse(
    params: GenerationParams & { model?: string }
  ): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: params.model ?? this.defaultModel,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      ...({ thinking: { type: "enabled" }, reasoning_effort: "low" }),
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
