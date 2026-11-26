import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OnboardingTourFlow } from "@/components/studio/onboarding/onboarding-tour-flow";
import type { OnboardingBootstrap } from "@/components/studio/onboarding/onboarding-tour-types";
import { hasActiveSubscription } from "@/lib/billing/access";
import { getEffectiveBillingRow } from "@/lib/billing/store";
import { needsFullOnboardingFlow, sanitizeStudioOnboardingState } from "@/lib/dashboard/onboarding";
import { getFreshUserDashboardMetadata } from "@/lib/dashboard/freshMetadata";
import { orWorkspaceBlockedRedirect } from "@/lib/dashboard/workspace";
import { TWO_FACTOR_PAGE, hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "BrewAI · Einrichtung" },
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    redirect("/anmelden");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/anmelden");
  }

  if (!(await hasPassedTwoFactor(user))) {
    redirect(TWO_FACTOR_PAGE);
  }

  const dashboard = await orWorkspaceBlockedRedirect(getFreshUserDashboardMetadata(user.id, user.user_metadata));
  const onboarding = sanitizeStudioOnboardingState(dashboard.onboarding);

  if (!needsFullOnboardingFlow(onboarding)) {
    redirect("/dashboard");
  }

  const settings = dashboard.settings;
  const profileName =
    (typeof settings?.profileName === "string" && settings.profileName.trim()) ||
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (user.email?.split("@")[0] ?? "");

  let hasActivePlan = false;
  let tokensRemaining: number | null = null;
  try {
    const row = await getEffectiveBillingRow(user.id);
    hasActivePlan = hasActiveSubscription(row);
    if (row) {
      tokensRemaining = Math.max((row.monthly_tokens ?? 0) - (row.used_tokens ?? 0), 0);
    }
  } catch {
    /* optional */
  }

  const bootstrap: OnboardingBootstrap = {
    profileName,
    settings: settings ?? null,
    beers: dashboard.myBeers ?? [],
    userEmail: user.email ?? "",
    hasActivePlan,
    tokensRemaining,
  };

  return (
    <Suspense
      fallback={
        <div className="brewai-admin grid min-h-dvh place-items-center bg-background text-muted-foreground">
          <p className="text-sm" role="status">Einrichtung wird geladen …</p>
        </div>
      }
    >
      <OnboardingTourFlow bootstrap={bootstrap} />
    </Suspense>
  );
}
