import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSurveyAggregate,
  filterScoreReadyEntries,
  type ReportEntry,
} from "../src/lib/interview-report";

const QUESTIONS = [{ text: "Q1" }, { text: "Q2" }];

const READY_INSIGHTS = {
  questionEvaluations: [
    { question: "Q1", score: 8 },
    { question: "Q2", score: 6 },
  ],
};

function entry(
  overrides: { id?: string; status?: string; insights?: unknown } = {},
): ReportEntry {
  return {
    name: "Candidate",
    email: null,
    source: "Walk-in",
    session: {
      id: overrides.id ?? "s1",
      status: overrides.status ?? "COMPLETED",
      insights: overrides.insights ?? READY_INSIGHTS,
      summary: "summary",
      participantName: "Candidate",
      participantEmail: null,
      completedAt: "2026-11-05T00:00:00Z",
      messages: null,
    },
  };
}

describe("filterScoreReadyEntries", () => {
  it("keeps COMPLETED scored sessions for AI-judged kinds", () => {
    const entries = [entry({ id: "a" }), entry({ id: "b" })];
    for (const kind of ["INTERVIEW", "ASSESSMENT"]) {
      assert.deepEqual(
        filterScoreReadyEntries(entries, kind, { questions: QUESTIONS }).map(
          (e) => e.session?.id,
        ),
        ["a", "b"],
        kind,
      );
    }
  });

  it("hides sessions whose score is not ready yet (no evaluations)", () => {
    const entries = [
      entry({ id: "unscored", insights: {} }),
      entry({ id: "ready" }),
    ];
    assert.deepEqual(
      filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS }).map(
        (e) => e.session?.id,
      ),
      ["ready"],
    );
  });

  it("hides sessions with pendingGrading evaluations", () => {
    const entries = [
      entry({
        id: "pending",
        insights: {
          questionEvaluations: [
            { question: "Q1", score: 8 },
            { question: "Q2" },
          ],
        },
      }),
    ];
    assert.deepEqual(
      filterScoreReadyEntries(entries, "INTERVIEW", {
        questions: [{ text: "Q1" }, { text: "Q2", id: "q2" }],
        // Q2 has a stored candidate answer but no AI grade yet — the entry
        // becomes a pendingGrading marker, which blocks the overall score.
        answeredBySession: new Map([["pending", new Set(["q2"])]]),
      }),
      [],
    );
  });

  it("hides sessions that are still running", () => {
    const entries = [entry({ id: "running", status: "IN_PROGRESS" })];
    assert.deepEqual(
      filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS }),
      [],
    );
  });

  it("treats a zero score as ready (unanswered questions score 0)", () => {
    const entries = [
      entry({
        id: "zero",
        insights: {
          questionEvaluations: [
            { question: "Q1", score: 0 },
            { question: "Q2", score: 0 },
          ],
        },
      }),
    ];
    assert.equal(
      filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS }).length,
      1,
    );
  });

  it("keeps invited candidates who never started", () => {
    const entries: ReportEntry[] = [
      { name: "Invited", email: null, source: "Invited", session: null },
    ];
    assert.equal(
      filterScoreReadyEntries(entries, "INTERVIEW", { questions: QUESTIONS }).length,
      1,
    );
  });

  it("leaves objective kinds untouched", () => {
    const entries = [
      entry({ id: "running", status: "IN_PROGRESS", insights: {} }),
      entry({ id: "done" }),
    ];
    for (const kind of ["SURVEY", "QUIZ", "FORM"]) {
      assert.equal(
        filterScoreReadyEntries(entries, kind, { questions: QUESTIONS }).length,
        entries.length,
        kind,
      );
    }
  });
});

describe("assessment aggregate honors the score-ready gate", () => {
  it("respondentCount counts only score-ready sessions", () => {
    const visible = filterScoreReadyEntries(
      [entry({ id: "ready" }), entry({ id: "unscored", insights: {} })],
      "ASSESSMENT",
      { questions: QUESTIONS },
    );
    const aggregate = buildSurveyAggregate(visible, []);
    assert.equal(aggregate.respondentCount, 1);
  });
});
