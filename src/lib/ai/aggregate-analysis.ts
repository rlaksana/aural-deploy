import { generateChatWithFallback } from "@/lib/ai/generator-run";
import { REPORT_MODEL } from "@/lib/ai/registry";
import { getPromptLanguageName } from "@/lib/ai/language-name";
import type { SurveyAggregate } from "@/lib/interview-report";

/**
 * Cross-respondent AI analysis for non-interview kinds. One LLM call per
 * generation; the caller caches the result (interviews.aiAnalysis jsonb).
 */

const MAX_TEXT_CHARS_PER_QUESTION = 2000;

function renderAggregate(aggregate: SurveyAggregate): string {
  const lines: string[] = [`Respondents: ${aggregate.respondentCount}`, ""];

  for (const question of aggregate.questions) {
    lines.push(`Q: ${question.text} [${question.type}]`);
    if (question.tally) {
      for (const { option, count } of question.tally) {
        lines.push(`  - "${option}": ${count}`);
      }
      if (question.average !== undefined) {
        lines.push(`  Average (numeric labels): ${question.average}`);
      }
    }
    if (question.correctRate) {
      lines.push(
        `  Correct: ${question.correctRate.correct}/${question.correctRate.total}`,
      );
    }
    if (question.textAnswers?.length) {
      let budget = MAX_TEXT_CHARS_PER_QUESTION;
      lines.push("  Answers:");
      for (const answer of question.textAnswers) {
        if (budget <= 0) {
          lines.push(`  …(${question.textAnswers.length} answers total, truncated)`);
          break;
        }
        const text = answer.content.slice(0, budget);
        budget -= text.length;
        lines.push(`  - ${text}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function generateSurveyAnalysis(
  interviewTitle: string,
  kind: string,
  aggregate: SurveyAggregate,
  language?: string | null,
): Promise<string> {
  const languageName = getPromptLanguageName(language ?? undefined);
  const languageInstruction = languageName
    ? ` Write the entire analysis in ${languageName}.`
    : "";

  const response = await generateChatWithFallback({
    messages: [
      {
        role: "system",
        content:
          `You are an expert survey and assessment analyst. Analyze the aggregated results of a ${kind.toLowerCase()} titled "${interviewTitle}". ` +
          "Identify the most important findings: standout agreement or disagreement, notable patterns in the numeric ratings, recurring topics in open answers, outliers, and — for quizzes — concepts respondents struggled with. " +
          "Be concrete and reference the numbers. Keep it under 400 words, structured with short markdown paragraphs or bullet lists." +
          languageInstruction,
      },
      {
        role: "user",
        content: `Aggregated results:\n\n${renderAggregate(aggregate)}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 2048,
    model: REPORT_MODEL,
  });

  return response.content.trim();
}
