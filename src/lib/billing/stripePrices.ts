import type { BillingInterval } from "@/lib/billing/planCatalog";
import { getStripeSecretKey } from "@/lib/billing/stripeServer";
import { SUBSCRIPTION_PLAN_KEYS, type SubscriptionPlanKey } from "@/lib/billing/tokenState";

/** Aktuelle Price-IDs (Fallback wenn Env fehlt). */
const STRIPE_PRICE_FALLBACKS: Record<
  "test" | "live",
  Record<BillingInterval, Partial<Record<SubscriptionPlanKey, string>>>
> = {
  // Preisstufe 2026-11 (Endpreise, § 19 UStG ohne USt.): 29/79/199/499 monatlich, 24/65/165/415 × 12 jährlich
  test: {
    monthly: {
      start: "price_1UfO0wRsiwg9bLFF2uLeRMiK",
      growth: "price_1UfO1ERsiwg9bLFFCg4otiys",
      pro: "price_1UfO1GRsiwg9bLFFfMMf7iB4",
      enterprise: "price_1UfO1IRsiwg9bLFFwX6PRMUB",
    },
    yearly: {
      start: "price_1UfO1DRsiwg9bLFFP74WzcDX",
      growth: "price_1UfO1FRsiwg9bLFFj7ZKruCY",
      pro: "price_1UfO1HRsiwg9bLFFeUY9xdL5",
      enterprise: "price_1UfO1JRsiwg9bLFFyusXIPln",
    },
  },
  live: {
    monthly: {
      start: "price_1UfO1oRojElHlMEeFGZ6Aoge",
      growth: "price_1UfO1qRojElHlMEeTbWQlZqq",
      pro: "price_1UfO1sRojElHlMEeshEFMpak",
      enterprise: "price_1UfO1uRojElHlMEeMkBbVlac",
    },
    yearly: {
      start: "price_1UfO1pRojElHlMEeloXkYDjD",
      growth: "price_1UfO1rRojElHlMEeJYiG57KJ",
      pro: "price_1UfO1tRojElHlMEeen5gGTSp",
      enterprise: "price_1UfO1vRojElHlMEetcj2uwVq",
    },
  },
};

/**
 * Frühere Price-IDs — bestehende Abos/Webhooks weiter zuordnen.
 * Nach Live-Migration: neue IDs aus scripts/sync-stripe-plan-prices.mjs eintragen.
 */
const LEGACY_STRIPE_PRICE_TO_PLAN: Record<string, SubscriptionPlanKey> = {
  // Test — alt (79/149/299 monatlich, 65/125/249 jährlich)
  price_1TJarsRsiwg9bLFFudD7vEy7: "start",
  price_1TJasBRsiwg9bLFFDsrwFGBV: "growth",
  price_1TJasPRsiwg9bLFFLHg41tgG: "pro",
  price_1TeEoBRsiwg9bLFFpIv3vznP: "start",
  price_1TeEoBRsiwg9bLFFGkV9sJMW: "growth",
  price_1TeEoCRsiwg9bLFFVoOX8v8r: "pro",
  // Test — 100/200/400/799 monatlich, 79/149/299/599 × 12 jährlich (bis 2026-11)
  price_1TfFkpRsiwg9bLFF2V7TTEFO: "start",
  price_1TfFkqRsiwg9bLFFV0mTiqm9: "growth",
  price_1TfFkqRsiwg9bLFFCmDTMwiI: "pro",
  price_1UJ8GURsiwg9bLFFElVYqASH: "enterprise",
  price_1TfFkpRsiwg9bLFFvXQzd8om: "start",
  price_1TfFkqRsiwg9bLFFqiaPfndl: "growth",
  price_1TfFkqRsiwg9bLFFMQE8YRs7: "pro",
  price_1UJ8GURsiwg9bLFF4PCCTDeb: "enterprise",
  // Live — alt
  price_1TUMhBRojElHlMEe7nvvFwyM: "start",
  price_1TUMhBRojElHlMEeZhNWLsnq: "growth",
  price_1TUMh8RojElHlMEerxH4kFLp: "pro",
  price_1TeElhRojElHlMEeaOShHJry: "start",
  price_1TeElhRojElHlMEeRMLLZnUy: "growth",
  price_1TeElhRojElHlMEeOuZHA68v: "pro",
};

export function getStripePriceEnvKey(plan: SubscriptionPlanKey, interval: BillingInterval): string {
  const suffix = interval === "yearly" ? "YEARLY" : "MONTHLY";
  return `STRIPE_PRICE_${plan.toUpperCase()}_${suffix}`;
}

function getStripeMode(): "test" | "live" {
  const key = getStripeSecretKey() ?? "";
  return key.startsWith("sk_live_") ? "live" : "test";
}

function resolvePriceId(plan: SubscriptionPlanKey, interval: BillingInterval): string | undefined {
  const envKey = getStripePriceEnvKey(plan, interval);
  return process.env[envKey] ?? STRIPE_PRICE_FALLBACKS[getStripeMode()][interval][plan];
}

export function getPriceIdForPlan(plan: SubscriptionPlanKey, interval: BillingInterval = "monthly"): string {
  const priceId = resolvePriceId(plan, interval);
  if (!priceId) {
    throw new Error(`Stripe Price-ID für Plan "${plan}" (${interval}) fehlt.`);
  }
  return priceId;
}

export function mapPriceIdToPlan(priceId?: string | null): SubscriptionPlanKey | null {
  if (!priceId) return null;

  if (priceId in LEGACY_STRIPE_PRICE_TO_PLAN) {
    return LEGACY_STRIPE_PRICE_TO_PLAN[priceId];
  }

  const intervals: BillingInterval[] = ["monthly", "yearly"];
  for (const plan of SUBSCRIPTION_PLAN_KEYS) {
    for (const interval of intervals) {
      if (resolvePriceId(plan, interval) === priceId) return plan;
    }
  }

  return null;
}
