import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PSYCHOMETRIC_BANKS,
  getPsychometricBank,
} from "../src/lib/psychometric/banks";
import { bandFor, scorePsychometric } from "../src/lib/psychometric/scoring";

describe("psychometric banks", () => {
  it("cover every declared dimension with items and valid options", () => {
    for (const bank of Object.values(PSYCHOMETRIC_BANKS)) {
      const keys = new Set(bank.dimensions.map((d) => d.key));
      for (const item of bank.items) {
        assert.ok(keys.has(item.dimension), `${bank.id}: unknown dim ${item.dimension}`);
        assert.ok(item.options.length >= 2, `${bank.id}: item needs 2+ options`);
      }
      for (const dim of bank.dimensions) {
        const count = bank.items.filter((i) => i.dimension === dim.key).length;
        assert.ok(count > 0, `${bank.id}: dimension ${dim.key} has no items`);
      }
    }
  });

  it("keyed banks have a correctIndex in range; likert banks do not", () => {
    for (const item of PSYCHOMETRIC_BANKS.REASONING.items) {
      assert.ok(
        typeof item.correctIndex === "number" &&
          item.correctIndex >= 0 &&
          item.correctIndex < item.options.length,
        `keyed item missing valid key: ${item.text}`,
      );
    }
    for (const bank of [PSYCHOMETRIC_BANKS.BIG_FIVE, PSYCHOMETRIC_BANKS.DISC]) {
      for (const item of bank.items) {
        assert.equal(item.correctIndex, undefined);
      }
    }
  });

  it("getPsychometricBank resolves known ids and rejects junk", () => {
    assert.equal(getPsychometricBank("DISC")?.id, "DISC");
    assert.equal(getPsychometricBank("nope"), null);
    assert.equal(getPsychometricBank(undefined), null);
  });
});

describe("scorePsychometric", () => {
  it("all-strong Likert answers map to 100 / High", () => {
    const bank = PSYCHOMETRIC_BANKS.BIG_FIVE;
    const selections = bank.items.map((item) =>
      item.reverse ? [0] : [4],
    );
    const result = scorePsychometric(bank, selections);
    for (const dim of bank.dimensions) {
      assert.equal(result.dimensionScores[dim.key], 100);
      assert.equal(result.bands[dim.key], "High");
      assert.equal(result.criteriaEvaluations.find((c) => c.name === dim.label)?.score, 10);
    }
  });

  it("reverse items invert the score", () => {
    const bank = PSYCHOMETRIC_BANKS.BIG_FIVE;
    const reverseItem = bank.items.find((i) => i.reverse)!;
    const dimKey = reverseItem.dimension;
    // Endorse every trait item; "Strongly disagree" on the reverse-worded
    // one also endorses the trait → OPENNESS = 100.
    const selections = bank.items.map((item) => {
      if (item.dimension !== dimKey) return null;
      return item.text === reverseItem.text ? [0] : [4];
    });
    assert.equal(scorePsychometric(bank, selections).dimensionScores[dimKey], 100);
    // "Strongly agree" on the reverse item rejects the trait (likert 1 → 2/10);
    // the other five items still score 10 → (2 + 50) / 6 = 86.7.
    const selectionsAgree = bank.items.map((item) => {
      if (item.dimension !== dimKey) return null;
      return item.text === reverseItem.text ? [4] : [4];
    });
    const score = scorePsychometric(bank, selectionsAgree).dimensionScores[dimKey];
    assert.ok(Math.abs(score - 86.7) < 0.05, `expected ~86.7, got ${score}`);
  });

  it("DISC produces four dimensions on the 0-100 scale", () => {
    const bank = PSYCHOMETRIC_BANKS.DISC;
    const result = scorePsychometric(bank, bank.items.map(() => [2])); // neutral
    assert.equal(Object.keys(result.dimensionScores).length, 4);
    for (const v of Object.values(result.dimensionScores)) {
      assert.equal(v, 60); // likert 3/5 → 60%
      assert.equal(result.bands[Object.keys(result.dimensionScores).find((k) => result.dimensionScores[k] === v)!], "Moderate");
    }
  });

  it("keyed reasoning items score correct/incorrect all-or-nothing", () => {
    const bank = PSYCHOMETRIC_BANKS.REASONING;
    const selections = bank.items.map((item, i) =>
      i % 2 === 0 ? [item.correctIndex!] : [(item.correctIndex! + 1) % item.options.length],
    );
    const result = scorePsychometric(bank, selections);
    const numerical = result.dimensionScores.NUMERICAL;
    // 5 items, alternating correct: 3 of 5 → 60
    assert.equal(numerical, 60);
    assert.equal(result.bands.NUMERICAL, "Average");
    assert.equal(result.questionEvaluations[0].score, 10);
    assert.equal(result.questionEvaluations[1].score, 0);
  });

  it("unanswered items score 0 and still count toward the dimension", () => {
    const bank = PSYCHOMETRIC_BANKS.REASONING;
    const result = scorePsychometric(bank, [null, null, null, null, null, ...Array(10).fill([0])]);
    assert.equal(result.dimensionScores.NUMERICAL, 0);
    assert.equal(result.questionEvaluations[0].evaluation, "Not answered");
  });

  it("bandFor cuts match the documented rule", () => {
    assert.equal(bandFor(true, 100), "Strong");
    assert.equal(bandFor(true, 75), "Strong");
    assert.equal(bandFor(true, 74.9), "Average");
    assert.equal(bandFor(true, 50), "Average");
    assert.equal(bandFor(true, 49.9), "Below average");
    assert.equal(bandFor(false, 65), "High");
    assert.equal(bandFor(false, 64.9), "Moderate");
    assert.equal(bandFor(false, 35), "Moderate");
    assert.equal(bandFor(false, 34.9), "Low");
  });
});
