/**
 * AI operating window (WIB, no DST → fixed +07:00): heavy/deferrable batch AI
 * processes may only RUN between 17:00 and 07:00 WIB. Interactive interview
 * paths never consult this. AI_WINDOW_OVERRIDE=open|closed exists for local
 * verification only and must not be set in production.
 */
export const WINDOW_TZ_OFFSET_HOURS = 7;
export const WINDOW_START_HOUR = 17; // 17:00 WIB — opens
export const WINDOW_END_HOUR = 7; // 07:00 WIB — hard stop

const DAY_MS = 86_400_000;

export interface AiWindowStatus {
  open: boolean;
  /** Time left until the window closes (open) or opens (closed). */
  msUntilBoundary: number;
  /** ISO timestamp of the next open→closed / closed→open flip. */
  nextBoundaryAt: string;
}

function nextBoundaryUtc(nowMs: number, hourWib: number): number {
  const d = new Date(nowMs);
  const todayAtHour = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hourWib - WINDOW_TZ_OFFSET_HOURS,
    0,
    0,
    0,
  );
  return todayAtHour > nowMs ? todayAtHour : todayAtHour + DAY_MS;
}

export function aiWindowStatus(now: Date = new Date()): AiWindowStatus {
  const t = now.getTime();
  const override = process.env.AI_WINDOW_OVERRIDE?.trim().toLowerCase();
  if (override === "open") {
    return {
      open: true,
      msUntilBoundary: DAY_MS,
      nextBoundaryAt: new Date(t + DAY_MS).toISOString(),
    };
  }
  if (override === "closed") {
    const boundary = nextBoundaryUtc(t, WINDOW_START_HOUR);
    return { open: false, msUntilBoundary: boundary - t, nextBoundaryAt: new Date(boundary).toISOString() };
  }

  const wibHour = (now.getUTCHours() + WINDOW_TZ_OFFSET_HOURS) % 24;
  const open = wibHour >= WINDOW_START_HOUR || wibHour < WINDOW_END_HOUR;
  const boundary = nextBoundaryUtc(t, open ? WINDOW_END_HOUR : WINDOW_START_HOUR);
  return { open, msUntilBoundary: boundary - t, nextBoundaryAt: new Date(boundary).toISOString() };
}
