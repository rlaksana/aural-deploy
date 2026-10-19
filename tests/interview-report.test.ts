import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportRows,
  canonicalizeInsights,
  type ReportEntry,
} from "../src/lib/interview-report";

function entry(
  overrides: Partial<ReportEntry> & { session?: ReportEntry["session"] } = {},
): ReportEntry {
  return {
    name: "Candidate",
    email: null,
    source: "Walk-in",
    session: {
      id: "s1",
      status: "COMPLETED",
      insights: null,
      summary: null,
      participantName: null,
      participantEmail: null,
      completedAt: null,
    },
    ...overrides,
  };
}

test("ranks by overall score desc, unscored last", () => {
  const report = buildReportRows("T", [
    entry({ session: { id: "low", status: "COMPLETED", insights: { questionEvaluations: [{ question: "a", score: 4 }] } } }),
    entry({ session: { id: "high", status: "COMPLETED", insights: { criteriaEvaluations: [{ name: "Communication", score: 9 }] } } }),
    entry({ session: { id: "none", status: "COMPLETED", insights: null } }),
    entry({ name: "Never", source: "Invited", session: null }),
  ]);

  assert.deepEqual(
    report.rows.map((r) => r.sessionId),
    ["high", "low", "none", ""],
  );
  assert.equal(report.rows[0].overallScore, 9);
  assert.equal(report.rows[3].status, "NOT_STARTED");
});

test("with canonical questions, one strong answer no longer outranks complete coverage", () => {
  const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
    text: `Question ${i + 1}`,
  }));
  const report = buildReportRows(
    "T",
    [
      entry({
        session: {
          id: "one-answer",
          status: "COMPLETED",
          insights: { questionEvaluations: [{ question: "a", score: 8 }] },
        },
      }),
      entry({
        session: {
          id: "all-answers",
          status: "COMPLETED",
          insights: {
            questionEvaluations: [
              { question: "a", score: 6 },
              { question: "b", score: 6 },
            ],
          },
        },
      }),
    ],
    tenQuestions,
  );

  // 12/10 = 1.2 beats 8/10 = 0.8: unanswered questions cost points.
  assert.equal(report.rows[0].sessionId, "all-answers");
  assert.equal(report.rows[1].sessionId, "one-answer");
});

test("unions criteria across candidates and maps question labels", () => {
  const report = buildReportRows("T", [
    entry({
      session: {
        id: "a",
        status: "COMPLETED",
        insights: {
          criteriaEvaluations: [{ name: "Communication", score: 8 }],
          questionEvaluations: [
            { question: "Tell me about yourself", score: 7 },
            { question: "Why this role?", score: 6 },
          ],
        },
      },
    }),
    entry({
      session: {
        id: "b",
        status: "COMPLETED",
        insights: {
          criteriaEvaluations: [{ name: "Problem Solving", score: 5 }],
          questionEvaluations: [{ question: "Tell me about yourself", score: 9 }],
        },
      },
    }),
  ]);

  assert.deepEqual(report.criteriaNames, ["Communication", "Q1", "Q2", "Problem Solving"]);
  assert.equal(report.questionLabels.Q1, "Tell me about yourself");
  // b (avg 9) outranks a (avg 6.5)
  assert.equal(report.rows[0].criteria["Q1"], 9);
  assert.equal(report.rows[1].criteria["Q1"], 7);
  // Candidate a has no score for b's Q2 slot missing — must not invent a score
  assert.equal(report.rows[0].criteria["Q2"], undefined);
});

test("drops follow-up evaluation entries stored as extra questions", () => {
  const questions = [{ text: "What is REST?" }, { text: "Explain indexes." }];
  const report = buildReportRows(
    "T",
    [
      entry({
        session: {
          id: "s",
          status: "COMPLETED",
          insights: {
            questionEvaluations: [
              { question: "Q1: What is REST?", score: 8 },
              { question: "Q1 follow-up: why stateless?", score: 9 },
              { question: "Q2: Explain indexes.", score: 5 },
            ],
          },
        },
      }),
    ],
    questions,
  );

  // The follow-up entry must not become a phantom Q3 column.
  assert.deepEqual(report.criteriaNames, ["Q1", "Q2"]);
  assert.equal(report.rows[0].criteria["Q1"], 8);
  assert.equal(report.rows[0].criteria["Q2"], 5);
  // (8+5)/2 = 6.5 — the follow-up 9 must not inflate the score.
  assert.equal(report.rows[0].overallScore, 6.5);
});

test("ignores malformed insights and falls back to participant names", () => {
  const report = buildReportRows("T", [
    entry({
      name: null,
      session: {
        id: "x",
        status: "IN_PROGRESS",
        insights: "corrupted",
        participantName: null,
        participantEmail: "p@example.com",
        completedAt: "2026-01-02T00:00:00Z",
      },
    }),
  ]);

  assert.deepEqual(report.criteriaNames, []);
  assert.equal(report.rows[0].name, "p@example.com");
  assert.equal(report.rows[0].overallScore, null);
});

test("walk-in entries without a session row are skipped; invited roster rows are kept", () => {
  const report = buildReportRows("T", [
    entry({ name: "Ghost", source: "Walk-in", session: null }),
    entry({ name: "Roster", source: "Invited", session: null }),
  ]);
  // Only the invited roster entry stays visible.
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].name, "Roster");
  assert.equal(report.rows[0].status, "NOT_STARTED");
});

test("ties on score break by most recent completion date", () => {
  const mk = (id: string, completedAt: string | null) =>
    entry({
      session: {
        id,
        status: "COMPLETED",
        completedAt,
        insights: { questionEvaluations: [{ question: "a", score: 7 }] },
      },
    });
  const report = buildReportRows("T", [
    mk("older", "2026-01-01T00:00:00Z"),
    mk("newer", "2026-06-01T00:00:00Z"),
    mk("never", null),
  ]);
  assert.deepEqual(
    report.rows.map((r) => r.sessionId),
    ["newer", "older", "never"],
  );
});

test("summary falls back from the column to insights when the column is empty", () => {
  const report = buildReportRows("T", [
    entry({
      session: {
        id: "s",
        status: "COMPLETED",
        summary: null,
        insights: {
          summary: "Strong candidate",
          questionEvaluations: [{ question: "a", score: 7 }],
        },
      },
    }),
  ]);
  assert.equal(report.rows[0].summary, "Strong candidate");
});

test("canonicalizeInsights passes through when there is nothing to rebuild", () => {
  const corrupted = "not-an-object";
  // No canonical questions → passthrough untouched.
  assert.equal(canonicalizeInsights(corrupted, []), corrupted);
  // Empty evaluations → nothing to rebuild.
  const empty = { questionEvaluations: [] };
  assert.equal(canonicalizeInsights(empty, [{ text: "q" }]), empty);
});
