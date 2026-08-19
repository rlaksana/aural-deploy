/**
 * Maps ISO language codes (en/id/zh/es/fr) to a human-readable language name
 * that is safe to embed inside an LLM prompt. The code is what we persist as
 * `interview.language`; the human-readable name is what we tell the model to
 * use for the generated text.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  id: "Indonesian (Bahasa Indonesia)",
  zh: "Chinese (Simplified)",
  es: "Spanish",
  fr: "French",
};

export function getPromptLanguageName(code?: string): string | undefined {
  if (!code) return undefined;
  return LANGUAGE_NAMES[code] ?? code;
}

export const SUPPORTED_LANGUAGE_CODES = Object.keys(LANGUAGE_NAMES);