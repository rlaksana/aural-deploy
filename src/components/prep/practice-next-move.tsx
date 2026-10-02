"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { bt, getLanguageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
    ArrowRight,
    BookOpenText,
    Bookmark,
    BookmarkCheck,
    ExternalLink,
    FilePlus2,
    Flag,
    RotateCcw,
    Sparkles,
    X,
} from "lucide-react";
import type { PrepFeedback } from "./prep-types";

export type PracticeNextAction =
  | "retry"
  | "sample"
  | "next"
  | "answer_bank"
  | "real_interview"
  | "resume_proof"
  | "finish";

export type NextMoveRecommendation = {
  action: PracticeNextAction;
  label: string;
  reason: string;
};

/** Pick the single best next move after a graded answer. */
export function recommendNextMove({
  score,
  canNext,
  hasSample,
  language,
}: {
  score: number;
  canNext: boolean;
  hasSample: boolean;
  language?: string;
}): NextMoveRecommendation {
  const lang = getLanguageKey(language);
  const t = (text: { en: string; id: string }) =>
    bt(lang, { zh: text.en, ...text });
  if (score <= 7 && hasSample) {
    return {
      action: "sample",
      label: t({ en: "Study the sample answer", id: "Pelajari contoh jawaban" }),
      reason: t(
        score <= 5
          ? {
              en: "Low score — study a strong sample, then revise your answer below.",
              id: "Skor rendah — pelajari contoh yang kuat, lalu perbaiki jawabanmu di bawah.",
            }
          : {
              en: "Almost there — compare with a strong sample to sharpen it.",
              id: "Hampir sampai — bandingkan dengan contoh yang kuat untuk mempertajamnya.",
            },
      ),
    };
  }
  if (score >= 8) {
    return {
      action: "real_interview",
      label: t({
        en: "Practice in real interview",
        id: "Berlatih di wawancara nyata",
      }),
      reason: t({
        en: "Strong answer — rehearse it in the real interview setting.",
        id: "Jawaban bagus — latih di suasana wawancara nyata.",
      }),
    };
  }
  if (canNext) {
    return {
      action: "next",
      label: t({ en: "Next question", id: "Pertanyaan berikutnya" }),
      reason: t(
        score <= 7
          ? {
              en: "Apply the feedback below, then keep your momentum going.",
              id: "Terapkan umpan balik di bawah, pertahankan momentummu.",
            }
          : {
              en: "Strong answer — keep your momentum going.",
              id: "Jawaban bagus — pertahankan momentummu.",
            },
      ),
    };
  }
  return {
    action: "finish",
    label: t({ en: "Finish & view report", id: "Selesai & lihat laporan" }),
    reason: t({
      en: "Last question done — wrap up and review your session report.",
      id: "Pertanyaan terakhir selesai — tutup dan tinjau laporan sesimu.",
    }),
  };
}

const ACTION_META: Record<
  PracticeNextAction,
  { label: { en: string; id: string }; icon: typeof RotateCcw }
> = {
  retry: {
    label: { en: "Retry this answer", id: "Ulangi jawaban ini" },
    icon: RotateCcw,
  },
  sample: {
    label: { en: "View sample answer", id: "Lihat contoh jawaban" },
    icon: BookOpenText,
  },
  next: { label: { en: "Move next", id: "Lanjut" }, icon: ArrowRight },
  answer_bank: {
    label: { en: "Save to answer bank", id: "Simpan ke bank jawaban" },
    icon: Bookmark,
  },
  real_interview: {
    label: { en: "Practice in real interview", id: "Berlatih di wawancara nyata" },
    icon: ExternalLink,
  },
  resume_proof: {
    label: { en: "Add resume proof", id: "Tambah bukti dari CV" },
    icon: FilePlus2,
  },
  finish: { label: { en: "Finish practice", id: "Akhiri latihan" }, icon: Flag },
};

