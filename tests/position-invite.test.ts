import assert from "node:assert/strict";
import test from "node:test";

import { assertSamePosition, buildInviteUrl } from "../src/lib/position-invite";

test("buildInviteUrl produces the canonical /i/invite/<token> shape", () => {
  assert.equal(
    buildInviteUrl("https://app.example.com", "tok123"),
    "https://app.example.com/i/invite/tok123",
  );
  assert.equal(
    buildInviteUrl("https://app.example.com/", "tok123"),
    "https://app.example.com/i/invite/tok123",
  );
});

test("assertSamePosition enforces the per-interview separation invariant", () => {
  assert.doesNotThrow(() => assertSamePosition("p1", "p1"));
  assert.throws(() => assertSamePosition("p1", "p2"), /not part of this position/);
  assert.throws(() => assertSamePosition("p1", null), /not part of this position/);
});
