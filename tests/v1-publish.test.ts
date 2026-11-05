import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { fakeDb, withAdminPatches, type FakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
// Trailing slash on purpose: the route must strip it before joining /i/<slug>.
process.env.NEXT_PUBLIC_APP_URL ??= "https://api.example.test/";

type PublishMod = typeof import("../src/app/api/v1/interviews/[id]/publish/route");
type DetailMod = typeof import("../src/app/api/v1/interviews/[id]/route");
let publishPost: PublishMod["POST"];
let detailGet: DetailMod["GET"];

before(async () => {
  publishPost = (await import("../src/app/api/v1/interviews/[id]/publish/route")).POST;
  detailGet = (await import("../src/app/api/v1/interviews/[id]/route")).GET;
});

const RAW = "dlv_v1_publish_probe";

/** Org fixtures giving the key user access to exactly project p1. */
function apiTables(
  interviews: Record<string, unknown>[],
  projectMembers: Record<string, unknown>[] = [{ projectId: "p1", userId: "u-key" }],
) {
  return {
    api_keys: [
      { key: createHash("sha256").update(RAW).digest("hex"), userId: "u-key", isActive: true, expiresAt: null },
    ],
    organization_members: [{ workspaceId: "org1", userId: "u-key" }],
    projects: [{ id: "p1", organizationId: "org1" }],
    project_members: projectMembers,
    interviews,
  };
}

function v1Req(body?: string) {
  return new Request("https://api.example.test/v1", {
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

test("publish: empty project access is 404 before any interview write", async () => {
  const db = fakeDb(
    apiTables([{ id: "i1", projectId: "p1", publicSlug: null }], [{ projectId: "p1", userId: "u-someone" }]),
  );
  const res = await run(db, () => publishPost(v1Req(""), { params: Promise.resolve({ id: "i1" }) }));
  assert.equal(res.status, 404);
  assert.ok(
    !db.writes.some((w) => w.table === "interviews"),
    "an empty whitelist must not touch the interview row",
  );
});

test("publish: an interview outside the key's projects is NOT_FOUND", async () => {
  const db = fakeDb(apiTables([{ id: "i2", projectId: "p-other", publicSlug: null }]));
  const res = await run(db, () => publishPost(v1Req(""), { params: Promise.resolve({ id: "i2" }) }));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: { code: string } };
  assert.equal(body.error.code, "NOT_FOUND");
});

test("publish keeps an existing slug and activates the interview", async () => {
  const db = fakeDb(apiTables([{ id: "i1", projectId: "p1", publicSlug: "custom-slug" }]));
  const res = await run(db, () => publishPost(v1Req(""), { params: Promise.resolve({ id: "i1" }) }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { publicSlug: string; url: string } };
  assert.equal(body.data.publicSlug, "custom-slug");
  assert.equal(body.data.url, "https://api.example.test/i/custom-slug");

  const update = db.writes.find((w) => w.op === "update" && w.table === "interviews");
  assert.ok(update, "interview row updated");
  assert.deepEqual(update!.payload, {
    isActive: true,
    requireInvite: false,
    publicSlug: "custom-slug",
  });
});

test("publish generates a fresh 10-char slug when the interview has none", async () => {
  const db = fakeDb(apiTables([{ id: "i1", projectId: "p1", publicSlug: null }]));
  const res = await run(db, () => publishPost(v1Req(""), { params: Promise.resolve({ id: "i1" }) }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: { publicSlug: string; url: string } };
  assert.match(body.data.publicSlug, /^[a-z0-9]{10}$/, "nanoid(10) over the lowercase alphabet");
  assert.equal(body.data.url, `https://api.example.test/i/${body.data.publicSlug}`);
  const update = db.writes.find((w) => w.op === "update" && w.table === "interviews");
  assert.equal((update!.payload as { publicSlug: string }).publicSlug, body.data.publicSlug);
});

test("GET detail: empty project access is 404", async () => {
  const db = fakeDb(
    apiTables([{ id: "i1", projectId: "p1" }], [{ projectId: "p1", userId: "u-someone" }]),
  );
  const res = await run(db, () => detailGet(v1Req(), { params: Promise.resolve({ id: "i1" }) }));
  assert.equal(res.status, 404);
});

test("GET detail: partner payload strips the expectedAnswer rubric and counts sessions", async () => {
  const db = fakeDb(
    apiTables([
      {
        id: "i1",
        projectId: "p1",
        title: "Teknis",
        questions: [
          { id: "q1", text: "Q satu", expectedAnswer: "SECRET-RUBRIC" },
          { id: "q2", text: "Q dua" },
        ],
        sessions: [{ id: "s1" }, { id: "s2" }],
      },
    ]),
  );
  const res = await run(db, () => detailGet(v1Req(), { params: Promise.resolve({ id: "i1" }) }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { questions: Record<string, unknown>[]; _count: { sessions: number } };
  };
  assert.equal(body.data._count.sessions, 2);
  assert.equal(body.data.questions.length, 2);
  assert.ok(
    body.data.questions.every((q) => !("expectedAnswer" in q)),
    "the grading rubric is evaluator-only and must not ship to partners",
  );
  assert.ok(!JSON.stringify(body).includes("SECRET-RUBRIC"));
});
