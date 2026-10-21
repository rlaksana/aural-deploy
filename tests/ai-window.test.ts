import assert from "node:assert/strict";
import test from "node:test";

import { aiWindowStatus } from "../src/lib/ai/ai-window";

/** Build a UTC Date from WIB wall-clock parts. */
function wib(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 9, 21, hour - 7, minute, 0, 0));
}

const HOUR_MS = 3_600_000;

test("window is open 17:00–23:59 WIB", () => {
  assert.equal(aiWindowStatus(wib(17)).open, true);
  assert.equal(aiWindowStatus(wib(20, 30)).open, true);
  assert.equal(aiWindowStatus(wib(23, 59)).open, true);
});

test("window is open 00:00–06:59 WIB", () => {
  assert.equal(aiWindowStatus(wib(0)).open, true);
  assert.equal(aiWindowStatus(wib(3, 15)).open, true);
  assert.equal(aiWindowStatus(wib(6, 59)).open, true);
});

test("window is closed 07:00–16:59 WIB", () => {
  assert.equal(aiWindowStatus(wib(7)).open, false);
  assert.equal(aiWindowStatus(wib(10)).open, false);
  assert.equal(aiWindowStatus(wib(12, 34)).open, false);
  assert.equal(aiWindowStatus(wib(16, 59)).open, false);
});

test("boundary edges: 17:00 opens, 07:00 closes", () => {
  assert.equal(aiWindowStatus(wib(16, 59, )).open, false);
  assert.equal(aiWindowStatus(wib(17, 0)).open, true);
  assert.equal(aiWindowStatus(wib(6, 59)).open, true);
  assert.equal(aiWindowStatus(wib(7, 0)).open, false);
});

test("msUntilBoundary counts down to 07:00 WIB while open", () => {
  const status = aiWindowStatus(wib(22, 0));
  assert.equal(status.open, true);
  // 22:00 → 07:00 next day = 9 hours
  assert.equal(status.msUntilBoundary, 9 * HOUR_MS);
  assert.equal(new Date(status.nextBoundaryAt).toISOString(), new Date(Date.UTC(2026, 9, 22, 0, 0)).toISOString());
});

test("msUntilBoundary counts down to 17:00 WIB while closed", () => {
  const status = aiWindowStatus(wib(10, 0));
  assert.equal(status.open, false);
  assert.equal(status.msUntilBoundary, 7 * HOUR_MS);
});

test("AI_WINDOW_OVERRIDE forces open/closed for verification", () => {
  const previous = process.env.AI_WINDOW_OVERRIDE;
  try {
    process.env.AI_WINDOW_OVERRIDE = "closed";
    assert.equal(aiWindowStatus(wib(20)).open, false);
    process.env.AI_WINDOW_OVERRIDE = "open";
    assert.equal(aiWindowStatus(wib(10)).open, true);
  } finally {
    if (previous === undefined) delete process.env.AI_WINDOW_OVERRIDE;
    else process.env.AI_WINDOW_OVERRIDE = previous;
  }
});
