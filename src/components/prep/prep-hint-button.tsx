"use client";

import { AiButton } from "@/components/ui/ai-button";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { bt, getLanguageKey } from "@/lib/i18n";
import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { readPrepStream } from "./prep-stream";

type Props = {
  interviewId: string;
  questionId: string;
  disabledReason?: string;
  language?: string;
};

export function PrepHintButton({
  interviewId,
  questionId,
  disabledReason,
  language,
}: Props) {
  const { toast } = useToast();
  const lang = getLanguageKey(language);
  const t = (text: { en: string; id: string }) =>
    bt(lang, { zh: text.en, ...text });
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchHint = async () => {
    if (loading) return;
    setLoading(true);
    setHint("");
    try {
      const res = await fetch("/api/prep/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, questionId }),
      });
      await readPrepStream<Record<string, unknown>>(res, (token) => {
        setHint((prev) => prev + token);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Hint failed";
      toast({
        title: t({ en: "Hint failed", id: "Gagal membuat jawaban" }),
        description: message,
        variant: "destructive",
      });
      setHint("");
    } finally {
      setLoading(false);
    }
  };

  if (!hint && !loading) {
    return (
      <AiButton
        wrapperClassName="w-fit"
        size="sm"
        className="gap-2"
        loading={false}
        disabled={!!disabledReason}
        onClick={fetchHint}
        title={disabledReason}
      >
        <Lightbulb className="h-4 w-4" />
        {t({ en: "Show suggested answer", id: "Tampilkan jawaban yang disarankan" })}
      </AiButton>
    );
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
          <Lightbulb className="h-4 w-4" />
          {t({ en: "Suggested answer", id: "Jawaban yang disarankan" })}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            setHint("");
          }}
          aria-label={t({
            en: "Hide suggested answer",
            id: "Sembunyikan jawaban yang disarankan",
          })}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900/90 dark:text-amber-100/80">
        {hint || t({ en: "Generating...", id: "Sedang membuat..." })}
      </p>
    </div>
  );
}
