import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapProctoringViolation } from "../src/hooks/use-anti-cheating";

describe("mapProctoringViolation", () => {
  it("classifies visibility-hidden as tab_switch", () => {
    assert.deepEqual(mapProctoringViolation("visibility_hidden", 1000), {
      type: "tab_switch",
      timestamp: 1000,
    });
  });

  it("classifies blur-expiry as focus_lost", () => {
    assert.deepEqual(mapProctoringViolation("blur_expired", 2000), {
      type: "focus_lost",
      timestamp: 2000,
    });
  });

  it("passes copy and cut through with their own types", () => {
    assert.deepEqual(mapProctoringViolation("copy", 3000), {
      type: "copy",
      timestamp: 3000,
    });
    assert.deepEqual(mapProctoringViolation("cut", 4000), {
      type: "cut",
      timestamp: 4000,
    });
  });

  it("returns null for unknown events", () => {
    assert.equal(mapProctoringViolation("bogus" as never, 5000), null);
  });
});
