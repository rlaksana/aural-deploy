import { createLogger } from "@/lib/logger";
import type { ZodType } from "zod";
import { extractJson } from "./extract-json";
import { getProvider, REPAIR_MODEL } from "./registry";
import type { LLMMessage } from "./types";

const log = createLogger("ai/repair");

export type RepairGenerate = (
  messages: LLMMessage[],
) => Promise<{ content: string }>;

export class AiRepairError extends Error {
  readonly label: string;
  constructor(label: string, message: string) {
    super(`[${label}] ${message}`);
    this.name = "AiRepairError";
    this.label = label;
  }
}

const repairGenerateDefault: RepairGenerate = (messages) =>
  getProvider("openrouter").generateResponse({
    messages,
    model: REPAIR_MODEL,
    temperature: 0,
    maxTokens: 8192,
  });

function buildRepairMessages(raw: string, issues: string[]): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "You repair malformed JSON output produced by another model. You receive the raw model output and the validation errors it produced. Return the COMPLETE corrected JSON object that passes those validation errors.\n" +
        "Rules:\n" +
        "- Preserve the original content and meaning; fix structure and syntax only.\n" +
        "- Never invent or add data that is not present in the raw output; if a field cannot be repaired from the raw output, drop it or use a schema default.\n" +
        "- Output ONLY the JSON object. No markdown fences, no commentary.",
    },
    {
      role: "user",
      content: `Validation errors:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nRaw model output:\n${raw}`,
    },
  ];
}

/**
 * Structured-output repair pipeline: deterministic fix (extractJson) → schema
 * validation → ONE dedicated repair-model call fed the ORIGINAL raw output and
 * the validation errors (never a blind re-run of the main model) → final
 * validation. Throws AiRepairError when the output cannot be saved — it never
 * returns fabricated data.
 */
export async function repairStructured<T>(opts: {
  raw: string;
  schema: ZodType<T>;
  label: string;
  generate?: RepairGenerate;
}): Promise<T> {
  const { raw, schema, label, generate = repairGenerateDefault } = opts;
  const startedAt = Date.now();
  let issues: string[];

  try {
    const parsed = extractJson(raw);
    const direct = schema.safeParse(parsed);
    if (direct.success) {
      log.info(
        `ai_repair ${label} ok=true repaired=false latencyMs=${Date.now() - startedAt}`,
      );
      return direct.data;
    }
    issues = direct.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  } catch {
    // extractJson cannot close unterminated braces — the repair model can.
    issues = ["raw output is not parseable JSON (unterminated braces or missing object)"];
  }

  const response = await generate(buildRepairMessages(raw, issues));

  let repairedParsed: unknown;
  try {
    repairedParsed = extractJson(response.content);
  } catch {
    log.info(
      `ai_repair ${label} ok=false repaired=true latencyMs=${Date.now() - startedAt}`,
    );
    throw new AiRepairError(label, "repair model output is not parseable JSON");
  }
  const validated = schema.safeParse(repairedParsed);
  log.info(
    `ai_repair ${label} ok=${validated.success} repaired=true latencyMs=${Date.now() - startedAt}`,
  );
  if (!validated.success) {
    const summary = validated.error.issues
      .slice(0, 3)
      .map((i) => i.message)
      .join("; ");
    throw new AiRepairError(label, `repair output failed validation: ${summary}`);
  }
  return validated.data;
}
