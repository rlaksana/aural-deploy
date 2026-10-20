import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReportRows,
  buildSurveyAggregate,
  filterFinalForAiKinds,
  type ReportEntry,
} from "../src/lib/interview-report";

function entry(
  overrides: Partial<ReportEntry> & { id?: string; reportStatus?: string | null },
): ReportEntry {
  return {
    name: "Candidate",
    email: null,
    source: "Walk-in",
    session: {
      id: overrides.id ?? "s1",
      status: "COMPLETED",
      insights: {},
      summary: "summary",
      participantName: "Candidate",
      participantEmail: null,
      completedAt: "2026-10-20T00:00:00Z",
      reportStatus: overrides.reportStatus ?? null,
      messages: null,
    },
    ...overrides,
  };
}

describe("filterFinalForAiKinds", () => {
  const entries: ReportEntry[] = [
    entry({ id: "final", reportStatus: "FINAL" }),
    entry({ id: "draft", reportStatus: "DRAFT" }),
    entry({ id: "legacy", reportStatus: null }),
    {
      name: "Invited",
      email: null,
      source: "Invited",
      session: null,
    },
  ];

  it("hides DRAFT sessions for AI-judged kinds", () => {
    for (const kind of ["INTERVIEW", "ASSESSMENT"]) {
      const kept = filterFinalForAiKinds(entries, kind).map(
        (e) => e.session?.id ?? "none",
      );
      assert.deepEqual(kept, ["final", "legacy", "none"], kind);
    }
  });

  it("leaves objective kinds untouched", () => {
    for (const kind of ["SURVEY", "QUIZ", "FORM"]) {
      assert.equal(filterFinalForAiKinds(entries, kind).length, entries.length, kind);
    }
  });
});

describe("buildReportRows reportStatus", () => {
  it("carries the session's status onto the row", () => {
    const report = buildReportRows("T", [entry({ id: "s1", reportStatus: "DRAFT" })]);
    assert.equal(report.rows[0].reportStatus, "DRAFT");
  });

  it("invited roster rows have null status", () => {
    const report = buildReportRows("T", [
      { name: "Invited", email: null, source: "Invited", session: null },
    ]);
    assert.equal(report.rows[0].reportStatus, null);
  });
});

describe("assessment aggregate honors the finalize gate", () => {
  it("respondentCount excludes DRAFT sessions", () => {
    const visible = filterFinalForAiKinds(
      [entry({ id: "final", reportStatus: "FINAL" }), entry({ id: "draft", reportStatus: "DRAFT" })],
      "ASSESSMENT",
    );
    const aggregate = buildSurveyAggregate(visible, []);
    assert.equal(aggregate.respondentCount, 1);
  });
});
