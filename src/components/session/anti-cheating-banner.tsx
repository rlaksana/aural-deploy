"use client";

import type { AntiCheatingViolation } from "@/hooks/use-anti-cheating";
import { useAntiCheating } from "@/hooks/use-anti-cheating";
import { useProctoringCamera } from "@/hooks/use-proctoring-camera";
import { useToast } from "@/hooks/use-toast";
import { bt, getLanguageKey, type LangKey } from "@/lib/i18n";
import { trpc } from "@/lib/trpc/client";
import { AlertTriangle, Camera } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface AntiCheatingGuardProps {
  enabled: boolean;
  /** Proctoring mode: granular violations + consent-gated webcam snapshots. */
  proctoring?: boolean;
  sessionId?: string;
  sessionToken?: string | null;
  language?: string;
  /** Departure-type entries already persisted for this session, so a page reload does not reset the warning counter. */
  initialDepartureCount?: number;
}

/** Departure-type entries in a session's persisted anti-cheating log. */
export function countDepartures(log: unknown): number {
  if (!Array.isArray(log)) return 0;
  return log.filter(
    (v): v is { type: string } =>
      !!v &&
      typeof v === "object" &&
      ["page_departure", "tab_switch", "focus_lost"].includes(
        (v as { type?: string }).type ?? "",
      ),
  ).length;
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

export function AntiCheatingGuard({ enabled, proctoring = false, sessionId, sessionToken, language, initialDepartureCount }: AntiCheatingGuardProps) {
  const lang = getLanguageKey(language);
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(false);
  const [departureCount, setDepartureCount] = useState(initialDepartureCount ?? 0);
  const [cameraConsent, setCameraConsent] = useState<"pending" | "granted" | "denied">("pending");
  const lastDepartureTs = useRef(0);
  const lastPasteToast = useRef(0);

  const { setVideoEl, captureNow } = useProctoringCamera({
    enabled: enabled && proctoring && cameraConsent === "granted" && !!sessionId,
    sessionId: sessionId ?? "",
    sessionToken,
  });

  const reportMutation = trpc.session.reportAntiCheatingViolation.useMutation();

  const persistViolation = useCallback(
    async (violation: AntiCheatingViolation) => {
      if (!sessionId) return;
      // Proctoring: grab the webcam frame at the violation moment; a failed
      // capture never blocks the violation from being recorded.
      let snapshotPath: string | undefined;
      if (proctoring) {
        snapshotPath = (await captureNow().catch(() => null)) ?? undefined;
      }
      reportMutation.mutate({
        sessionId,
        sessionToken: sessionToken ?? undefined,
        violation: {
          type: violation.type,
          timestamp: violation.timestamp,
          detail: violation.detail,
          snapshotPath,
        },
      });
    },
    [sessionId, sessionToken, reportMutation, proctoring, captureNow],
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
        case "tab_switch":
        case "focus_lost":
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

  useAntiCheating({ enabled, proctoring, onViolation: handleViolation });

  if (!enabled) return null;

  // Proctoring consent gate: the camera opens strictly after an explicit
  // yes. Denying (or ignoring) disables snapshots but never blocks the
  // interview — the guard's other detections keep running either way.
  if (proctoring && cameraConsent === "pending") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950/50">
              <Camera className="h-7 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
              {bt(lang, {
                en: "Webcam proctoring",
                zh: "网络摄像头监考",
                id: "Proctoring webcam",
              })}
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {bt(lang, {
                en: "With your permission, the interviewer takes a webcam snapshot when suspicious activity (tab switching, copying) is detected. Snapshots are visible only to the recruiter. You may decline — the interview continues either way.",
                zh: "经你许可后，当检测到可疑行为（切换标签页、复制）时，系统会拍摄网络摄像头快照。快照仅招聘人员可见。你可以拒绝，面试仍会继续。",
                id: "Dengan izinmu, snapshot webcam diambil saat aktivitas mencurigakan (pindah tab, menyalin) terdeteksi. Snapshot hanya terlihat oleh rekruter. Kamu boleh menolak — wawancara tetap berjalan.",
              })}
            </p>
            <button
              onClick={() => setCameraConsent("granted")}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-700 dark:hover:bg-blue-600"
            >
              {bt(lang, {
                en: "Allow camera",
                zh: "允许摄像头",
                id: "Izinkan kamera",
              })}
            </button>
            <button
              onClick={() => setCameraConsent("denied")}
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {bt(lang, {
                en: "Continue without camera",
                zh: "不使用摄像头继续",
                id: "Lanjut tanpa kamera",
              })}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {proctoring && cameraConsent === "granted" && (
        <video ref={setVideoEl} muted playsInline className="hidden" />
      )}
      {warningOpen && (
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
      )}
    </>
  );
}
