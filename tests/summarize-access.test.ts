import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb, withAdminPatches, type FakeDb } from "./helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* eslint-disable @typescript-eslint/no-explicit-any */

// authorizeSummarizeForSession lives in logic.ts so the HTTP route stays thin
// and the session→interview→RBAC wiring is testable without mocking the
// cookie session.
const logicMod = () => import("../src/app/api/ai/summarize/logic");
let authorizeReportManager: (typeof import("../src/app/api/ai/summarize/logic"))["authorizeReportManager"];
let authorizeSummarizeForSession: (typeof import("../src/app/api/ai/summarize/logic"))["authorizeSummarizeForSession"];

before(async () => {
  const mod = await logicMod();
  authorizeReportManager = mod.authorizeReportManager;
  authorizeSummarizeForSession = mod.authorizeSummarizeForSession;
});

/**
 * i1 is owned by u-and (org MEMBER, the "and…" account that owns interview
 * 6c6e09a6); u-rich is the org OWNER (Richard) — neither owns the other's
 * grant, both must manage reports because the project whitelist is empty.
 */
function tables(projectMembers: Record<string, unknown>[] = []) {
  return {
    interviews: [
      { id: "i1", userId: "u-and", projectId: "p1", project: { organizationId: "org1" } },
    ],
    projects: [{ id: "p1", organizationId: "org1" }],
    organization_members: [
      { workspaceId: "org1", userId: "u-and", role: "MEMBER" },
      { workspaceId: "org1", userId: "u-rich", role: "OWNER" },
      { workspaceId: "org1", userId: "u-view", role: "VIEWER" },
    ],
    project_members: projectMembers,
  };
}

const run = <T>(db: FakeDb, fn: (admin: any) => Promise<T>) =>
  withAdminPatches({ from: db.client.from }, fn);

test("the interview owner (org MEMBER) may manage reports", async () => {
  const db = fakeDb(tables());
  const res = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-and"));
  assert.deepEqual(res, { ok: true });
});

test("an org OWNER who is not the interview owner may manage reports", async () => {
  const db = fakeDb(tables());
  const res = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-rich"));
  assert.deepEqual(res, { ok: true });
});

test("a VIEWER may not manage reports", async () => {
  const db = fakeDb(tables());
  const res = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-view"));
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.status, 403);
    assert.match(res.error, /at least MEMBER/);
  }
});

// Grant denials carry no existence oracle: cross-org callers and callers
// without a project grant get the same uniform 404 as a missing interview
// (operator directive); only role shortfalls are informative 403s.
test("a user outside the organization gets a uniform 404", async () => {
  const db = fakeDb(tables());
  const res = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-stranger"));
  assert.deepEqual(res, { ok: false, status: 404, error: "Not found" });
});

test("a populated project whitelist gives non-listed org members the same uniform 404 but keeps listed ones", async () => {
  const db = fakeDb(tables([{ projectId: "p1", userId: "u-and" }]));
  const denied = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-rich"));
  assert.deepEqual(denied, { ok: false, status: 404, error: "Not found" });

  const allowed = await run(db, (admin) => authorizeReportManager(admin, "i1", "u-and"));
  assert.deepEqual(allowed, { ok: true });
});

test("an unknown interview resolves to NOT_FOUND", async () => {
  const db = fakeDb(tables());
  const res = await run(db, (admin) => authorizeReportManager(admin, "ghost", "u-rich"));
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 404);
});

test("a session id authorizes through its interview's project", async () => {
  const db = fakeDb({ ...tables(), sessions: [{ id: "s1", interviewId: "i1" }] });

  const ok = await run(db, (admin) => authorizeSummarizeForSession(admin, "s1", "u-rich"));
  assert.deepEqual(ok, { ok: true });

  const viewer = await run(db, (admin) => authorizeSummarizeForSession(admin, "s1", "u-view"));
  assert.equal(viewer.ok, false);
  if (!viewer.ok) assert.equal(viewer.status, 403);
});

test("a missing session is 404 before any RBAC lookup", async () => {
  const db = fakeDb({ ...tables(), sessions: [] });
  const res = await run(db, (admin) => authorizeSummarizeForSession(admin, "ghost", "u-rich"));
  assert.deepEqual(res, { ok: false, status: 404, error: "Not found" });
});
