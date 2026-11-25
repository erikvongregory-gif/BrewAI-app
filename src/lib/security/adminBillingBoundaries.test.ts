import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin-Rollenwechsel darf Betreiber-Konten nicht entmachten, und der
 * Willkommensbonus-Fallback darf sich nicht auf veränderbare user_metadata verlassen.
 */
const mocks = vi.hoisted(() => ({
  adminSession: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  rpc: vi.fn(),
  billingRow: null as Record<string, unknown> | null,
  updates: [] as Array<{ patch: Record<string, unknown>; eqs: Array<[string, unknown]> }>,
  updateResult: [] as unknown[],
  updateUser: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ getAdminSession: mocks.adminSession }));
vi.mock("@/lib/security/requestGuards", () => ({
  enforceRateLimit: () => null,
  enforceRateLimitPersistent: async () => null,
  enforceSameOrigin: () => null,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById, updateUserById: mocks.updateUserById } },
    rpc: mocks.rpc,
    from: () => {
      const read = {
        select: () => read,
        eq: () => read,
        maybeSingle: async () => ({ data: mocks.billingRow, error: null }),
      };
      return {
        select: read.select,
        update: (patch: Record<string, unknown>) => {
          const entry = { patch, eqs: [] as Array<[string, unknown]> };
          mocks.updates.push(entry);
          const chain = {
            eq: (column: string, value: unknown) => {
              entry.eqs.push([column, value]);
              return chain;
            },
            select: async () => ({ data: mocks.updateResult, error: null }),
          };
          return chain;
        },
      };
    },
  }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "brewer-1",
            email: "info@brauerei-sonnenhof.de",
            email_confirmed_at: "2026-01-01T00:00:00Z",
            app_metadata: {},
            // Nutzer hat onboarding_bonus_claimed_at selbst aus user_metadata gelöscht.
            user_metadata: {},
          },
        },
      }),
      updateUser: mocks.updateUser,
    },
  }),
}));
vi.mock("@/lib/auth/twoFactorSession", () => ({ hasPassedTwoFactor: async () => true }));
vi.mock("@/lib/dashboard/workspace", () => ({ getWorkspace: async () => ({ ownerId: "brewer-1", role: "owner" }) }));
vi.mock("@/lib/billing/store", () => ({
  ensureBillingRow: async () => undefined,
  getBillingRow: async () => ({
    user_id: "brewer-1",
    plan: null,
    subscription_status: "none",
    stripe_subscription_id: null,
    monthly_tokens: 50,
    used_tokens: 0,
  }),
  buildOwnerBillingRow: () => ({}),
}));

import { PATCH as patchUserRole } from "@/app/api/admin/users/route";
import { POST as onboardingBonus } from "@/app/api/billing/onboarding-bonus/route";

function patch(body: unknown) {
  return new Request("https://app.brewai.de/api/admin/users", {
    method: "PATCH",
    headers: { "content-type": "application/json", origin: "https://app.brewai.de" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.updates.length = 0;
  mocks.updateResult = [];
  mocks.billingRow = null;
  mocks.adminSession.mockResolvedValue({ userId: "admin-1", email: "admin@brewai.de", role: "admin" });
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});

describe("PATCH /api/admin/users", () => {
  it("lehnt ohne Admin-Session ab", async () => {
    mocks.adminSession.mockResolvedValueOnce(null);
    const response = await patchUserRole(patch({ userId: "u-2", role: "admin" }));
    expect(response.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("verhindert, dass ein Admin ein Owner-Konto (app_metadata.role) herabstuft", async () => {
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: { id: "owner-1", email: "chef@brewai.de", email_confirmed_at: null, app_metadata: { role: "owner" } } },
      error: null,
    });
    const response = await patchUserRole(patch({ userId: "owner-1", role: "user" }));
    expect(response.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("schützt auch Owner aus OWNER_EMAILS", async () => {
    vi.stubEnv("OWNER_EMAILS", "chef@brewai.de");
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: { id: "owner-2", email: "chef@brewai.de", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {} } },
      error: null,
    });
    const response = await patchUserRole(patch({ userId: "owner-2", role: "user" }));
    expect(response.status).toBe(403);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("verbietet das Ändern der eigenen Rolle", async () => {
    const response = await patchUserRole(patch({ userId: "admin-1", role: "user" }));
    expect(response.status).toBe(403);
    expect(mocks.getUserById).not.toHaveBeenCalled();
  });

  it("ändert die Rolle normaler Nutzer weiterhin", async () => {
    mocks.getUserById.mockResolvedValueOnce({
      data: { user: { id: "u-2", email: "team@brauerei.de", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {} } },
      error: null,
    });
    const response = await patchUserRole(patch({ userId: "u-2", role: "admin" }));
    expect(response.status).toBe(200);
    expect(mocks.updateUserById).toHaveBeenCalledWith("u-2", { app_metadata: { role: "admin" } });
  });

  it("antwortet bei unbekanntem Nutzer mit 404", async () => {
    mocks.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: "not found" } });
    const response = await patchUserRole(patch({ userId: "missing", role: "user" }));
    expect(response.status).toBe(404);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});

describe("POST /api/billing/onboarding-bonus (Fallback ohne RPC)", () => {
  function bonusRequest() {
    return new Request("https://app.brewai.de/api/billing/onboarding-bonus", {
      method: "POST",
      headers: { origin: "https://app.brewai.de" },
    });
  }

  it("bucht keinen zweiten Bonus, wenn die DB-Spalte ihn bereits vermerkt (trotz gelöschter user_metadata)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.billingRow = { monthly_tokens: 50, used_tokens: 0, onboarding_bonus_granted: true, stripe_subscription_id: null };
    const response = await onboardingBonus(bonusRequest());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: { bonusGranted: boolean } };
    expect(body.state.bonusGranted).toBe(false);
    expect(mocks.updates).toHaveLength(0);
  });

  it("bucht den ersten Bonus nur bedingt (onboarding_bonus_granted = false)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.billingRow = { monthly_tokens: 0, used_tokens: 0, onboarding_bonus_granted: false, stripe_subscription_id: null };
    mocks.updateResult = [{ user_id: "brewer-1" }];
    const response = await onboardingBonus(bonusRequest());
    const body = (await response.json()) as { state: { bonusGranted: boolean } };
    expect(body.state.bonusGranted).toBe(true);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]?.eqs).toContainEqual(["onboarding_bonus_granted", false]);
  });

  it("meldet keinen Bonus, wenn ein paralleler Request schneller war", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    mocks.billingRow = { monthly_tokens: 0, used_tokens: 0, onboarding_bonus_granted: false, stripe_subscription_id: null };
    mocks.updateResult = [];
    const response = await onboardingBonus(bonusRequest());
    const body = (await response.json()) as { state: { bonusGranted: boolean } };
    expect(body.state.bonusGranted).toBe(false);
  });
});
