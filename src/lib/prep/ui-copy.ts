import { bt, getLanguageKey } from "@/lib/i18n";

/** Empty-state copy in the suggested-answer sidebar — not valid interview answers. */
export const PREP_SUGGESTED_ANSWER_EMPTY_HINT =
  "Generate a sample answer grounded in your JD and resume.";

export const PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT =
  "Add a JD or resume, then generate a sample answer tailored to your background.";

export function getPrepSuggestedAnswerEmptyHint(language?: string): string {
  return bt(getLanguageKey(language), {
    zh: PREP_SUGGESTED_ANSWER_EMPTY_HINT,
    en: PREP_SUGGESTED_ANSWER_EMPTY_HINT,
    id: "Buat contoh jawaban berdasarkan JD dan CV-mu.",
  });
}

export function getPrepSuggestedAnswerEmptyHintNoContext(
  language?: string,
): string {
  return bt(getLanguageKey(language), {
    zh: PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT,
    en: PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT,
    id: "Tambahkan JD atau CV, lalu buat contoh jawaban yang sesuai dengan latar belakangmu.",
  });
}

export const PREP_UI_PLACEHOLDER_ANSWERS = [
  PREP_SUGGESTED_ANSWER_EMPTY_HINT,
  PREP_SUGGESTED_ANSWER_EMPTY_HINT_NO_CONTEXT,
] as const;
