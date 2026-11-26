import { orWorkspaceBlockedRedirect, workspaceResourceUser } from "@/lib/dashboard/workspace";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { getDashboardMetadata } from "@/lib/dashboard/metadata";
import { needsFullOnboardingFlow, sanitizeStudioOnboardingState } from "@/lib/dashboard/onboarding";
import { isOwnerUser } from "@/lib/auth/owner";
import { redirectUnlessStudioBilling } from "@/lib/dashboard/studioBillingGate";
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

  const user = await getServerUser();

  if (!user) {
    redirect("/anmelden");
  }

  // Nur Onboarding-Status wird gelesen: keine Asset-URLs signieren (A-6).
  const resourceUser = await orWorkspaceBlockedRedirect(workspaceResourceUser(user, false, { hydrate: false }));
  if (
    needsFullOnboardingFlow(
      sanitizeStudioOnboardingState(getDashboardMetadata(resourceUser.user_metadata).onboarding),
    )
  ) {
    redirect("/onboarding");
  }

  if (!isOwnerUser(user)) {
    await redirectUnlessStudioBilling(resourceUser);
  }

  return <InhalteErstellenMoonChatPage />;
}
