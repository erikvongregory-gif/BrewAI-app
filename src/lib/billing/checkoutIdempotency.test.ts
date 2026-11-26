import { expect, it } from "vitest";
import { checkoutConsentTimestamp, checkoutIdempotencyKey } from "./checkoutIdempotency";

const params = (consentAt: string) => ({ customer: "cus_1", metadata: { plan: "start", consumer_early_performance_consent_at: consentAt } });

it("keeps the consent timestamp stable for every attempt within one lock", () => {
  const first = checkoutConsentTimestamp("2026-11-27T10:00:00.000Z", new Date("2026-11-26T10:00:05Z"));
  const retry = checkoutConsentTimestamp("2026-11-27T10:00:00.000Z", new Date("2026-11-26T18:30:00Z"));
  expect(first).toBe("2026-11-26T10:00:00.000Z");
  expect(retry).toBe(first);
});

it("falls back to now when the lock timestamp is missing or invalid", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  expect(checkoutConsentTimestamp(null, now)).toBe(now.toISOString());
  expect(checkoutConsentTimestamp("kaputt", now)).toBe(now.toISOString());
});

it("reuses the key for an identical retry (no second subscription session)", () => {
  const consentAt = checkoutConsentTimestamp("2026-11-27T10:00:00.000Z");
  expect(checkoutIdempotencyKey("lock-1", params(consentAt))).toBe(checkoutIdempotencyKey("lock-1", params(consentAt)));
});

it("uses a new key when parameters change, so Stripe cannot reject the retry", () => {
  const a = checkoutIdempotencyKey("lock-1", params("2026-11-26T10:00:00.000Z"));
  const b = checkoutIdempotencyKey("lock-1", params("2026-11-26T10:00:01.000Z"));
  expect(a).not.toBe(b);
  expect(a.startsWith("checkout:lock-1:")).toBe(true);
  expect(a.length).toBeLessThanOrEqual(255);
});
