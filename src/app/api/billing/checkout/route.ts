import { billingOwnerDenied } from "@/lib/dashboard/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getAppBaseUrlOrigin,
  isBillingCheckoutEnabled,
  isKleinunternehmerModeEnabled,
  isStripeAutomaticTaxEnabled,
  isSupabaseConfigured,
} from "@/lib/supabase/env";
import { ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { resolveStripeCustomerId } from "@/lib/billing/stripeCustomer";
import { getPriceIdForPlan } from "@/lib/billing/stripePrices";
import { getStripeClient, isStripeConfigured, stripeConfigurationError } from "@/lib/billing/stripeServer";
import type { BillingInterval } from "@/lib/billing/planCatalog";
import { type SubscriptionPlanKey } from "@/lib/billing/tokenState";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { checkoutConsentTimestamp, checkoutIdempotencyKey } from "@/lib/billing/checkoutIdempotency";

const checkoutSchema = z.object({
  plan: z.enum(["start", "growth", "pro", "enterprise"]),
  interval: z.enum(["monthly", "yearly"]).optional().default("yearly"),
  consumerEarlyPerformanceConsent: z.literal(true),
});

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "billing-checkout",
      limit: 10,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    if (!isBillingCheckoutEnabled()) {
      return NextResponse.json({ error: "Checkout ist derzeit deaktiviert." }, { status: 403 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: stripeConfigurationError(), code: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { const denied = await billingOwnerDenied(user.id); if (denied) return denied; }
    if (!user) {
      return NextResponse.json(
        { error: "Konto erforderlich. Bitte zuerst registrieren.", code: "ACCOUNT_REQUIRED" },
        { status: 401 },
      );
    }

    const parsed = checkoutSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Bitte bestätige die Zustimmung zum Leistungsbeginn vor Ablauf der Widerrufsfrist.",
          code: "CONSUMER_CONSENT_REQUIRED",
        },
        { status: 400 },
      );
    }
    const plan: SubscriptionPlanKey = parsed.data.plan;
    const interval: BillingInterval = parsed.data.interval;

    const stripe = getStripeClient();
    await ensureBillingRow(user.id);
    const billing = await getBillingRow(user.id);

    const customerId = await resolveStripeCustomerId({
      stripe,
      userId: user.id,
      email: user.email,
      existingCustomerId: billing?.stripe_customer_id ?? null,
    });

    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (subscriptions.data.some(sub => !["canceled", "incomplete_expired"].includes(sub.status))) return NextResponse.json({ error: "Es besteht bereits ein Abo. Bitte über die Aboverwaltung ändern." }, { status: 409 });
    const admin = createAdminClient();
    const claim = await admin.rpc("billing_claim_checkout", { p_user: user.id, p_plan: plan, p_interval: interval });
    if (claim.error) {
      console.warn("[billing/checkout] Checkout-Lock verweigert", claim.error);
      return NextResponse.json(
        { error: "Für dein Konto ist noch ein anderer Checkout offen. Schließ ihn bitte zuerst ab oder versuch es später noch einmal." },
        { status: 409 },
      );
    }
    const lock = await admin.from("billing_checkout_locks").select("expires_at").eq("user_id", user.id).maybeSingle();
    const priceId = getPriceIdForPlan(plan, interval);
    const origin = getAppBaseUrlOrigin(new URL(req.url).origin);
    const kleinunternehmerMode = isKleinunternehmerModeEnabled();
    const automaticTaxEnabled = isStripeAutomaticTaxEnabled();
    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/pricing?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard/pricing?billing=cancel`,
      billing_address_collection: automaticTaxEnabled ? "required" : "auto",
      tax_id_collection: { enabled: automaticTaxEnabled },
      customer_update: automaticTaxEnabled
        ? {
            address: "auto",
            name: "auto",
          }
        : undefined,
      automatic_tax: { enabled: automaticTaxEnabled },
      custom_text: kleinunternehmerMode
        ? {
            submit: {
              message: "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
            },
          }
        : undefined,
      metadata: {
        user_id: user.id,
        plan,
        interval,
        consumer_early_performance_consent: "1",
        consumer_early_performance_consent_at: checkoutConsentTimestamp(lock.data?.expires_at),
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          interval,
          consumer_early_performance_consent: "1",
        },
      },
    };
    const session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: checkoutIdempotencyKey(String(claim.data), params),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing/checkout] Checkout fehlgeschlagen", error);
    return NextResponse.json(
      { error: "Der Checkout konnte gerade nicht gestartet werden. Bitte versuch es in einem Moment noch einmal." },
      { status: 500 },
    );
  }
}

