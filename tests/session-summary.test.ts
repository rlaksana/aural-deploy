import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

import { before } from "node:test";

type SummaryMod = typeof import("../src/lib/ai/session-summary");
let generateSessionSummary: SummaryMod["generateSessionSummary"];
let generateSessionSummaryCore: SummaryMod["generateSessionSummaryCore"];

before(async () => {
  // Dynamic import after env placeholders: the module chain reaches
  // supabaseAdmin, which throws at construction without these vars.
  const mod = await import("../src/lib/ai/session-summary");
  generateSessionSummary = mod.generateSessionSummary;
  generateSessionSummaryCore = mod.generateSessionSummaryCore;
});
import type { SummaryDeps } from "../src/lib/ai/session-summary";

/* eslint-disable @typescript-eslint/no-explicit-any */

const QUESTIONS = [
  { id: "q1", text: "Jelaskan pengalaman Anda", order: 1 },
  { id: "q2", text: "Apa kelemahan Anda?", order: 2 },
];

function baseRow(overrides: Record<string, unknown> = {}) {
  // Loose typing on purpose: tests push message variants (WHITEBOARD, SYSTEM)
  // whose nullable fields differ from the base fixture's literal nulls.
  return ({
    id: "s1",
    summary: null,
    insights: null,
    interview: {
      title: "Wawancara Teknis",
      objective: null,
      language: "id",
      kind: "INTERVIEW",
      assessmentCriteria: null,
      questions: QUESTIONS,
    },
    messages: [
      {
        role: "USER",
        contentType: "TEXT",
        content: "Saya punya pengalaman 5 tahun.",
        questionId: "q1",
        whiteboardData: null,
        whiteboardImageUrl: null,
      },
      {
        role: "ASSISTANT",
        contentType: "TEXT",
        content: "Terima kasih.",
        questionId: null,
        whiteboardData: null,
        whiteboardImageUrl: null,
      },
    ],
    ...overrides,
  }) as Record<string, any>;
}

function okParsed() {
  return {
    summary: "Ringkasan kandidat.",
    themes: ["komunikasi"],
    sentiment: "POSITIVE",
    keyInsights: ["poin utama"],
    questionEvaluations: [
      { index: 1, question: "Jelaskan pengalaman Anda", score: 8, evaluation: "baik" },
    ],
  };
}

function makeDeps(
  db: FakeDb,
  parsed: Record<string, unknown> = okParsed(),
  generate?: (args: any) => Promise<any>,
) {
  const calls: any[] = [];
  const deps = {
    supabase: db.client,
    generate: (async (args: any) => {
      calls.push(args);
      if (generate) return generate(args);
      return { content: JSON.stringify(parsed) };
    }) as any,
    repair: (async () => parsed) as any,
  } as SummaryDeps;
  return { deps, calls };
}

test("a missing session is skipped with zero writes", async () => {
  const db = fakeDb({ sessions: [] });
  const { deps } = makeDeps(db);
  const result = await generateSessionSummaryCore("s1", {}, deps);
  assert.equal(result.status, "skipped");
  assert.equal(db.writes.length, 0);
});

test("an existing summary is skipped unless force is set", async () => {
  const db = fakeDb({ sessions: [baseRow({ summary: "sudah ada" })] });
  const { deps, calls } = makeDeps(db);
  const skipped = await generateSessionSummaryCore("s1", {}, deps);
  assert.equal(skipped.status, "skipped");
  assert.equal(calls.length, 0);

  const forced = await generateSessionSummaryCore("s1", { force: true }, deps);
  assert.equal(forced.status, "generated");
  assert.equal(calls.length, 1);
});

test("a session with no messages is skipped", async () => {
  const db = fakeDb({ sessions: [baseRow({ messages: [] })] });
  const { deps, calls } = makeDeps(db);
  const result = await generateSessionSummaryCore("s1", {}, deps);
  assert.equal(result.status, "skipped");
  assert.equal(calls.length, 0);
});

