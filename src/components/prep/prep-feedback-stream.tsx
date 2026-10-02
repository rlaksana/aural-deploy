"use client";

import { Button } from "@/components/ui/button";
import { useMinimaxTts } from "@/hooks/use-minimax-tts";
import { bt, getLanguageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CheckCircle2, Volume2 } from "lucide-react";
import type { PrepFeedback } from "./prep-types";
import { scoreTone } from "./prep-types";

type Props = {
  feedback: PrepFeedback | null;
  /** Streaming raw text (the model is still typing). */
  streaming?: string;
  isLoading?: boolean;
  language?: string;
};

export function PrepFeedbackStream({
  feedback,
  streaming,
  isLoading,
  language,
}: Props) {
  const tts = useMinimaxTts(language);
  const lang = getLanguageKey(language);
  const t = (text: { en: string; id: string }) =>
    bt(lang, { zh: text.en, ...text });

  if (isLoading && !feedback) {
    return (
      <div className="rounded-md border bg-background p-5">
        <p className="text-sm text-muted-foreground">
          {t({ en: "Generating feedback...", id: "Menyusun umpan balik..." })}
        </p>
        {streaming ? (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {streaming}
          </pre>
        ) : null}
      </div>
    );
  }

  if (!feedback) return null;

  const speak = () => {
    void tts.speak(
      `${feedback.verdict}. Score ${feedback.score} out of 10. ${feedback.summary} ${feedback.improvements
        .slice(0, 2)
        .join(". ")}`,
    );
  };

  return (
    <div className="rounded-md border bg-background p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className={cn("h-5 w-5", scoreTone(feedback.score))} />
            <h3 className="text-lg font-semibold">{feedback.verdict}</h3>
            <span className={cn("text-lg font-bold", scoreTone(feedback.score))}>
              {feedback.score}/10
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{feedback.summary}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={speak}
          aria-label={t({ en: "Read feedback", id: "Bacakan umpan balik" })}
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FeedbackList
          title={t({ en: "What worked", id: "Yang berhasil" })}
          items={feedback.strengths}
          t={t}
        />
        <FeedbackList
          title={t({ en: "Improve next", id: "Perbaiki selanjutnya" })}
          items={feedback.improvements}
          t={t}
        />
        <FeedbackList
          title={t({ en: "Missing signals", id: "Sinyal yang hilang" })}
          items={feedback.missingSignals}
          t={t}
        />
        <FeedbackList
          title={t({ en: "Resume leverage", id: "Manfaatkan dari CV" })}
          items={feedback.resumeLeverage}
          t={t}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md bg-muted/40 p-4">
          <p className="text-sm font-medium">{t({ en: "Structure", id: "Struktur" })}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {feedback.structureSuggestion}
          </p>
          {feedback.followUpQuestion ? (
            <>
              <p className="mt-4 text-sm font-medium">
                {t({ en: "Likely follow-up", id: "Kemungkinan tindak lanjut" })}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {feedback.followUpQuestion}
              </p>
            </>
          ) : null}
        </div>
        <div className="rounded-md bg-muted/40 p-4">
          <p className="text-sm font-medium">
            {t({ en: "Sample answer", id: "Contoh jawaban" })}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
            {feedback.sampleAnswer ||
              t({ en: "Sample answer not generated yet.", id: "Contoh jawaban belum dibuat." })}
          </p>
          {feedback.needsUserVerification.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">
                {t({ en: "Verify before using", id: "Verifikasi sebelum dipakai" })}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {feedback.needsUserVerification.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FeedbackList({
  title,
  items,
  t,
}: {
  title: string;
  items: string[];
  t: (text: { en: string; id: string }) => string;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-4">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {t({ en: "No items.", id: "Belum ada poin." })}
        </p>
      )}
    </div>
  );
}
