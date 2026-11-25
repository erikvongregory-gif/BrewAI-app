import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { hasPaidSubscription, paidPlanFromBilling } from "@/lib/billing/access";
import { isOwnerUser } from "@/lib/auth/owner";
import { buildOwnerBillingRow, ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/** Liest Billing nur aus der DB. Stripe-Sync läuft über Webhooks, Checkout und /api/billing/sync. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  user = await workspaceResourceUser(user, false, { hydrate: false });
  const freeTrialImageUsed = Boolean(user.user_metadata?.free_trial_image_used_at);
  const onboardingBonusClaimed = Boolean(user.user_metadata?.onboarding_bonus_claimed_at);

  if (isOwnerUser(user)) {
    const ownerRow = buildOwnerBillingRow(user.id);
    return NextResponse.json(
      {
        state: {
          plan: ownerRow.plan,
          monthlyTokens: ownerRow.monthly_tokens,
          usedTokens: 0,
          remainingTokens: ownerRow.monthly_tokens,
          status: ownerRow.subscription_status,
          unlimited: true,
          freeTrialImageUsed,
          onboardingBonusClaimed,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  await ensureBillingRow(user.id);
  const row = await getBillingRow(user.id);

  const state = row
    ? {
        plan: paidPlanFromBilling(row),
        monthlyTokens: row.monthly_tokens,
        usedTokens: row.used_tokens,
        remainingTokens: Math.max(row.monthly_tokens - row.used_tokens, 0),
        status: hasPaidSubscription(row) ? row.subscription_status : "none",
        unlimited: false,
        freeTrialImageUsed,
        onboardingBonusClaimed,
      }
    : {
        plan: null,
        monthlyTokens: 0,
        usedTokens: 0,
        remainingTokens: 0,
        status: "none",
        unlimited: false,
        freeTrialImageUsed,
        onboardingBonusClaimed,
      };
  return NextResponse.json({ state }, { headers: NO_STORE_HEADERS });
}

