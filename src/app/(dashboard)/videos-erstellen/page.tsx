import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getServerUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { isOwnerUser } from "@/lib/auth/owner";
import { redirectUnlessStudioBilling } from "@/lib/dashboard/studioBillingGate";
import { getDashboardMetadata } from "@/lib/dashboard/metadata";
import { needsFullOnboardingFlow, sanitizeStudioOnboardingState } from "@/lib/dashboard/onboarding";
import { isVideosCreateEnabled } from "@/lib/featureFlags";
import { CreateVideosComingSoonView } from "@/components/studio/create-videos-coming-soon-view";
import { CreateVideosView } from "@/components/studio/create-videos-view";
import { orWorkspaceBlockedRedirect, workspaceResourceUser } from "@/lib/dashboard/workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    absolute: "BrewAI - Videos erstellen",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function VideosErstellenPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="relative z-10 mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Videos erstellen</h1>
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

  // Nur Onboarding-Status und Brauereiname werden gelesen: keine Asset-URLs signieren (A-6).
  const resourceUser = await orWorkspaceBlockedRedirect(workspaceResourceUser(user, false, { hydrate: false }));

  if (
    needsFullOnboardingFlow(
      sanitizeStudioOnboardingState(getDashboardMetadata(resourceUser.user_metadata).onboarding),
    )
  ) {
    redirect("/onboarding");
  }

  if (!isVideosCreateEnabled()) {
    return <CreateVideosComingSoonView />;
  }

  if (!isOwnerUser(user)) {
    await redirectUnlessStudioBilling(resourceUser);
  }

  const dashboard = (resourceUser.user_metadata?.dashboard ?? {}) as Record<string, unknown>;
  const settings = dashboard.settings as Record<string, unknown> | undefined;
  const breweryName =
    typeof settings?.breweryName === "string"
      ? settings.breweryName
      : typeof resourceUser.user_metadata?.brewery === "string"
        ? resourceUser.user_metadata.brewery
        : undefined;

  return <CreateVideosView breweryName={breweryName} />;
}
