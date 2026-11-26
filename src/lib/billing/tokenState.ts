// Client-sicher halten: wird von checkoutClient/planCatalog ins Browser-Bundle gezogen, keine Node-Imports.
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
