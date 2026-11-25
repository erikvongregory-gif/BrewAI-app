import type { SubscriptionPlanKey } from "@/lib/billing/tokenState";
import { SUBSCRIPTION_PLAN_TOKENS } from "@/lib/billing/tokenState";
import {
  calculateSeedanceVideoTokenCost,
  formatPlanImageEstimate,
  formatPlanVideoEstimate,
} from "@/lib/billing/generationTokenCost";

export type BillingInterval = "monthly" | "yearly";

export type StudioPlanDefinition = {
  id: SubscriptionPlanKey;
  tag: string;
  name: string;
  monthly: number;
  yearly: number;
  /** Streichpreis Monatsabo (Marketing) */
  compareAtMonthly: number;
  /** z. B. „21% Ersparnis inklusive“ */
  savingsLabel: string;
  recommended?: boolean;
  features: string[];
};

/** Übertrag ungenutzter Abo-Tokens in Tagen ab Periodenende. */
export const TOKEN_CARRY_DAYS_BY_PLAN: Record<SubscriptionPlanKey, number> = {
  start: 0,
  growth: 30,
  pro: 60,
  enterprise: 90,
};

export const PLAN_SEAT_LIMITS: Record<SubscriptionPlanKey, number> = {
  start: 1,
  growth: 3,
  pro: 10,
  enterprise: 25,
};

export function carryFeatureLabel(planId: SubscriptionPlanKey): string {
  const days = TOKEN_CARRY_DAYS_BY_PLAN[planId];
  if (days <= 0) return "Keine Übertragung ungenutzter Tokens";
  if (days <= 30) return "Ungenutzte Tokens 1 Monat übertragbar";
  if (days <= 60) return "Ungenutzte Tokens 2 Monate übertragbar";
  return "Ungenutzte Tokens 3 Monate übertragbar";
}

export function planSeatLimit(plan: SubscriptionPlanKey | null | undefined): number {
  if (!plan) return 1;
  return PLAN_SEAT_LIMITS[plan] ?? 1;
}

function buildPlanFeatures(planId: SubscriptionPlanKey, teamLine: string, supportLine: string): string[] {
  const tokens = SUBSCRIPTION_PLAN_TOKENS[planId];
  return [
    `${tokens.toLocaleString("de-DE")} Tokens / Monat`,
    `${formatPlanImageEstimate(tokens)} · ${formatPlanVideoEstimate(tokens)}`,
    "Videos erstellen mit Seedance 2.5",
    teamLine,
    supportLine,
    carryFeatureLabel(planId),
  ];
}

export const STUDIO_PLANS: StudioPlanDefinition[] = [
  {
    id: "start",
    tag: "Für kleine Teams, die regelmäßig posten",
    name: "Brauerei Start",
    monthly: 79,
    yearly: 65,
    compareAtMonthly: 100,
    savingsLabel: "21% Ersparnis inklusive",
    features: buildPlanFeatures(
      "start",
      "1 Teamplatz (Inhaber inklusive)",
      "E-Mail-Support",
    ),
  },
  {
    id: "growth",
    tag: "Für aktive Brauereien mit Saisonkampagnen",
    name: "Brauerei Wachstum",
    monthly: 149,
    yearly: 125,
    compareAtMonthly: 200,
    savingsLabel: "26% Ersparnis inklusive",
    recommended: true,
    features: buildPlanFeatures(
      "growth",
      "3 Teamplätze (Inhaber inklusive)",
      "Priorisierter Support",
    ),
  },
  {
    id: "pro",
    tag: "Für Marken mit hohem Content-Bedarf",
    name: "Brauerei Pro",
    monthly: 299,
    yearly: 249,
    compareAtMonthly: 400,
    savingsLabel: "25% Ersparnis inklusive",
    features: buildPlanFeatures(
      "pro",
      "10 Teamplätze (Inhaber inklusive)",
      "Fast-Lane Rendering + Premium-Support",
    ),
  },
  {
    id: "enterprise",
    tag: "Für Gruppen, Verbünde und Agenturen",
    name: "Brauerei Enterprise",
    monthly: 599,
    yearly: 499,
    compareAtMonthly: 799,
    savingsLabel: "25% Ersparnis inklusive",
    features: buildPlanFeatures(
      "enterprise",
      "25 Teamplätze (Inhaber inklusive)",
      "Direkter Ansprechpartner für euer Team",
    ),
  },
];

export const PLAN_ORDER: SubscriptionPlanKey[] = ["start", "growth", "pro", "enterprise"];

export function planRank(plan: SubscriptionPlanKey): number {
  return PLAN_ORDER.indexOf(plan);
}

/** Angezeigter Monatspreis: jährlich = Aktionspreis, Monatsabo = Listenpreis. */
export function getPlanDisplayMonthlyPrice(plan: StudioPlanDefinition, yearlyBilling: boolean): number {
  return yearlyBilling ? plan.monthly : plan.compareAtMonthly;
}

/** Jährliche Ersparnis gegenüber Listenpreis (nur bei jährlicher Zahlung relevant). */
export function getPlanAnnualSavingsVsList(plan: StudioPlanDefinition): number {
  return (plan.compareAtMonthly - plan.monthly) * 12;
}

/** Hinweis für UI: typischer Video-Verbrauch (720p, 5 s, mit Audio) – Werte aus der echten Abrechnungsformel. */
const STANDARD_VIDEO_COST_SEEDANCE_2 = calculateSeedanceVideoTokenCost({
  resolution: "720p",
  duration: 5,
  generateAudio: true,
  modelId: "seedance-2",
});
const STANDARD_VIDEO_COST_SEEDANCE_25 = calculateSeedanceVideoTokenCost({
  resolution: "720p",
  duration: 5,
  generateAudio: true,
  modelId: "seedance-2.5",
});
export const SEEDANCE_VIDEO_TOKEN_HINT =
  `Ein Standard-Video (720p · 5 s · mit Audio) kostet mit Seedance 2 ${STANDARD_VIDEO_COST_SEEDANCE_2} Tokens, ` +
  `mit Seedance 2.5 ${STANDARD_VIDEO_COST_SEEDANCE_25} Tokens — Varianten und längere Clips multiplizieren 1:1.`;
