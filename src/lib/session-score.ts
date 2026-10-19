import { bt, getLanguageKey, type BiText } from "./i18n";

type ScoreEntry = { score?: number | string | null } | null | undefined;

export type SessionScoreInsights =
  | {
      questionEvaluations?: ScoreEntry[] | null;
      criteriaEvaluations?: ScoreEntry[] | null;
    }
  | null
  | undefined;

const UNANSWERED_EVALUATION = {
  en: "Not answered",
  id: "Pertanyaan tidak dijawab",
  zh: "未回答",
} as const;

/**
 * The LLM only evaluates questions present in the transcript, but a fair
 * score must measure the candidate against ALL questions (unanswered = 0).
 * Rebuild the evaluation list in interview-question order: keep matched LLM
 * evaluations (canonical text), fill the gaps with zero scores, and drop
 * evaluations of follow-up questions so the report never gains phantom
 * Q-columns. When nothing text-matches (all paraphrased), fall back to the
 * old positional clamp so real scores are not lost.
 */
export function completeQuestionEvaluations(
  evals: unknown[],
  questions: { text: string }[],
  language: string | undefined,
): Record<string, unknown>[] {
  const normalize = (s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const byText = new Map<string, unknown>();
  for (const e of evals) {
    const text = normalize((e as { question?: unknown })?.question);
    if (text) byText.set(text, e);
  }
  const findMatch = (questionText: string): unknown | undefined => {
    const key = normalize(questionText);
    if (byText.has(key)) return byText.get(key);
    for (const [text, e] of byText) {
      if (text.includes(key) || key.includes(text)) return e;
    }
    return undefined;
  };
  const hasDirectMatch = questions.some((q) => findMatch(q.text) !== undefined);
  const unansweredLabel = bt(
    getLanguageKey(language),
    UNANSWERED_EVALUATION as BiText,
  );

  return questions.map((q, i) => {
    const e = hasDirectMatch ? findMatch(q.text) : evals[i];
    const score = (e as { score?: unknown } | undefined)?.score;
    if (e && score != null && Number.isFinite(Number(score))) {
      return { ...(e as Record<string, unknown>), question: q.text };
    }
    return { question: q.text, score: 0, evaluation: unansweredLabel };
  });
}

function averageScore(entries: ScoreEntry[] | null | undefined): number | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const scores = entries
    .map((entry) => {
      if (!entry || entry.score == null) return null;
      return typeof entry.score === "number"
        ? entry.score
        : Number(entry.score);
    })
    .filter((score): score is number => Number.isFinite(score));
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function sumScore(entries: ScoreEntry[] | null | undefined): number {
  if (!Array.isArray(entries)) return 0;
  return entries.reduce((sum, entry) => {
    if (!entry || entry.score == null) return sum;
    const score = typeof entry.score === "number" ? entry.score : Number(entry.score);
    return Number.isFinite(score) ? sum + score : sum;
  }, 0);
}

export function getSessionOverallScore(
  insights: SessionScoreInsights,
  totalQuestions?: number,
): number | null {
  const evals = insights?.questionEvaluations;
  if (!Array.isArray(evals) || evals.length === 0) {
    return averageScore(insights?.criteriaEvaluations);
  }
  // Unanswered questions count as 0: divide by ALL interview questions, not
  // just the ones that were answered. Without a total, keep the legacy
  // average-of-answered behavior.
  if (!totalQuestions || totalQuestions <= 0) return averageScore(evals);
  return sumScore(evals) / totalQuestions;
}

export function usesQuestionEvaluationScore(
  insights: SessionScoreInsights,
): boolean {
  return averageScore(insights?.questionEvaluations) !== null;
}
