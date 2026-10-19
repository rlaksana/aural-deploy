import type { LLMMessage } from "./ai/types";
import type { DeterministicFlowResult } from "./deterministic-flow";
import type { ChoiceQuestionFlowResult } from "./choice-question-flow";

const MOVE_ON_PATTERN =
  /\b(next\s*question|move\s*on|skip\s*(this|it)?|next\s*one|let'?s\s*(move|continue)\s*(on|forward)?)\b/i;

/**
 * Pure decision matrix for the live interview chat: which markers advance or
 * complete the session, which are suppressed, and what text reaches the
 * transcript. Extracted from /api/ai/chat so the most fragile AI contract —
 * marker-driven progression — is unit-testable without a database or LLM.
 */
export type ChatAdvanceInput = {
  responseContent: string;
  detFlow: DeterministicFlowResult | null;
  choiceFlow: ChoiceQuestionFlowResult | null;
  manualNavigation: boolean;
  currentQuestionIndex: number | undefined;
  questions: { id: string; text: string }[];
  conversationHistory: LLMMessage[];
};

export type ChatAdvanceResult = {
  questionAdvanced: boolean;
  isComplete: boolean;
  /** Response text with markers stripped — this is what gets persisted. */
  cleanContent: string;
  /** The completion/advance markers as the AI emitted them, pre-guard. */
  markerComplete: boolean;
  /** Advance came from the verbal-transition fallback, not from a marker. */
  advancedWithoutMarker: boolean;
};

export function resolveChatAdvance({
  responseContent,
  detFlow,
  choiceFlow,
  manualNavigation,
  currentQuestionIndex,
  questions,
  conversationHistory,
}: ChatAdvanceInput): ChatAdvanceResult {
  const rawIsComplete =
    detFlow?.isComplete ??
    choiceFlow?.isComplete ??
    responseContent.includes("[INTERVIEW_COMPLETE]");
  let questionAdvanced =
    detFlow?.questionAdvanced ??
    choiceFlow?.questionAdvanced ??
    responseContent.includes("[NEXT_QUESTION]");
  const markerAdvanced = questionAdvanced;

  // Ignore [NEXT_QUESTION] in the greeting message — the AI sometimes
  // mistakenly includes it when first asking Q1 from the introduction.
  if (questionAdvanced && conversationHistory.length === 0) {
    questionAdvanced = false;
  }
  if (questionAdvanced && manualNavigation) {
    questionAdvanced = false;
  }

  // The deterministic flow completes exactly on the last question, so its
  // isComplete bypasses the premature-completion guard below.
  let isComplete: boolean;
  if (detFlow) {
    isComplete = rawIsComplete;
  } else {
    // Guard against premature completion: only honor [INTERVIEW_COMPLETE]
    // when the conversation has actually covered the whole script. The AI
    // sometimes emits the marker after a SINGLE_CHOICE selection, reading
    // the option text as a complete answer with reasoning.
    const totalQuestions = questions.length;
    const isOnLastQuestion =
      (currentQuestionIndex ?? 0) >= Math.max(totalQuestions - 1, 0);
    const hasEnoughBackAndForth = conversationHistory.length >= totalQuestions * 2 - 1;
    isComplete = rawIsComplete && isOnLastQuestion && hasEnoughBackAndForth;
  }

  const cleanContent = responseContent
    .replace("[INTERVIEW_COMPLETE]", "")
    .replace("[NEXT_QUESTION]", "")
    .trim();

  // Fallback: detect when the AI moved to the next question without the marker.
  // This catches the common case where the user says "next question" and the AI
  // transitions verbally but forgets [NEXT_QUESTION].
  if (
    !manualNavigation &&
    !detFlow &&
    choiceFlow === null &&
    !questionAdvanced &&
    !isComplete &&
    conversationHistory.length > 0
  ) {
    const lastUserMsg = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMsg) {
      const userText =
        typeof lastUserMsg.content === "string"
          ? lastUserMsg.content
          : lastUserMsg.content.map((p) => ("text" in p ? p.text : "")).join(" ");
      const userAskedToMoveOn = MOVE_ON_PATTERN.test(userText);
      if (userAskedToMoveOn) {
        const nextQ = questions[(currentQuestionIndex ?? 0) + 1];
        if (nextQ) {
          // Check if the AI's response references the next question's content
          const nextQWords = nextQ.text
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 4);
          const responseLower = cleanContent.toLowerCase();
          const matchCount = nextQWords.filter((w) => responseLower.includes(w)).length;
          const matchRatio = nextQWords.length > 0 ? matchCount / nextQWords.length : 0;
          if (matchRatio >= 0.4) {
            questionAdvanced = true;
          }
        }
      }
    }
  }

  return {
    questionAdvanced,
    isComplete,
    cleanContent,
    markerComplete: rawIsComplete,
    advancedWithoutMarker: questionAdvanced && !markerAdvanced,
  };
}
