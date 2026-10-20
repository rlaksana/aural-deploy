import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCriteriaWeights,
  getSessionOverallScore,
} from "../src/lib/session-score";

describe("buildCriteriaWeights", () => {
  it("returns undefined when criteria are missing or not an array", () => {
    assert.equal(buildCriteriaWeights(undefined), undefined);
    assert.equal(buildCriteriaWeights(null), undefined);
    assert.equal(buildCriteriaWeights("nope"), undefined);
  });

  it("returns undefined when every weight is 1 or absent (legacy math)", () => {
    assert.equal(
      buildCriteriaWeights([
        { name: "Communication" },
        { name: "Depth", weight: 1 },
      ]),
      undefined,
    );
    assert.equal(buildCriteriaWeights([]), undefined);
  });

  it("returns a name->weight map when any weight differs from 1", () => {
    assert.deepEqual(
      buildCriteriaWeights([
        { name: "Communication", weight: 2 },
        { name: "Depth" },
        { name: null, weight: 5 }, // invalid entry skipped
        { name: "Grit", weight: 0 }, // non-positive treated as 1
      ]),
      { Communication: 2, Depth: 1, Grit: 1 },
    );
  });
});

describe("getSessionOverallScore with criteria weights", () => {
  const insights = {
    questionEvaluations: [{ score: 10 }, { score: 0 }],
    criteriaEvaluations: [
      { name: "Communication", score: 8 },
      { name: "Depth", score: 4 },
    ],
  };

  it("all-unit weights keep the legacy question average", () => {
    // (10 + 0) / 2 = 5
    assert.equal(getSessionOverallScore(insights, 2), 5);
  });

  it("weighted criteria average replaces the question average", () => {
    // (8*2 + 4*1) / 3 = 6.666...
    const score = getSessionOverallScore(insights, 2, {
      Communication: 2,
      Depth: 1,
    });
    assert.ok(Math.abs(score! - 20 / 3) < 1e-9);
  });

  it("criteria absent from the weight map default to weight 1", () => {
    const score = getSessionOverallScore(insights, 2, { Communication: 3 });
    // (8*3 + 4*1) / 4 = 7
    assert.equal(score, 7);
  });

  it("falls back to the legacy path when criteriaEvaluations are absent", () => {
    const noCriteria = { questionEvaluations: [{ score: 10 }, { score: 0 }] };
    assert.equal(getSessionOverallScore(noCriteria, 2, { Communication: 3 }), 5);
  });

  it("returns null when weights are active but no criteria carry scores", () => {
    const score = getSessionOverallScore(
      {
        criteriaEvaluations: [{ name: "X" }],
      } as unknown as Parameters<typeof getSessionOverallScore>[0],
      undefined,
      { X: 2 },
    );
    // weighted average is null -> falls through to legacy paths -> null
    assert.equal(score, null);
  });
});
