"use client";

import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { bt, getLanguageKey, type LangKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Gauge, MicOff, Timer, Waves } from "lucide-react";
import type { PrepVoiceDeliveryFeedback, PrepVoiceTimelineSegment } from "./prep-types";

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function segmentState(
  segment: PrepVoiceTimelineSegment,
): "pause" | "filler" | "dip" | "ok" {
  if (segment.pause) return "pause";
  if (segment.fillers >= 2) return "filler";
  if (segment.lowConfidence) return "dip";
  return "ok";
}

const STATE_STYLES: Record<ReturnType<typeof segmentState>, string> = {
  ok: "bg-emerald-500/80 dark:bg-emerald-400/70",
  dip: "bg-amber-500/85 dark:bg-amber-400/75",
  filler: "bg-violet-500/85 dark:bg-violet-400/75",
  pause: "bg-muted-foreground/25",
};

const STATE_LABELS: Record<
  ReturnType<typeof segmentState>,
  { zh: string; en: string; id: string }
> = {
  ok: { zh: "Steady delivery", en: "Steady delivery", id: "Penyampaian stabil" },
  dip: { zh: "Energy dip", en: "Energy dip", id: "Penurunan energi" },
  filler: { zh: "Filler-heavy", en: "Filler-heavy", id: "Banyak kata pengisi" },
  pause: { zh: "Pause", en: "Pause", id: "Jeda" },
};

