import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ReportMod = typeof import("../src/server/routers/report");
type LibMod = typeof import("../src/lib/interview-report");
let reportRouter: ReportMod["reportRouter"];
let filterScoreReadyEntries: LibMod["filterScoreReadyEntries"];
let buildReportRows: LibMod["buildReportRows"];

before(async () => {
  // Dynamic import after env placeholders: the router chain reaches
  // supabaseAdmin (via aggregate-analysis), which throws without them.
  const routerMod = await import("../src/server/routers/report");
  const libMod = await import("../src/lib/interview-report");
  reportRouter = routerMod.reportRouter;
  filterScoreReadyEntries = libMod.filterScoreReadyEntries;
  buildReportRows = libMod.buildReportRows;
});

const QUESTIONS = [
  { id: "q1", text: "Q satu", type: "OPEN_ENDED", options: null },
  { id: "q2", text: "Q dua", type: "OPEN_ENDED", options: null },
];

const INTERVIEW_ROW = {
  id: "i1",
  userId: "u-owner",
  projectId: "p1",
  project: { organizationId: "org1" },
  title: "Wawancara Teknis",
  kind: "INTERVIEW",
  assessmentCriteria: null,
  questions: QUESTIONS,
};

const scoredSession = {
  id: "s1",
  interviewId: "i1",
  status: "COMPLETED",
  insights: {
    questionEvaluations: [
      { question: "Q satu", score: 8 },
      { question: "Q dua", score: 6 },
    ],
  },
  summary: "bagus",
  participantName: "Budi",
  participantEmail: "b@x.com",
  completedAt: "2026-11-01T10:00:00Z",
};

const orgTables = {
  interviews: [INTERVIEW_ROW],
  organization_members: [{ workspaceId: "org1", userId: "u-recruiter", role: "VIEWER" }],
  project_members: [],
};

function caller(dbTables: Record<string, any[]>) {
  const db = fakeDb(dbTables);
  const call = reportRouter.createCaller({ user: { id: "u-recruiter" } as any, supabase: db.client });
  return { db, call };
}

test("get requires authentication", async () => {
  const db = fakeDb(orgTables);
  const anon = reportRouter.createCaller({ user: null, supabase: db.client } as any);
  await assert.rejects(
    anon.get({ interviewId: "i1" }),
    (err: { code: string }) => err.code === "UNAUTHORIZED",
  );
});

test("get: happy path — scored rows, link token, and the caller's effective role", async () => {
  const { db, call } = caller({
    ...orgTables,
    interview_report_links: [{ interviewId: "i1", token: "tok123" }],
    candidates: [
      { interviewId: "i1", name: "Budi", email: "b@x.com", session: scoredSession },
    ],
    sessions: [],
    messages: [
      { sessionId: "s1", questionId: "q1", role: "USER" },
      { sessionId: "s1", questionId: "q2", role: "USER" },
    ],
  });
  const out = await call.get({ interviewId: "i1" });
  assert.equal(out.role, "VIEWER");
  assert.equal(out.linkToken, "tok123");
  assert.equal(out.report.rows.length, 1);
  assert.equal(out.report.rows[0].overallScore, 7);
  assert.equal(out.report.rows[0].name, "Budi");
  assert.equal(db.writes.length, 0, "a read records no writes");
});

test("getByToken: unknown token is NOT_FOUND", async () => {
  const db = fakeDb({ interview_report_links: [] });
  const call = reportRouter.createCaller({ user: null, supabase: db.client } as any);
  await assert.rejects(
    call.getByToken({ token: "nope" }),
    (err: { code: string }) => err.code === "NOT_FOUND",
  );
});

test("getByToken (INTERVIEW): only score-ready sessions are public", async () => {
  const { db, call } = caller({
    ...orgTables,
    interview_report_links: [{ interviewId: "i1", token: "tok123" }],
    candidates: [{ interviewId: "i1", name: "Budi", email: "b@x.com", session: scoredSession }],
    sessions: [
      scoredSession,
      { ...scoredSession, id: "s2", status: "RUNNING", participantName: "Citra" },
      {
        // COMPLETED but the grading pipeline never produced insights for its
        // answered question — the score is null, so it must stay hidden.
        ...scoredSession,
        id: "s3",
        participantName: "Dewi",
        insights: null,
      },
    ],
    messages: [
      { sessionId: "s1", questionId: "q1", role: "USER" },
      { sessionId: "s1", questionId: "q2", role: "USER" },
      { sessionId: "s3", questionId: "q1", role: "USER" },
    ],
  });
  const out = await call.getByToken({ token: "tok123" });
  const sessionIds = out.report.rows.map((r: any) => r.sessionId);
  assert.deepEqual(sessionIds, ["s1"], "RUNNING and ungraded sessions stay hidden");
  assert.equal(out.report.rows[0].overallScore, 7);
  assert.equal(db.writes.length, 0);
});

