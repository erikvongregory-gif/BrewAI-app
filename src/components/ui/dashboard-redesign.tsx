"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StudioViewTransition } from "@/components/studio/studio-view-transition";
import { MARKETING_SITE_URL } from "@/lib/siteConfig";
import { useStudioShell } from "@/components/studio/studio-workspace-shell";
import { AdminHomeView } from "@/components/dashboard/admin-home-view";
import { AdminPricingView } from "@/components/dashboard/admin-pricing-view";
import { AdminSettingsView } from "@/components/dashboard/admin-settings-view";
import { AdminTeamView } from "@/components/dashboard/admin-team-view";
import { BrandProfileView } from "@/components/dashboard/BrandProfileView";
import { BrandProfileSetupModal, type BrandScanSuggestion } from "@/components/dashboard/BrandProfileSetupModal";
import { BrewAiAssistantView } from "@/components/studio/hopfen-hugo-assistant";
import { StudioMediaLibrary, type MediaItem } from "@/components/studio/media/studio-media-library";
import { hasActiveSubscriptionFromState } from "@/lib/billing/access";
import {
  clearHomepageCheckoutParams,
  getHomepageCheckoutPlan,
} from "@/lib/billing/checkoutClient";
import { useBillingCredits } from "@/components/dashboard-shell/billing-credits-provider";
import { setBillingCredits, type ClientBillingState } from "@/lib/billing/creditsCache";
import { markDashboardPerf } from "@/lib/dashboard/dashboardPerf";
import { buildGenericBrandProfilePatch, isBrandProfileCompleteFromSettings } from "@/lib/dashboard/brandProfile";
import { mergeDashboardSettings, sanitizeDashboardSettings } from "@/lib/dashboard/settingsPayload";
import { canWriteWithRole } from "@/lib/dashboard/teamRoles";
import { fetchWithRetry } from "@/lib/http/fetchWithRetry";
import { signOutAndRedirect } from "@/lib/auth/signOutClient";

type DashboardTab =
  | "dashboard"
  | "assistant"
  | "media"
  | "team"
  | "brand"
  | "settings"
  | "pricing";

const PATH_TABS = new Set<DashboardTab>([
  "media",
  "team",
  "brand",
  "settings",
  "pricing",
  "assistant",
]);

const MEDIA_PAGE_SIZE = 48;

