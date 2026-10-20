/**
 * Integrity summary for proctored sessions: counts violations by type,
 * flags serial tab-switchers, and collects the webcam snapshots captured at
 * violation moments. Informational only — a flag never changes the score.
 */

export type ProctoringLogEntry = {
  type: string;
  timestamp: number;
  detail?: string;
  snapshotPath?: string;
};

export type ProctoringSnapshot = {
  snapshotPath: string;
  timestamp: number;
  type: string;
};

export type ProctoringSummary = {
  /** violation type -> count (unknown types included as-is) */
  counts: Record<string, number>;
  total: number;
  /** tab_switch >= 3 — informational flag for the recruiter. */
  flagged: boolean;
  snapshots: ProctoringSnapshot[];
};

/** Recruiter-facing flag threshold for serial tab switching. */
export const TAB_SWITCH_FLAG_THRESHOLD = 3;

export function summarizeLog(log: unknown): ProctoringSummary {
  const entries = Array.isArray(log) ? (log as ProctoringLogEntry[]) : [];
  const counts: Record<string, number> = {};
  const snapshots: ProctoringSnapshot[] = [];
  let total = 0;

  for (const e of entries) {
    if (!e || typeof e.type !== "string" || typeof e.timestamp !== "number") continue;
    total++;
    counts[e.type] = (counts[e.type] ?? 0) + 1;
    if (typeof e.snapshotPath === "string" && e.snapshotPath) {
      snapshots.push({ snapshotPath: e.snapshotPath, timestamp: e.timestamp, type: e.type });
    }
  }

  return {
    counts,
    total,
    flagged: (counts.tab_switch ?? 0) >= TAB_SWITCH_FLAG_THRESHOLD,
    snapshots,
  };
}
