/**
 * Backfills AI summaries for completed sessions that lack scores, running a
 * bounded pool of concurrent requests. A shared cursor hands each worker the
 * next pending session the moment it frees up, so uneven LLM latencies never
 * leave slots idle. Continues past individual failures so one bad transcript
 * doesn't stall the batch.
 */
export type BackfillProgress = {
  done: number;
  failed: number;
  total: number;
  current: string | null;
};

export type BackfillFailure = {
  sessionId: string;
  /** HTTP status when the server answered; null on abort/network failure. */
  status: number | null;
  /** Client-side error message (network/abort); null when the server answered. */
  error: string | null;
  durationMs: number;
};

const DEFAULT_CONCURRENCY = 5;

// The route's internal deadline is 270s; abort a wedged response a little
// after that so a slot can never hang forever.
const ABORT_AFTER_MS = 290_000;

/**
 * Hard cap on parallel AI calls per batch run — the batch budget. Callers may
 * ask for fewer, never more: report regeneration must not stampede the LLM
 * provider regardless of roster size.
 */
export const MAX_BATCH_CONCURRENCY = 5;

export async function runBatchSummaries(
  sessions: { sessionId: string; name: string }[],
  opts: {
    concurrency?: number;
    /** Regenerate even when a summary already exists (overwrites it). */
    force?: boolean;
    onProgress?: (p: BackfillProgress) => void;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ done: number; failed: number; failures: BackfillFailure[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = Math.max(
    1,
    Math.min(
      opts.concurrency ?? DEFAULT_CONCURRENCY,
      MAX_BATCH_CONCURRENCY,
      sessions.length,
    ),
  );
  let cursor = 0;
  let done = 0;
  let failed = 0;
  const failures: BackfillFailure[] = [];
  let completions = 0;

  const tick = (current: string | null) => {
    opts.onProgress?.({ done, failed, total: sessions.length, current });
  };

  const worker = async () => {
    for (;;) {
      // Single-threaded JS: claim the next index synchronously, then await.
      const i = cursor;
      if (i >= sessions.length) return;
      cursor += 1;
      const { sessionId } = sessions[i];
      const startedAt = Date.now();
      try {
        const res = await fetchImpl("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, skipExisting: true, force: opts.force ?? false }),
          signal: AbortSignal.timeout(ABORT_AFTER_MS),
        });
        if (!res.ok) {
          failures.push({ sessionId, status: res.status, error: null, durationMs: Date.now() - startedAt });
          failed += 1;
        } else {
          done += 1;
        }
      } catch (error) {
        failures.push({
          sessionId,
          status: null,
          error: error instanceof Error ? error.message : null,
          durationMs: Date.now() - startedAt,
        });
        failed += 1;
      }
      completions += 1;
      // Throttle UI ticks — each onProgress re-renders the 300+ row report.
      if (completions % 5 === 0 || cursor >= sessions.length) tick(null);
    }
  };

  await Promise.all(Array.from({ length: limit }, worker));
  tick(null);
  if (failures.length > 0) {
    console.warn("[report-backfill] failed sessions:", JSON.stringify(failures));
  }
  return { done, failed, failures };
}
