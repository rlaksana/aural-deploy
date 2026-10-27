import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasMinRole,
  assertMinRole,
  getOrgMembership,
  hasProjectAccess,
  getEffectiveProjectRole,
  filterAccessibleProjectIds,
} from "../src/server/rbac";

type Row = Record<string, unknown>;

/**
 * Minimal chainable Supabase stub covering exactly the query shapes the RBAC
 * helpers use: select/eq/in chained, awaited directly for counts, or ended
 * with single(). Each from() starts from a fresh copy of the table rows.
 */
function fakeSupabase(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const working = [...(tables[table] ?? [])];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          const next = working.filter((r) => r[col] === val);
          working.length = 0;
          working.push(...next);
          return b;
        },
        in: (col: string, vals: readonly unknown[]) => {
          const next = working.filter((r) => (vals as unknown[]).includes(r[col]));
          working.length = 0;
          working.push(...next);
          return b;
        },
        single: () => Promise.resolve({ data: working[0] ?? null }),
        then: (resolve: (v: { data: Row[]; count: number }) => void) =>
          resolve({ data: [...working], count: working.length }),
      };
      return b;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as unknown as any;
}

test("role hierarchy: equal or higher role passes", () => {
  assert.equal(hasMinRole("VIEWER", "VIEWER"), true);
  assert.equal(hasMinRole("MEMBER", "VIEWER"), true);
  assert.equal(hasMinRole("MEMBER", "ADMIN"), false);
  assert.equal(hasMinRole("OWNER", "ADMIN"), true);
  assert.equal(hasMinRole("VIEWER", "MEMBER"), false);
});

test("assertMinRole throws FORBIDDEN naming required and actual roles", () => {
  assert.throws(
    () => assertMinRole("VIEWER", "ADMIN"),
    (e: unknown) => {
      const err = e as { code?: string; message?: string };
      return (
        err.code === "FORBIDDEN" &&
        err.message?.includes("ADMIN") === true &&
        err.message?.includes("VIEWER") === true
      );
    },
  );
  assert.doesNotThrow(() => assertMinRole("ADMIN", "ADMIN"));
});

test("getOrgMembership returns the role for members, null for strangers", async () => {
  const db = fakeSupabase({
    organization_members: [
      { workspaceId: "org1", userId: "u1", role: "ADMIN" },
      { workspaceId: "org2", userId: "u1", role: "VIEWER" },
    ],
  });
  assert.equal((await getOrgMembership(db, "org1", "u1"))?.role, "ADMIN");
  assert.equal(await getOrgMembership(db, "orgX", "u1"), null);
});

test("hasProjectAccess: empty project_members grants access (open mode)", async () => {
  const db = fakeSupabase({ project_members: [] });
  assert.equal(await hasProjectAccess(db, "p1", "u1"), true);
});

test("hasProjectAccess: populated project_members is a whitelist", async () => {
  const db = fakeSupabase({
    project_members: [
      { projectId: "p1", userId: "u1" },
      { projectId: "p1", userId: "u2" },
    ],
  });
  assert.equal(await hasProjectAccess(db, "p1", "u1"), true);
  assert.equal(await hasProjectAccess(db, "p1", "u3"), false);
});

test("getEffectiveProjectRole takes the higher of org and project roles", async () => {
  const db = fakeSupabase({
    project_members: [{ projectId: "p1", userId: "u1", role: "ADMIN" }],
  });
  // No project-level row → org role stands.
  assert.equal(await getEffectiveProjectRole(db, "p2", "u1", "MEMBER"), "MEMBER");
  // Project role higher → wins.
  assert.equal(await getEffectiveProjectRole(db, "p1", "u1", "MEMBER"), "ADMIN");
  // Org role higher → stands.
  assert.equal(await getEffectiveProjectRole(db, "p1", "u1", "OWNER"), "OWNER");
});

test("filterAccessibleProjectIds keeps open projects and listed memberships", async () => {
  const db = fakeSupabase({
    project_members: [
      { projectId: "p1", userId: "u1" },
      { projectId: "p1", userId: "u2" },
      { projectId: "p2", userId: "u2" },
    ],
  });
  const accessible = await filterAccessibleProjectIds(
    db,
    ["p1", "p2", "p3"],
    "u1",
  );
  assert.deepEqual(accessible.sort(), ["p1", "p3"]);
});