test("missing insights are completed: matched score kept, unanswered zero-filled, persist shape correct", async () => {
  const db = fakeDb({ sessions: [baseRow()] });
  const { deps } = makeDeps(db);
  const result = await generateSessionSummaryCore("s1", {}, deps);
  assert.equal(result.status, "generated");

  const update = db.writes.find((w) => w.op === "update" && w.table === "sessions");
  assert.ok(update, "sessions update recorded");
  assert.equal((update!.payload as any).summary, "Ringkasan kandidat.");
  assert.deepEqual((update!.payload as any).themes, ["komunikasi"]);

  const rpc = db.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.ok(rpc, "merge_session_insights recorded");
  assert.equal((rpc!.payload as any).p_session_id, "s1");
  const evals = (rpc!.payload as any).p_insights.questionEvaluations;
  assert.equal(evals.length, 2);
  assert.equal(evals[0].score, 8);
  assert.equal(evals[1].score, 0);
  assert.equal(evals[1].evaluation, "Pertanyaan tidak dijawab");
  assert.deepEqual((rpc!.payload as any).p_insights.keyInsights, ["poin utama"]);
});

test("an answered question the LLM did not evaluate blocks persistence entirely", async () => {
  const row = baseRow();
  row.messages.push({
    role: "USER",
    contentType: "TEXT",
    content: "Saya kurang sabar.",
    questionId: "q2",
    whiteboardData: null,
    whiteboardImageUrl: null,
  });
  const db = fakeDb({ sessions: [row] });
  const { deps } = makeDeps(db); // LLM only evaluated index 1, not q2
  await assert.rejects(
    generateSessionSummaryCore("s1", {}, deps),
    /refusing to persist/,
  );
  assert.equal(db.writes.length, 0, "no partial persistence");
});

test("deterministic quiz scores win and the LLM fills open gaps joined by echoed index", async () => {
  const row = baseRow({
    insights: {
      questionEvaluations: [
        { question: "Jelaskan pengalaman Anda", score: 7, correct: true },
      ],
    },
  });
  row.messages.push({
    role: "USER",
    contentType: "TEXT",
    content: "Kelemahan saya kurang detail.",
    questionId: "q2",
    whiteboardData: null,
    whiteboardImageUrl: null,
  });
  const db = fakeDb({ sessions: [row] });
  // LLM evaluation for q2 carries index 2 with paraphrased text (no textual
  // overlap) — the 8a7cc10 join-by-index contract.
  const { deps } = makeDeps(db, {
    summary: "x",
    themes: [],
    sentiment: null,
    keyInsights: [],
    questionEvaluations: [
      { index: 2, question: "Kelemahan utama Anda apa saja", score: 9, evaluation: "cukup" },
    ],
  });
  await generateSessionSummaryCore("s1", {}, deps);

  const rpc = db.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.ok(rpc);
  const evals = (rpc!.payload as any).p_insights.questionEvaluations;
  assert.equal(evals.length, 2);
  assert.equal(evals[0].score, 7, "deterministic keyed score wins");
  assert.equal(evals[1].score, 9, "paraphrased LLM eval joined by index fills the open gap");
  assert.ok(evals.every((e: any) => e.pendingGrading !== true));
});

test("duplicate index claims orphan the paraphrased eval and the gate refuses persistence", async () => {
  const row = baseRow();
  row.messages.push({
    role: "USER",
    contentType: "TEXT",
    content: "Jawaban q2.",
    questionId: "q2",
    whiteboardData: null,
    whiteboardImageUrl: null,
  });
  const db = fakeDb({ sessions: [row] });
  // Both evals claim index 1 → the index join drops both as ambiguous.
  // q1 still matches by its exact text (so the positional fallback does not
  // kick in), but the paraphrased eval for q2 is orphaned → q2 answered with
  // no evaluation → pendingGrading → persist refused. Without the gate the
  // orphan score would be mis-assigned positionally to q2.
  const { deps } = makeDeps(db, {
    summary: "x",
    themes: [],
    sentiment: null,
    keyInsights: [],
    questionEvaluations: [
      { index: 1, question: "Jelaskan pengalaman Anda", score: 5 },
      { index: 1, question: "Kelemahan yang jarang disebut", score: 6 },
    ],
  });
  await assert.rejects(
    generateSessionSummaryCore("s1", {}, deps),
    /refusing to persist/,
  );
  assert.equal(db.writes.length, 0);
});

