import { orWorkspaceBlockedRedirect, workspaceResourceUser } from "@/lib/dashboard/workspace";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { getDashboardMetadata } from "@/lib/dashboard/metadata";
import { needsFullOnboardingFlow, sanitizeStudioOnboardingState } from "@/lib/dashboard/onboarding";
import { DashboardRedesignShell } from "@/components/ui/dashboard-redesign";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: {
    absolute: "BrewAI - Dashboard",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

const SECTION_TABS = new Set([
  "media",
  "team",
  "brand",
  "settings",
  "pricing",
  "assistant",
]);

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params?: Promise<{ section?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const routeParams = (await params) ?? {};
  const query = (await searchParams) ?? {};
  const section = routeParams.section?.[0]?.toLowerCase();
  // Vor jedem await auf Supabase prüfen: So steht der 404-Status fest, bevor das Layout gestreamt wird.
  if (section && !SECTION_TABS.has(section)) notFound();

  // Legacy ?tab=… → path-based routes
  const legacyTabRaw = query.tab;
  const legacyTab = (Array.isArray(legacyTabRaw) ? legacyTabRaw[0] : legacyTabRaw)?.toLowerCase();
  if (legacyTab && SECTION_TABS.has(legacyTab) && !section) {
    const next = new URLSearchParams();
    for (const [key, raw] of Object.entries(query)) {
      if (key === "tab" || raw === undefined) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) next.append(key, value);
    }
    const qs = next.toString();
    redirect(qs ? `/dashboard/${legacyTab}?${qs}` : `/dashboard/${legacyTab}`);
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="relative z-10 mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-2xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="mt-4 text-zinc-600">
          Supabase ist noch nicht konfiguriert. Lege in Vercel (und lokal in{" "}
          <code className="rounded bg-zinc-100 px-1">.env.local</code>){" "}
          <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_SUPABASE_URL</code> und{" "}
          <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> an.
        </p>
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
    const loginQuery = new URLSearchParams();
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) loginQuery.append(key, value);
    }
    const qs = loginQuery.toString();
    redirect(qs ? `/anmelden?${qs}` : "/anmelden");
  }

  const resourceUser = await orWorkspaceBlockedRedirect(workspaceResourceUser(user, false, { hydrate: false }));
  const onboardingState = sanitizeStudioOnboardingState(
    getDashboardMetadata(resourceUser.user_metadata).onboarding,
  );
  if (needsFullOnboardingFlow(onboardingState)) {
    redirect("/onboarding");
  }

  const actorDashboard = getDashboardMetadata(user.user_metadata);
  const actorSettings = actorDashboard.settings as Record<string, unknown> | undefined;
  const workspaceDashboard = getDashboardMetadata(resourceUser.user_metadata);
  const workspaceSettings = workspaceDashboard.settings as Record<string, unknown> | undefined;
  const profileName =
    typeof actorSettings?.profileName === "string"
      ? actorSettings.profileName
      : typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : undefined;
  const breweryName =
    typeof workspaceSettings?.breweryName === "string"
      ? workspaceSettings.breweryName
      : typeof resourceUser.user_metadata?.brewery === "string"
        ? resourceUser.user_metadata.brewery
        : typeof resourceUser.user_metadata?.brewery_name === "string"
          ? resourceUser.user_metadata.brewery_name
          : undefined;
  const userRole =
    typeof user.app_metadata?.role === "string"
      ? String(user.app_metadata.role).toLowerCase()
      : "user";
  const isAdmin = userRole === "admin";

  return (
    <DashboardRedesignShell
      userEmail={user.email}
      initialProfileName={profileName}
      initialBreweryName={breweryName}
      isAdmin={isAdmin}
      forcedTab={section}
    />
  );
}
