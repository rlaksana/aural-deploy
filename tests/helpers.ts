/* eslint-disable @typescript-eslint/no-explicit-any */

export type FakeRow = Record<string, unknown>;

/**
 * Shared test double for the Supabase admin client, generalized from the
 * hand-rolled fake in rbac.test.ts. Covers exactly the builder shapes the
 * routers/lib use: select/eq/in/not(is|null,in-list)/order/limit/single/
 * maybeSingle, awaited results, plus stateful update/insert/delete and rpc
 * recording. Embeds are pre-shaped in fixture rows (the fake ignores select
 * strings), matching how supabase-js returns aliased joins.
 */

export type FakeWrite = {
  op: "update" | "insert" | "delete" | "rpc";
  table: string;
  payload?: unknown;
  fn?: string;
  filters?: Record<string, unknown>;
};

export type FakeDb = {
  client: any;
  tables: Record<string, FakeRow[]>;
  writes: FakeWrite[];
};

export type FakeDbOptions = {
  /** fn name -> resolved data for rpc calls (default null). */
  rpcResults?: Record<string, unknown>;
  /** table -> error message returned by insert instead of persisting. */
  insertErrors?: Record<string, string>;
};

export function fakeDb(
  tables: Record<string, FakeRow[]>,
  opts: FakeDbOptions = {},
): FakeDb {
  const writes: FakeWrite[] = [];

  const client = {
    from(table: string) {
      const working = [...(tables[table] ?? [])];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          if (b._pending.update || b._pending.del || b._pending.insert) {
            b._pending.filters = { ...b._pending.filters, [col]: val };
            if (b._pending.update || b._pending.del) {
              const rows = tables[table] ?? [];
              const matches = rows.filter((r) =>
                Object.entries(b._pending.filters ?? {}).every(([c, v]) => r[c] === v),
              );
              working.length = 0;
              working.push(...matches);
              applyFilterMutation(table, b._pending);
            }
            return b;
          }
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
        not: (col: string, op: string, value: unknown) => {
          if (op === "is" && value === null) {
            const next = working.filter((r) => r[col] !== null && r[col] !== undefined);
            working.length = 0;
            working.push(...next);
            return b;
          }
          if (op === "in" && typeof value === "string") {
            const excluded = value
              .slice(1, -1)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            const next = working.filter((r) => !excluded.includes(String(r[col])));
            working.length = 0;
            working.push(...next);
            return b;
          }
          throw new Error(`fakeDb: unsupported not(${col}, ${op}, ${JSON.stringify(value)})`);
        },
        order: (col: string, o?: { referencedTable?: string; ascending?: boolean }) => {
          if (o?.referencedTable) return b; // embeds are pre-shaped in fixtures
          const asc = o?.ascending ?? true;
          working.sort((x, y) => {
            const a = String(x[col] ?? "");
            const c = String(y[col] ?? "");
            return asc ? a.localeCompare(c) : c.localeCompare(a);
          });
          return b;
        },
        limit: (n: number) => {
          working.length = Math.min(working.length, n);
          return b;
        },
        single: () => {
          // insert/delete chains resolve through then() — commit first so
          // .insert(...).select("id").single() sees the persisted row.
          if (b._pending.insert || b._pending.del) {
            return new Promise((resolve) => {
              b.then((res: { data: FakeRow[]; error: unknown; count: number }) =>
                resolve({ data: res.data[0] ?? null, error: res.error, count: res.count }),
              );
            });
          }
          return Promise.resolve({ data: working[0] ?? null, error: null });
        },
        maybeSingle: () => {
          if (b._pending.insert || b._pending.del) {
            return new Promise((resolve) => {
              b.then((res: { data: FakeRow[]; error: unknown; count: number }) =>
                resolve({ data: res.data[0] ?? null, error: res.error, count: res.count }),
              );
            });
          }
          return Promise.resolve({ data: working[0] ?? null, error: null });
        },
        update: (payload: Record<string, unknown>) => {
          b._pending.update = payload;
          return b;
        },
        insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
          b._pending.insert = payload;
          return b;
        },
        delete: () => {
          b._pending.del = true;
          return b;
        },
        _pending: {} as {
          update?: Record<string, unknown>;
          insert?: Record<string, unknown> | Record<string, unknown>[];
          del?: boolean;
          filters?: Record<string, unknown>;
        },
        then: (
          resolve: (v: { data: FakeRow[]; error: null; count: number }) => void,
        ) => {
          if (b._pending.insert) {
            const insertError = opts.insertErrors?.[table];
            const rows = (
              Array.isArray(b._pending.insert) ? b._pending.insert : [b._pending.insert]
            ) as FakeRow[];
            if (insertError) {
              writes.push({ op: "insert", table, payload: rows });
              resolve({ data: null as unknown as FakeRow[], error: { message: insertError } as any, count: 0 });
              return;
            }
            (tables[table] ??= []).push(...rows);
            writes.push({ op: "insert", table, payload: rows });
            resolve({ data: rows, error: null, count: rows.length });
            return;
          }
          if (b._pending.del) {
            applyFilterMutation(table, b._pending);
            resolve({ data: [] as FakeRow[], error: null, count: 0 });
            return;
          }
          resolve({ data: [...working], error: null, count: working.length });
        },
      };
      return b;
    },
    rpc(fn: string, params: unknown) {
      writes.push({ op: "rpc", table: "", fn, payload: params });
      return Promise.resolve({ data: opts.rpcResults?.[fn] ?? null, error: null });
    },
  };

  function applyFilterMutation(
    table: string,
    pending: { update?: Record<string, unknown>; del?: boolean; filters?: Record<string, unknown> },
  ) {
    const rows = (tables[table] ??= []);
    const matches = rows.filter((r) =>
      Object.entries(pending.filters ?? {}).every(([col, val]) => r[col] === val),
    );
    writes.push({ op: pending.del ? "delete" : "update", table, payload: pending.update, filters: pending.filters });
    if (pending.del) {
      tables[table] = rows.filter((r) => !matches.includes(r));
    } else if (pending.update) {
      for (const row of matches) Object.assign(row, pending.update);
    }
  }

  return { client, tables, writes } as FakeDb;
}

/**
 * Run `fn` with the module-singleton supabaseAdmin's from()/rpc() swapped for
 * fakes, restoring afterwards. supabase-js v2.95 returns a plain class
 * instance (not frozen/proxied), so own-property shadowing works; when the
 * original method was inherited we delete the own property to restore the
 * prototype lookup.
 */
export async function withAdminPatches<T>(
  patches: { from?: any; rpc?: any },
  fn: (admin: any) => Promise<T>,
): Promise<T> {
  process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
  const mod = await import("../src/lib/supabase/admin");
  const admin = mod.supabaseAdmin as any;
  const saved: { from?: any; rpc?: any } = {};
  const wasOwn: Record<string, boolean> = {};
  const stash = (key: "from" | "rpc") => {
    if (patches[key] !== undefined) {
      wasOwn[key] = Object.prototype.hasOwnProperty.call(admin, key);
      saved[key] = admin[key];
      admin[key] = patches[key];
    }
  };
  const restore = (key: "from" | "rpc") => {
    if (saved[key] === undefined) return;
    if (wasOwn[key]) admin[key] = saved[key];
    else delete admin[key];
  };
  stash("from");
  stash("rpc");
  try {
    return await fn(admin);
  } finally {
    restore("from");
    restore("rpc");
  }
}
