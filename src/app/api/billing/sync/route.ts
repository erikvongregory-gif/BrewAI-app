import { billingOwnerDenied } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { syncBillingFromStripe } from "@/lib/billing/stripeSync";
import { enforceRateLimit, enforceSameOrigin } from "@/lib/security/requestGuards";

export async function POST(req: Request) {
  try {
    const rateError = enforceRateLimit(req, {
      keyPrefix: "billing-sync",
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
  if (user) { const denied = await billingOwnerDenied(user.id); if (denied) return denied; }
    if (!user) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }

    await ensureBillingRow(user.id);
    const row = await getBillingRow(user.id);
    const syncResult = await syncBillingFromStripe({
      userId: user.id,
      userEmail: user.email,
      currentRow: row,
    });

    if (!syncResult.synced) {
      return NextResponse.json({ ok: true, synced: false, reason: syncResult.reason });
    }
    return NextResponse.json({ ok: true, synced: true, plan: syncResult.plan });
  } catch {
    return NextResponse.json({ error: "Billing-Sync fehlgeschlagen." }, { status: 500 });
  }
}

