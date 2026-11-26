import { billingOwnerDenied } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  activatePlanForUser,
  grantTokenPackSession,
  getBillingRow,
} from "@/lib/billing/store";
import { getStripeClient, mapPriceIdToPlan, syncBillingFromStripe } from "@/lib/billing/stripeSync";
import { enforceRateLimit, enforceSameOrigin } from "@/lib/security/requestGuards";
import { type SubscriptionPlanKey } from "@/lib/billing/tokenState";

export async function POST(req: Request) {
  try {
    const rateError = enforceRateLimit(req, {
      keyPrefix: "billing-confirm-session",
      limit: 12,
      windowMs: 60_000,
    });
    if (rateError) return rateError;
    const originError = enforceSameOrigin(req);
    if (originError) return originError;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
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

    const body = z.object({ sessionId: z.string().trim().min(1).max(200) }).safeParse(await req.json());
    if (!body.success) {
      return NextResponse.json({ error: "sessionId fehlt." }, { status: 400 });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(body.data.sessionId, {
      expand: ["subscription"],
    });
    if (session.payment_status !== "paid" && session.status !== "complete") {
      return NextResponse.json({ error: "Zahlung nicht abgeschlossen." }, { status: 400 });
    }

    const userIdMeta = session.metadata?.user_id;
    if (!userIdMeta || userIdMeta !== user.id) {
      return NextResponse.json({ error: "Session gehoert nicht zum User." }, { status: 403 });
    }

    if (session.mode === "payment" && session.metadata?.kind === "token_pack") {
      try {
        if (session.payment_status !== "paid") {
          return NextResponse.json({ error: "Zahlung noch nicht bestätigt." }, { status: 400 });
        }
        const tokens = Number(session.metadata?.tokens ?? "0");
        if (!Number.isSafeInteger(tokens) || tokens <= 0) {
          return NextResponse.json({ error: "Token-Metadaten ungueltig." }, { status: 400 });
        }
        const packId = (session.metadata?.pack_id ?? session.metadata?.pack ?? "tokens").toString();
        const claimed = await grantTokenPackSession({
          sessionId: session.id,
          userId: user.id,
          packId,
          tokens,
          source: "confirm_session",
        });
        const row = await getBillingRow(user.id);
        return NextResponse.json({
          ok: true,
          alreadyGranted: !claimed,
          receipt: {
            kind: "token_pack" as const,
            productLabel: `Token-Paket · ${tokens.toLocaleString("de-DE")} Tokens`,
            tokensGranted: claimed ? tokens : null,
            remainingTokens: row ? Math.max(row.monthly_tokens - row.used_tokens, 0) : null,
            amountLabel: formatStripeAmount(session.amount_total, session.currency),
            sessionRef: session.id.slice(-8),
            dateLabel: new Date().toLocaleString("de-DE"),
          },
          state: row
            ? {
                plan: row.plan,
                monthlyTokens: row.monthly_tokens,
                usedTokens: row.used_tokens,
                remainingTokens: Math.max(row.monthly_tokens - row.used_tokens, 0),
                status: row.subscription_status,
              }
            : null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Token-Session-Bestätigung fehlgeschlagen.";
        return NextResponse.json({ error: message }, { status: 500 });
      }
    }

    if (session.mode !== "subscription") {
      return NextResponse.json({ error: "Keine Subscription-Session." }, { status: 400 });
    }

    const customerId =
      typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    const planFromMeta = (session.metadata?.plan as SubscriptionPlanKey | undefined) ?? null;
    const planFromPrice = mapPriceIdToPlan(subscription?.items.data[0]?.price?.id ?? null);
    const plan = planFromPrice ?? planFromMeta;
    if (!plan || !customerId || !subscription?.id) {
      return NextResponse.json({ error: "Session-Metadaten unvollstaendig." }, { status: 400 });
    }

    const subscriptionWithPeriod = subscription as Stripe.Subscription & { current_period_end?: number };
    const currentPeriodEndUnix =
      typeof subscriptionWithPeriod.current_period_end === "number"
        ? subscriptionWithPeriod.current_period_end
        : subscription.items.data[0]?.current_period_end ?? null;

    await activatePlanForUser({
      userId: user.id,
      plan,
      subscriptionStatus:
        (subscription.status as "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid") ?? "active",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      currentPeriodStart: new Date((subscription.items.data[0]?.current_period_start ?? subscription.start_date) * 1000).toISOString(),
      currentPeriodEnd: currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null,
    });

    await syncBillingFromStripe({ userId: user.id, userEmail: user.email });
    const row = await getBillingRow(user.id);

    return NextResponse.json({
      ok: true,
      receipt: {
        kind: "subscription" as const,
        productLabel: `BrewAI ${plan.charAt(0).toUpperCase()}${plan.slice(1)}`,
        plan,
        remainingTokens: row ? Math.max(row.monthly_tokens - row.used_tokens, 0) : null,
        amountLabel: formatStripeAmount(session.amount_total, session.currency),
        sessionRef: session.id.slice(-8),
        dateLabel: new Date().toLocaleString("de-DE"),
      },
      state: row
        ? {
            plan: row.plan,
            monthlyTokens: row.monthly_tokens,
            usedTokens: row.used_tokens,
            remainingTokens: Math.max(row.monthly_tokens - row.used_tokens, 0),
            status: row.subscription_status,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Session-Bestätigung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatStripeAmount(amountTotal: number | null, currency: string | null): string | null {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return null;
  const cur = (currency ?? "eur").toUpperCase();
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: cur,
    }).format(amountTotal / 100);
  } catch {
    return `${(amountTotal / 100).toFixed(2)} ${cur}`;
  }
}