test("a vision error retries twice with the image dropped from the second prompt", async () => {
  const row = baseRow();
  row.messages.push({
    role: "USER",
    contentType: "WHITEBOARD",
    content: "",
    questionId: null,
    whiteboardData: { label: "sketsa" },
    whiteboardImageUrl: "data:image/png;base64,iVBORw0KGgo=",
  });
  const db = fakeDb({ sessions: [row] });
  const prompts: string[] = [];
  const { deps } = makeDeps(db, okParsed(), async (args) => {
    prompts.push(JSON.stringify(args.messages));
    if (prompts.length === 1) throw new Error("this model does not support images");
    return { content: JSON.stringify(okParsed()) };
  });
  const result = await generateSessionSummaryCore("s1", {}, deps);
  assert.equal(result.status, "generated");
  assert.equal(prompts.length, 2, "generate called twice");
  assert.ok(prompts[0].includes("data:image/png"), "first prompt carries the drawing");
  assert.ok(!prompts[1].includes("data:image"), "retry prompt is text-only");
});

test("SYSTEM pipeline markers never reach the prompt; USER maps to user", async () => {
  const row = baseRow();
  row.messages.push({
    role: "SYSTEM",
    contentType: "TEXT",
    content: "RAHASIA-PIPELINE-XYZ pindah ke pertanyaan berikutnya",
    questionId: null,
    whiteboardData: null,
    whiteboardImageUrl: null,
  });
  const db = fakeDb({ sessions: [row] });
  const { deps, calls } = makeDeps(db);
  await generateSessionSummaryCore("s1", {}, deps);
  const serialized = JSON.stringify(calls[0].messages);
  assert.ok(serialized.includes("Saya punya pengalaman"), "user transcript present");
  assert.ok(
    !serialized.includes("RAHASIA-PIPELINE-XYZ"),
    "system control message excluded",
  );
});

test("a non-vision error is rethrown, not retried", async () => {
  const db = fakeDb({ sessions: [baseRow()] });
  let calls = 0;
  const { deps } = makeDeps(db, okParsed(), async () => {
    calls++;
    throw new Error("kaboom");
  });
  await assert.rejects(generateSessionSummaryCore("s1", {}, deps), /kaboom/);
  assert.equal(calls, 1);
});

test("concurrent summaries for one session generate exactly once", async () => {
  const db = fakeDb({ sessions: [baseRow({ id: "s-dedupe" })] });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let calls = 0;
  const { deps } = makeDeps(db, okParsed(), async () => {
    calls++;
    await gate;
    return { content: JSON.stringify(okParsed()) };
  });
  const p1 = generateSessionSummary("s-dedupe", deps);
  const p2 = generateSessionSummary("s-dedupe", deps);
  release();
  await Promise.all([p1, p2]);
  assert.equal(calls, 1, "in-flight dedupe collapsed the second call");
});

test("a failed summary resolves the wrapper and records the summaryFailedAt marker", async () => {
  const db = fakeDb({ sessions: [baseRow({ id: "s-fail" })] });
  const { deps } = makeDeps(db, okParsed(), async () => {
    throw new Error("boom");
  });
  await generateSessionSummary("s-fail", deps); // must resolve, not reject
  const rpc = db.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.ok(rpc, "failure marker written");
  const marker = (rpc!.payload as any).p_insights.summaryFailedAt;
  assert.ok(typeof marker === "string" && !Number.isNaN(Date.parse(marker)));
});

test("after an in-flight run finishes, a new call generates again", async () => {
  const db = fakeDb({ sessions: [baseRow({ id: "s-again" })] });
  let calls = 0;
  const { deps } = makeDeps(db, okParsed(), async () => {
    calls++;
    return { content: JSON.stringify(okParsed()) };
  });
  await generateSessionSummary("s-again", deps);
  // The first run persisted its summary; clear it so the second call is not
  // short-circuited by idempotency — only a cleared in-flight entry lets a
  // fresh generate happen.
  db.tables.sessions[0].summary = null;
  await generateSessionSummary("s-again", deps);
  assert.equal(calls, 2, "the in-flight entry is cleared after completion");
});