function SegmentBar({
  segment,
  lang,
}: {
  segment: PrepVoiceTimelineSegment;
  lang: LangKey;
}) {
  const state = segmentState(segment);
  const height = segment.pause
    ? 18
    : Math.round(30 + Math.min(1, Math.max(0.12, segment.energy)) * 70);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="group flex h-full min-w-0 flex-1 cursor-default items-end px-px"
          role="img"
          aria-label={`${formatClock(segment.startSec)}–${formatClock(segment.endSec)}: ${bt(lang, STATE_LABELS[state])}`}
        >
          <div
            className={cn(
              "w-full rounded-sm transition-all group-hover:opacity-100",
              STATE_STYLES[state],
              state === "ok" ? "opacity-80" : "opacity-95",
            )}
            style={{ height: `${height}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        <p className="font-medium">
          {formatClock(segment.startSec)}–{formatClock(segment.endSec)} ·{" "}
          {bt(lang, STATE_LABELS[state])}
        </p>
        <ul className="mt-1 space-y-0.5 text-[11px] opacity-90">
          {segment.pause ? (
            <li>{bt(lang, { zh: "Mostly silence", en: "Mostly silence", id: "Hampir hening" })}</li>
          ) : (
            <>
              {segment.wpm != null ? (
                <li>
                  {bt(lang, {
                    zh: `Pace ~${segment.wpm} wpm`,
                    en: `Pace ~${segment.wpm} wpm`,
                    id: `Tempo ±${segment.wpm} kpm`,
                  })}
                </li>
              ) : null}
              <li>
                {bt(lang, {
                  zh: `Energy ${(segment.energy * 100).toFixed(0)}%`,
                  en: `Energy ${(segment.energy * 100).toFixed(0)}%`,
                  id: `Energi ${(segment.energy * 100).toFixed(0)}%`,
                })}
              </li>
              {segment.fillers > 0 ? (
                <li>
                  {bt(lang, {
                    zh:
                      segment.fillers === 1
                        ? `${segment.fillers} filler word`
                        : `${segment.fillers} filler words`,
                    en:
                      segment.fillers === 1
                        ? `${segment.fillers} filler word`
                        : `${segment.fillers} filler words`,
                    id: `${segment.fillers} kata pengisi`,
                  })}
                </li>
              ) : null}
              {segment.lowConfidence ? (
                <li>
                  {bt(lang, {
                    zh: "Quieter than the rest",
                    en: "Quieter than the rest",
                    id: "Lebih pelan dari sisanya",
                  })}
                </li>
              ) : null}
            </>
          )}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-sm", className)} />
      {label}
    </span>
  );
}

/**
 * Delivery timeline for one recorded answer: per-segment pace + energy with
 * pauses, confidence dips, and filler-heavy stretches called out.
 */
export function VoiceDeliveryTimeline({
  delivery,
  durationSeconds,
  compact = false,
  className,
  language,
}: {
  delivery: PrepVoiceDeliveryFeedback;
  durationSeconds?: number | null;
  compact?: boolean;
  className?: string;
  language?: string;
}) {
  const lang = getLanguageKey(language);
  const timeline = delivery.timeline ?? [];
  if (timeline.length === 0) return null;

  const totalSec =
    durationSeconds ?? timeline[timeline.length - 1]?.endSec ?? 0;
  const paces = timeline
    .map((segment) => segment.wpm)
    .filter((wpm): wpm is number => wpm != null && wpm > 0);
  const avgPace =
    paces.length > 0
      ? Math.round(paces.reduce((sum, wpm) => sum + wpm, 0) / paces.length)
      : null;

  const stats = [
    avgPace != null
      ? {
          icon: Gauge,
          label: bt(lang, {
            zh: `~${avgPace} wpm avg`,
            en: `~${avgPace} wpm avg`,
            id: `rata-rata ±${avgPace} kpm`,
          }),
        }
      : null,
    {
      icon: Timer,
      label: bt(lang, {
        zh: `${delivery.pauseCount ?? 0} pause${
          (delivery.pauseCount ?? 0) === 1 ? "" : "s"
        }${
          delivery.longestPauseSec && delivery.longestPauseSec > 0
            ? ` · longest ${delivery.longestPauseSec.toFixed(1)}s`
            : ""
        }`,
        en: `${delivery.pauseCount ?? 0} pause${
          (delivery.pauseCount ?? 0) === 1 ? "" : "s"
        }${
          delivery.longestPauseSec && delivery.longestPauseSec > 0
            ? ` · longest ${delivery.longestPauseSec.toFixed(1)}s`
            : ""
        }`,
        id: `${delivery.pauseCount ?? 0} jeda${
          delivery.longestPauseSec && delivery.longestPauseSec > 0
            ? ` · terpanjang ${delivery.longestPauseSec.toFixed(1)} dtk`
            : ""
        }`,
      }),
    },
    {
      icon: MicOff,
      label: bt(lang, {
        zh: `${delivery.fillerCount ?? 0} filler word${
          (delivery.fillerCount ?? 0) === 1 ? "" : "s"
        }`,
        en: `${delivery.fillerCount ?? 0} filler word${
          (delivery.fillerCount ?? 0) === 1 ? "" : "s"
        }`,
        id: `${delivery.fillerCount ?? 0} kata pengisi`,
      }),
    },
  ].filter(Boolean) as Array<{ icon: typeof Gauge; label: string }>;

  return (
    <div className={cn("space-y-2", className)}>
      {!compact ? (
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Waves className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          {bt(lang, {
            zh: "Delivery timeline",
            en: "Delivery timeline",
            id: "Garis waktu penyampaian",
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {stats.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          >
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </span>
        ))}
      </div>
      <div
        className={cn(
          "flex items-end rounded-md border bg-muted/30 px-1 pb-1 pt-2",
          compact ? "h-12" : "h-16",
        )}
      >
        {timeline.map((segment, index) => (
          <SegmentBar key={index} segment={segment} lang={lang} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tabular-nums text-muted-foreground">0:00</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LegendDot
            className={STATE_STYLES.ok}
            label={bt(lang, { zh: "Steady", en: "Steady", id: "Stabil" })}
          />
          <LegendDot
            className={STATE_STYLES.dip}
            label={bt(lang, { zh: "Energy dip", en: "Energy dip", id: "Penurunan energi" })}
          />
          <LegendDot
            className={STATE_STYLES.filler}
            label={bt(lang, { zh: "Fillers", en: "Fillers", id: "Pengisi" })}
          />
          <LegendDot
            className={STATE_STYLES.pause}
            label={bt(lang, { zh: "Pause", en: "Pause", id: "Jeda" })}
          />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {formatClock(totalSec)}
        </span>
      </div>
    </div>
  );
}
