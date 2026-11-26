import { billingOwnerDenied } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
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
import { getStripeClient, isStripeConfigured, stripeConfigurationError } from "@/lib/billing/stripeServer";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";

type TokenPackKey = "tokens_500" | "tokens_2000";

function getPackConfig(pack: TokenPackKey) {
  const map: Record<TokenPackKey, { priceId?: string; tokens: number }> = {
    tokens_500: { priceId: process.env.STRIPE_PRICE_TOKENS_500, tokens: 500 },
    tokens_2000: { priceId: process.env.STRIPE_PRICE_TOKENS_2000, tokens: 2000 },
  };
  return map[pack];
}

export async function POST(req: Request) {
  try {
    const rateError = await enforceRateLimitPersistent(req, {
      keyPrefix: "billing-buy-tokens",
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
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    const body = z
      .object({
        pack: z.enum(["tokens_500", "tokens_2000"]),
        consumerEarlyPerformanceConsent: z.literal(true),
      })
      .safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json(
        {
          error:
            "Bitte bestätige die Zustimmung zum Leistungsbeginn vor Ablauf der Widerrufsfrist.",
          code: "CONSUMER_CONSENT_REQUIRED",
        },
        { status: 400 },
      );
    }
    const pack: TokenPackKey = body.data.pack;
    const packConfig = getPackConfig(pack);
    if (!packConfig?.priceId) {
      return NextResponse.json({ error: "Preis für Token-Pack ist nicht konfiguriert." }, { status: 500 });
    }

    await ensureBillingRow(user.id);
    const row = await getBillingRow(user.id);
    if (!row?.stripe_customer_id) {
      return NextResponse.json({ error: "Bitte zuerst ein Abo kaufen." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const customerId = await resolveStripeCustomerId({
      stripe,
      userId: user.id,
      email: user.email,
      existingCustomerId: row.stripe_customer_id,
    });
    const origin = getAppBaseUrlOrigin(new URL(req.url).origin);
    const kleinunternehmerMode = isKleinunternehmerModeEnabled();
    const automaticTaxEnabled = isStripeAutomaticTaxEnabled();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price: packConfig.priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?billing=success_tokens&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/dashboard?billing=cancel_tokens`,
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
        kind: "token_pack",
        tokens: String(packConfig.tokens),
        pack,
        consumer_early_performance_consent: "1",
        consumer_early_performance_consent_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json({ error: "Token-Pack Checkout konnte nicht gestartet werden." }, { status: 500 });
  }
}

