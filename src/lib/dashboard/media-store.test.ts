import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null };
type Call = { method: string; args: unknown[] };

const mocks = vi.hoisted(() => ({ results: [] as Result[], queries: [] as Call[][] }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const calls: Call[] = [];
      mocks.queries.push(calls);
      const builder = {
        then(resolve: (r: unknown) => unknown) {
          const r = mocks.results.shift() ?? {};
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }).then(resolve);
        },
      } as Record<string, unknown>;
      for (const method of ["select", "eq", "order", "range"]) {
        builder[method] = (...args: unknown[]) => (calls.push({ method, args }), builder);
      }
      return builder;
    },
  }),
}));
vi.mock("@/lib/supabase/privateAssets", () => ({ hydratePrivateAssets: async (input: unknown) => input }));
import { readDashboardMedia, readDashboardMediaPage } from "./media-store";

const rows = (ids: string[]) => ids.map((id) => ({ item: { id, createdAt: "2026-11-01T00:00:00.000Z" } }));
const callsOf = (i: number, method: string) => mocks.queries[i].filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  mocks.results = [];
  mocks.queries = [];
});

describe("readDashboardMediaPage", () => {
  it("sorts newest first in the DB and reads only the requested range", async () => {
    mocks.results.push({ data: rows(["b", "a"]), count: 60 });
    const page = await readDashboardMediaPage("u1", { limit: 48, offset: 48 });
    expect(page).toEqual({ items: rows(["b", "a"]).map((r) => r.item), total: 60, hasMore: false });
    expect(callsOf(0, "eq")).toEqual([["user_id", "u1"]]);
    expect(callsOf(0, "order")).toEqual([
      ["item->>createdAt", { ascending: false, nullsFirst: false }],
      ["id"],
    ]);
    expect(callsOf(0, "range")).toEqual([[48, 95]]);
    expect(callsOf(0, "select")).toEqual([["item", { count: "exact" }]]);
  });

  it("reports hasMore while rows remain and clamps limit/offset", async () => {
    mocks.results.push({ data: rows(["a"]), count: 500 });
    const page = await readDashboardMediaPage("u1", { limit: 1000, offset: -5 });
    expect(callsOf(0, "range")).toEqual([[0, 99]]);
    expect(page.hasMore).toBe(true);
  });

  it("returns an empty page with the real total when the offset is past the end", async () => {
    mocks.results.push({ error: { message: "range", code: "PGRST103" } }, { count: 47 });
    expect(await readDashboardMediaPage("u1", { limit: 48, offset: 48 })).toEqual({ items: [], total: 47, hasMore: false });
  });

  it("throws on other DB errors", async () => {
    mocks.results.push({ error: { message: "boom" } });
    await expect(readDashboardMediaPage("u1")).rejects.toThrow("Mediathek konnte nicht geladen werden: boom");
  });
});

describe("readDashboardMedia", () => {
  it("reads the whole library in DB order across 1000-row chunks", async () => {
    const first = rows(Array.from({ length: 1000 }, (_, i) => `m${i}`));
    mocks.results.push({ data: first }, { data: rows(["last"]) });
    const items = await readDashboardMedia("u1");
    expect(items).toHaveLength(1001);
    expect(items.at(-1)?.id).toBe("last");
    expect([callsOf(0, "range"), callsOf(1, "range")]).toEqual([[[0, 999]], [[1000, 1999]]]);
  });

  it("reads a single row for limit 1 and nothing for limit 0", async () => {
    mocks.results.push({ data: rows(["newest"]) });
    expect((await readDashboardMedia("u1", { limit: 1 })).map((i) => i.id)).toEqual(["newest"]);
    expect(callsOf(0, "range")).toEqual([[0, 0]]);
    expect(await readDashboardMedia("u1", { limit: 0 })).toEqual([]);
    expect(mocks.queries).toHaveLength(1);
  });
});
