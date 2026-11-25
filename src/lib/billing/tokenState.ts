import crypto from "crypto";

export type SubscriptionPlanKey = "start" | "growth" | "pro" | "enterprise";

export const SUBSCRIPTION_PLAN_TOKENS: Record<SubscriptionPlanKey, number> = {
  start: 400,
  growth: 1500,
  pro: 4500,
  enterprise: 12000,
};

export const SUBSCRIPTION_PLAN_KEYS: SubscriptionPlanKey[] = ["start", "growth", "pro", "enterprise"];

export function isSubscriptionPlanKey(value: string | null | undefined): value is SubscriptionPlanKey {
  return value === "start" || value === "growth" || value === "pro" || value === "enterprise";
}

export type BillingState = {
  plan: SubscriptionPlanKey | null;
  monthlyTokens: number;
  usedTokens: number;
};

const COOKIE_NAME = "evglab_billing_v1";

function getSecret() {
  return process.env.TOKEN_STATE_SECRET || process.env.NEXTAUTH_SECRET || "dev-token-secret-change-me";
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadB64: string) {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function serializeBillingState(state: BillingState) {
  const payload = toBase64Url(JSON.stringify(state));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function parseBillingState(raw: string | undefined | null): BillingState | null {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature !== expected) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as BillingState;
    if (
      !parsed ||
      (parsed.plan !== null && !(parsed.plan in SUBSCRIPTION_PLAN_TOKENS)) ||
      typeof parsed.monthlyTokens !== "number" ||
      typeof parsed.usedTokens !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getDefaultBillingState(): BillingState {
  return { plan: null, monthlyTokens: 0, usedTokens: 0 };
}

export function getCookieName() {
  return COOKIE_NAME;
}

