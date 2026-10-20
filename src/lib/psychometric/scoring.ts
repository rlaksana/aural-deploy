import type { PsychometricBank } from "./banks";
import { parseChoiceSelection } from "@/lib/deterministic-flow";

/**
 * Deterministic psychometric scoring. Pure — no DB, no LLM. Takes the bank
 * and one selection per item (positional, null = unanswered), returns
 * dimension percentages (0-100), rule-based bands, and insight-shaped
 * evaluations so report tables, share links, and XLSX need zero changes.
 *
 * Bands are screening heuristics, not clinical norms.
 */

export type PsychometricResult = {
  /** dimension key -> 0-100 */
  dimensionScores: Record<string, number>;
  /** dimension key -> band label (rule-based) */
  bands: Record<string, string>;
  /** 0-10 scale for the existing criteria report columns */
  criteriaEvaluations: { name: string; score: number; reasoning: string }[];
  /** per-item 0-10 for the existing question columns */
  questionEvaluations: { question: string; score: number; evaluation: string }[];
  summary: string;
};

/** Rule-based band lookup. Keyed tests and personality use different cuts. */
export function bandFor(keyed: boolean, pct: number): string {
  if (keyed) {
    return pct >= 75 ? "Strong" : pct >= 50 ? "Average" : "Below average";
  }
  return pct >= 65 ? "High" : pct >= 35 ? "Moderate" : "Low";
}

/**
 * Aligns USER messages to bank items positionally: questions were generated
 * from the bank in order, so answer i feeds item i. Matched by questionId;
 * missing or unparsable answers come back null (unanswered → scores 0).
 */
export function selectionsFromAnswers(
  questions: { id: string }[],
  answers: { questionId: string | null; content: string }[],
): (number[] | null)[] {
  const contentByQuestionId = new Map(
    answers.map((a) => [a.questionId, a.content]),
  );
  return questions.map((q) => {
    const content = contentByQuestionId.get(q.id);
    if (!content) return null;
    const sel = parseChoiceSelection(content);
    return sel.length > 0 ? sel : null;
  });
}

/**
 * @param selections one index array per bank item, positional; null or
 *        empty = unanswered (scores 0, never breaks the dimension).
 */
export function scorePsychometric(
  bank: PsychometricBank,
  selections: (number[] | null | undefined)[],
): PsychometricResult {
  const dimStats = new Map<string, { sum: number; answered: number; total: number }>();
  for (const dim of bank.dimensions) {
    dimStats.set(dim.key, { sum: 0, answered: 0, total: 0 });
  }

  const questionEvaluations: PsychometricResult["questionEvaluations"] = [];

  bank.items.forEach((item, i) => {
    const stats = dimStats.get(item.dimension);
    const raw = selections[i];
    const index = raw && raw.length > 0 ? raw[0] : null;

    let score10: number;
    if (index === null || !Number.isInteger(index) || index < 0 || index >= item.options.length) {
      score10 = 0;
      questionEvaluations.push({
        question: item.text,
        score: 0,
        evaluation: "Not answered",
      });
    } else if (bank.keyed) {
      const correct = item.correctIndex === index;
      score10 = correct ? 10 : 0;
      questionEvaluations.push({
        question: item.text,
        score: score10,
        evaluation: correct ? "Correct" : `Incorrect (answer: ${item.options[item.correctIndex ?? -1] ?? "?"})`,
      });
    } else {
      // Likert agreement: selected index 0-4 -> 1-5, inverted for reverse items.
      const likert = item.reverse ? 5 - index : index + 1;
      score10 = (likert / 5) * 10;
      questionEvaluations.push({
        question: item.text,
        score: Math.round(score10 * 10) / 10,
        evaluation: `Answered: ${item.options[index]}`,
      });
    }

    if (stats) {
      stats.total++;
      if (index !== null) {
        stats.sum += score10;
        stats.answered++;
      }
    }
  });

  const dimensionScores: Record<string, number> = {};
  const bands: Record<string, string> = {};
  const criteriaEvaluations: PsychometricResult["criteriaEvaluations"] = [];
  const dimLabel = new Map(bank.dimensions.map((d) => [d.key, d.label]));

  for (const dim of bank.dimensions) {
    const stats = dimStats.get(dim.key)!;
    const pct = stats.total > 0 ? (stats.sum / stats.total) * 10 : 0;
    const rounded = Math.round(pct * 10) / 10;
    dimensionScores[dim.key] = rounded;
    bands[dim.key] = bandFor(bank.keyed, rounded);
    criteriaEvaluations.push({
      name: dimLabel.get(dim.key) ?? dim.key,
      score: Math.round(rounded) / 10,
      reasoning: `${stats.answered}/${stats.total} items scored · band: ${bands[dim.key]} (rule-based, not clinical norms)`,
    });
  }

  const summaryLines = bank.dimensions.map(
    (d) => `- ${d.label}: ${dimensionScores[d.key]}/100 (${bands[d.key]})`,
  );
  const summary = [
    `Automated ${bank.name} result. Rule-based interpretation for screening — not a clinical assessment.`,
    ...summaryLines,
  ].join("\n");

  return { dimensionScores, bands, criteriaEvaluations, questionEvaluations, summary };
}
