import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

/** Strip `<think>…</think>` reasoning blocks that MiniMax-family models emit. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

/**
 * LiteLLM gateway (OpenAI-compatible). ALL text-LLM traffic routes through
 * this provider; only the repair model intentionally bypasses it (OpenRouter).
 */
export class LiteLLMProvider implements LLMProvider {
  id = "litellm";
  name = "LiteLLM Gateway";
  models = [process.env.AI_MODEL ?? "minimax-m3.1"];
  defaultModel = process.env.AI_MODEL ?? "minimax-m3.1";

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AI_API_KEY ?? "",
      baseURL: process.env.AI_BASE_URL ?? "",
    });
  }

  private toOpenAIMessages(messages: LLMMessage[]): ChatCompletionMessageParam[] {
    const formatted: ChatCompletionMessageParam[] = messages
      .filter((m) => {
        if (typeof m.content === "string") {
          return m.content.trim().length > 0;
        }
        return Array.isArray(m.content) && m.content.length > 0;
      })
      .map((m) => ({
        role: m.role,
        content: m.content as string & Array<unknown>,
      })) as ChatCompletionMessageParam[];

    // MiniMax-backed backends require at least one user message in the
    // payload; append one when the prompt is system-only so the gateway
    // does not reject it with 400.
    const hasUserMessage = formatted.some((m) => m.role === "user");
    if (!hasUserMessage) {
      formatted.push({
        role: "user",
        content: "Please proceed with the task as instructed.",
      });
    }

    return formatted;
  }

  async generateResponse(
    params: GenerationParams & { model?: string }
  ): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: params.model ?? this.defaultModel,
        messages: this.toOpenAIMessages(params.messages),
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
      },
      { signal: params.signal },
    );

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
    const stream = await this.client.chat.completions.create(
      {
        model: params.model ?? this.defaultModel,
        messages: this.toOpenAIMessages(params.messages),
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 2048,
        stream: true,
      },
      { signal: params.signal },
    );

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
