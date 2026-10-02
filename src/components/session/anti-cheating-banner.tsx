"use client";

import type { AntiCheatingViolation } from "@/hooks/use-anti-cheating";
import { useAntiCheating } from "@/hooks/use-anti-cheating";
import { useToast } from "@/hooks/use-toast";
import { bt, getLanguageKey, type LangKey } from "@/lib/i18n";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AntiCheatingGuardProps {
  enabled: boolean;
  sessionId?: string;
  language?: string;
}

function departureBody(lang: LangKey, count: number): string {
  if (lang === "zh") {
    return `你已离开面试页面 ${count} 次。所有离开都会被记录并可能被审查；过于频繁的离开可能影响你的面试评估。`;
  }
  if (lang === "id") {
    return `Kamu sudah ${count} kali meninggalkan halaman wawancara. Semua kejadian dicatat dan dapat ditinjau. Terlalu sering keluar halaman dapat mempengaruhi evaluasi sesimu.`;
  }
  return `You have left the interview page ${count} ${
    count === 1 ? "time" : "times"
  }. All departures are recorded and may be reviewed. Excessive departures could affect the evaluation of your session.`;
}

export function AntiCheatingGuard({ enabled, sessionId, language }: AntiCheatingGuardProps) {
  const lang = getLanguageKey(language);
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(false);
  const [departureCount, setDepartureCount] = useState(0);
  const lastDepartureTs = useRef(0);
  const lastPasteToast = useRef(0);

  const reportMutation = trpc.session.reportAntiCheatingViolation.useMutation();

  const persistViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      if (!sessionId) return;
      reportMutation.mutate({
        sessionId,
        violation: {
          type: violation.type,
          timestamp: violation.timestamp,
          detail: violation.detail,
        },
      });
    },
    [sessionId, reportMutation],
  );

  const recordDeparture = useCallback(() => {
    const now = Date.now();
    if (now - lastDepartureTs.current < 500) return;
    lastDepartureTs.current = now;
    setDepartureCount((prev) => prev + 1);
    setWarningOpen(true);
  }, []);

  const handleViolation = useCallback(
    (violation: AntiCheatingViolation) => {
      persistViolation(violation);

      switch (violation.type) {
        case "page_departure":
          recordDeparture();
          break;

        case "paste": {
          const now = Date.now();
          if (now - lastPasteToast.current < 3000) return;
          lastPasteToast.current = now;
          toast({
            title: bt(lang, {
              en: (<span className="text-red-600 dark:text-red-400">External paste blocked</span>) as unknown as string,
              zh: (<span className="text-red-600 dark:text-red-400">已阻止外部粘贴</span>) as unknown as string,
              id: (<span className="text-red-600 dark:text-red-400">Tempelan dari luar diblokir</span>) as unknown as string,
            }),
            description: bt(lang, {
              en: "Pasting content from outside the interview is not allowed.",
              zh: "面试期间不允许粘贴来自面试页面之外的内容。",
              id: "Menempel konten dari luar halaman wawancara tidak diizinkan.",
            }),
          });
          break;
        }

        case "multi_screen":
          toast({
            title: bt(lang, {
              en: (<span className="text-red-600 dark:text-red-400">Additional display detected</span>) as unknown as string,
              zh: (<span className="text-red-600 dark:text-red-400">检测到额外显示器</span>) as unknown as string,
              id: (<span className="text-red-600 dark:text-red-400">Layar tambahan terdeteksi</span>) as unknown as string,
            }),
            description: bt(lang, {
              en: "For the best experience, please use a single screen during this interview.",
              zh: "为获得最佳体验，请在面试期间只使用一个屏幕。",
              id: "Untuk pengalaman terbaik, gunakan satu layar saja selama wawancara ini.",
            }),
          });
          break;
      }
    },
    [toast, recordDeparture, persistViolation, lang],
  );

  useAntiCheating({ enabled, onViolation: handleViolation });

  if (!enabled || !warningOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-900 dark:bg-gray-900">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/50">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>

          <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {bt(lang, {
              en: "Page departure detected",
              zh: "检测到离开页面",
              id: "Kamu meninggalkan halaman wawancara",
            })}
          </h2>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {departureBody(lang, departureCount)}
          </p>

          {departureCount >= 3 && (
            <div className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
              {bt(lang, {
                en: "Warning: You have reached the maximum number of allowed departures. Further departures will be flagged for review.",
                zh: "警告：你已达到允许离开次数的上限。再次离开将被标记以供审查。",
                id: "Peringatan: kamu sudah mencapai batas maksimal keluar halaman. Jika mengulangi, kejadian akan ditandai untuk ditinjau.",
              })}
            </div>
          )}

          <button
            onClick={() => setWarningOpen(false)}
            className="mt-5 w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {bt(lang, {
              en: "I understand, continue interview",
              zh: "我明白了，继续面试",
              id: "Saya mengerti, lanjutkan wawancara",
            })}
          </button>
        </div>
      </div>
    </div>
  );
}
