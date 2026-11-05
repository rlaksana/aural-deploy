import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, withAdminPatches, type FakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* eslint-disable @typescript-eslint/no-explicit-any */

type SessionMod = typeof import("../src/server/routers/session");
let sessionRouter: SessionMod["sessionRouter"];

before(async () => {
  const mod = await import("../src/server/routers/session");
  sessionRouter = mod.sessionRouter;
});

const errCode = (e: unknown): string => (e as { code: string }).code;

/** Run fn with supabaseAdmin.rpc recorded into the shared writes list. */
async function withRpcRecording(db: FakeDb, fn: () => Promise<unknown>) {
  return withAdminPatches(
    {
      rpc: (fnName: string, params: unknown) => {
        db.writes.push({ op: "rpc", table: "", fn: fnName, payload: params });
        return Promise.resolve({ data: null, error: null });
      },
    },
    () => fn(),
  );
}

function caller(db: FakeDb, user: { id: string } | null = null) {
  return sessionRouter.createCaller({ user, supabase: db.client } as any);
}

const START_TS = "2026-11-05T02:00:00.000Z";

/** Session + interview fixture with one keyed quiz question. */
function quizTables(overrides: Record<string, unknown> = {}) {
  return {
    sessions: [
      {
        id: "s1",
        accessToken: null,
        startedAt: "2026-11-05T01:59:00.000Z",
        status: "IN_PROGRESS",
        ...overrides,
        interview: {
          kind: "QUIZ",
          aiSummaryEnabled: false,
          psychometricConfig: null,
          questions: [{ id: "q1", text: "2+2?", type: "SINGLE_CHOICE", options: { options: ["3", "4"], correctIndices: [1] } }],
        },
      },
    ],
    messages: [{ sessionId: "s1", timestamp: START_TS, questionId: "q1", content: "B", role: "USER" }],
  };
}

test("complete: unknown session is NOT_FOUND", async () => {
  const db = fakeDb({ sessions: [] });
  await assert.rejects(
    caller(db).complete({ id: "ghost" }),
    (e: unknown) => errCode(e) === "NOT_FOUND",
  );
});

test("complete: a wrong share token is FORBIDDEN for anonymous callers", async () => {
  const db = fakeDb(quizTables({ accessToken: "secret" }));
  await assert.rejects(
    caller(db).complete({ id: "s1", sessionToken: "wrong" }),
    (e: { code: string; message: string }) =>
      e.code === "FORBIDDEN" && /Invalid session token/.test(e.message),
  );
});

test("complete (QUIZ, AI off): grades deterministically, backdates startedAt, writes the score-line summary", async () => {
  const db = fakeDb(quizTables());
  await withRpcRecording(db, () =>
    caller(db).complete({ id: "s1", sessionToken: undefined }),
  );

  const update = db.writes.find((w) => w.op === "update" && w.table === "sessions")?.payload as any;
  assert.equal(update.status, "COMPLETED");
  assert.equal(update.startedAt, START_TS, "duration is measured from the first message");
  assert.ok(update.totalDurationSeconds >= 0);

  const rpc = db.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.ok(rpc, "quiz grade merged into insights");
  assert.deepEqual((rpc!.payload as any).p_insights.questionEvaluations[0].correct, true);

  const summaryUpdate = db.writes.filter((w) => w.op === "update" && w.table === "sessions")
    .map((w) => w.payload as any)
    .find((p) => typeof p.summary === "string");
  assert.match(summaryUpdate.summary, /Score: 1\/1 fully correct · average 10\.0\/10/);
  assert.ok(db.writes.every((w) => w.fn !== "append_anti_cheating_log"));
});

test("complete (QUIZ, AI on): grade is merged, no score-line summary, AI summary scheduled via after()", async () => {
  const db = fakeDb(quizTables({ interview: undefined }));
  // Restore the interview with aiSummaryEnabled true.
  db.tables.sessions[0].interview = {
    kind: "QUIZ",
    aiSummaryEnabled: true,
    psychometricConfig: null,
    questions: [{ id: "q1", text: "2+2?", type: "SINGLE_CHOICE", options: { options: ["3", "4"], correctIndices: [1] } }],
  };
  // Next's after() throws outside a request scope (E468) — in production it
  // schedules generateSessionSummary; in tests the rejection proves the
  // summary was delegated instead of run inline. Grading writes land first.
  await assert.rejects(
    withRpcRecording(db, () => caller(db).complete({ id: "s1" })),
    /outside a request scope/,
  );
  assert.ok(
    db.writes.some((w) => w.op === "rpc" && w.fn === "merge_session_insights"),
    "grade merged before the summary scheduling",
  );
  assert.ok(
    !db.writes.some((w) => w.op === "update" && (w.payload as any)?.summary),
    "no score-line summary when AI summarization is on",
  );
});

