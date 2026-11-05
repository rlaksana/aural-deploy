import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { fakeDb } from "./helpers";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ApiKeyMod = typeof import("../src/server/routers/apikey");
let apiKeyRouter: ApiKeyMod["apiKeyRouter"];

before(async () => {
  const mod = await import("../src/server/routers/apikey");
  apiKeyRouter = mod.apiKeyRouter;
});

function caller(dbTables: Record<string, any[]>, userId = "u-owner") {
  const db = fakeDb(dbTables);
  const call = apiKeyRouter.createCaller({ user: { id: userId } as any, supabase: db.client });
  return { db, call };
}

test("create returns the raw dlv_ key exactly once and stores only its SHA-256", async () => {
  const { db, call } = caller({ api_keys: [] });
  const out = await call.create({ name: "CI" });

  assert.match(out.key, /^dlv_[A-Za-z0-9_-]{32}$/);
  const row = db.tables.api_keys[0];
  assert.equal(row.key, createHash("sha256").update(out.key).digest("hex"), "only the hash is stored");
  assert.notEqual(row.key, out.key);
  assert.equal(row.keyPrefix, out.key.slice(0, 12));
  assert.equal(row.userId, "u-owner");
  assert.equal(row.name, "CI");
  assert.equal(row.expiresAt, null);
  assert.equal(db.tables.api_keys.length, 1);
});

test("create stores an expiry when given", async () => {
  const { db, call } = caller({ api_keys: [] });
  await call.create({ name: "Temp", expiresAt: "2027-01-01T00:00:00.000Z" });
  assert.equal(db.tables.api_keys[0].expiresAt, "2027-01-01T00:00:00.000Z");
});

test("list is self-scoped and exposes only the display prefix", async () => {
  const { call } = caller({
    api_keys: [
      { id: "k1", userId: "u-owner", name: "mine", keyPrefix: "dlv_abcdefghij", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-01T00:00:00Z" },
      { id: "k2", userId: "u-someone-else", name: "theirs", keyPrefix: "dlv_zzzzzzzzzz", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-02T00:00:00Z" },
    ],
  });
  const rows = await call.list();
  assert.deepEqual(rows.map((r: any) => r.id), ["k1"], "another user's keys are invisible");
  assert.equal(rows[0].key, "dlv_abcdefghij", "the legacy key field carries the prefix only");
  assert.ok(!JSON.stringify(rows).includes("dlv_zzzz"));
});

test("revoke is self-scoped: another user's key is NOT_FOUND", async () => {
  const { db, call } = caller({
    api_keys: [{ id: "k2", userId: "u-someone-else", name: "theirs", keyPrefix: "dlv_x", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-01T00:00:00Z" }],
  }, "u-attacker");
  await assert.rejects(
    call.revoke({ id: "k2" }),
    (e: { code: string }) => e.code === "NOT_FOUND",
  );
  assert.equal(db.tables.api_keys[0].isActive, true, "untouched");
});

test("revoke deactivates the owner's key without deleting it", async () => {
  const { db, call } = caller({
    api_keys: [{ id: "k1", userId: "u-owner", name: "mine", keyPrefix: "dlv_x", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-01T00:00:00Z" }],
  });
  const out = await call.revoke({ id: "k1" });
  assert.deepEqual(out, { success: true });
  assert.equal(db.tables.api_keys[0].isActive, false);
  assert.equal(db.tables.api_keys.length, 1, "revoke keeps the row");
});

test("delete removes only the owner's own key row", async () => {
  const { db, call } = caller({
    api_keys: [
      { id: "k1", userId: "u-owner", name: "mine", keyPrefix: "dlv_x", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-01T00:00:00Z" },
      { id: "k2", userId: "u-someone-else", name: "theirs", keyPrefix: "dlv_y", isActive: true, lastUsedAt: null, expiresAt: null, createdAt: "2026-11-01T00:00:00Z" },
    ],
  });
  await call.delete({ id: "k1" });
  assert.deepEqual(db.tables.api_keys.map((r: any) => r.id), ["k2"]);
});

test("a revoked key can be re-created under a fresh raw secret", async () => {
  const { db, call } = caller({ api_keys: [] });
  const first = await call.create({ name: "CI" });
  // The fake DB does not synthesize ids (Postgres does) — stamp one to revoke.
  db.tables.api_keys[0].id = "k1";
  await call.revoke({ id: "k1" });
  const second = await call.create({ name: "CI" });
  assert.notEqual(first.key, second.key, "each create mints a new secret");
  assert.equal(db.tables.api_keys.length, 2);
  assert.equal(db.tables.api_keys[0].isActive, false);
  assert.notEqual(db.tables.api_keys[1].isActive, false, "the fresh key is not revoked");
});
