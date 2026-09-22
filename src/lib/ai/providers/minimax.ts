import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { type LLMProvider, type GenerationParams, type LLMResponse, type LLMMessage } from "../types";

/** Strip `<think>…</think>` reasoning blocks that M2+ models emit. */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

export class MinimaxProvider implements LLMProvider {
  id = "minimax";
  name = "MiniMax";
  models = ["MiniMax-M3"];
  defaultModel = "MiniMax-M3";

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY ?? "",
      baseURL: process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1",
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

    // MiniMax API requires at least one user message in the payload.
    // If the prompt contains only system messages, append a user message
    // so MiniMax does not reject it with 400 (chat content is empty - code 2013).
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
    const response = await this.client.chat.completions.create({
      model: params.model ?? this.defaultModel,
      messages: this.toOpenAIMessages(params.messages),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
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
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
