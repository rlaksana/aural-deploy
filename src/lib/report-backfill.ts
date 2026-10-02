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

const DEFAULT_CONCURRENCY = 5;

export async function runBatchSummaries(
  sessions: { sessionId: string; name: string }[],
  opts: {
    concurrency?: number;
    /** Regenerate even when a summary already exists (overwrites it). */
    force?: boolean;
    onProgress?: (p: BackfillProgress) => void;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<{ done: number; failed: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const limit = Math.max(
    1,
    Math.min(opts.concurrency ?? DEFAULT_CONCURRENCY, sessions.length),
  );
  let cursor = 0;
  let done = 0;
  let failed = 0;
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
      try {
        const res = await fetchImpl("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, skipExisting: true, force: opts.force ?? false }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        done += 1;
      } catch {
        failed += 1;
      }
      completions += 1;
      // Throttle UI ticks — each onProgress re-renders the 300+ row report.
      if (completions % 5 === 0 || cursor >= sessions.length) tick(null);
    }
  };

  await Promise.all(Array.from({ length: limit }, worker));
  tick(null);
  return { done, failed };
}