function tabFromPathname(pathname: string): DashboardTab | null {
  const match = pathname.match(/^\/dashboard\/([^/?#]+)/);
  if (!match?.[1]) return null;
  const section = match[1].toLowerCase() as DashboardTab;
  return PATH_TABS.has(section) ? section : null;
}

function hrefForTab(tab: DashboardTab, searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("tab");
  const qs = next.toString();
  if (tab === "dashboard") return qs ? `/dashboard?${qs}` : "/dashboard";
  return qs ? `/dashboard/${tab}?${qs}` : `/dashboard/${tab}`;
}

type DashboardSummary = {
  unlimited?: boolean;
  tokens: { monthly: number; used: number; remaining: number; unlimited?: boolean };
  periodEnd?: string | null;
  postsThisMonth: number | null;
  chargesTotal?: number;
  activeCampaigns?: number;
  teamMembers: number;
  openInvites: number;
  billingStatus: string;
  plan: string | null;
  degradedBilling?: boolean;
  degradedUsage?: boolean;
  tokenUsageByDay?: { date: string; tokens: number }[];
};
import { type SubscriptionPlanKey } from "@/lib/billing/tokenState";

type TeamMember = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
  status: "active" | "invited";
  invitedAt: string;
};

type SettingsPayload = {
  profileName: string;
  breweryName: string;
  profilePhone: string;
  profileAvatarUrl: string;
  emailNotifications: boolean;
  weeklySummary: boolean;
  brandProfileMode: "undecided" | "guided" | "skip";
  brandInstagramUrl: string;
  brandWebsiteUrl: string;
  brandProfileSource: "url" | "instagram" | "manual" | "skip";
  brandLockLevel: "strict" | "balanced" | "loose";
  brandTone: string;
  brandColors: string;
  brandDos: string;
  brandDonts: string;
  brandReferenceImageUrls: string[];
  brandLabelReferenceUrl: string;
  brandHeadlineFontName: string;
  brandFontFileUrl: string;
  brandFontWeight: string;
  brandAnalyzedAt?: string;
};

const isBrandProfileComplete = isBrandProfileCompleteFromSettings;

function normalizeSettings(raw: Partial<SettingsPayload> | SettingsPayload): SettingsPayload {
  return sanitizeDashboardSettings(raw);
}

function Placeholder({
  label,
  w = "100%",
  h = 64,
}: {
  label: string;
  w?: number | string;
  h?: number;
}) {
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border border-dashed bg-muted"
      style={{ width: w, height: h }}
    >
      <span className="absolute bottom-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Sparkline({ data, color, width = 64, height = 22 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" aria-hidden="true">
      <polyline points={pts} stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={lastY} r="2" fill={color} />
    </svg>
  );
}

function SidebarIcon({ name, color = "currentColor" }: { name: string; color?: string }) {
  const s = 18;
  const sw = 1.6;
  const map: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M3 9 L10 3 L17 9 V16 H3 Z" />
        <path d="M8 16 V12 H12 V16" />
      </>
    ),
    dash: (
      <>
        <rect x="3" y="3" width="6" height="6" rx="1.2" />
        <rect x="11" y="3" width="6" height="4" rx="1.2" />
        <rect x="11" y="9" width="6" height="8" rx="1.2" />
        <rect x="3" y="11" width="6" height="6" rx="1.2" />
      </>
    ),
    spark: <path d="M10 3 L11.5 8 L16.5 9.5 L11.5 11 L10 16 L8.5 11 L3.5 9.5 L8.5 8 Z" />,
    media: (
      <>
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <path d="M3 13 L7 9 L11 13 L14 10 L17 13" />
        <circle cx="13.5" cy="6.5" r="1.3" />
      </>
    ),
    team: (
      <>
        <circle cx="7" cy="8" r="2.6" />
        <circle cx="13" cy="8" r="2.6" />
        <path d="M3 16 C3 13.5 5 12 7 12 C9 12 11 13.5 11 16 M9 16 C9 13.5 11 12 13 12 C15 12 17 13.5 17 16" />
      </>
    ),
    gear: (
      <>
        <circle cx="10" cy="10" r="3" />
        <path d="M10 2 V4 M10 16 V18 M2 10 H4 M16 10 H18 M4.3 4.3 L5.7 5.7 M14.3 14.3 L15.7 15.7 M4.3 15.7 L5.7 14.3 M14.3 5.7 L15.7 4.3" />
      </>
    ),
    help: (
      <>
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.8 8 C7.8 6.6 8.8 5.8 10 5.8 C11.2 5.8 12.2 6.6 12.2 7.8 C12.2 9 10 9.5 10 11" />
        <circle cx="10" cy="13.5" r="0.6" fill={color} stroke="none" />
      </>
    ),
  };
  return (
    <svg width={s} height={s} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
      {map[name]}
    </svg>
  );
}