test("getByToken (SURVEY): rows are stripped and the aggregate projection never leaks names or open text", async () => {
  const surveyRow = {
    id: "i2",
    title: "Survei Kepuasan",
    kind: "SURVEY",
    assessmentCriteria: null,
    questions: [
      {
        id: "sq1",
        text: "Rating layanan",
        type: "SINGLE_CHOICE",
        options: { options: ["1", "5"] },
      },
    ],
  };
  const dbTables = {
    interviews: [surveyRow],
    interview_report_links: [{ interviewId: "i2", token: "tokS" }],
    candidates: [
      {
        interviewId: "i2",
        name: "Ani Sang Responden",
        email: "ani@x.com",
        session: {
          id: "sv1",
          status: "COMPLETED",
          insights: null,
          participantName: "Ani Sang Responden",
          completedAt: "2026-11-02T09:00:00Z",
          messages: [
            // Choice answers are stored as single capital letters (A = first
            // option); "B" selects option "5".
            { role: "USER", content: "B", questionId: "sq1" },
            { role: "ASSISTANT", content: "Terima kasih", questionId: null },
          ],
        },
      },
    ],
    sessions: [],
  };
  const { db, call } = caller(dbTables);
  const out = await call.getByToken({ token: "tokS" });

  assert.deepEqual(out.report.rows, [], "survey share links never carry a row table");
  assert.ok(out.aggregate, "survey links carry an aggregate");
  assert.equal(out.aggregate!.respondentCount, 1);
  const q = out.aggregate!.questions[0] as Record<string, unknown>;
  assert.equal(q.text, "Rating layanan");
  assert.deepEqual(q.tally, [
    { option: "1", count: 0 },
    { option: "5", count: 1 },
  ]);
  assert.equal(q.average, 5);
  const allowed = new Set(["id", "text", "type", "tally", "average", "correctRate"]);
  assert.ok(
    Object.keys(q).every((k) => allowed.has(k)),
    `aggregate projection carries only public-safe fields: ${Object.keys(q)}`,
  );
  assert.ok(
    !JSON.stringify(out).includes("Ani Sang Responden"),
    "respondent names must not leak through a public token",
  );
  assert.equal(db.writes.length, 0);
});

test("createLink replaces the existing link with a single delete-then-insert", async () => {
  const { db, call } = caller({
    ...orgTables,
    interview_report_links: [{ interviewId: "i1", token: "old-token" }],
  });
  const out = await call.createLink({ interviewId: "i1" });
  assert.equal(out.token.length, 24);
  const deleteIdx = db.writes.findIndex((w) => w.op === "delete" && w.table === "interview_report_links");
  const insertIdx = db.writes.findIndex((w) => w.op === "insert" && w.table === "interview_report_links");
  assert.ok(deleteIdx !== -1 && insertIdx !== -1, "both writes recorded");
  assert.ok(deleteIdx < insertIdx, "delete happens before insert");
  assert.deepEqual((db.writes[insertIdx].payload as any)[0].token, out.token);
  assert.deepEqual(
    db.tables.interview_report_links,
    [{ interviewId: "i1", token: out.token }],
    "exactly one link row remains",
  );
});

test("createLink: a failed insert surfaces as INTERNAL_SERVER_ERROR", async () => {
  const db = fakeDb(
    { ...orgTables, interview_report_links: [] },
    { insertErrors: { interview_report_links: "duplicate key" } },
  );
  const call = reportRouter.createCaller({ user: { id: "u-recruiter" } as any, supabase: db.client });
  await assert.rejects(
    call.createLink({ interviewId: "i1" }),
    (err: { code: string }) => err.code === "INTERNAL_SERVER_ERROR",
  );
});

test("deleteLink removes the link row and reports success", async () => {
  const { db, call } = caller({
    ...orgTables,
    interview_report_links: [{ interviewId: "i1", token: "tok123" }],
  });
  const out = await call.deleteLink({ interviewId: "i1" });
  assert.equal(out.success, true);
  assert.deepEqual(db.tables.interview_report_links, []);
});

/* ------------------------------------------------------------------ */
/*  Parity invariant: the public gate and the report rows must agree.  */
/* ------------------------------------------------------------------ */

const pendingEntry = {
  id: "s3",
  status: "COMPLETED",
  insights: null,
  summary: null,
  participantName: "Dewi",
  participantEmail: "d@x.com",
  completedAt: "2026-11-03T10:00:00Z",
  messages: [{ role: "USER", content: "jawaban", questionId: "q1" }],
};

test("parity: an entry is kept by the score gate exactly when its row would carry a finite score", () => {
  const entries = [
    { name: "Budi", email: "b@x.com", source: "Invited" as const, session: scoredSession },
    { name: "Dewi", email: "d@x.com", source: "Invited" as const, session: pendingEntry },
    { name: "Tanpa Sesi", email: "e@x.com", source: "Invited" as const, session: null },
  ];
  const answeredBySession = new Map([
    ["s1", new Set(["q1", "q2"])],
    ["s3", new Set(["q1"])],
  ]);
  const filtered = filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS, answeredBySession });
  const report = buildReportRows("T", entries, QUESTIONS, undefined, answeredBySession);

  const keptIds = filtered.map((e) => e.session?.id ?? null);
  assert.deepEqual(keptIds, ["s1", null], "scored kept, ungraded dropped, roster kept");
  for (const row of report.rows) {
    if (row.sessionId === "") continue; // roster rows have no session
    assert.equal(
      typeof row.overallScore === "number",
      keptIds.includes(row.sessionId),
      `session ${row.sessionId}: gate decision must match score finiteness`,
    );
  }
});

test("parity: both answered-set derivations (side query and embedded messages) agree", () => {
  const withEmbed = { ...scoredSession, messages: [
    { role: "USER", content: "a", questionId: "q1" },
    { role: "USER", content: "b", questionId: "q2" },
  ] };
  const entries = [{ name: "Budi", email: null, source: "Invited" as const, session: withEmbed }];
  const map = new Map([["s1", new Set(["q1", "q2"])]]);

  const viaMap = buildReportRows("T", entries, QUESTIONS, undefined, map);
  const viaEmbed = buildReportRows("T", entries, QUESTIONS, undefined, undefined);
  assert.equal(viaMap.rows[0].overallScore, viaEmbed.rows[0].overallScore);

  const filterViaMap = filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS, answeredBySession: map });
  const filterViaEmbed = filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS });
  assert.equal(filterViaMap.length, filterViaEmbed.length, "gate decision identical either way");
  assert.equal(filterViaMap.length, 1);
});
