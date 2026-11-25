import { workspaceResourceUser } from "@/lib/dashboard/workspace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { getDashboardMetadata } from "@/lib/dashboard/metadata";
import { needsFullOnboardingFlow, sanitizeStudioOnboardingState } from "@/lib/dashboard/onboarding";
import { isOwnerUser } from "@/lib/auth/owner";
import { ensureBillingRow, getBillingRow } from "@/lib/billing/store";
import { hasActiveSubscription } from "@/lib/billing/access";
import { syncBillingFromStripe } from "@/lib/billing/stripeSync";
import { InhalteErstellenMoonChatPage } from "@/components/ui/inhalte-erstellen-moon-chat-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    absolute: "BrewAI - Bilder erstellen",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function InhalteErstellenPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="relative z-10 mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Bilder erstellen</h1>
        <p className="mt-4 text-zinc-600">Supabase ist noch nicht konfiguriert.</p>
        <a href={MARKETING_SITE_URL} className="mt-6 inline-block text-sm font-medium text-[#c65a20] hover:underline">
          Zur Startseite
        </a>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/anmelden");
  }

  const resourceUser = await workspaceResourceUser(user);
  if (
    needsFullOnboardingFlow(
      sanitizeStudioOnboardingState(getDashboardMetadata(resourceUser.user_metadata).onboarding),
    )
  ) {
    redirect("/onboarding");
  }

  if (!isOwnerUser(user)) {
    await ensureBillingRow(resourceUser.id);
    let billing = await getBillingRow(resourceUser.id);
    // Begrenzte Reparatur vor Zugangssperre — nicht beim normalen Dashboard-Besuch.
    if (!hasActiveSubscription(billing)) {
      try {
        const syncResult = await syncBillingFromStripe({
          userId: resourceUser.id,
          userEmail: resourceUser.email,
          currentRow: billing,
        });
        if (syncResult.synced) {
          billing = await getBillingRow(resourceUser.id);
        }
      } catch {
        /* Stripe optional */
      }
    }

    if (!hasActiveSubscription(billing)) {
      redirect("/dashboard/pricing");
    }
  }

  return <InhalteErstellenMoonChatPage />;
}
