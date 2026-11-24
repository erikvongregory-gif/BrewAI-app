import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  activatePlanForUser,
  grantTokenPackSession,
  getByStripeCustomerId,
  getByStripeSubscriptionId,
  hasBillingRow,
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  releaseStripeWebhookEvent,
  renewBillingPeriodTokens,
  cancelBillingSubscription,
} from "@/lib/billing/store";
import { mapPriceIdToPlan } from "@/lib/billing/stripePrices";
import { getStripeClient } from "@/lib/billing/stripeServer";

function toIsoFromUnix(seconds?: number | null) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function getCurrentPeriodEndUnix(subscription: Stripe.Subscription) {
  const value = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
  return typeof value === "number" ? value : subscription.items.data[0]?.current_period_end ?? null;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;

  const fromParent = invoice.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  if (fromParent && typeof fromParent === "object" && "id" in fromParent) return fromParent.id;

  const lineSub = invoice.lines?.data?.[0]?.subscription;
  if (typeof lineSub === "string") return lineSub;
  if (lineSub && typeof lineSub === "object" && "id" in lineSub) return lineSub.id;

  return null;
}

export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET fehlt." }, { status: 500 });
    }

    const stripe = getStripeClient();
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Stripe-Signatur fehlt." }, { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    // Token purchases have their own transactional deduplication. Do not put a
    // separate event claim in front of it: a process crash could strand a payment.
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind === "token_pack") {
        if (session.payment_status !== "paid") return NextResponse.json({ received: true, awaitingPayment: true });
        const userId = session.metadata.user_id;
        const tokens = Number(session.metadata.tokens);
        if (!userId || !Number.isSafeInteger(tokens) || tokens <= 0) {
          throw new Error("Token-Kauf-Metadaten ungültig.");
        }
        // Stripe-Konto wird mit EvGlab geteilt (gleiche Metadaten-Felder): fremde Nutzer ignorieren.
        if (!(await hasBillingRow(userId))) return NextResponse.json({ received: true, ignored: true });
        await grantTokenPackSession({
          sessionId: session.id, userId, tokens,
          packId: session.metadata.pack_id ?? session.metadata.pack ?? "tokens",
          source: "webhook",
        });
        return NextResponse.json({ received: true });
      }
    }
    const claimed = await claimStripeWebhookEvent(event.id, event.type);
    if (!claimed) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    try {
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscription = userId && subscriptionId && customerId
          ? await stripe.subscriptions.retrieve(subscriptionId) : null;
        // Nur BrewAI-Preise: EvGlab-Checkouts tragen dieselben Metadaten (user_id, plan).
        const plan = mapPriceIdToPlan(subscription?.items.data[0]?.price.id);
        if (userId && subscription && plan && subscriptionId && customerId) {
          await activatePlanForUser({
            userId,
            plan,
            subscriptionStatus:
              (subscription.status as "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid") ?? "active",
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            currentPeriodEnd: toIsoFromUnix(getCurrentPeriodEndUnix(subscription)),
    currentPeriodStart: toIsoFromUnix(subscription.items.data[0]?.current_period_start ?? subscription.start_date),
          });
        }
      }

      if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created") {
        const subscription = await stripe.subscriptions.retrieve((event.data.object as Stripe.Subscription).id);
        const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const mappedPlan = mapPriceIdToPlan(priceId);
        // Kunden werden mit EvGlab geteilt: nur Abos mit BrewAI-Preis übernehmen.
        if (customerId && mappedPlan) {
          const row = await getByStripeCustomerId(customerId);
          if (row) {
            const plan = mappedPlan;
            await activatePlanForUser({
              userId: row.user_id, plan,
              subscriptionStatus: subscription.status === "paused" || subscription.status === "incomplete_expired"
                ? "incomplete" : subscription.status,
              stripeCustomerId: customerId, stripeSubscriptionId: subscription.id,
              currentPeriodEnd: toIsoFromUnix(getCurrentPeriodEndUnix(subscription)),
    currentPeriodStart: toIsoFromUnix(subscription.items.data[0]?.current_period_start ?? subscription.start_date),
            });
          }
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        await cancelBillingSubscription(subscription.id, toIsoFromUnix(getCurrentPeriodEndUnix(subscription)));
      }

      if (event.type === "invoice.paid") {
        const invoice = event.data.object as Stripe.Invoice;
        const billingReason = invoice.billing_reason;
        if (billingReason === "subscription_cycle") {
          const subscriptionId = getInvoiceSubscriptionId(invoice);
          // Unbekanntes Abo = EvGlab; sonst würde die RPC werfen und Stripe endlos wiederholen.
          if (subscriptionId && (await getByStripeSubscriptionId(subscriptionId))) {
            const periodEnd = invoice.lines.data.find((line) => {
              const details = line.parent?.subscription_item_details;
              const lineSubscription = details?.subscription ??
                (typeof line.subscription === "string" ? line.subscription : line.subscription?.id);
              return lineSubscription === subscriptionId && !details?.proration;
            })?.period.end;
            await renewBillingPeriodTokens({
              stripeSubscriptionId: subscriptionId,
              currentPeriodEnd: toIsoFromUnix(periodEnd),
            });
          }
        }
      }

      await markStripeWebhookEventProcessed(event.id);
      return NextResponse.json({ received: true });
    } catch (processingError) {
      await releaseStripeWebhookEvent(event.id);
      throw processingError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook-Verarbeitung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
