"use client";

import type { PrepContextInitial } from "@/components/prep/prep-context-types";
import { PrepJdResumePanel } from "@/components/prep/prep-jd-resume-panel";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc/client";
import { bt, getLanguageKey } from "@/lib/i18n";
import { SlidersHorizontal } from "lucide-react";

type Props = {
  interviewId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackInitial: PrepContextInitial;
  onContextSaved?: () => void;
  language?: string;
};

export function PrepContextDrawer({
  interviewId,
  open,
  onOpenChange,
  fallbackInitial,
  onContextSaved,
  language,
}: Props) {
  const utils = trpc.useUtils();
  const lang = getLanguageKey(language);
  const t = (text: { en: string; id: string }) =>
    bt(lang, { zh: text.en, ...text });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-y-auto code-scrollbar sm:max-w-2xl lg:max-w-4xl"
      >
        <SheetHeader className="pr-8">
          <SheetTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-primary" />
            {t({ en: "Practice context", id: "Konteks latihan" })}
          </SheetTitle>
          <SheetDescription>
            {t({
              en: "Job description and resume context are reused by hints, feedback, ratings, and suggested answers.",
              id: "Deskripsi pekerjaan dan konteks CV dipakai ulang oleh petunjuk, umpan balik, penilaian, dan jawaban yang disarankan.",
            })}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex-1">
          {open ? (
            <PrepJdResumePanel
              interviewId={interviewId}
              language={language}
              initial={fallbackInitial}
              onSaved={async () => {
                await Promise.all([
                  utils.prep.getBundle.invalidate({ interviewId }),
                  utils.interview.getById.invalidate({ id: interviewId }),
                ]);
                onContextSaved?.();
                onOpenChange(false);
              }}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
