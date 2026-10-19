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
/** Text matcher over stored evaluations — shared by canonicalization and merging. */
function buildEvalMatcher(evals: unknown[]) {
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
  return (questionText: string): unknown | undefined => {
    const key = normalize(questionText);
    if (byText.has(key)) return byText.get(key);
    for (const [text, e] of byText) {
      if (text.includes(key) || key.includes(text)) return e;
    }
    return undefined;
  };
}

export function completeQuestionEvaluations(
  evals: unknown[],
  questions: { text: string }[],
  language: string | undefined,
): Record<string, unknown>[] {
  const findMatch = buildEvalMatcher(evals);
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

/**
 * Whether an entry is the "Not answered" zero-fill produced by
 * completeQuestionEvaluations (as opposed to a real evaluation scoring 0).
 */
export function isUnansweredFill(entry: unknown, language?: string): boolean {
  const e = entry as { score?: unknown; evaluation?: unknown } | null;
  return (
    !!e &&
    Number(e.score) === 0 &&
    typeof e.evaluation === "string" &&
    e.evaluation === bt(getLanguageKey(language), UNANSWERED_EVALUATION as BiText)
  );
}

/**
 * Quiz/assessment grades are deterministic only for keyed choice questions;
 * unkeyed questions (open-ended, short text) are absent from that list even
 * when the candidate answered them. Deterministic entries win; the LLM's
 * evaluation fills those gaps so an answered open-ended question is graded
 * instead of falsely marked "Not answered".
 */
export function mergeDeterministicWithLlm(
  deterministic: unknown[],
  llmEvals: unknown[],
  questions: { text: string }[],
  language: string | undefined,
): Record<string, unknown>[] {
  const canonical = completeQuestionEvaluations(deterministic, questions, language);
  if (!Array.isArray(llmEvals) || llmEvals.length === 0) return canonical;
  const findLlm = buildEvalMatcher(llmEvals);
  return canonical.map((entry) => {
    if (!isUnansweredFill(entry, language)) return entry;
    const llm = findLlm(String((entry as { question?: unknown }).question ?? ""));
    if (!llm) return entry;
    return {
      ...(llm as Record<string, unknown>),
      question: (entry as { question: string }).question,
    };
  });
}

/**
 * Whether stored evaluations are already the canonical one-per-question list
 * (right count, every entry matching its positional question by the same
 * text-match rules as completeQuestionEvaluations). Batch regeneration uses
 * this to skip the AI call for sessions whose report is already correct.
 */
export function evaluationsAreCanonical(
  evals: unknown,
  questions: { text: string }[],
): boolean {
  if (!Array.isArray(evals) || evals.length !== questions.length) return false;
  const normalize = (s: unknown) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  return questions.every((q, i) => {
    const stored = normalize((evals[i] as { question?: unknown })?.question);
    const canonical = normalize(q.text);
    if (!stored || !canonical) return false;
    return (
      stored === canonical ||
      stored.includes(canonical) ||
      canonical.includes(stored)
    );
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
  // Unanswered questions count as 0: divide by ALL interview questions, not
  // just the ones that were answered. Without a total, keep the legacy
  // average-of-answered behavior, including its criteria fallback when no
  // evaluation carries a valid score.
  if (Array.isArray(evals) && evals.length > 0 && totalQuestions && totalQuestions > 0) {
    // Cap at the interview's question count: a stored array longer than the
    // canonical list (follow-up probes miscounted as questions) must not
    // inflate the score.
    return sumScore(evals.slice(0, totalQuestions)) / totalQuestions;
  }
  const questionScore = averageScore(evals);
  if (questionScore !== null) return questionScore;
  return averageScore(insights?.criteriaEvaluations);
}

export function usesQuestionEvaluationScore(
  insights: SessionScoreInsights,
): boolean {
  return averageScore(insights?.questionEvaluations) !== null;
}