function actionMetaLabel(
  meta: { label: { en: string; id: string } },
  language?: string,
): string {
  const lang = getLanguageKey(language);
  return bt(lang, { zh: meta.label.en, ...meta.label });
}

/** Inline action row under the latest feedback card. */
export function NextActionStrip({
  feedback,
  canNext,
  disabled = false,
  attemptId,
  bookmarked = false,
  onAction,
  language,
}: {
  feedback: PrepFeedback;
  canNext: boolean;
  disabled?: boolean;
  attemptId?: string | null;
  bookmarked?: boolean;
  onAction: (action: PracticeNextAction) => void;
  language?: string;
}) {
  const actions: PracticeNextAction[] = [
    "retry",
    ...(feedback.sampleAnswer?.trim() ? (["sample"] as const) : []),
    "real_interview",
    ...(canNext ? (["next"] as const) : []),
    ...(attemptId ? (["answer_bank"] as const) : []),
  ];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {actions.map((action) => {
        const meta = ACTION_META[action];
        const { icon: Icon } = meta;
        const isBookmarked = action === "answer_bank" && bookmarked;
        const actionLabel = isBookmarked
          ? "Remove from answer bank"
          : actionMetaLabel(meta, language);
        const ActionIcon = isBookmarked ? BookmarkCheck : Icon;
        return (
          <Button
            key={action}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className={cn(
              "h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal",
              isBookmarked && "border-amber-200/80 text-amber-600 hover:text-amber-700",
            )}
            onClick={() => onAction(action)}
          >
            <ActionIcon className="h-3 w-3" aria-hidden />
            {actionLabel}
          </Button>
        );
      })}
    </div>
  );
}

/** Thin "Next best move" nudge shown above the composer after coach feedback. */
export function NextBestMoveBar({
  feedback,
  canNext,
  disabled = false,
  onAction,
  onDismiss,
  className,
  language,
}: {
  feedback: PrepFeedback;
  canNext: boolean;
  disabled?: boolean;
  onAction: (action: PracticeNextAction) => void;
  onDismiss: () => void;
  className?: string;
  language?: string;
}) {
  const lang = getLanguageKey(language);
  const t = (text: { en: string; id: string }) =>
    bt(lang, { zh: text.en, ...text });
  const hasSample = Boolean(feedback.sampleAnswer?.trim());
  const recommendation = recommendNextMove({
    score: feedback.score,
    canNext,
    hasSample,
    language,
  });
  const PrimaryIcon = ACTION_META[recommendation.action].icon;

  return (
    <div
      className={cn(
        "mb-2 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.06] py-1.5 pl-3 pr-2 shadow-sm backdrop-blur-sm",
        className,
      )}
      data-testid="next-best-move"
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-xs leading-tight">
        <span className="font-semibold text-foreground">
          {t({ en: "Next best move", id: "Langkah terbaik berikutnya" })}
        </span>
        <span className="text-muted-foreground">
          {" — "}
          {recommendation.reason}
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
        onClick={() => onAction(recommendation.action)}
      >
        <PrimaryIcon className="h-3.5 w-3.5" aria-hidden />
        {recommendation.label}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        aria-label={t({
          en: "Dismiss next best move",
          id: "Tutup langkah terbaik berikutnya",
        })}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Modal with the coach's sample answer for the current question. */
export function SampleAnswerDialog({
  open,
  onOpenChange,
  sampleAnswer,
  questionText,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleAnswer: string;
  questionText?: string | null;
  language?: string;
}) {
  const lang = getLanguageKey(language);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4 text-primary" aria-hidden />
            {bt(lang, {
              zh: "Sample answer",
              en: "Sample answer",
              id: "Contoh jawaban",
            })}
          </DialogTitle>
          {questionText ? (
            <DialogDescription className="line-clamp-2">
              {questionText}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-3">
            {sampleAnswer
              .split(/\n\n+/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p
                  key={index}
                  className="text-sm leading-relaxed text-foreground/90"
                >
                  {paragraph}
                </p>
              ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
