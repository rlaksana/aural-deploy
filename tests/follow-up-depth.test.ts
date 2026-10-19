import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FOLLOW_UP_DEPTH,
  maxFollowUpsForDepth,
  normalizeFollowUpDepth,
} from "../src/lib/follow-up-depth";

test("follow-up budgets match the depth contract shown to creators", () => {
  assert.equal(maxFollowUpsForDepth("LIGHT"), 0);
  assert.equal(maxFollowUpsForDepth("MODERATE"), 2);
  assert.equal(maxFollowUpsForDepth("DEEP"), 5);
});

test("RESEARCH questions get the larger budget per depth", () => {
  assert.equal(maxFollowUpsForDepth("LIGHT", "RESEARCH"), 2);
  assert.equal(maxFollowUpsForDepth("MODERATE", "RESEARCH"), 4);
  assert.equal(maxFollowUpsForDepth("DEEP", "RESEARCH"), 8);
  // Non-research types never get the research budget.
  assert.equal(maxFollowUpsForDepth("DEEP", "OPEN_ENDED"), 5);
  assert.equal(maxFollowUpsForDepth("DEEP", "CODING"), 5);
});

test("unknown depth values fall back to the column default (MODERATE)", () => {
  assert.equal(normalizeFollowUpDepth(null), DEFAULT_FOLLOW_UP_DEPTH);
  assert.equal(normalizeFollowUpDepth(undefined), DEFAULT_FOLLOW_UP_DEPTH);
  assert.equal(normalizeFollowUpDepth("nonsense"), DEFAULT_FOLLOW_UP_DEPTH);
  // Case-insensitive and whitespace tolerant.
  assert.equal(normalizeFollowUpDepth(" deep "), "DEEP");
  assert.equal(maxFollowUpsForDepth("light"), 0);
});
