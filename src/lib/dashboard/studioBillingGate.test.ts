import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  row: null as unknown,
  after: vi.fn(),
  sync: vi.fn(async () => ({ synced: true })),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT ${path}`);
  }),
}));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/billing/store", () => ({ ensureBillingRow: async () => {}, getBillingRow: async () => m.row }));
vi.mock("@/lib/billing/stripeSync", () => ({ syncBillingFromStripe: m.sync }));

import { redirectUnlessStudioBilling } from "./studioBillingGate";

const user = { id: "u1", email: "a@example.test" };
beforeEach(() => vi.clearAllMocks());

it("lets users with tokens in without touching Stripe", async () => {
  m.row = { plan: null, subscription_status: "none", stripe_subscription_id: null, monthly_tokens: 10, used_tokens: 2 };
  await redirectUnlessStudioBilling(user);
  expect(m.redirect).not.toHaveBeenCalled();
  expect(m.after).not.toHaveBeenCalled();
});

it("redirects without credit and repairs from Stripe only after the response", async () => {
  m.row = { plan: null, subscription_status: "none", stripe_subscription_id: null, monthly_tokens: 5, used_tokens: 5 };
  await expect(redirectUnlessStudioBilling(user)).rejects.toThrow("REDIRECT /dashboard/pricing");
  expect(m.sync).not.toHaveBeenCalled();
  expect(m.after).toHaveBeenCalledTimes(1);
  await m.after.mock.calls[0][0]();
  expect(m.sync).toHaveBeenCalledWith({ userId: "u1", userEmail: "a@example.test", currentRow: m.row });
});
