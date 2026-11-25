import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/twoFactorSession",()=>({hasPassedTwoFactor:async()=>true}));
vi.mock("@/lib/dashboard/workspace",()=>({getWorkspace:async()=>({ownerId:"user_one",role:"owner"})}));
const mocks = vi.hoisted(() => ({
  grant: vi.fn(), claim: vi.fn(), renew: vi.fn(), activate: vi.fn(),
  release: vi.fn(), processed: vi.fn(), retrieve: vi.fn(), event: vi.fn(),
  sync: vi.fn(), row: vi.fn(), hasRow: vi.fn(), bySub: vi.fn(),
}));
vi.mock("@/lib/billing/store", () => ({
  grantTokenPackSession: mocks.grant, claimStripeWebhookEvent: mocks.claim,
  renewBillingPeriodTokens: mocks.renew, activatePlanForUser: mocks.activate,
  releaseStripeWebhookEvent: mocks.release, markStripeWebhookEventProcessed: mocks.processed,
  cancelBillingSubscription: vi.fn(), getByStripeCustomerId: vi.fn(), getBillingRow: mocks.row,
  hasBillingRow: mocks.hasRow, getByStripeSubscriptionId: mocks.bySub,
}));
vi.mock("@/lib/billing/stripeServer", () => ({
  getStripeClient: () => ({ webhooks: { constructEvent: mocks.event } }),
}));
vi.mock("@/lib/billing/stripePrices", () => ({ mapPriceIdToPlan: () => "start" }));
vi.mock("@/lib/billing/stripeSync", () => ({
  getStripeClient: () => ({ checkout: { sessions: { retrieve: mocks.retrieve } } }),
  mapPriceIdToPlan: () => "start", syncBillingFromStripe: mocks.sync,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user_one" } } }) } }),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/security/requestGuards", () => ({ enforceRateLimit: () => null, enforceSameOrigin: () => null }));

import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { POST as confirm } from "@/app/api/billing/confirm-session/route";

const session = {
  id: "cs_one", mode: "payment", status: "complete", payment_status: "paid",
  metadata: { user_id: "user_one", kind: "token_pack", tokens: "100", pack_id: "pack" },
};
function request() {
  return new Request("http://localhost/api", { method: "POST", headers: { "stripe-signature": "test" }, body: JSON.stringify({ sessionId: "cs_one" }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test_secret");
  mocks.grant.mockResolvedValue(true); mocks.claim.mockResolvedValue(true);
  mocks.row.mockResolvedValue(null);
  mocks.hasRow.mockResolvedValue(true); mocks.bySub.mockResolvedValue({ user_id: "user_one" });
  mocks.retrieve.mockResolvedValue(session);
  mocks.event.mockReturnValue({ id: "evt_one", type: "checkout.session.completed", data: { object: session } });
});

describe("token purchase routes", () => {
  it("both entry points use the same atomic session grant", async () => {
    expect((await webhook(request())).status).toBe(200);
    expect((await confirm(request())).status).toBe(200);
    expect(mocks.grant).toHaveBeenNthCalledWith(1, expect.objectContaining({ sessionId: "cs_one", source: "webhook", tokens: 100 }));
    expect(mocks.grant).toHaveBeenNthCalledWith(2, expect.objectContaining({ sessionId: "cs_one", source: "confirm_session", tokens: 100 }));
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("does not acknowledge a failed grant and allows retry", async () => {
    mocks.grant.mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await webhook(request())).status).toBeGreaterThanOrEqual(400);
    expect(mocks.processed).not.toHaveBeenCalled();
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.grant).toHaveBeenCalledTimes(2);
  });
  it("confirmation surfaces a grant failure instead of reporting success", async () => {
    mocks.grant.mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await confirm(request())).status).toBe(500);
  });
  it("a completed but unpaid checkout receives no tokens", async () => {
    const unpaid = { ...session, payment_status: "unpaid" };
    mocks.retrieve.mockResolvedValue(unpaid);
    mocks.event.mockReturnValue({ type: "checkout.session.completed", data: { object: unpaid } });
    expect((await webhook(request())).status).toBe(200);
    expect((await confirm(request())).status).toBe(400);
    expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("credits a delayed payment on its success event", async () => {
    mocks.event.mockReturnValue({ type: "checkout.session.async_payment_succeeded", data: { object: session } });
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.grant).toHaveBeenCalledTimes(1);
  });
  it("does not reset monthly consumption on a plan-change invoice", async () => {
    mocks.event.mockReturnValue({ id: "evt_update", type: "invoice.paid", data: { object: { billing_reason: "subscription_update" } } });
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.renew).not.toHaveBeenCalled();
  });
  it("uses the billed subscription period, ignoring unrelated invoice items", async () => {
    mocks.event.mockReturnValue({ id: "evt_cycle", type: "invoice.paid", data: { object: {
      billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_one" } },
      lines: { data: [
        { period: { end: 1 } },
        { parent: { subscription_item_details: { subscription: "sub_one", proration: false } }, period: { end: 1790812800 } },
      ] },
    } } });
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.renew).toHaveBeenCalledWith({ stripeSubscriptionId: "sub_one", currentPeriodEnd: new Date(1790812800 * 1000).toISOString() });
  });
  it("ignores an EvGlab token purchase from the shared Stripe account", async () => {
    mocks.hasRow.mockResolvedValue(false);
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.grant).not.toHaveBeenCalled();
  });
  it("acknowledges an EvGlab renewal instead of failing it", async () => {
    mocks.bySub.mockResolvedValue(null);
    mocks.event.mockReturnValue({ id: "evt_evg", type: "invoice.paid", data: { object: {
      billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_evg" } }, lines: { data: [] },
    } } });
    expect((await webhook(request())).status).toBe(200);
    expect(mocks.renew).not.toHaveBeenCalled();
  });
});
