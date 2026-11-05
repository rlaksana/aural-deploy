import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createHash } from "crypto";

import type { ApiKeyAuth } from "@/lib/api-key-auth";
import { fakeDb, withAdminPatches } from "./helpers";

let apiError: (typeof import("@/lib/api-key-auth"))["apiError"];
let isAuthError: (typeof import("@/lib/api-key-auth"))["isAuthError"];
let validateApiKey: (typeof import("@/lib/api-key-auth"))["validateApiKey"];

before(async () => {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const mod = await import("@/lib/api-key-auth");
  apiError = mod.apiError;
  isAuthError = mod.isAuthError;
  validateApiKey = mod.validateApiKey;
});

function req(headers: Record<string, string>) {
  return new Request("https://example.test/api", { headers });
}

describe("isAuthError", () => {
  it("returns true for Response objects", () => {
    const res = Response.json({ ok: true });
    assert.equal(isAuthError(res), true);
  });

  it("returns false for ApiKeyAuth objects", () => {
    const auth: ApiKeyAuth = {
      userId: "u1",
      organizationId: "o1",
      projectIds: ["p1"],
    };
    assert.equal(isAuthError(auth), false);
  });
});

describe("apiError", () => {
  it("builds JSON with error.code, error.message, and HTTP status", async () => {
    const res = apiError("TEST_CODE", "Something went wrong", 418);
    assert.equal(res.status, 418);
    const body = (await res.json()) as {
      error: { code: string; message: string };
    };
    assert.deepEqual(body, {
      error: { code: "TEST_CODE", message: "Something went wrong" },
    });
  });

  it("merges extra fields onto the error object", async () => {
    const res = apiError("WITH_EXTRA", "msg", 400, {
      details: ["a"],
      hint: "try again",
    });
    const body = (await res.json()) as {
      error: { code: string; message: string; details: string[]; hint: string };
    };
    assert.equal(body.error.code, "WITH_EXTRA");
    assert.equal(body.error.message, "msg");
    assert.deepEqual(body.error.details, ["a"]);
    assert.equal(body.error.hint, "try again");
  });
});

describe("validateApiKey (early validation)", () => {
  it("returns 401 when Authorization is missing", async () => {
    const result = await validateApiKey(req({}));
    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
    const body = (await result.json()) as { error: { code: string } };
    assert.equal(body.error.code, "UNAUTHORIZED");
  });

  it("returns 401 for non-Bearer schemes", async () => {
    const result = await validateApiKey(
      req({ authorization: "Basic dGVzdA==" }),
    );
    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
  });

  it("returns 401 when Bearer token does not use the dlv_ prefix", async () => {
    const result = await validateApiKey(
      req({ authorization: "Bearer sk_live_abc" }),
    );
    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
    const body = (await result.json()) as { error: { message: string } };
    assert.ok(body.error.message.includes("dlv_"));
  });
});

/* ------------------------------------------------------------------ */
/*  DB lookup: hash matching, org pick, project filter, rate limit.    */
/*  validateApiKey reaches supabaseAdmin directly, so the instance     */
/*  method is patched via withAdminPatches.                            */
/* ------------------------------------------------------------------ */

function keyRow(rawKey: string, overrides: Record<string, unknown> = {}) {
  return {
    key: createHash("sha256").update(rawKey).digest("hex"),
    userId: "u-key",
    isActive: true,
    expiresAt: null,
    ...overrides,
  };
}

function authedReq(rawKey: string) {
  return req({ authorization: `Bearer ${rawKey}` });
}

/** Auth fixture: one key user in two orgs, one open + one whitelisted project. */
function authTables(rawKey: string, overrides: Record<string, unknown> = {}) {
  return {
    api_keys: [keyRow(rawKey, overrides)],
    organization_members: [
      { workspaceId: "org-b", userId: "u-key" },
      { workspaceId: "org-a", userId: "u-key" },
    ],
    projects: [
      { id: "p-wl", organizationId: "org-a" },
      { id: "p-open", organizationId: "org-a" },
    ],
    project_members: [{ projectId: "p-wl", userId: "u-key" }],
  };
}

