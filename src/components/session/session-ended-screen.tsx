"use client";

import { Card, CardContent } from "@/components/ui/card";
import { bt, getLanguageKey, type BiText } from "@/lib/i18n";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";

export type SessionEndReason =
  | "COMPLETED"
  | "INTERVIEW_TIME_LIMIT_REACHED"
  | "ACCOUNT_SESSION_TIME_LIMIT_REACHED";

export type SessionEndReasonInput =
  | SessionEndReason
  | "TIME_LIMIT_EXCEEDED"
  | undefined
  | null;

export function normalizeSessionEndReason(
  reason?: SessionEndReasonInput,
): SessionEndReason {
  if (reason === "INTERVIEW_TIME_LIMIT_REACHED") {
    return "INTERVIEW_TIME_LIMIT_REACHED";
  }
  if (
    reason === "ACCOUNT_SESSION_TIME_LIMIT_REACHED" ||
    reason === "TIME_LIMIT_EXCEEDED"
  ) {
    return "ACCOUNT_SESSION_TIME_LIMIT_REACHED";
  }
  return "COMPLETED";
}

const endReasonCopy: Record<
  SessionEndReason,
  {
    description: BiText;
    icon: typeof CheckCircle2;
    iconClassName: string;
    title: BiText;
  }
> = {
  COMPLETED: {
    icon: CheckCircle2,
    iconClassName: "text-secondary-500",
    title: { en: "Thank you!", zh: "谢谢！", id: "Terima kasih!" },
    description: {
      en: "Your interview has been completed successfully. We appreciate your time and thoughtful responses.",
      zh: "你的面试已顺利完成。感谢你的时间与认真的回答。",
      id: "Wawancaramu telah selesai dengan baik. Terima kasih atas waktu dan jawabanmu.",
    },
  },
  INTERVIEW_TIME_LIMIT_REACHED: {
    icon: Clock3,
    iconClassName: "text-amber-600",
    title: {
      en: "Interview time limit reached",
      zh: "已达面试时限",
      id: "Batas waktu wawancara tercapai",
    },
    description: {
      en: "This interview reached its configured time limit and was submitted automatically. Thank you for your time and responses.",
      zh: "本场面试已达到设定的时限，答案已自动提交。感谢你的时间与回答。",
      id: "Wawancara ini telah mencapai batas waktu yang ditentukan dan jawabanmu dikirim otomatis. Terima kasih atas waktu dan jawabanmu.",
    },
  },
  ACCOUNT_SESSION_TIME_LIMIT_REACHED: {
    icon: AlertTriangle,
    iconClassName: "text-amber-600",
    title: {
      en: "Session time limit reached",
      zh: "已达会话时长上限",
      id: "Batas waktu sesi tercapai",
    },
    description: {
      en: "This interview ended because the organization's available session time was used up. Your responses were saved, but please contact the interviewer if you need to continue.",
      zh: "由于组织的可用会话时长已用完，本次面试已结束。你的回答已保存，如需继续请联系面试官。",
      id: "Wawancara ini berakhir karena kuota durasi sesi organisasi sudah habis. Jawabanmu sudah tersimpan; hubungi pewawancara jika kamu perlu melanjutkan.",
    },
  },
};

export function SessionEndedScreen({
  reason,
  language,
}: {
  reason?: SessionEndReasonInput;
  language?: string;
}) {
  const lang = getLanguageKey(language);
  const normalizedReason = normalizeSessionEndReason(reason);
  const copy = endReasonCopy[normalizedReason];
  const Icon = copy.icon;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="py-12 text-center">
          <Icon className={`mx-auto h-16 w-16 ${copy.iconClassName}`} />
          <h2 className="mt-4 text-2xl font-bold">{bt(lang, copy.title)}</h2>
          <p className="mt-2 text-muted-foreground">
            {bt(lang, copy.description)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
