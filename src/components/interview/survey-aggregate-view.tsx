import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SurveyAggregate } from "@/lib/interview-report";
import { CircleDot } from "lucide-react";

/**
 * Cross-respondent aggregate for surveys/quizzes/forms: per-question tallies
 * as plain CSS bars, numeric averages, open-answer lists, quiz correct rates.
 * No chart dependency — server-renderable.
 */
export function SurveyAggregateView({
  aggregate,
  aiAnalysis,
}: {
  aggregate: SurveyAggregate;
  aiAnalysis?: { text: string; generatedAt: string } | null;
}) {
  if (aggregate.questions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CircleDot className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">
          Results
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {aggregate.respondentCount}{" "}
            {aggregate.respondentCount === 1 ? "respondent" : "respondents"}
          </span>
        </h2>
      </div>

      {aiAnalysis && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">AI Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{aiAnalysis.text}</p>
          </CardContent>
        </Card>
      )}

      {aggregate.questions.map((question, qi) => (
        <Card key={question.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {qi + 1}. {question.text}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {question.average !== undefined && (
              <p className="text-sm text-muted-foreground">
                Average: <span className="font-semibold text-foreground">{question.average}</span>
              </p>
            )}
            {question.tally?.map(({ option, count }) => {
              const total = question.tally!.reduce((sum, t) => sum + t.count, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={option} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 truncate" title={option}>
                    {option}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                    {count} ({pct}%)
                  </span>
                </div>
              );
            })}
            {question.correctRate && (
              <p className="text-sm text-muted-foreground">
                Correct:{" "}
                <span className="font-semibold text-foreground">
                  {question.correctRate.correct}/{question.correctRate.total}
                </span>
              </p>
            )}
            {question.textAnswers?.map((answer, ai) => (
              <div key={ai} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                {answer.name && (
                  <p className="mb-0.5 text-xs font-medium text-muted-foreground">{answer.name}</p>
                )}
                <p className="whitespace-pre-wrap leading-snug">{answer.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
