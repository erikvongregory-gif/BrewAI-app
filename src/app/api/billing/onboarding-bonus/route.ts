import { getWorkspace } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOwnerUser } from "@/lib/auth/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { hasPaidSubscription, paidPlanFromBilling } from "@/lib/billing/access";
import { buildOwnerBillingRow, ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isDisposableEmail, normalizeEmailIdentity } from "@/lib/auth/disposableEmail";

const ONBOARDING_BONUS_TOKENS = 50;
const BONUS_CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_CLAIM_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

function isMissingOnboardingBonusRpc(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    message.includes("billing_onboarding_bonus_atomic") ||
    message.includes("could not find the function")
  );
}

async function markOnboardingBonusClaimed(supabase: SupabaseClient, alreadyClaimed: boolean) {
  if (alreadyClaimed) return { error: null };
  const { error } = await supabase.auth.updateUser({
    data: { onboarding_bonus_claimed_at: new Date().toISOString() },
  });
  return { error };
}

/**
 * Tokens gutschreiben — kein Fake-Start-Abo. Nur Fallback, wenn die RPC fehlt.
 * Maßgeblich ist die serverseitige Spalte `onboarding_bonus_granted`, nicht
 * `user_metadata.onboarding_bonus_claimed_at` (das kann jeder Nutzer selbst löschen).
 */
async function grantOnboardingBonusLegacy(userId: string, amount: number): Promise<boolean> {
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("billing_subscriptions")
    .select("monthly_tokens,used_tokens,onboarding_bonus_granted,stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row || row.onboarding_bonus_granted === true || row.stripe_subscription_id) return false;
  const current = Math.max((row.monthly_tokens ?? 0) - (row.used_tokens ?? 0), 0);
  const { data: updated, error } = await admin
    .from("billing_subscriptions")
    .update({
      monthly_tokens: current + amount,
      used_tokens: 0,
      onboarding_bonus_granted: true,
    })
    .eq("user_id", userId)
    // Bedingte Aktualisierung: parallele Requests können den Bonus nicht doppelt buchen.
    .eq("onboarding_bonus_granted", false)
    .select("user_id");
  if (error) throw new Error(error.message);
  return Array.isArray(updated) && updated.length > 0;
}

export async function POST(req: Request) {
  const rateError = await enforceRateLimitPersistent(req, {
    keyPrefix: "billing-onboarding-bonus",
    limit: 10,
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
  if (user && (await getWorkspace(user.id)).role !== "owner") return NextResponse.json({error:"Abrechnung kann nur der Teaminhaber verwalten."},{status:403});
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const alreadyClaimed = Boolean(user.user_metadata?.onboarding_bonus_claimed_at);

  if (isOwnerUser(user)) {
    const ownerRow = buildOwnerBillingRow(user.id);
    await markOnboardingBonusClaimed(supabase, alreadyClaimed);
    return NextResponse.json({
      state: {
        plan: ownerRow.plan,
        monthlyTokens: ownerRow.monthly_tokens,
        usedTokens: 0,
        remainingTokens: ownerRow.monthly_tokens,
        status: ownerRow.subscription_status,
        unlimited: true,
        bonusGranted: false,
        bonusAlreadyClaimed: true,
      },
    });
  }

  await ensureBillingRow(user.id);
  let row = await getBillingRow(user.id);
  if (!row) {
    return NextResponse.json({ error: "Billing-Profil nicht gefunden." }, { status: 500 });
  }

  let bonusGranted = false;
  // Nur echtes Stripe-Abo blockiert den Bonus — nicht ein früheres Fake-Start.
  if (!alreadyClaimed && !hasPaidSubscription(row)) {
    const email = user.email?.trim() ?? "";
    if (!email || isDisposableEmail(email)) {
      return NextResponse.json(
        { error: "Willkommensbonus ist für diese E-Mail-Adresse nicht verfügbar.", code: "bonus_email_blocked" },
        { status: 403 },
      );
    }

    // Gmail-Aliase (+ / Punkte) zählen als eine Identität.
    const emailClaimLimit = await enforceRateLimitPersistent(
      req,
      { keyPrefix: "onboarding-bonus-email", limit: 1, windowMs: EMAIL_CLAIM_WINDOW_MS },
      { identifier: normalizeEmailIdentity(email) },
    );
    if (emailClaimLimit) {
      return NextResponse.json(
        { error: "Für diese E-Mail wurde der Willkommensbonus bereits vergeben.", code: "bonus_email_claimed" },
        { status: 429, headers: emailClaimLimit.headers },
      );
    }

    // Max 2 Bonus-Claims / IP / 7 Tage — bremst Massen-Signups vom gleichen Anschluss.
    const ipClaimLimit = await enforceRateLimitPersistent(req, {
      keyPrefix: "onboarding-bonus-ip",
      limit: 2,
      windowMs: BONUS_CLAIM_WINDOW_MS,
    });
    if (ipClaimLimit) {
      return NextResponse.json(
        { error: "Zu viele Willkommensboni von diesem Netzwerk. Bitte später erneut versuchen.", code: "bonus_ip_limited" },
        { status: 429, headers: ipClaimLimit.headers },
      );
    }

    const admin = createAdminClient();
    const { data: granted, error: updateError } = await admin.rpc("billing_onboarding_bonus_atomic", {
      p_user_id: user.id,
      p_amount: ONBOARDING_BONUS_TOKENS,
    });

    if (updateError) {
      if (!isMissingOnboardingBonusRpc(updateError)) {
        return NextResponse.json({ error: "Bonus konnte nicht gespeichert werden." }, { status: 500 });
      }
      try {
        bonusGranted = await grantOnboardingBonusLegacy(user.id, ONBOARDING_BONUS_TOKENS);
      } catch {
        return NextResponse.json({ error: "Bonus konnte nicht gespeichert werden." }, { status: 500 });
      }
    } else {
      bonusGranted = granted === true;
    }

    const { error: metadataError } = await markOnboardingBonusClaimed(supabase, false);
    if (metadataError) {
      return NextResponse.json({ error: "Bonus konnte nicht final gespeichert werden." }, { status: 500 });
    }

    row = await getBillingRow(user.id);
    if (!row) {
      return NextResponse.json({ error: "Billing-Profil nicht gefunden." }, { status: 500 });
    }
  }

  return NextResponse.json({
    state: {
      plan: paidPlanFromBilling(row),
      monthlyTokens: row.monthly_tokens,
      usedTokens: row.used_tokens,
      remainingTokens: Math.max(row.monthly_tokens - row.used_tokens, 0),
      status: hasPaidSubscription(row) ? row.subscription_status : "none",
      bonusGranted,
      bonusAlreadyClaimed: alreadyClaimed || hasPaidSubscription(row),
    },
  });
}
