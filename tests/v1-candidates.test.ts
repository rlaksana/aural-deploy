import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { fakeDb, withAdminPatches, type FakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
// The route captures APP_BASE at module import time — set before the import.
process.env.NEXT_PUBLIC_APP_URL ??= "https://cb.example.test";

/* eslint-disable @typescript-eslint/no-explicit-any */

type CandidatesMod = typeof import("../src/app/api/v1/interviews/[id]/candidates/route");
let candidatesGet: CandidatesMod["GET"];
let candidatesPost: CandidatesMod["POST"];

before(async () => {
  const mod = await import("../src/app/api/v1/interviews/[id]/candidates/route");
  candidatesGet = mod.GET;
  candidatesPost = mod.POST;
});

const RAW = "dlv_v1_candidates_probe";

/** Org fixtures: key user may access interview i1 via project p1. */
function candidateTables(
  interviews: Record<string, unknown>[],
  candidates: Record<string, unknown>[] = [],
) {
  return {
    api_keys: [
      { key: createHash("sha256").update(RAW).digest("hex"), userId: "u-key", isActive: true, expiresAt: null },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-key" }],
    projects: [{ id: "p1", organizationId: "org1" }],
    project_members: [{ projectId: "p1", userId: "u-key" }],
    interviews,
    candidates,
  };
}

function v1Req(body?: string) {
  return new Request("https://cb.example.test/v1", {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body }),
    headers: {
      authorization: `Bearer ${RAW}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
}

function run<T>(db: FakeDb, fn: () => Promise<T>) {
  return withAdminPatches({ from: db.client.from }, fn);
}

const STATUS = async (res: unknown) => (res as Response).status;
const BODY = async (res: unknown) => (await (res as Response).json()) as any;

test("GET is NOT_FOUND for an unknown interview and FORBIDDEN for a foreign project", async () => {
  const dbMissing = fakeDb(candidateTables([]));
  const resMissing = await run(dbMissing, () =>
    candidatesGet(v1Req(), { params: Promise.resolve({ id: "ghost" }) }),
  );
  assert.equal(await STATUS(resMissing), 404);

  const dbForeign = fakeDb(candidateTables([{ id: "i1", projectId: "p-other" }]));
  const resForeign = await run(dbForeign, () =>
    candidatesGet(v1Req(), { params: Promise.resolve({ id: "i1" }) }),
  );
  assert.equal(await STATUS(resForeign), 403);
  assert.equal((await BODY(resForeign)).error.code, "FORBIDDEN");
});

test("POST is NOT_FOUND for an unknown interview", async () => {
  const db = fakeDb(candidateTables([]));
  const res = await run(db, () =>
    candidatesPost(v1Req(JSON.stringify([{ name: "Budi" }])), {
      params: Promise.resolve({ id: "ghost" }),
    }),
  );
  assert.equal(await STATUS(res), 404);
  assert.ok(!db.writes.some((w) => w.table === "candidates"));
});

test("POST rejects a broken JSON body, an empty array, oversized batches, and non-object items", async () => {
  const tables = candidateTables([{ id: "i1", projectId: "p1" }]);

  const badJson = await run(fakeDb(tables), () =>
    candidatesPost(v1Req("{oops"), { params: Promise.resolve({ id: "i1" }) }),
  );
  assert.equal(await STATUS(badJson), 400);
  assert.match((await BODY(badJson)).error.message, /Invalid JSON/);

  const empty = await run(fakeDb(tables), () =>
    candidatesPost(v1Req("[]"), { params: Promise.resolve({ id: "i1" }) }),
  );
  assert.equal(await STATUS(empty), 400);
  assert.match((await BODY(empty)).error.message, /At least one/);

  const oversized = Array.from({ length: 501 }, () => ({ name: "x" }));
  const tooMany = await run(fakeDb(tables), () =>
    candidatesPost(v1Req(JSON.stringify(oversized)), { params: Promise.resolve({ id: "i1" }) }),
  );
  assert.equal(await STATUS(tooMany), 400);
  assert.match((await BODY(tooMany)).error.message, /Maximum 500/);

  const nonObject = await run(fakeDb(tables), () =>
    candidatesPost(v1Req(JSON.stringify([{ name: "Budi" }, 42])), {
      params: Promise.resolve({ id: "i1" }),
    }),
  );
  assert.equal(await STATUS(nonObject), 400);
  assert.match((await BODY(nonObject)).error.message, /must be an object/);

  // No validation failure case may persist a candidate row.
  assert.deepEqual(tables.candidates, []);
});

test("POST normalizes names, emails, and nulls, then returns invite URLs", async () => {
  const db = fakeDb(candidateTables([{ id: "i1", projectId: "p1" }]));
  const res = await run(db, () =>
    candidatesPost(
      v1Req(
        JSON.stringify([
          { name: "  Budi Santoso  ", email: "  Budi@Example.COM ", phone: "  ", notes: null },
        ]),
      ),
      { params: Promise.resolve({ id: "i1" }) },
    ),
  );
  assert.equal(await STATUS(res), 200);

  const insert = db.writes.find((w) => w.op === "insert" && w.table === "candidates");
  assert.ok(insert, "candidate row inserted");
  const row = (insert!.payload as any[])[0];
  assert.equal(row.name, "Budi Santoso", "name is trimmed");
  assert.equal(row.email, "budi@example.com", "email is trimmed and lowercased");
  assert.equal(row.phone, null, "blank phone becomes null");
  assert.equal(row.notes, null);
  assert.equal(row.interviewId, "i1");
  assert.match(row.inviteToken, /^[a-z0-9]{12}$/);

  const body = await BODY(res);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].inviteUrl, `https://cb.example.test/invite/${row.inviteToken}`);
  assert.equal(db.tables.candidates.length, 1);
});

test("GET lists candidates newest-first for an accessible interview", async () => {
  const db = fakeDb(
    candidateTables([{ id: "i1", projectId: "p1" }], [
      { id: "c1", interviewId: "i1", name: "Lama", createdAt: "2026-11-01T00:00:00Z" },
      { id: "c2", interviewId: "i1", name: "Baru", createdAt: "2026-11-03T00:00:00Z" },
      { id: "c3", interviewId: "i2", name: "Kandidat wawancara lain", createdAt: "2026-11-04T00:00:00Z" },
    ]),
  );
  const res = await run(db, () =>
    candidatesGet(v1Req(), { params: Promise.resolve({ id: "i1" }) }),
  );
  assert.equal(await STATUS(res), 200);
  const body = await BODY(res);
  assert.deepEqual(body.data.map((c: any) => c.name), ["Baru", "Lama"], "createdAt descending");
  assert.ok(!JSON.stringify(body).includes("Kandidat wawancara lain"), "scoped to the interview");
});
