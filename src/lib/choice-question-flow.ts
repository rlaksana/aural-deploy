import type { LLMMessage } from "@/lib/ai/types";

const CHOICE_SELECTION_PATTERN = /^Selected options?(?: [A-Z]|(?:: [A-Z](?:, [A-Z])*))$/;

type ChoiceQuestion = {
  type: string;
};

export type ChoiceQuestionFlowResult = {
  content: string;
  questionAdvanced: boolean;
  isComplete: boolean;
};

export function resolveChoiceQuestionFlow({
  questions,
  currentQuestionIndex,
  conversationHistory,
}: {
  questions: ChoiceQuestion[];
  currentQuestionIndex: number;
  conversationHistory: LLMMessage[];
}): ChoiceQuestionFlowResult | null {
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
      content: "Got it. Why did you pick that option?",
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
    content: isLastQuestion
      ? "Thank you for your answer. That completes the interview."
      : "Thank you for sharing that. Let's move on to the next question.",
    questionAdvanced: !isLastQuestion,
    isComplete: isLastQuestion,
  };
}
