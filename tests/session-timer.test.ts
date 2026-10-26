import assert from "node:assert/strict";
import { test } from "node:test";

import { countDepartures } from "../src/components/session/anti-cheating-banner";
import { remainingSecondsFromAnchor } from "../src/lib/session-timer";

test("remainingSecondsFromAnchor: fresh start gets the full duration", () => {
  assert.equal(remainingSecondsFromAnchor(null, 30), 1800);
  assert.equal(remainingSecondsFromAnchor(0, 30), 1800);
  assert.equal(remainingSecondsFromAnchor(Number.NaN, 30), 1800);
});

test("remainingSecondsFromAnchor: resume continues from the anchor", () => {
  const now = 1_800_000_000_000; // realistic epoch ms
  const anchor = now - 5 * 60 * 1000; // 5 minutes elapsed
  assert.equal(remainingSecondsFromAnchor(anchor, 30, now), 25 * 60);
});

test("remainingSecondsFromAnchor: expired clamps to 0", () => {
  const now = 1_800_000_000_000;
  const anchor = now - 45 * 60 * 1000; // longer than the 30-minute limit
  assert.equal(remainingSecondsFromAnchor(anchor, 30, now), 0);
});

test("countDepartures counts persisted departure-type entries only", () => {
  assert.equal(countDepartures(null), 0);
  assert.equal(countDepartures("x"), 0);
  assert.equal(
    countDepartures([
      { type: "page_departure", timestamp: 1 },
      { type: "tab_switch", timestamp: 2 },
      { type: "focus_lost", timestamp: 3 },
      { type: "paste", timestamp: 4 },
      { type: "copy", timestamp: 5 },
      "garbage",
      null,
    ]),
    3,
  );
});
