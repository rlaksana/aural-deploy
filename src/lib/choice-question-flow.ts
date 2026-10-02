import type { LLMMessage } from "@/lib/ai/types";
import { bt, getLanguageKey, type BiText, type LangKey } from "@/lib/i18n";

// Protocol token inserted as a synthetic user message when the candidate taps
// an option. English and Indonesian variants are both accepted so the display
// string can follow the interview language.
const CHOICE_SELECTION_PATTERN =
  /^(?:Selected options?|Memilih opsi)(?: [A-Z]|(?:: [A-Z](?:, [A-Z])*))$/;

type ChoiceQuestion = {
  type: string;
};

export type ChoiceQuestionFlowResult = {
  content: string;
  questionAdvanced: boolean;
  isComplete: boolean;
};

const CHOICE_REPLIES: Record<"rationale" | "complete" | "next", BiText> = {
  rationale: {
    en: "Got it. Why did you pick that option?",
    zh: "好的。你为什么选这个选项？",
    id: "Baik. Kenapa kamu memilih opsi itu?",
  },
  complete: {
    en: "Thank you for your answer. That completes the interview.",
    zh: "感谢你的回答，面试到此结束。",
    id: "Terima kasih atas jawabanmu. Wawancara sudah selesai.",
  },
  next: {
    en: "Thank you for sharing that. Let's move on to the next question.",
    zh: "感谢你的分享，我们继续下一题。",
    id: "Terima kasih sudah berbagi. Kita lanjut ke pertanyaan berikutnya.",
  },
};

export function resolveChoiceQuestionFlow({
  questions,
  currentQuestionIndex,
  conversationHistory,
  language,
}: {
  questions: ChoiceQuestion[];
  currentQuestionIndex: number;
  conversationHistory: LLMMessage[];
  language?: string;
}): ChoiceQuestionFlowResult | null {
  const lang: LangKey = getLanguageKey(language);
  const currentQuestion = questions[currentQuestionIndex];
  const isChoiceQuestion =
    currentQuestion?.type === "SINGLE_CHOICE" ||
    currentQuestion?.type === "MULTIPLE_CHOICE";

  if (!isChoiceQuestion) return null;

  const userMessages = conversationHistory.filter(
    (message): message is LLMMessage & { content: string } =>
      message.role === "user" && typeof message.content === "string",
  );
  const latestUserMessage = userMessages.at(-1)?.content;

  if (!latestUserMessage) return null;

  if (CHOICE_SELECTION_PATTERN.test(latestUserMessage)) {
    return {
      content: bt(lang, CHOICE_REPLIES.rationale),
      questionAdvanced: false,
      isComplete: false,
    };
  }

  const previousUserMessage = userMessages.at(-2)?.content;
  if (
    !previousUserMessage ||
    !CHOICE_SELECTION_PATTERN.test(previousUserMessage)
  ) {
    return null;
  }

  const isLastQuestion = currentQuestionIndex >= questions.length - 1;
  return {
    content: bt(
      lang,
      isLastQuestion ? CHOICE_REPLIES.complete : CHOICE_REPLIES.next,
    ),
    questionAdvanced: !isLastQuestion,
    isComplete: isLastQuestion,
  };
}
