import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./helpers";

type CandidateMod = typeof import("../src/server/routers/candidate");
let verifyInterviewAccess: CandidateMod["verifyInterviewAccess"];

before(async () => {
  const mod = await import("../src/server/routers/candidate");
  verifyInterviewAccess = mod.verifyInterviewAccess;
});

/** Interview row whose embedded project points at org1. */
const interview = {
  id: "i1",
  userId: "u-owner",
  projectId: "p1",
  project: { organizationId: "org1" },
};

test("verifyInterviewAccess: unknown interview is NOT_FOUND", async () => {
  const db = fakeDb({ interviews: [] });
  await assert.rejects(
    verifyInterviewAccess(db.client as never, "i1", "u1"),
    (err: { code: string }) => err.code === "NOT_FOUND",
  );
});

test("verifyInterviewAccess: non-member of the org is FORBIDDEN", async () => {
  const db = fakeDb({ interviews: [interview], organization_members: [] });
  await assert.rejects(
    verifyInterviewAccess(db.client as never, "i1", "u-outsider"),
    (err: { code: string; message: string }) =>
      err.code === "FORBIDDEN" && /not a member/.test(err.message),
  );
});

test("verifyInterviewAccess: org member excluded by a populated project whitelist is FORBIDDEN", async () => {
  const db = fakeDb({
    interviews: [interview],
    organization_members: [{ workspaceId: "org1", userId: "u1", role: "VIEWER" }],
    project_members: [{ projectId: "p1", userId: "u-colleague", role: "ADMIN" }],
  });
  await assert.rejects(
    verifyInterviewAccess(db.client as never, "i1", "u1"),
    (err: { code: string; message: string }) =>
      err.code === "FORBIDDEN" && /do not have access/.test(err.message),
  );
});

test("verifyInterviewAccess: an unpopulated whitelist (open project) falls back to the org role", async () => {
  const db = fakeDb({
    interviews: [interview],
    organization_members: [{ workspaceId: "org1", userId: "u1", role: "VIEWER" }],
    project_members: [],
  });
  const result = await verifyInterviewAccess(db.client as never, "i1", "u1");
  assert.equal(result.role, "VIEWER");
  assert.equal(result.interviewUserId, "u-owner");
  assert.equal(result.organizationId, "org1");
});

test("verifyInterviewAccess: the effective role is the max of org and project roles", async () => {
  const upgraded = fakeDb({
    interviews: [interview],
    organization_members: [{ workspaceId: "org1", userId: "u1", role: "MEMBER" }],
    project_members: [{ projectId: "p1", userId: "u1", role: "ADMIN" }],
  });
  assert.equal(
    (await verifyInterviewAccess(upgraded.client as never, "i1", "u1")).role,
    "ADMIN",
    "project role lifts the org role",
  );

  const downgraded = fakeDb({
    interviews: [interview],
    organization_members: [{ workspaceId: "org1", userId: "u1", role: "ADMIN" }],
    project_members: [{ projectId: "p1", userId: "u1", role: "VIEWER" }],
  });
  assert.equal(
    (await verifyInterviewAccess(downgraded.client as never, "i1", "u1")).role,
    "ADMIN",
    "a narrower project role never lowers the org role",
  );
});

test("verifyInterviewAccess: interview owner outside the org still cannot pass", async () => {
  // Ownership does not grant access: tenant membership is the only gate.
  const db = fakeDb({
    interviews: [{ ...interview, userId: "u1" }],
    organization_members: [],
  });
  await assert.rejects(
    verifyInterviewAccess(db.client as never, "i1", "u1"),
    (err: { code: string }) => err.code === "FORBIDDEN",
  );
});
