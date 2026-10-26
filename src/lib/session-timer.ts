/**
 * Countdown anchors: the deadline must survive a page refresh, so remaining
 * time is always derived from a persisted timestamp (the first answer's
 * message timestamp) instead of client component state.
 */

/**
 * Remaining countdown seconds anchored at `startedAtMs`.
 * Null/invalid anchor = full duration (fresh start); clamps to 0 once expired.
 */
export function remainingSecondsFromAnchor(
  startedAtMs: number | null,
  durationMinutes: number,
  now: number = Date.now(),
): number {
  if (!startedAtMs || startedAtMs <= 0) return durationMinutes * 60;
  return Math.max(0, durationMinutes * 60 - Math.floor((now - startedAtMs) / 1000));
}
