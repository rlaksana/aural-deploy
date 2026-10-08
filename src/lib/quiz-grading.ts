import { parseChoiceSelection } from "./deterministic-flow";

/**
 * Deterministic quiz grading. Output deliberately matches the existing
 * `insights.questionEvaluations` shape ({question, score}) so
 * `getSessionOverallScore` and `buildReportRows` work unchanged.
 */

export type QuizQuestion = {
  id: string;
  text: string;
  type: string;
  options?: { options?: string[]; correctIndices?: number[] } | null;
};

export type QuizAnswer = {
  questionId: string | null;
  content: string;
};

export type GradedQuestion = {
  question: string;
  score: number; // 0-10, matching the LLM-evaluation scale
  correct: boolean;
};

export type QuizResult = {
  questionEvaluations: GradedQuestion[];
  totalCorrect: number;
  total: number;
};

/** Score one selection against the answer key. Empty key → null (ungraded). */
export function gradeSelection(
  selectedIndices: number[],
  question: Pick<QuizQuestion, "type" | "options">,
): number | null {
  const correctIndices = question.options?.correctIndices;
  if (!Array.isArray(correctIndices) || correctIndices.length === 0) return null;

  if (question.type === "MULTIPLE_CHOICE") {
    const hits = selectedIndices.filter((i) => correctIndices.includes(i)).length;
    return Math.round((hits / correctIndices.length) * 10);
  }
  // SINGLE_CHOICE: all-or-nothing.
  return selectedIndices.length === 1 && correctIndices.includes(selectedIndices[0]) ? 10 : 0;
}

/** Grade a whole quiz from its USER messages grouped per question. */
export function gradeQuiz(questions: QuizQuestion[], answers: QuizAnswer[]): QuizResult {
  const questionEvaluations: GradedQuestion[] = [];
  let totalCorrect = 0;
  let total = 0;

  for (const question of questions) {
    const hasKey = Array.isArray(question.options?.correctIndices) && question.options!.correctIndices!.length > 0;
    if (!hasKey) continue; // ungraded (e.g. open-ended awaiting AI grading)
    total++;

    const answer = answers.find((a) => a.questionId === question.id);
    const score = gradeSelection(
      answer ? parseChoiceSelection(answer.content) : [],
      question,
    );
    const graded = score ?? 0;
    if (graded === 10) totalCorrect++;

    questionEvaluations.push({
      question: question.text,
      score: graded,
      correct: graded === 10,
    });
  }

  return { questionEvaluations, totalCorrect, total };
}
