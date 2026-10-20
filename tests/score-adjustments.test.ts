import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyScoreAdjustments,
  getScoreAdjustments,
  getSessionOverallScore,
  hasScoreAdjustments,
} from "../src/lib/session-score";

const base = {
  questionEvaluations: [{ score: 10 }, { score: 0 }],
  criteriaEvaluations: [
    { name: "Communication", score: 8 },
    { name: "Depth", score: 4 },
  ],
};

describe("getScoreAdjustments / hasScoreAdjustments", () => {
  it("returns null and false when adjustments are missing or empty", () => {
    assert.equal(getScoreAdjustments(undefined), null);
    assert.equal(getScoreAdjustments({}), null);
    assert.deepEqual(getScoreAdjustments({ adjustments: {} }), {}); // present but inert
    assert.equal(hasScoreAdjustments({ adjustments: {} }), false);
  });

  it("detects an active adjustment", () => {
    assert.equal(hasScoreAdjustments({ adjustments: { overallScore: 7 } }), true);
    assert.equal(hasScoreAdjustments({ adjustments: { criteriaScores: { X: 5 } } }), true);
    assert.equal(hasScoreAdjustments({ adjustments: { note: "reason" } }), true);
  });
});

describe("applyScoreAdjustments", () => {
  it("is identity when there is nothing to apply", () => {
    assert.equal(applyScoreAdjustments(null), null);
    const withEmpty = { ...base, adjustments: {} };
    assert.equal(applyScoreAdjustments(withEmpty), withEmpty);
  });

  it("does not mutate its input", () => {
    const input = { ...base, adjustments: { criteriaScores: { Depth: 9 } } };
    applyScoreAdjustments(input);
    assert.equal((input.criteriaEvaluations as { score: number }[])[1].score, 4);
  });

  it("replaces matching criteria scores and keeps the rest", () => {
    const out = applyScoreAdjustments({
      ...base,
      adjustments: { criteriaScores: { Depth: 9, Unknown: 1 } },
    });
    assert.equal(out.criteriaEvaluations[1].score, 9);
    assert.equal(out.criteriaEvaluations[0].score, 8);
    assert.equal(out.adjustments?.criteriaScores.Depth, 9);
  });
});

describe("getSessionOverallScore with adjustments", () => {
  it("overallScore override wins over every computed path", () => {
    const score = getSessionOverallScore(
      { ...base, adjustments: { overallScore: 6.5, criteriaScores: { Depth: 9 } } },
      2,
      { Communication: 2 },
    );
    assert.equal(score, 6.5);
  });

  it("per-criteria overrides feed the legacy question fallback", () => {
    // criteria average fallback: (8 + 9) / 2 = 8.5 (no questionEvaluations)
    const score = getSessionOverallScore({
      criteriaEvaluations: base.criteriaEvaluations,
      adjustments: { criteriaScores: { Depth: 9 } },
    });
    assert.equal(score, 8.5);
  });

  it("per-criteria overrides feed the weighted path", () => {
    // (8*3 + 9*1) / 4 = 8.25
    const score = getSessionOverallScore(
      { ...base, adjustments: { criteriaScores: { Depth: 9 } } },
      2,
      { Communication: 3, Depth: 1 },
    );
    assert.ok(Math.abs(score! - 8.25) < 1e-9);
  });

  it("without adjustments the score is unchanged", () => {
    assert.equal(getSessionOverallScore(base, 2), 5);
  });
});
