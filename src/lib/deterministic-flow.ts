import type { LLMMessage } from "@/lib/ai/types";
import { CHOICE_SELECTION_PATTERN } from "./choice-question-flow";
import { bt, getLanguageKey, type BiText, type LangKey } from "./i18n";

/**
 * Extract option indices (0-based) from a protocol message like
 * "Selected option B" / "Memilih opsi: A, C". Returns [] when none.
 */
export function parseChoiceSelection(content: string): number[] {
  const letters = content.match(/\b[A-Z]\b/g) ?? [];
  return letters.map((letter) => letter.charCodeAt(0) - 65);
}

/**
 * Deterministic session flow for non-interview kinds (SURVEY, QUIZ, FORM,
 * ASSESSMENT). Mirrors `resolveChoiceQuestionFlow`'s contract so
 * `/api/ai/chat` can branch without touching its persistence tail:
 * no LLM is ever called — acks and advancement are pure functions of
 * the conversation history.
 */

const DETERMINISTIC_KINDS = new Set(["SURVEY", "QUIZ", "FORM", "ASSESSMENT"]);

export function isDeterministicKind(kind?: string | null): boolean {
  return !!kind && DETERMINISTIC_KINDS.has(kind);
}

/** Lowercase respondent-facing noun per kind, in the interview language. */
export const KIND_NOUNS: Record<string, BiText> = {
  INTERVIEW: { en: "interview", id: "wawancara", zh: "interview" },
  SURVEY: { en: "survey", id: "survei", zh: "survey" },
  QUIZ: { en: "quiz", id: "kuis", zh: "quiz" },
  FORM: { en: "form", id: "formulir", zh: "form" },
  ASSESSMENT: { en: "assessment", id: "asesmen", zh: "assessment" },
};

export function getKindNoun(lang: LangKey, kind?: string | null): string {
  return bt(lang, KIND_NOUNS[kind ?? "INTERVIEW"] ?? KIND_NOUNS.INTERVIEW);
}

export type DeterministicFlowResult = {
  content: string;
  questionAdvanced: boolean;
  isComplete: boolean;
};

type FlowQuestion = {
  type: string;
  text: string;
  validationRules?: unknown;
  options?: { options?: string[]; correctIndices?: number[] } | null;
};

/** Field constraints authored in the question editor (validationRules jsonb). */
export type AnswerValidationRules = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Java(ish) regex source string. ponytail: owner-authored, ReDoS trusted. */
  pattern?: string;
  min?: number;
  max?: number;
  inputType?: "email" | "number" | "date";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALIDATION_REPLIES: Record<string, BiText> = {
  required: {
    en: "This answer is required. Please fill it in to continue.",
    id: "Jawaban ini wajib diisi. Silakan isi untuk melanjutkan.",
    zh: "此项为必填，请填写后继续。",
  },
  minLength: {
    en: "Your answer is too short. Please write a bit more.",
    id: "Jawabanmu terlalu singkat. Tolong tulis lebih panjang sedikit.",
    zh: "回答太短，请多写一些。",
  },
  maxLength: {
    en: "Your answer is too long. Please shorten it.",
    id: "Jawabanmu terlalu panjang. Tolong persingkat.",
    zh: "回答太长，请缩短。",
  },
  pattern: {
    en: "The answer format doesn't look right. Please check and try again.",
    id: "Format jawaban tidak sesuai. Silakan periksa dan coba lagi.",
    zh: "回答格式不正确，请检查后重试。",
  },
  min: {
    en: "The value is too small. Please enter a larger number.",
    id: "Angka terlalu kecil. Silakan masukkan angka yang lebih besar.",
    zh: "数值太小，请输入更大的数字。",
  },
  max: {
    en: "The value is too large. Please enter a smaller number.",
    id: "Angka terlalu besar. Silakan masukkan angka yang lebih kecil.",
    zh: "数值太大，请输入更小的数字。",
  },
  email: {
    en: "Please enter a valid email address.",
    id: "Silakan masukkan alamat email yang valid.",
    zh: "请输入有效的电子邮件地址。",
  },
  date: {
    en: "Please enter a valid date (YYYY-MM-DD).",
    id: "Silakan masukkan tanggal yang valid (YYYY-MM-DD).",
    zh: "请输入有效日期（YYYY-MM-DD）。",
  },
};

/**
 * Server-side enforcement of a form field's validationRules. Returns a
 * localized error message, or null when the answer is accepted.
 */
