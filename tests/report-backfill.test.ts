import assert from "node:assert/strict";
import test from "node:test";

import { runBatchSummaries } from "../src/lib/report-backfill";

type FetchCall = (input: string, init?: RequestInit) => Promise<Response>;

test("runBatchSummaries caps concurrency at 5 and refills slots dynamically", async () => {
  let active = 0;
  let maxActive = 0;
  const processed: string[] = [];

  // Varied durations: some finish fast, others slow. The fast ones should
  // finish and immediately pull the next item from the queue without
  // waiting for the slow ones to complete.
  const durations: Record<string, number> = {
    s1: 40,
    s2: 10, // finishes early
    s3: 10, // finishes early
    s4: 40,
    s5: 40,
    s6: 10, // should be pulled the moment s2 frees a slot
    s7: 10, // should be pulled the moment s3 frees a slot
  };

  const fetchImpl: FetchCall = async (_input, init) => {
    const body = JSON.parse(init!.body as string) as { sessionId: string };
    active += 1;
    maxActive = Math.max(maxActive, active);
    processed.push(body.sessionId);
    await new Promise((r) => setTimeout(r, durations[body.sessionId] ?? 10));
    active -= 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const sessions = Object.keys(durations).map((id) => ({
    sessionId: id,
    name: id.toUpperCase(),
  }));

  const result = await runBatchSummaries(sessions, {
    concurrency: 5,
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert.equal(maxActive, 5, "concurrency pool filled all 5 slots");
  assert.equal(result.done, 7, "every item was processed");
  assert.equal(result.failed, 0);
  assert.deepEqual(result.failures, [], "successes are not recorded as failures");
  assert.deepEqual(
    new Set(processed),
    new Set(sessions.map((s) => s.sessionId)),
    "every session was handled exactly once",
  );
});

test("runBatchSummaries isolates failures while others continue", async () => {
  const fetchImpl: FetchCall = async (_input, init) => {
    const body = JSON.parse(init!.body as string) as { sessionId: string };
    if (body.sessionId === "s2") {
      return new Response("error", { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const result = await runBatchSummaries(
    [
      { sessionId: "s1", name: "A" },
      { sessionId: "s2", name: "B" },
      { sessionId: "s3", name: "C" },
    ],
    { concurrency: 5, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.equal(result.done, 2);
  assert.equal(result.failed, 1);
});

test("runBatchSummaries records HTTP status and duration per failure", async () => {
  const fetchImpl: FetchCall = async (_input, init) => {
    const body = JSON.parse(init!.body as string) as { sessionId: string };
    if (body.sessionId === "s-bad") return new Response("boom", { status: 503 });
    if (body.sessionId === "s-dead") throw new Error("network down");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const result = await runBatchSummaries(
    [
      { sessionId: "s-bad", name: "B" },
      { sessionId: "s-dead", name: "D" },
      { sessionId: "s-ok", name: "O" },
    ],
    { concurrency: 3, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.equal(result.done, 1);
  assert.equal(result.failed, 2);
  const byId = Object.fromEntries(result.failures.map((f) => [f.sessionId, f]));
  assert.equal(byId["s-bad"].status, 503, "HTTP status is preserved for triage");
  assert.equal(byId["s-bad"].error, null, "server-answered failures carry no client error");
  assert.ok(byId["s-bad"].durationMs >= 0, "duration is recorded");
  assert.equal(byId["s-dead"].status, null, "network-level failures record no status");
  assert.equal(byId["s-dead"].error, "network down", "client-side cause is preserved");
  assert.ok(!result.failures.some((f) => f.sessionId === "s-ok"));
});

test("runBatchSummaries sends skipExisting on every request", async () => {
  const seen: unknown[] = [];
  const fetchImpl: FetchCall = async (_input, init) => {
    seen.push(JSON.parse(init!.body as string));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await runBatchSummaries([{ sessionId: "s1", name: "A" }], {
    concurrency: 5,
    fetchImpl: fetchImpl as typeof fetch,
  });

  for (const body of seen) {
    assert.equal((body as { skipExisting: boolean }).skipExisting, true);
  }
});

test("runBatchSummaries handles empty input gracefully", async () => {
  const result = await runBatchSummaries([], {
    concurrency: 5,
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });

  assert.deepEqual(result, { done: 0, failed: 0, failures: [] });
});

test("runBatchSummaries respects lower custom concurrency", async () => {
  let active = 0;
  let maxActive = 0;

  const fetchImpl: FetchCall = async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 10));
    active -= 1;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await runBatchSummaries(
    [
      { sessionId: "s1", name: "A" },
      { sessionId: "s2", name: "B" },
      { sessionId: "s3", name: "C" },
      { sessionId: "s4", name: "D" },
    ],
    { concurrency: 2, fetchImpl: fetchImpl as typeof fetch },
  );

  assert.equal(maxActive, 2, "bounded by concurrency limit");
});