describe("validateApiKey (DB lookup)", () => {
  it("resolves the stored digest to the smallest workspaceId and accessible projects", async () => {
    const raw = "dlv_auth_ok_happy";
    const db = fakeDb(authTables(raw, { expiresAt: "2027-01-01T00:00:00Z" }));
    const result = await withAdminPatches({ from: db.client.from }, () =>
      validateApiKey(authedReq(raw)),
    );
    assert.ok(!(result instanceof Response));
    // org pick is `.order("workspaceId").limit(1)` — the smallest id wins.
    // Future expiresAt stays valid; only past dates reject.
    assert.deepEqual(result, {
      userId: "u-key",
      organizationId: "org-a",
      projectIds: ["p-wl", "p-open"],
    } satisfies ApiKeyAuth);
  });

  it("excludes whitelisted projects that do not list the key's user", async () => {
    const raw = "dlv_auth_wl_excluded";
    const tables = authTables(raw);
    tables.project_members = [{ projectId: "p-wl", userId: "u-someone" }];
    const db = fakeDb(tables);
    const result = await withAdminPatches({ from: db.client.from }, () =>
      validateApiKey(authedReq(raw)),
    );
    assert.ok(!(result instanceof Response));
    assert.deepEqual(result.projectIds, ["p-open"], "whitelisted project needs the user listed");
  });

  it("matches only the stored SHA-256 digest — a plaintext key row never authenticates", async () => {
    const raw = "dlv_auth_plaintext_probe";
    const db = fakeDb({
      api_keys: [
        {
          key: raw, // wrong on purpose: the column must hold the digest
          userId: "u-key",
          isActive: true,
          expiresAt: null,
        },
      ],
      organization_members: [{ workspaceId: "org-a", userId: "u-key" }],
    });
    const result = await withAdminPatches({ from: db.client.from }, () =>
      validateApiKey(authedReq(raw)),
    );
    assert.ok(result instanceof Response);
    assert.equal(result.status, 401);
  });

  it("returns 401 for an inactive (revoked) key and for an expired key", async () => {
    for (const overrides of [{ isActive: false }, { expiresAt: "2026-01-01T00:00:00Z" }]) {
      const raw = "dlv_auth_dead_probe";
      const db = fakeDb(authTables(raw, overrides));
      const result = await withAdminPatches({ from: db.client.from }, () =>
        validateApiKey(authedReq(raw)),
      );
      assert.ok(result instanceof Response);
      assert.equal(result.status, 401, JSON.stringify(overrides));
      const body = (await result.json()) as { error: { code: string } };
      assert.equal(body.error.code, "UNAUTHORIZED");
    }
  });

  it("returns 403 when the key user belongs to no organization", async () => {
    const raw = "dlv_auth_no_org_probe";
    const db = fakeDb({
      api_keys: [keyRow(raw)],
      organization_members: [],
    });
    const result = await withAdminPatches({ from: db.client.from }, () =>
      validateApiKey(authedReq(raw)),
    );
    assert.ok(result instanceof Response);
    assert.equal(result.status, 403);
    const body = (await result.json()) as { error: { code: string } };
    assert.equal(body.error.code, "FORBIDDEN");
  });

  it("records lastUsedAt on the key row (fire-and-forget update)", async () => {
    const raw = "dlv_auth_lastused_probe";
    const db = fakeDb(authTables(raw));
    await withAdminPatches({ from: db.client.from }, () =>
      validateApiKey(authedReq(raw)),
    );
    const update = db.writes.find(
      (w) => w.op === "update" && w.table === "api_keys",
    );
    assert.ok(update, "lastUsedAt write recorded");
    assert.equal(typeof (update!.payload as { lastUsedAt: string }).lastUsedAt, "string");
    assert.equal(db.tables.api_keys[0].userId, "u-key", "row mutated in place");
    assert.notEqual(db.tables.api_keys[0].lastUsedAt, null);
  });

  it("returns 429 with Retry-After on the 61st request inside the window", async () => {
    const raw = "dlv_rl_61st_window_probe";
    const db = fakeDb({ api_keys: [keyRow(raw)], organization_members: [] });
    await withAdminPatches({ from: db.client.from }, async () => {
      for (let i = 1; i <= 60; i++) {
        const r = await validateApiKey(authedReq(raw));
        assert.ok(r instanceof Response);
        assert.equal(r.status, 403, `call ${i} passes the limiter but has no org`);
      }
      const limited = await validateApiKey(authedReq(raw));
      assert.ok(limited instanceof Response);
      assert.equal(limited.status, 429);
      assert.ok(limited.headers.get("Retry-After"));
      const body = (await limited.json()) as { error: { code: string } };
      assert.equal(body.error.code, "RATE_LIMITED");
    });
  });
});
