import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("lib/answer-keys");

/**
 * Answer keys (expectedAnswer + options.correctIndices) live in the
 * question_answer_keys table, which denies anon/authenticated access
 * (RLS enabled, no policies). The service-role key is the only
 * reader/writer. These helpers are the single seam: grading, prompting,
 * and editor reads merge keys back in here — candidate/public payloads
 * never pass through this module.
 */

export type AnswerKeyRow = {
  questionId: string;
  expectedAnswer: string | null;
  correctIndices: number[] | null;
};

export type KeyedQuestion = {
  id: string;
  expectedAnswer?: string | null;
  options?: {
    options?: string[];
    allowMultiple?: boolean;
    correctIndices?: number[];
  } | null;
};

type KeyClient = Pick<typeof supabaseAdmin, "from">;

/**
 * Merge stored keys onto question rows. Missing/erroring key rows leave
 * the questions untouched (open-ended questions have no key row). Returns
 * new objects; the input array is not mutated.
 */
export async function withAnswerKeys<T extends KeyedQuestion>(
  questions: T[],
  client: KeyClient = supabaseAdmin,
): Promise<T[]> {
  if (questions.length === 0) return questions;
  const ids = questions.map((q) => q.id);
  const { data, error } = await client
    .from("question_answer_keys")
    .select("questionId, expectedAnswer, correctIndices")
    .in("questionId", ids);
  if (error) {
    // An unreadable key table must not pass for "this question has no key" —
    // that silently drops the rubric and the deterministic grade with it.
    log.error("Answer key read failed", error);
  }
  if (error || !data || data.length === 0) return questions;
  const byId = new Map(
    (data as AnswerKeyRow[]).map((k) => [k.questionId, k]),
  );
  return questions.map((q) => {
    const key = byId.get(q.id);
    if (!key) return q;
    // An existing key row is authoritative — including explicit nulls.
    // Falling back to the questions-row copy would resurrect a key the
    // editor already cleared (the row copy only survives until 027).
    return {
      ...q,
      expectedAnswer: key.expectedAnswer ?? null,
      options: q.options
        ? { ...q.options, correctIndices: key.correctIndices ?? undefined }
        : q.options,
    };
  });
}

/**
 * Persist keys for question ids. Call after inserting/updating question
 * rows — the questions row itself must never carry expectedAnswer or
 * options.correctIndices. A field left undefined leaves the stored value
 * untouched (partial update); an explicit null clears it.
 */
export async function upsertAnswerKeys(
  rows: {
    questionId: string;
    expectedAnswer?: string | null;
    correctIndices?: number[] | null;
  }[],
  client: KeyClient = supabaseAdmin,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from("question_answer_keys").upsert(
    rows.map((r) => ({
      questionId: r.questionId,
      // supabase-js drops undefined properties, so an omitted field never
      // reaches PostgREST and the stored value survives the upsert.
      ...(r.expectedAnswer !== undefined ? { expectedAnswer: r.expectedAnswer } : {}),
      ...(r.correctIndices !== undefined ? { correctIndices: r.correctIndices } : {}),
      updatedAt: new Date().toISOString(),
    })),
    { onConflict: "questionId" },
  );
  if (error) {
    // The questions row is already committed key-free by the time this runs:
    // a silent failure here would drop the rubric permanently. Fail loudly.
    throw new Error(`Answer key write failed: ${error.message}`);
  }
}

/**
 * Split an authored options object into the storable options (no key) and
 * the correctIndices that belong in the key table.
 */
export function splitChoiceKey(
  options: KeyedQuestion["options"],
): {
  options: { options?: string[]; allowMultiple?: boolean } | null;
  correctIndices: number[] | null;
} {
  if (!options) return { options: null, correctIndices: null };
  const { correctIndices, ...rest } = options;
  return {
    options: rest,
    correctIndices: Array.isArray(correctIndices) ? correctIndices : null,
  };
}
