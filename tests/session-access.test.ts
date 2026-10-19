import assert from "node:assert/strict";
import test from "node:test";
import { sessionTokenValid } from "../src/lib/session-access";

/** Minimal chained fake of the Supabase builder sessionTokenValid uses. */
function fakeSupabase(stored: string | null | undefined) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  stored === undefined ? { data: null } : { data: { accessToken: stored } },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof sessionTokenValid>[0];
}

test("sessionTokenValid gates writes on the stored per-session token", async () => {
  // Legacy session without a token keeps the id-as-capability posture.
  assert.equal(await sessionTokenValid(fakeSupabase(null), "s1", undefined), true);
  assert.equal(await sessionTokenValid(fakeSupabase(null), "s1", "anything"), true);
  // Matching token passes.
  assert.equal(await sessionTokenValid(fakeSupabase("tok"), "s1", "tok"), true);
  // Wrong or missing token is rejected — never a silent pass.
  assert.equal(await sessionTokenValid(fakeSupabase("tok"), "s1", "wrong"), false);
  assert.equal(await sessionTokenValid(fakeSupabase("tok"), "s1", undefined), false);
  // Unknown session id is rejected.
  assert.equal(await sessionTokenValid(fakeSupabase(undefined), "s1", "tok"), false);
});
