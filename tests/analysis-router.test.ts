import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnalysisMod = typeof import("../src/server/routers/analysis");
let analysisRouter: AnalysisMod["analysisRouter"];

before(async () => {
  // Dynamic import after env placeholders: the router chain reaches
  // supabaseAdmin, which throws without them.
  const mod = await import("../src/server/routers/analysis");
  analysisRouter = mod.analysisRouter;
});

// Reproduces the 2026-11-19 production incident shape: a COMPLETED session
// whose only stored evaluation is the deterministic quiz grade, while the
// candidate also answered open questions the AI report never evaluated.
const INTERVIEW_ROW = {
  id: "i1",
  userId: "u-owner",
  title: "Wawancara Teknis",
  objective: null,
  projectId: "p1",
  project: { organizationId: "org1" },
  assessmentCriteria: null,
  questions: [
    { id: "q1", text: "Q pilihan ganda" },
    { id: "q2", text: "Q terbuka dijawab" },
    { id: "q3", text: "Q terbuka tak dijawab" },
  ],
};

const SESSION_ROW = {
  id: "s1",
  interviewId: "i1",
  status: "COMPLETED",
  insights: {
    questionEvaluations: [{ question: "Q pilihan ganda", score: 0, correct: false }],
  },
  summary: null,
  participantName: "Budi",
  participantEmail: "b@x.com",
  themes: null,
  sentiment: null,
  screenshots: null,
  interview: INTERVIEW_ROW,
  messages: [
    { id: "m1", role: "USER", content: "jawaban A", questionId: "q1" },
    { id: "m2", role: "USER", content: "jawaban terbuka", questionId: "q2" },
    { id: "m3", role: "ASSISTANT", content: "terima kasih", questionId: null },
  ],
};

function caller(tables: Record<string, any[]>) {
  const db = fakeDb(tables);
  const call = analysisRouter.createCaller({
    user: { id: "u-recruiter" } as any,
    supabase: db.client,
  });
  return { db, call };
}

test("answered-but-unevaluated questions canonicalize to pending, not false zeros", async () => {
  const { call } = caller({
    sessions: [SESSION_ROW],
    interviews: [INTERVIEW_ROW],
    organization_members: [{ workspaceId: "org1", userId: "u-recruiter", role: "VIEWER" }],
    project_members: [],
  });
  const out = await call.getSessionSummary({ sessionId: "s1" });
  const evals = (out.insights as { questionEvaluations: any[] }).questionEvaluations;
  assert.equal(evals.length, 3, "one entry per interview question");
  const byQuestion = new Map(evals.map((e: any) => [e.question, e]));

  const keyed = byQuestion.get("Q pilihan ganda");
  assert.equal(keyed.score, 0, "a real deterministic grade is kept even at 0");

  const answeredPending = byQuestion.get("Q terbuka dijawab");
  assert.equal(answeredPending.score, null, "answered with no evaluation must not become a false 0");
  assert.equal(answeredPending.pendingGrading, true);

  const neverAnswered = byQuestion.get("Q terbuka tak dijawab");
  assert.equal(neverAnswered.score, 0, "a question never answered stays a zero");
  assert.ok(!neverAnswered.pendingGrading);
});
