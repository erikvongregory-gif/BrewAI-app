import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  twoFactor: vi.fn(),
  rate: vi.fn(),
  queries: [] as Array<{ table: string; columns: string; column: string; value: unknown }>,
  tables: {} as Record<string, { data: unknown[] | null; error: { message: string } | null }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/auth/twoFactorSession", () => ({ hasPassedTwoFactor: mocks.twoFactor }));
vi.mock("@/lib/security/requestGuards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/requestGuards")>()),
  enforceRateLimitPersistent: mocks.rate,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: unknown) => ({
          range: async () => {
            mocks.queries.push({ table, columns, column, value });
            return mocks.tables[table] ?? { data: [], error: null };
          },
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";
import { isSecretKey, sanitizeForExport } from "@/lib/compliance/accountExport";

const URL = "https://app.brewai.de/api/account/export";
const user = {
  id: "owner-1",
  email: "brauerei@example.com",
  phone: "",
  created_at: "2026-01-01T00:00:00.000Z",
  last_sign_in_at: "2026-11-09T18:00:00.000Z",
  email_confirmed_at: "2026-01-01T00:05:00.000Z",
  identities: [{ provider: "email", created_at: "2026-01-01T00:00:00.000Z", identity_data: { secret: "x" } }],
  app_metadata: { role: "owner", provider: "email" },
  user_metadata: {
    full_name: "Erika Muster",
    brewery_name: "Musterbräu",
    password_epoch: 3,
    dashboard: {
      brandProfile: { breweryName: "Musterbräu" },
      brandReferenceImages: { br_1: { mime: "image/png", base64: "A".repeat(6000) } },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.tables = {
    dashboard_media: { data: [{ item: { id: "m1", imageUrl: "https://cdn.example/x.png?token=abc", prompt: "Helles im Biergarten", createdAt: "2026-11-01" } }], error: null },
    generation_jobs: { data: [{ id: "j1", status: "done", provider_task_id: "t1", access_token: "never" }], error: null },
    workspace_invites: { data: [{ id: "i1", email: "team@example.com", role: "editor" }], error: null },
    integration_secrets: { data: [{ provider: "instagram" }], error: null },
    billing_subscriptions: { data: [{ plan: "growth", subscription_status: "active", monthly_spent: 10, token_period_granted: 500 }], error: null },
  };
  mocks.getUser.mockResolvedValue({ data: { user } });
  mocks.twoFactor.mockResolvedValue(true);
  mocks.rate.mockResolvedValue(null);
});

describe("GET /api/account/export", () => {
  it("rejects foreign origins before reading the session", async () => {
    const response = await GET(new Request(URL, { headers: { origin: "https://evil.example" } }));
    expect(response.status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request(URL, { headers: { "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.queries).toEqual([]);
  });

  it("requires a passed two-factor check", async () => {
    mocks.twoFactor.mockResolvedValue(false);
    const response = await GET(new Request(URL, { headers: { origin: "https://app.brewai.de" } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "two_factor_required" });
    expect(mocks.queries).toEqual([]);
  });

  it("honours the per-user rate limit", async () => {
    mocks.rate.mockResolvedValueOnce(null).mockResolvedValueOnce(new Response("{}", { status: 429 }));
    const response = await GET(new Request(URL, { headers: { origin: "https://app.brewai.de" } }));
    expect(response.status).toBe(429);
    expect(mocks.rate).toHaveBeenLastCalledWith(expect.any(Request), expect.objectContaining({ keyPrefix: "account-export:user" }), { identifierParts: ["owner-1"] });
  });

  it("returns a no-store JSON download of the caller's own data without secrets", async () => {
    const response = await GET(new Request(URL, { headers: { "sec-fetch-site": "same-origin" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="brewai-datenexport-\d{4}-\d{2}-\d{2}\.json"$/);

    const raw = await response.text();
    const body = JSON.parse(raw);
    expect(body.format.name).toBe("brewai-account-export");
    expect(body.konto).toMatchObject({ id: "owner-1", email: "brauerei@example.com", rolle: "owner" });
    expect(body.konto.profil).toMatchObject({ full_name: "Erika Muster", brewery_name: "Musterbräu" });
    expect(body.mediathek[0].item.imageUrl).toBe("https://cdn.example/x.png");
    expect(body.generierungsauftraege[0]).toEqual({ id: "j1", status: "done", provider_task_id: "t1" });
    expect(body.team.einladungen[0].email).toBe("team@example.com");
    expect(body.verbindungen).toEqual([{ provider: "instagram" }]);
    expect(body.abrechnung.abonnement[0]).toMatchObject({ plan: "growth", token_period_granted: 500 });
    expect(body.unvollstaendig).toEqual([]);

    expect(raw).not.toContain("password_epoch");
    expect(raw).not.toContain("access_token");
    expect(raw).not.toContain("token=abc");
    expect(raw).not.toContain("A".repeat(5000));
    expect(raw).toContain("Binärdaten entfernt");
    expect(mocks.queries.every((query) => query.value === "owner-1")).toBe(true);
    expect(mocks.queries.find((query) => query.table === "integration_secrets")?.columns).toBe("provider");
  });

  it("marks sections that could not be read instead of failing silently", async () => {
    mocks.tables.token_lots = { data: null, error: { message: "relation does not exist" } };
    const response = await GET(new Request(URL, { headers: { origin: "https://app.brewai.de" } }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.unvollstaendig).toEqual(["Token-Kontingente"]);
  });
});

describe("sanitizeForExport", () => {
  it("removes credentials but keeps credit balances", () => {
    expect(isSecretKey("access_token")).toBe(true);
    expect(isSecretKey("provider_refresh_token")).toBe(true);
    expect(isSecretKey("inviteToken")).toBe(true);
    expect(isSecretKey("password_epoch")).toBe(true);
    expect(isSecretKey("code")).toBe(true);
    expect(isSecretKey("monthly_spent")).toBe(false);
    expect(isSecretKey("token_period_granted")).toBe(false);
    expect(isSecretKey("tokens")).toBe(false);
    expect(sanitizeForExport({ a: { secret: "x", keep: 1 }, list: [{ refresh_token: "y", ok: true }] })).toEqual({
      a: { keep: 1 },
      list: [{ ok: true }],
    });
  });
});
