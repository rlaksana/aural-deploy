import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PSYCHOMETRIC_BANKS } from "../src/lib/psychometric/banks";
import {
  scorePsychometric,
  selectionsFromAnswers,
} from "../src/lib/psychometric/scoring";

describe("selectionsFromAnswers", () => {
  const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }];

  it("aligns answers to questions positionally by questionId", () => {
    const selections = selectionsFromAnswers(questions, [
      { questionId: "q2", content: "C" }, // index 2
      { questionId: "q1", content: "A" }, // index 0
    ]);
    assert.deepEqual(selections, [[0], [2], null]);
  });

  it("missing or non-choice answers come back null", () => {
    const selections = selectionsFromAnswers(questions, [
      { questionId: "q1", content: "" },
      { questionId: "q3", content: "free text, no letters" },
    ]);
    assert.deepEqual(selections, [null, null, null]);
  });

  it("null questionId rows are ignored", () => {
    const selections = selectionsFromAnswers(questions, [
      { questionId: null, content: "A" },
      { questionId: "q1", content: "B" },
    ]);
    assert.deepEqual(selections, [[1], null, null]);
  });
});

describe("psychometric completion payload", () => {
  it("scores a full DISC answer set into criteria at the 0-10 report scale", () => {
    const bank = PSYCHOMETRIC_BANKS.DISC;
    const questions = bank.items.map((_, i) => ({ id: `q${i}` }));
    const answers = bank.items.map((item, i) => ({
      questionId: `q${i}`,
      content: item.reverse ? "A" : "E", // endorse the trait
    }));
    const result = scorePsychometric(bank, selectionsFromAnswers(questions, answers));
    assert.equal(Object.keys(result.criteriaEvaluations).length, 4);
    for (const c of result.criteriaEvaluations) {
      assert.equal(c.score, 10);
    }
    assert.match(result.summary, /not a clinical assessment/);
  });
});
