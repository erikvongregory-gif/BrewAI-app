import { createAdminClient } from "@/lib/supabase/admin";
import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isOwnerUser } from "@/lib/auth/owner";
import { hasPaidSubscription, paidPlanFromBilling } from "@/lib/billing/access";
import { buildOwnerBillingRow, ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { loadGenerationUsageStats } from "@/lib/dashboard/generationUsage";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, false, { hydrate: false }); } catch { return NextResponse.json({error:"Teamzugriff nicht erlaubt."},{status:403}); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const userId = user.id;

  const isOwner = isOwnerUser(user);
  const client = createAdminClient();

  // Alle Abfragen sind voneinander unabhängig — parallel statt ~10 Roundtrips hintereinander.
  const billingTask = (async () => {
    if (isOwner) return { billing: buildOwnerBillingRow(userId), degradedBilling: false };
    try {
      await ensureBillingRow(userId);
      return { billing: await getBillingRow(userId), degradedBilling: false };
    } catch (error) {
      console.error("dashboard.summary: billing fallback aktiv", error);
      return { billing: null, degradedBilling: true };
    }
  })();

  const [{ billing, degradedBilling }, activeMembers, pendingInvites, usage, chargesCount] = await Promise.all([
    billingTask,
    client.from("workspace_members").select("user_id").eq("owner_id", userId),
    client.from("workspace_invites").select("id").eq("owner_id", userId).gt("expires_at", new Date().toISOString()),
    // Verbrauchsstatistik aus generation_jobs — überlebt Mediathek-Löschen (paginiert, kein Media-Fallback)
    loadGenerationUsageStats({
      countCompletedSince: async (iso) => {
        const result = await client
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("created_at", iso);
        return { count: result.count ?? null, error: result.error };
      },
      listCompletedPage: async (cutoffIso, from, to) => {
        const result = await client
          .from("generation_jobs")
          .select("created_at,charged,result")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: true })
          .range(from, to);
        return { data: result.data ?? null, error: result.error };
      },
    }),
    client
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
  ]);

  if (activeMembers.error || pendingInvites.error) return NextResponse.json({ error: "Teamdaten konnten nicht geladen werden." }, { status: 503 });
  const activeMemberCount = 1 + (activeMembers.data ?? []).length;
  const invitedCount = (pendingInvites.data ?? []).length;
  const { postsThisMonth, tokenUsageByDay, degradedUsage } = usage;
  const chargesTotal = chargesCount.error ? undefined : (chargesCount.count ?? 0);

  return NextResponse.json({
    summary: {
      unlimited: isOwner,
      tokens: {
        monthly: billing?.monthly_tokens ?? 0,
        used: billing?.used_tokens ?? 0,
        remaining: Math.max((billing?.monthly_tokens ?? 0) - (billing?.used_tokens ?? 0), 0),
        unlimited: isOwner,
      },
      periodEnd: billing?.current_period_end ?? null,
      postsThisMonth,
      chargesTotal,
      teamMembers: activeMemberCount,
      openInvites: invitedCount,
      billingStatus: isOwner
        ? (billing?.subscription_status ?? "active")
        : hasPaidSubscription(billing)
          ? (billing?.subscription_status ?? "none")
          : "none",
      // Nur Stripe-Abo (oder Owner) — Willkommensbonus nicht als „Aktueller Plan“
      plan: isOwner ? (billing?.plan ?? null) : paidPlanFromBilling(billing),
      degradedBilling,
      degradedUsage,
      tokenUsageByDay,
    },
  });
}