export function DashboardRedesignShell(props: {
  userEmail?: string;
  initialProfileName?: string;
  initialBreweryName?: string;
  isAdmin?: boolean;
  forcedTab?: string;
}) {
  const { userEmail, initialProfileName, initialBreweryName, isAdmin, forcedTab } = props;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pathTab = tabFromPathname(pathname);
  const tabParam = (forcedTab || pathTab || searchParams.get("tab") || "dashboard").toLowerCase();
  const initialTab: DashboardTab = PATH_TABS.has(tabParam as DashboardTab)
    ? (tabParam as DashboardTab)
    : "dashboard";
  const [tab, setTab] = useState<DashboardTab>(initialTab);

  const changeTab = useCallback(
    (next: DashboardTab) => {
      setTab(next);
      router.push(hrefForTab(next, new URLSearchParams(searchParams.toString())));
    },
    [router, searchParams],
  );

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaTotal, setMediaTotal] = useState(0);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [mediaLoadingMore, setMediaLoadingMore] = useState(false);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [teamLoaded, setTeamLoaded] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [myTeamRole, setMyTeamRole] = useState<TeamMember["role"]>("owner");
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [brandProfileSetupOpen, setBrandProfileSetupOpen] = useState(false);
  const [brandQuickStartUrl, setBrandQuickStartUrl] = useState("");
  const [brandAutoAnalyzeSignal, setBrandAutoAnalyzeSignal] = useState(0);
  const [showBrandProfileChoice, setShowBrandProfileChoice] = useState(false);
  const [brandProfileNotice, setBrandProfileNotice] = useState("");
  const [pricingCheckoutError, setPricingCheckoutError] = useState<string | null>(null);
  const homepageCheckoutStartedRef = useRef(false);
  const firstAssetMarkedRef = useRef(false);
  const { state: credits } = useBillingCredits();

  const applyCreditsToSummary = useCallback((prev: DashboardSummary | null, state: ClientBillingState) => {
    const tokens = {
      monthly: state.monthlyTokens,
      used: state.usedTokens,
      remaining: state.remainingTokens,
      unlimited: Boolean(state.unlimited),
    };
    if (!prev) {
      return {
        unlimited: Boolean(state.unlimited),
        tokens,
        postsThisMonth: null,
        teamMembers: 0,
        openInvites: 0,
        billingStatus: state.status,
        plan: state.plan,
      } satisfies DashboardSummary;
    }
    return {
      ...prev,
      unlimited: Boolean(state.unlimited ?? prev.unlimited),
      tokens,
      plan: state.plan ?? prev.plan,
      billingStatus: state.status || prev.billingStatus,
    };
  }, []);

  const displaySummary = useMemo(() => {
    if (credits) return applyCreditsToSummary(summary, credits);
    return summary;
  }, [applyCreditsToSummary, credits, summary]);

  const profileName = settings?.profileName?.trim() || initialProfileName?.trim() || "";
  const breweryName = settings?.breweryName?.trim() || initialBreweryName?.trim() || "";
  const brandProfileComplete = isBrandProfileComplete(settings);
  const brandProfileMode = settings?.brandProfileMode ?? "undecided";

  useEffect(() => {
    // Path-based URLs are canonical; keep query params except legacy tab.
    const p = new URLSearchParams(searchParams.toString());
    if (p.has("tab")) {
      p.delete("tab");
      const qs = p.toString();
      const target = tab === "dashboard" ? (qs ? `/dashboard?${qs}` : "/dashboard") : qs ? `/dashboard/${tab}?${qs}` : `/dashboard/${tab}`;
      router.replace(target, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Externe URL-Aenderungen (Sidebar-Links, Browser Back/Forward) -> Tab updaten.
  useEffect(() => {
    const fromPath = tabFromPathname(pathname);
    const next = (fromPath || searchParams.get("tab") || "dashboard").toLowerCase();
    const resolved: DashboardTab = PATH_TABS.has(next as DashboardTab) ? (next as DashboardTab) : "dashboard";
    if (resolved !== tab) {
      setTab(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    let ignore = false;

    const load = async (url: string) => {
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      if (res.status === 401) {
        window.location.href = "/anmelden";
        return null;
      }
      return res;
    };

    void (async () => {
      try {
        const res = await load(`/api/dashboard/media?limit=${MEDIA_PAGE_SIZE}&offset=0`);
        if (!res || ignore) return;
        if (res.ok) {
          const json = (await res.json()) as {
            items?: MediaItem[];
            total?: number;
            hasMore?: boolean;
          };
          if (Array.isArray(json.items)) {
            setMedia(json.items);
            if (!firstAssetMarkedRef.current && json.items.length > 0) {
              firstAssetMarkedRef.current = true;
              markDashboardPerf("first-asset");
            }
          }
          setMediaTotal(typeof json.total === "number" ? json.total : json.items?.length ?? 0);
          setMediaHasMore(Boolean(json.hasMore));
          setMediaError(null);
        } else {
          setMediaError("Mediathek konnte nicht geladen werden.");
        }
      } catch {
        if (!ignore) setMediaError("Keine Verbindung. Prüfe deine Internetverbindung und lade die Mediathek erneut.");
      } finally {
        if (!ignore) setMediaLoaded(true);
      }
    })();

    void (async () => {
      try {
        const res = await load("/api/dashboard/summary");
        if (!res || ignore) return;
        if (res.ok) {
          const json = (await res.json()) as { summary?: DashboardSummary };
          if (json.summary) {
            setSummary(json.summary);
            setBillingCredits({
              plan: json.summary.plan,
              monthlyTokens: json.summary.tokens.monthly,
              usedTokens: json.summary.tokens.used,
              remainingTokens: json.summary.tokens.remaining,
              status: json.summary.billingStatus,
              unlimited: Boolean(json.summary.unlimited || json.summary.tokens.unlimited),
            });
            setSummaryError(null);
          }
        } else {
          setSummaryError("Übersicht konnte nicht geladen werden.");
        }
      } catch {
        if (!ignore) setSummaryError("Keine Verbindung. Prüfe deine Internetverbindung und lade die Übersicht erneut.");
      } finally {
        if (!ignore) setSummaryLoaded(true);
      }
    })();

    void (async () => {
      try {
        const res = await load("/api/dashboard/team");
        if (!res || ignore) return;
        if (res.ok) {
          const json = (await res.json()) as { members?: TeamMember[]; role?: TeamMember["role"] };
          if (Array.isArray(json.members)) setTeam(json.members);
          if (json.role === "owner" || json.role === "admin" || json.role === "editor" || json.role === "viewer") {
            setMyTeamRole(json.role);
          }
          setTeamError(null);
        } else {
          setTeamError("Teamdaten konnten nicht geladen werden.");
        }
      } catch {
        if (!ignore) setTeamError("Keine Verbindung. Prüfe deine Internetverbindung und lade die Seite neu.");
      } finally {
        if (!ignore) setTeamLoaded(true);
      }
    })();

    void (async () => {
      try {
        const res = await load("/api/dashboard/settings");
        if (!res || ignore) return;
        if (res.ok) {
          const json = (await res.json()) as { settings?: SettingsPayload };
          if (json.settings) {
            setSettings(normalizeSettings(json.settings));
            setSettingsError(null);
          }
        } else {
          const fallback = (await res.json().catch(() => null)) as { error?: string } | null;
          setSettingsError(fallback?.error ?? "Einstellungen konnten nicht geladen werden.");
        }
      } catch {
        if (!ignore) setSettingsError("Keine Verbindung. Prüfe deine Internetverbindung und lade die Seite neu.");
      } finally {
        if (!ignore) setSettingsLoaded(true);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (homepageCheckoutStartedRef.current || !settingsLoaded) return;

    const params = new URLSearchParams(searchParams.toString());
    const homepagePlan = getHomepageCheckoutPlan(params);
    if (!homepagePlan) return;

    homepageCheckoutStartedRef.current = true;
    setShowBrandProfileChoice(false);

    const hasPaidPlan =
      Boolean(displaySummary?.unlimited || displaySummary?.tokens.unlimited) ||
      (!summaryError &&
        !displaySummary?.degradedBilling &&
        hasActiveSubscriptionFromState(displaySummary?.plan, displaySummary?.billingStatus));
    if (hasPaidPlan) {
      clearHomepageCheckoutParams(params);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      return;
    }

    changeTab("pricing");
    setPricingCheckoutError(
      "Bitte bestätige unten die Widerrufs-Zustimmung und wähle danach deinen Tarif.",
    );
    clearHomepageCheckoutParams(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, displaySummary, searchParams]);

  const { setBrandProfileActive } = useStudioShell();

  useEffect(() => {
    setBrandProfileActive(brandProfileSetupOpen || tab === "brand");
  }, [brandProfileSetupOpen, setBrandProfileActive, tab]);

  const saveProfileSettings = useCallback(
    async (overrides: Partial<SettingsPayload>): Promise<SettingsPayload> => {
      let base = settings;
      if (!base) {
        const settingsRes = await fetch("/api/dashboard/settings", { cache: "no-store", credentials: "include" });
        if (!settingsRes.ok) throw new Error("Einstellungen konnten nicht geladen werden.");
        const json = (await settingsRes.json()) as { settings?: SettingsPayload };
        if (!json.settings) throw new Error("Einstellungen konnten nicht geladen werden.");
        base = normalizeSettings(json.settings);
      }
      const payload = mergeDashboardSettings(base, overrides);
      const res = await fetchWithRetry(
        "/api/dashboard/settings",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify(payload),
        },
        { retries: 2, baseDelayMs: 1200 },
      );
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; settings?: SettingsPayload } | null;
      if (!res.ok) throw new Error(json?.error ?? "Einstellungen konnten nicht gespeichert werden.");
      const saved = normalizeSettings(json?.settings ?? payload);
      setSettings(saved);
      return saved;
    },
    [settings],
  );

  const applyBrandScanAndPersist = useCallback(
    async (suggestion: BrandScanSuggestion) => {
      const analyzedAt = new Date().toISOString();
      const patch: Partial<SettingsPayload> = {
        brandProfileMode: "guided",
        breweryName: suggestion.breweryName,
        brandTone: suggestion.brandTone,
        brandColors: suggestion.brandColors,
        brandDos: suggestion.brandDos,
        brandDonts: suggestion.brandDonts,
        brandInstagramUrl: suggestion.brandInstagramUrl,
        brandWebsiteUrl: suggestion.brandWebsiteUrl,
        brandProfileSource: suggestion.brandProfileSource,
        brandReferenceImageUrls: suggestion.referenceImageUrls,
        brandLabelReferenceUrl: suggestion.brandLabelReferenceUrl ?? "",
        brandHeadlineFontName: suggestion.brandHeadlineFontName ?? "",
        brandFontFileUrl: suggestion.brandFontFileUrl ?? "",
        brandAnalyzedAt: analyzedAt,
      };

      setSettings((prev) => (prev ? mergeDashboardSettings(prev, patch) : normalizeSettings(patch)));
      changeTab("brand");
      setBrandProfileNotice("Markenprofil gespeichert und aktiviert.");
      window.setTimeout(() => router.refresh(), 300);
    },
    [changeTab, router],
  );

  const handleChooseBrandProfileGuided = useCallback(() => {
    // Wichtig: KEIN lokaler State-Wechsel vor Server-Save — das fuehrt sonst zu Drift,
    // wenn der User die Setup-Modal ohne Speichern schliesst. Der Modus wird erst durch
    // `applyBrandScanAndPersist` (saveProfileSettings) auf "guided" gesetzt.
    setShowBrandProfileChoice(false);
    setBrandProfileSetupOpen(true);
  }, []);

  const handleSkipBrandProfile = useCallback(async () => {
    setShowBrandProfileChoice(false);
    try {
      await saveProfileSettings(buildGenericBrandProfilePatch());
      setBrandProfileNotice("Markenprofil deaktiviert — du generierst jetzt generisch.");
    } catch {
      setBrandProfileNotice("Zurücksetzen konnte nicht gespeichert werden.");
    }
  }, [saveProfileSettings]);

  const handleResetBrandProfile = handleSkipBrandProfile;

  useEffect(() => {
    if (!settingsLoaded) return;
    if (brandProfileMode !== "undecided") return;
    // Nur einmal pro Browser-Session anzeigen — wenn der User die Modal ohne
    // explizite Entscheidung schliesst, faellt er ueber die Banner zurueck und
    // wird beim naechsten Login erneut sanft erinnert.
    if (typeof window !== "undefined") {
      const shownThisSession = window.sessionStorage.getItem("evglab:brandChoiceShown");
      if (shownThisSession === "1") return;
      window.sessionStorage.setItem("evglab:brandChoiceShown", "1");
    }
    setShowBrandProfileChoice(true);
  }, [brandProfileMode, settingsLoaded]);

  // Auswahl-Dialog per Escape schließen (wie das ×) — Tastaturnutzer kommen sonst nicht heraus.
  useEffect(() => {
    if (!showBrandProfileChoice) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowBrandProfileChoice(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showBrandProfileChoice]);

  useEffect(() => {
    if (searchParams.get("openBrand") !== "1") return;
    changeTab("brand");
    setBrandProfileSetupOpen(true);
    const p = new URLSearchParams(searchParams.toString());
    p.delete("openBrand");
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const refreshSummary = useCallback(() => {
    setSummaryLoaded(false);
    setSummaryError(null);
    void fetch("/api/dashboard/summary", { cache: "no-store", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("fail");
        const json = (await res.json()) as { summary?: DashboardSummary };
        if (json.summary) setSummary(json.summary);
      })
      .catch(() => setSummaryError("Übersicht konnte nicht geladen werden."))
      .finally(() => setSummaryLoaded(true));
  }, []);

  const refreshMedia = useCallback((quiet = false) => {
    if (!quiet) {
      setMediaLoaded(false);
      setMediaError(null);
    }
    void fetch(`/api/dashboard/media?limit=${MEDIA_PAGE_SIZE}&offset=0`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("fail");
        const json = (await res.json()) as {
          items?: MediaItem[];
          total?: number;
          hasMore?: boolean;
        };
        if (Array.isArray(json.items)) setMedia(json.items);
        setMediaTotal(typeof json.total === "number" ? json.total : json.items?.length ?? 0);
        setMediaHasMore(Boolean(json.hasMore));
        if (!quiet) setMediaError(null);
      })
      .catch(() => {
        if (!quiet) setMediaError("Mediathek konnte nicht geladen werden.");
      })
      .finally(() => setMediaLoaded(true));
  }, []);

  const refreshMediaQuiet = useCallback(() => refreshMedia(true), [refreshMedia]);

  const loadMoreMedia = useCallback(() => {
    if (mediaLoadingMore || !mediaHasMore) return;
    setMediaLoadingMore(true);
    void fetch(`/api/dashboard/media?limit=${MEDIA_PAGE_SIZE}&offset=${media.length}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("fail");
        const json = (await res.json()) as {
          items?: MediaItem[];
          total?: number;
          hasMore?: boolean;
        };
        if (Array.isArray(json.items) && json.items.length) {
          setMedia((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            return [...prev, ...json.items!.filter((item) => !seen.has(item.id))];
          });
        }
        if (typeof json.total === "number") setMediaTotal(json.total);
        setMediaHasMore(Boolean(json.hasMore));
      })
      .catch(() => {
        /* still genug der ersten Seite sichtbar */
      })
      .finally(() => setMediaLoadingMore(false));
  }, [media.length, mediaHasMore, mediaLoadingMore]);

  // Hinweis: Wir oeffnen das Setup-Modal NICHT mehr automatisch bei `guided + incomplete`.
  // Stattdessen wird der User ueber die Banner (Dashboard-Overview + Inhalte-erstellen)
  // sanft erinnert und kann selbst entscheiden, wann er das Markenprofil anlegt.

  // Bezahltes Abo ODER noch Bonus-Tokens → Studio nutzbar; Checkout nur bei Paid überspringen (oben).
  const hasActivePlan =
    Boolean(displaySummary?.unlimited || displaySummary?.tokens.unlimited) ||
    (!summaryError &&
      !displaySummary?.degradedBilling &&
      (hasActiveSubscriptionFromState(displaySummary?.plan, displaySummary?.billingStatus) ||
        (displaySummary?.tokens.remaining ?? 0) > 0));

  return (
    <>
      <StudioViewTransition viewKey={tab} variant="tab">
      {tab === "dashboard" ? (
        <AdminHomeView
          summary={displaySummary}
          summaryLoaded={summaryLoaded}
          summaryError={summaryError}
          media={media}
          mediaLoaded={mediaLoaded}
          mediaError={mediaError}
          settings={settings}
          settingsLoaded={settingsLoaded}
          profileName={profileName}
          breweryName={breweryName}
          brandProfileComplete={brandProfileComplete}
          brandProfileMode={brandProfileMode}
          onOpenTab={changeTab}
          onOpenBrandSetup={() => {
            changeTab("brand");
            setBrandProfileSetupOpen(true);
          }}
          onRetrySummary={refreshSummary}
          onRetryMedia={refreshMedia}
        />
      ) : null}
      {tab === "assistant" ? <BrewAiAssistantView /> : null}
      {tab === "media" ? (
        <StudioMediaLibrary
          items={media}
          loaded={mediaLoaded}
          loadError={mediaError}
          onRetry={() => refreshMedia(false)}
          onItemsChange={setMedia}
          onMediaRefresh={refreshMediaQuiet}
          hasActivePlan={hasActivePlan}
          canWriteMedia={canWriteWithRole(myTeamRole)}
          initialQuery={searchParams.get("q") ?? ""}
          focusedJobId={searchParams.get("job") ?? ""}
          mediaTotal={mediaTotal}
          hasMoreMedia={mediaHasMore}
          loadingMoreMedia={mediaLoadingMore}
          onLoadMoreMedia={loadMoreMedia}
        />
      ) : null}
      {tab === "team" ? (
        <AdminTeamView
          members={team}
          loaded={teamLoaded}
          loadError={teamError}
          myRole={myTeamRole}
          onMembersChange={(next) => {
            setTeam(next as TeamMember[]);
            refreshSummary();
          }}
        />
      ) : null}
      {tab === "brand" ? (
        <BrandProfileView
          value={settings}
          loaded={settingsLoaded}
          loadError={settingsError}
          brandProfileComplete={brandProfileComplete}
          brandProfileNotice={brandProfileNotice}
          onOpenBrandSetup={() => setBrandProfileSetupOpen(true)}
          onQuickAnalyze={(url) => {
            setBrandQuickStartUrl(url);
            setBrandAutoAnalyzeSignal((n) => n + 1);
            setBrandProfileSetupOpen(true);
          }}
          onSkipBrandProfile={() => void handleSkipBrandProfile()}
          onResetBrandProfile={handleResetBrandProfile}
          onChange={(patch) => setSettings((s) => (s ? { ...s, ...patch } : s))}
          onSave={async (patch) => {
            if (!settings) throw new Error("Einstellungen noch nicht geladen.");
            await saveProfileSettings(patch ?? {});
          }}
        />
      ) : null}
      {tab === "settings" ? (
        <AdminSettingsView
          value={settings}
          onChange={(next) => setSettings((prev) => (prev ? { ...prev, ...next } : (next as SettingsPayload)))}
          loaded={settingsLoaded}
          loadError={settingsError}
          brandProfileComplete={brandProfileComplete}
          brandProfileNotice={brandProfileNotice}
          onOpenBrandTab={() => changeTab("brand")}
          onOpenBrandSetup={() => {
            changeTab("brand");
            setBrandProfileSetupOpen(true);
          }}
          onSkipBrandProfile={() => void handleSkipBrandProfile()}
          onResetBrandProfile={handleResetBrandProfile}
        />
      ) : null}
      {tab === "pricing" ? (
        <AdminPricingView
          currentPlan={(displaySummary?.plan ?? null) as SubscriptionPlanKey | null}
          monthlyTokens={displaySummary?.tokens.monthly ?? 0}
          usedTokens={displaySummary?.tokens.used ?? 0}
          remainingTokens={displaySummary?.tokens.remaining ?? 0}
          initialCheckoutError={pricingCheckoutError}
        />
      ) : null}
      </StudioViewTransition>

    <BrandProfileSetupModal
      open={brandProfileSetupOpen}
      onOpenChange={setBrandProfileSetupOpen}
      title="Marke einlesen"
      onSaved={applyBrandScanAndPersist}
      initialWebsiteUrl={brandQuickStartUrl}
      autoAnalyzeSignal={brandAutoAnalyzeSignal}
    />

    {showBrandProfileChoice ? (
      <div
        className="studio-brand-choice"
        role="presentation"
        onClick={() => setShowBrandProfileChoice(false)}
      >
        <div
          className="studio-brand-choice__modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="studio-brand-choice-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="studio-brand-choice__glow" aria-hidden />
          <div className="studio-brand-choice__accent" aria-hidden />
          <div className="studio-brand-choice__dots" aria-hidden />

          <div className="studio-brand-choice__body">
            <button
              type="button"
              className="studio-brand-choice__close"
              aria-label="Schließen"
              title="Schließen"
              onClick={() => setShowBrandProfileChoice(false)}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
                <path
                  d="M1.5 1.5l11 11M12.5 1.5l-11 11"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="studio-brand-choice__icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 22 22">
                <path
                  d="M11 2l2.4 5.6 6.1.6-4.6 4 1.4 6-5.3-3.2-5.3 3.2 1.4-6-4.6-4 6.1-.6L11 2z"
                  fill="var(--ac-tint)"
                  stroke="var(--ac)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="studio-brand-choice__eyebrow">Markenprofil</div>
            <h3 id="studio-brand-choice-title" className="studio-brand-choice__title">
              Willst du deinen Markenstil fixieren?
            </h3>
            <p className="studio-brand-choice__lead">
              Gib einfach die Website deiner Brauerei ein — BrewAI erkennt Tonalität, Farben und Bildsprache und
              erstellt dein Markenprofil. Du kannst das später unter Einstellungen jederzeit ändern.
            </p>

            <div className="studio-brand-choice__actions">
              <button
                type="button"
                className="studio-brand-choice__btn studio-brand-choice__btn--primary"
                onClick={handleChooseBrandProfileGuided}
              >
                Ja, Markenprofil anlegen
                <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden>
                  <path
                    d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"
                    fill="none"
                    stroke="var(--ac-ink)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="studio-brand-choice__btn studio-brand-choice__btn--ghost"
                onClick={() => void handleSkipBrandProfile()}
              >
                Ohne Profil starten
              </button>
            </div>

            <div className="studio-brand-choice__note">
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M8 1.5l6 2.7v3.6c0 4-2.6 6.6-6 7.7-3.4-1.1-6-3.7-6-7.7V4.2L8 1.5z"
                  fill="none"
                  stroke="var(--t3)"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                Beim ×-Schließen wirst du in dieser Sitzung nicht erneut gefragt — beim nächsten Login erscheint
                die Auswahl wieder. „Ohne Profil starten“ speichert deine Wahl dauerhaft.
              </span>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}


