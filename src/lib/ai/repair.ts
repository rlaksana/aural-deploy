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

function buildRepairMessages(
  raw: string,
  issues: string[],
  shapeHint?: string,
  previousAttempt?: string,
): LLMMessage[] {
  return [
    {
      role: "system",
      content:
        "You repair malformed JSON output produced by another model. You receive the raw model output and the validation errors it produced. Return the COMPLETE corrected JSON object that passes those validation errors.\n" +
        "Rules:\n" +
        "- Preserve the original content and meaning; fix structure and syntax only.\n" +
        "- If the raw output is TRUNCATED (cut off mid-object, missing closing brackets, or missing trailing fields), complete the structure: close what is open and finish the incomplete last element from the content already present. If the last item (e.g. a question) is cut off mid-way, you MUST keep it and complete it minimally from its own fragments so the array is non-empty — do NOT drop it and do NOT create additional items beyond what the raw contains.\n" +
        "- For required fields that are absent from the raw output, use a minimal schema-conforming value (e.g. empty containers or the shortest valid enum) rather than inventing content.\n" +
        "- Output ONLY the JSON object. No markdown fences, no commentary." +
        (shapeHint ? `\n\nThe JSON must satisfy this schema:\n${shapeHint}` : ""),
    },
    {
      role: "user",
      content:
        `Validation errors:\n${issues.map((i) => `- ${i}`).join("\n")}\n\n` +
        (previousAttempt
          ? `Your previous repair attempt also failed validation with these errors:\n${issues.map((i) => `- ${i}`).join("\n")}\nPrevious attempt (first 4000 chars):\n${previousAttempt.slice(0, 4000)}\n\n`
          : "") +
        `Raw model output:\n${raw}`,
    },
  ];
}

/** Repair-model attempts. More than this and the output is unsalvageable. */
const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Structured-output repair pipeline: deterministic fix (extractJson) → schema
 * validation → up to TWO dedicated repair-model calls fed the ORIGINAL raw
 * output and the validation errors (never a blind re-run of the main model;
 * the second attempt sees the first attempt and its remaining errors) → final
 * validation. Throws AiRepairError when the output cannot be saved — it never
 * returns fabricated data.
 */
export async function repairStructured<T>(opts: {
  raw: string;
  schema: ZodType<T>;
  label: string;
  /** Required-shape description passed to the repair model (see schema exports). */
  shapeHint?: string;
  generate?: RepairGenerate;
}): Promise<T> {
  const { raw, schema, label, shapeHint, generate = repairGenerateDefault } = opts;
  const startedAt = Date.now();

  // Layer 1: deterministic fix of parseable output.
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
      .slice(0, 12)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
  } catch {
    issues = ["raw output is not parseable JSON (unterminated braces or missing object)"];
  }

  // Layer 2: deterministic truncation recovery — cut back to the last
  // parseable prefix and close it. Free and instant, so it runs before any
  // model call; it keeps exactly the content that survived (never invents).
  const recovered = recoverTruncated(raw, schema);
  if (recovered !== null) {
    log.info(`ai_repair ${label} ok=true repaired=true method=truncation-backoff latencyMs=${Date.now() - startedAt}`);
    return recovered;
  }

  // Layer 3: repair model (up to two attempts).
  return await repairWithModel({ raw, issues, schema, label, shapeHint, generate, startedAt });
}

/**
 * Recover a TRUNCATED JSON object: walk backwards from the end, close open
 * strings/brackets at each cut, and return the first cut whose closed object
 * passes the schema. Returns null when no prefix is recoverable.
 */
export function recoverTruncated<T>(raw: string, schema: ZodType<T>): T | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const body = raw.slice(start);
  for (let cut = body.length; cut > 0; cut -= 64) {
    const candidate = autoCloseJson(body.slice(0, cut));
    if (!candidate) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const validated = schema.safeParse(parsed);
    if (validated.success) return validated.data;
  }
  return null;
}

/** Close an unterminated JSON prefix: finish strings, strip dangling debris, close brackets. */
export function autoCloseJson(prefix: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of prefix) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.pop() !== ch) return null; // mismatched — not closeable as-is
    }
  }

  let out = prefix;
  if (inString) out += '"';
  // Strip dangling structural debris: trailing commas/colons and a key left
  // without its value ("key": <EOF>).
  for (;;) {
    out = out.trimEnd();
    if (out.endsWith(",")) {
      out = out.slice(0, -1);
      continue;
    }
    const danglingKey = out.match(/,\s*"[^"]*"\s*:\s*$/) ?? out.match(/^\{\s*"[^"]*"\s*:\s*$/);
    if (out.endsWith(":")) {
      if (danglingKey) out = out.slice(0, danglingKey.index).trimEnd();
      else out = out.slice(0, -1);
      continue;
    }
    break;
  }
  return out + stack.reverse().join("");
}

async function repairWithModel<T>(opts: {
  raw: string;
  issues: string[];
  schema: ZodType<T>;
  label: string;
  shapeHint?: string;
  generate: RepairGenerate;
  startedAt: number;
}): Promise<T> {
  const { raw, issues: initialIssues, schema, label, shapeHint, generate, startedAt } = opts;
  let issues = initialIssues;
  let lastSummary = "repair failed";
  let previousAttempt: string | undefined;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    let content: string;
    try {
      const response = await generate(buildRepairMessages(raw, issues, shapeHint, previousAttempt));
      content = response.content;
    } catch (err) {
      if (attempt < MAX_REPAIR_ATTEMPTS) continue;
      throw new AiRepairError(
        label,
        `repair model call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch {
      previousAttempt = content;
      issues = ["repair output is not parseable JSON"];
      lastSummary = "repair model output is not parseable JSON";
      log.info(`ai_repair ${label} ok=false repaired=true attempt=${attempt} latencyMs=${Date.now() - startedAt}`);
      continue;
    }
    const validated = schema.safeParse(parsed);
    if (validated.success) {
      log.info(`ai_repair ${label} ok=true repaired=true attempts=${attempt} latencyMs=${Date.now() - startedAt}`);
      return validated.data;
    }
    // Feed the failed attempt and its remaining errors into the next try.
    previousAttempt = content;
    issues = validated.error.issues
      .slice(0, 12)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    lastSummary = `repair output failed validation: ${issues.slice(0, 3).join("; ")}`;
    log.info(`ai_repair ${label} ok=false repaired=true attempt=${attempt} latencyMs=${Date.now() - startedAt}`);
  }

  throw new AiRepairError(label, lastSummary);
}

