import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Viewport } from "next";
import { cookies } from "next/headers";
import { BrewAiAdminShell } from "@/components/dashboard-shell/brewai-admin-shell";
import StudioDashboardLoading from "./loading";
import { hasAdminAccess, isOwnerUser } from "@/lib/auth/owner";
import { TWO_FACTOR_PAGE, hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { getShellGateDashboardMetadata } from "@/lib/dashboard/freshMetadata";
import {
  isUiTourComplete,
  needsFullOnboardingFlow,
  sanitizeStudioOnboardingState,
} from "@/lib/dashboard/onboarding";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getPreference } from "@/server/server-actions";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

export const viewport: Viewport = {
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default async function StudioDashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return children;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return children;
  }

  if (!(await hasPassedTwoFactor(user))) {
    redirect(TWO_FACTOR_PAGE);
  }

  // Nur Gate + Profiltexte — keine Asset-Signing-/Beers-Ladung im Shell-Pfad.
  const dashboard = await getShellGateDashboardMetadata(user.id, user.user_metadata);
  const onboardingState = sanitizeStudioOnboardingState(dashboard.onboarding);
  if (needsFullOnboardingFlow(onboardingState)) {
    redirect("/onboarding");
  }
  const uiTourSeen = isUiTourComplete(onboardingState);
  const settings = dashboard.settings as Record<string, unknown> | undefined;
  const profileName =
    typeof settings?.profileName === "string"
      ? settings.profileName
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined;
  const profileAvatarUrl =
    typeof settings?.profileAvatarUrl === "string" && settings.profileAvatarUrl.trim()
      ? settings.profileAvatarUrl
      : typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : typeof user.user_metadata?.picture === "string"
          ? user.user_metadata.picture
          : undefined;

  const breweryName =
    typeof settings?.breweryName === "string"
      ? settings.breweryName
      : typeof user.user_metadata?.brewery === "string"
        ? user.user_metadata.brewery
        : typeof user.user_metadata?.brewery_name === "string"
          ? user.user_metadata.brewery_name
          : undefined;

  void hasAdminAccess(user);
  void isOwnerUser(user);

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant"),
    getPreference("sidebar_collapsible"),
  ]);

  return (
    <PreferencesStoreProvider
      initialValues={{
        ...PREFERENCE_DEFAULTS,
        sidebar_variant: variant,
        sidebar_collapsible: collapsible,
      }}
    >
      <BrewAiAdminShell
        userEmail={user.email}
        userId={user.id}
        initialProfileName={profileName}
        initialBreweryName={breweryName}
        initialAvatarUrl={profileAvatarUrl}
        uiTourSeen={uiTourSeen}
        defaultSidebarOpen={defaultOpen}
        sidebarVariant={variant}
        sidebarCollapsible={collapsible}
      >
        {/* Gleiches Skeleton wie loading.tsx statt 100dvh-Platzhalter unter der Kopfzeile (B-6). */}
        <Suspense fallback={<StudioDashboardLoading />}>{children}</Suspense>
      </BrewAiAdminShell>
    </PreferencesStoreProvider>
  );
}
