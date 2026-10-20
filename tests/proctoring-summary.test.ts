import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  summarizeLog,
  TAB_SWITCH_FLAG_THRESHOLD,
} from "../src/lib/proctoring-summary";

describe("summarizeLog", () => {
  it("handles missing or malformed logs", () => {
    assert.equal(summarizeLog(undefined).total, 0);
    assert.equal(summarizeLog("junk").total, 0);
    assert.equal(summarizeLog([{ garbage: true }]).total, 0);
  });

  it("counts violations by type", () => {
    const s = summarizeLog([
      { type: "tab_switch", timestamp: 1 },
      { type: "tab_switch", timestamp: 2 },
      { type: "copy", timestamp: 3, snapshotPath: "s/1.jpg" },
    ]);
    assert.deepEqual(s.counts, { tab_switch: 2, copy: 1 });
    assert.equal(s.total, 3);
    assert.equal(s.flagged, false); // 2 < threshold 3
    assert.equal(s.snapshots.length, 1);
    assert.equal(s.snapshots[0].snapshotPath, "s/1.jpg");
  });

  it("flags at three or more tab switches (informational only)", () => {
    const log = Array.from({ length: TAB_SWITCH_FLAG_THRESHOLD }, (_, i) => ({
      type: "tab_switch",
      timestamp: i,
    }));
    assert.equal(summarizeLog(log).flagged, true);
    assert.equal(
      summarizeLog(log.slice(0, -1)).flagged,
      false,
      "below threshold is not flagged",
    );
  });
});