export function validateAnswer(
  rules: unknown,
  content: string,
  lang: LangKey,
): string | null {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) return null;
  const r = rules as AnswerValidationRules;
  const trimmed = content.trim();

  if (r.required && trimmed.length === 0) {
    return bt(lang, VALIDATION_REPLIES.required);
  }
  if (r.minLength !== undefined && trimmed.length < r.minLength) {
    return bt(lang, VALIDATION_REPLIES.minLength);
  }
  if (r.maxLength !== undefined && trimmed.length > r.maxLength) {
    return bt(lang, VALIDATION_REPLIES.maxLength);
  }
  if (r.inputType === "email" && !EMAIL_PATTERN.test(trimmed)) {
    return bt(lang, VALIDATION_REPLIES.email);
  }
  if (r.inputType === "date" && !DATE_PATTERN.test(trimmed)) {
    return bt(lang, VALIDATION_REPLIES.date);
  }
  if (r.inputType === "number" || r.min !== undefined || r.max !== undefined) {
    const value = Number(trimmed);
    if (Number.isNaN(value)) return bt(lang, VALIDATION_REPLIES.pattern);
    if (r.min !== undefined && value < r.min) return bt(lang, VALIDATION_REPLIES.min);
    if (r.max !== undefined && value > r.max) return bt(lang, VALIDATION_REPLIES.max);
  }
  if (r.pattern) {
    try {
      if (!new RegExp(r.pattern).test(trimmed)) {
        return bt(lang, VALIDATION_REPLIES.pattern);
      }
    } catch {
      // Invalid authored pattern — skip rather than brick the form.
    }
  }
  return null;
}

const DET_REPLIES: Record<
  "welcome" | "ack" | "selectOption" | "complete" | "correct" | "wrong",
  BiText
> = {
  welcome: {
    en: "Welcome! Please answer the question shown below to continue.",
    id: "Selamat datang! Silakan jawab pertanyaan di bawah ini untuk melanjutkan.",
    zh: "欢迎！请回答下方的问题以继续。",
  },
  ack: {
    en: "Thank you. Here is the next question:",
    id: "Terima kasih. Berikut pertanyaan berikutnya:",
    zh: "谢谢。下一题：",
  },
  selectOption: {
    en: "Please select one of the options above to continue.",
    id: "Silakan pilih salah satu opsi di atas untuk melanjutkan.",
    zh: "请选择上方的选项以继续。",
  },
  complete: {
    en: "Thank you! That was the last question. Your responses have been saved.",
    id: "Terima kasih! Itu adalah pertanyaan terakhir. Jawabanmu telah disimpan.",
    zh: "谢谢！这是最后一题。你的回答已保存。",
  },
  correct: {
    en: "Correct!",
    id: "Benar!",
    zh: "正确！",
  },
  wrong: {
    en: "Not quite.",
    id: "Kurang tepat.",
    zh: "不太对。",
  },
};

export function resolveDeterministicFlow({
  kind,
  questions,
  currentQuestionIndex,
  conversationHistory,
  language,
}: {
  kind?: string | null;
  questions: FlowQuestion[];
  currentQuestionIndex: number;
  conversationHistory: LLMMessage[];
  language?: string;
}): DeterministicFlowResult | null {
  if (!isDeterministicKind(kind)) return null;

  const lang: LangKey = getLanguageKey(language);
  const total = questions.length;
  const index = Math.min(Math.max(currentQuestionIndex, 0), Math.max(total - 1, 0));
  const isLast = index >= total - 1;
  const currentQuestion = questions[index];

  // Opening: greet and wait — the UI renders the active question.
  if (conversationHistory.length === 0) {
    return { content: bt(lang, DET_REPLIES.welcome), questionAdvanced: false, isComplete: false };
  }

  const latestUserMessage = [...conversationHistory]
    .reverse()
    .find(
      (message): message is LLMMessage & { content: string } =>
        message.role === "user" && typeof message.content === "string",
    )?.content;

  if (!latestUserMessage) return null;

  const isChoiceQuestion =
    currentQuestion?.type === "SINGLE_CHOICE" ||
    currentQuestion?.type === "MULTIPLE_CHOICE";

  // Choice questions must be answered through the option protocol —
  // free text may not substitute for a selection.
  if (isChoiceQuestion && !CHOICE_SELECTION_PATTERN.test(latestUserMessage)) {
    return { content: bt(lang, DET_REPLIES.selectOption), questionAdvanced: false, isComplete: false };
  }

  // SHORT_TEXT form fields enforce their validationRules server-side
  // (trust boundary); invalid answers re-ask without advancing.
  if (currentQuestion?.type === "SHORT_TEXT") {
    const error = validateAnswer(currentQuestion.validationRules, latestUserMessage, lang);
    if (error) {
      return { content: error, questionAdvanced: false, isComplete: false };
    }
  }

  // Quizzes grade the selection on the spot; assessments stay neutral and
  // are graded at completion.
  let feedback = "";
  if (kind === "QUIZ" && isChoiceQuestion) {
    const correctIndices = currentQuestion?.options?.correctIndices;
    if (Array.isArray(correctIndices) && correctIndices.length > 0) {
      const selected = parseChoiceSelection(latestUserMessage);
      const correct =
        currentQuestion?.type === "MULTIPLE_CHOICE"
          ? selected.length === correctIndices.length &&
            selected.every((i) => correctIndices.includes(i))
          : selected.length === 1 && correctIndices.includes(selected[0]);
      feedback = bt(lang, correct ? DET_REPLIES.correct : DET_REPLIES.wrong);
    }
  }

  const ack = bt(lang, isLast ? DET_REPLIES.complete : DET_REPLIES.ack);
  return {
    content: feedback ? `${feedback} ${ack}` : ack,
    questionAdvanced: !isLast,
    isComplete: isLast,
  };
}