test("complete (INTERVIEW): no quiz grade is written — scoring belongs to the summary pipeline", async () => {
  const db = fakeDb(quizTables());
  db.tables.sessions[0].interview = {
    kind: "INTERVIEW",
    aiSummaryEnabled: false,
    psychometricConfig: null,
    // Open-ended question without an answer key: gradeQuiz skips it.
    questions: [{ id: "q1", text: "Ceritakan pengalaman Anda", type: "OPEN_ENDED", options: null }],
  };
  await assert.rejects(
    withRpcRecording(db, () => caller(db).complete({ id: "s1" })),
    /outside a request scope/,
    "INTERVIEW always schedules the AI summary via after()",
  );
  assert.ok(
    !db.writes.some((w) => w.op === "rpc" && w.fn === "merge_session_insights"),
    "interview-kind completes never write a quiz grade",
  );
});

test("complete (psychometric): scores FINAL — dimensionScores merged and summary written, no AI path", async () => {
  const db = fakeDb(quizTables());
  db.tables.sessions[0].interview = {
    kind: "ASSESSMENT",
    aiSummaryEnabled: true,
    psychometricConfig: { bankId: "BIG_FIVE" },
    questions: [{ id: "pq1", text: "Saya cepat mencoba tool baru.", type: "SINGLE_CHOICE", options: null }],
  };
  const out = await withRpcRecording(db, () => caller(db).complete({ id: "s1" }));
  assert.deepEqual(out, { success: true });

  const rpc = db.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.ok(rpc);
  const insights = (rpc!.payload as any).p_insights;
  assert.equal(Object.keys(insights.dimensionScores).length, 5, "all Big Five dimensions scored");
  assert.ok(insights.bands && Object.keys(insights.bands).length > 0);

  const summaryUpdate = db.writes.filter((w) => w.op === "update" && w.table === "sessions")
    .map((w) => w.payload as any)
    .find((p) => typeof p.summary === "string" && p.summary.length > 0);
  assert.ok(summaryUpdate, "psychometric summary written");
});

test("adjustScore: null clears to an inert empty object; a value replaces wholesale with audit fields", async () => {
  const tables = {
    sessions: [
      {
        id: "s1",
        accessToken: null,
        insights: { adjustments: { overallScore: 5, note: "old" } },
        interview: { projectId: "p1", project: { organizationId: "org1" } },
      },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-rec", role: "ADMIN" }],
    project_members: [],
  };

  const dbClear = fakeDb(tables);
  await withRpcRecording(dbClear, () =>
    caller(dbClear, { id: "u-rec" }).adjustScore({ sessionId: "s1", adjustments: null }),
  );
  const cleared = dbClear.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  assert.deepEqual((cleared!.payload as any).p_insights, { adjustments: {} });

  const dbSet = fakeDb(tables);
  await withRpcRecording(dbSet, () =>
    caller(dbSet, { id: "u-rec" }).adjustScore({
      sessionId: "s1",
      adjustments: { overallScore: 8, note: "reviewed" },
    }),
  );
  const set = dbSet.writes.find((w) => w.op === "rpc" && w.fn === "merge_session_insights");
  const adj = (set!.payload as any).p_insights.adjustments;
  assert.equal(adj.overallScore, 8);
  assert.equal(adj.note, "reviewed");
  assert.equal(adj.adjustedBy, "u-rec");
  assert.ok(typeof adj.adjustedAt === "string");
  // Wholesale replace: the previous value must not survive inside the payload.
  assert.deepEqual(Object.keys(adj).sort(), ["adjustedAt", "adjustedBy", "note", "overallScore"]);
});

test("adjustScore: org non-members are FORBIDDEN; sessions without an org are NOT_FOUND", async () => {
  const base = {
    sessions: [
      {
        id: "s1",
        accessToken: null,
        interview: { projectId: "p1", project: { organizationId: "org1" } },
      },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-other", role: "VIEWER" }],
    project_members: [],
  };
  const dbForbidden = fakeDb(base);
  await assert.rejects(
    withRpcRecording(dbForbidden, () =>
      caller(dbForbidden, { id: "u-outsider" }).adjustScore({ sessionId: "s1", adjustments: null }),
    ),
    (e: unknown) => errCode(e) === "FORBIDDEN",
  );

  const dbMissing = fakeDb({
    sessions: [{ id: "s2", interview: null }],
    organization_members: [],
  });
  await assert.rejects(
    withRpcRecording(dbMissing, () =>
      caller(dbMissing, { id: "u-rec" }).adjustScore({ sessionId: "s2", adjustments: null }),
    ),
    (e: unknown) => errCode(e) === "NOT_FOUND",
  );
});

test("adjustScore: an overall score above 10 is rejected by input validation", async () => {
  const db = fakeDb({
    sessions: [
      {
        id: "s1",
        interview: { projectId: "p1", project: { organizationId: "org1" } },
      },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-rec", role: "ADMIN" }],
  });
  await assert.rejects(
    caller(db, { id: "u-rec" }).adjustScore({ sessionId: "s1", adjustments: { overallScore: 11 } } as any),
    (e: unknown) => errCode(e) === "BAD_REQUEST",
  );
  assert.equal(db.writes.length, 0, "validation rejects before any write");
});
