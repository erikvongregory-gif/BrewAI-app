import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/billing/store", () => ({ setStripeCustomerId: vi.fn() }));
import { resolveStripeCustomerId } from "./stripeCustomer";

describe("resolveStripeCustomerId", () => {
  it("binds the idempotency key to user and parameters", async () => {
    const create = vi.fn(async (_params: unknown, _opts: { idempotencyKey: string }) => ({ id: "cus_new" }));
    const stripe = { customers: { create, retrieve: vi.fn() } } as never;
    await resolveStripeCustomerId({ stripe, userId: "u1", email: "a@example.test" });
    await resolveStripeCustomerId({ stripe, userId: "u1", email: "a@example.test" });
    await resolveStripeCustomerId({ stripe, userId: "u1", email: "b@example.test" });
    const keys = create.mock.calls.map(([, opts]) => opts.idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[0].startsWith("customer:u1:")).toBe(true);
  });
});
