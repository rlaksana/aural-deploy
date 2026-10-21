import { generateChatWithFallback } from "@/lib/ai/generator-run";
import { REPORT_MODEL } from "@/lib/ai/registry";
import { getPromptLanguageName } from "@/lib/ai/language-name";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildSurveyAggregate,
  fetchReportEntries,
  type SurveyAggregate,
} from "@/lib/interview-report";

/**
 * Cross-respondent AI analysis for non-interview kinds. One LLM call per
 * generation; the caller caches the result (interviews.aiAnalysis jsonb).
 */

const MAX_TEXT_CHARS_PER_QUESTION = 2000;

type InterviewKindRow = {
  title: string;
  kind?: string;
  questions?: { id: string; text: string; type: string; options: { correctIndices?: number[] } | null }[];
};

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

/**
 * Full pipeline shared by the tRPC procedure and the deferred-job executor:
 * aggregate → one LLM call → cache into interviews.aiAnalysis.
 */
export async function generateAndCacheSurveyAnalysis(
  interviewId: string,
): Promise<{ aiAnalysis: { text: string; generatedAt: string } }> {
  const { data: interviewRow } = await supabaseAdmin
    .from("interviews")
    .select("title, kind, language, questions(id, text, type, options)")
    .eq("id", interviewId)
    .order("order", { referencedTable: "questions", ascending: true })
    .single();

  const row = interviewRow as unknown as
    | (InterviewKindRow & { language?: string })
    | null;
  const kind = row?.kind ?? "INTERVIEW";
  if (kind === "INTERVIEW") {
    throw new Error("AI analysis is only available for survey/quiz/form kinds");
  }

  const entries = await fetchReportEntries(supabaseAdmin, interviewId);
  const aggregate = buildSurveyAggregate(entries, row?.questions ?? []);

  const text = await generateSurveyAnalysis(
    row?.title ?? "Untitled",
    kind,
    aggregate,
    row?.language,
  );

  const aiAnalysis = { text, generatedAt: new Date().toISOString() };
  await supabaseAdmin
    .from("interviews")
    .update({ aiAnalysis })
    .eq("id", interviewId);

  return { aiAnalysis };
}
