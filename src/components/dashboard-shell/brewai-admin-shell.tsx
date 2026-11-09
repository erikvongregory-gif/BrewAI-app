"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { EvglabMark } from "@/components/studio/evglab-mark";
import { AccountSwitcher } from "@/components/dashboard-shell/header/account-switcher";
import { AssetsFolderButton } from "@/components/dashboard-shell/header/assets-folder-button";
import { SearchDialog } from "@/components/dashboard-shell/header/search-dialog";
import { ThemeSwitcher } from "@/components/dashboard-shell/header/theme-switcher";
import { NavMain } from "@/components/dashboard-shell/sidebar/nav-main";
import { NavUser } from "@/components/dashboard-shell/sidebar/nav-user";
import { SupportCard } from "@/components/dashboard-shell/sidebar/support-card";
import LumaBar from "@/components/ui/futuristic-nav";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { BillingCreditsProvider } from "@/components/dashboard-shell/billing-credits-provider";
import { DashboardProductTour } from "@/components/dashboard-shell/dashboard-product-tour";
import { cn } from "@/lib/utils";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";
import { submitSignOut } from "@/lib/auth/submitSignOut";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

type StudioShellContextValue = {
  setBrandProfileActive: (active: boolean) => void;
  setContentPadding: (padding: string | undefined) => void;
  setContentPending: (pending: boolean) => void;
  setFullBleed: (fullBleed: boolean) => void;
};

const StudioShellContext = createContext<StudioShellContextValue | null>(null);

export function useStudioShell(): StudioShellContextValue {
  const ctx = useContext(StudioShellContext);
  if (!ctx) {
    return {
      setBrandProfileActive: () => undefined,
      setContentPadding: () => undefined,
      setContentPending: () => undefined,
      setFullBleed: () => undefined,
    };
  }
  return ctx;
}

function BrewAiSidebar({
  user,
  variant,
}: {
  user: { name: string; email: string; avatar: string };
  variant?: React.ComponentProps<typeof Sidebar>["variant"];
}) {
  const { sidebarVariant, isSynced } = usePreferencesStore(
    useShallow((s) => ({
      sidebarVariant: s.values.sidebar_variant,
      isSynced: s.isSynced,
    })),
  );

  const resolvedVariant = isSynced ? sidebarVariant : variant;

  return (
    <Sidebar variant={resolvedVariant} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link prefetch={false} href="/dashboard">
                <EvglabMark size={18} />
                <span className="font-semibold text-base">{APP_CONFIG.name}</span>
                <span className="font-bold text-xs tracking-wide text-muted-foreground">Beta</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={sidebarItems} />
      </SidebarContent>
      <SidebarFooter>
        <SupportCard />
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

export function BrewAiAdminShell({
  children,
  userEmail,
  userId,
  initialProfileName,
  initialBreweryName,
  initialAvatarUrl,
  uiTourSeen = false,
  defaultSidebarOpen = true,
  sidebarVariant = "sidebar",
  sidebarCollapsible: _sidebarCollapsible = "icon",
}: {
  children: ReactNode;
  userEmail?: string;
  /** Für die nutzerbezogene lokale Tour-Markierung (geteilte Browser). */
  userId?: string;
  initialProfileName?: string;
  initialBreweryName?: string;
  initialAvatarUrl?: string;
  /** Server: Dashboard-UI-Rundgang bereits abgeschlossen. */
  uiTourSeen?: boolean;
  defaultSidebarOpen?: boolean;
  sidebarVariant?: React.ComponentProps<typeof Sidebar>["variant"];
  /** Ignored: collapse is always icon-rail, matching the template default. */
  sidebarCollapsible?: React.ComponentProps<typeof Sidebar>["collapsible"];
}) {
  void _sidebarCollapsible;
  const pathname = usePathname();
  const pathFullBleed =
    pathname === "/inhalte-erstellen" ||
    pathname.startsWith("/inhalte-erstellen/") ||
    pathname === "/videos-erstellen" ||
    pathname.startsWith("/videos-erstellen/");
  const [contentPadding, setContentPadding] = useState<string | undefined>(undefined);
  const [fullBleedOverride, setFullBleedOverride] = useState<boolean | null>(null);
  const [profileName, setProfileName] = useState(initialProfileName ?? "");
  const [breweryName, setBreweryName] = useState(initialBreweryName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl?.trim() ?? "");
  const fullBleed = fullBleedOverride ?? pathFullBleed;
  const shellApi = useMemo<StudioShellContextValue>(
    () => ({
      setBrandProfileActive: () => undefined,
      setContentPadding,
      setContentPending: () => undefined,
      setFullBleed: (next) => setFullBleedOverride(next ? true : null),
    }),
    [],
  );

  useEffect(() => {
    setFullBleedOverride(null);
    setContentPadding(undefined);
  }, [pathname]);

  // Bereichswechsel sanft einblenden. Dashboard-Tabs animiert StudioViewTransition selbst,
  // daher zählt /dashboard/* als ein Bereich. Web Animations statt key → kein Remount.
  const contentRef = useRef<HTMLDivElement>(null);
  const routeKey = pathname.startsWith("/dashboard") ? "/dashboard" : pathname;
  const prevRouteKey = useRef(routeKey);
  useLayoutEffect(() => {
    if (prevRouteKey.current === routeKey) return;
    prevRouteKey.current = routeKey;
    const el = contentRef.current;
    if (!el?.animate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "translateY(8px)", filter: "blur(2px)" },
            { opacity: 1, transform: "none", filter: "none" },
          ],
      { duration: reduce ? 160 : 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [routeKey]);

  useEffect(() => {
    setProfileName(initialProfileName ?? "");
  }, [initialProfileName]);

  useEffect(() => {
    setBreweryName(initialBreweryName ?? "");
  }, [initialBreweryName]);

  useEffect(() => {
    setAvatarUrl(initialAvatarUrl?.trim() ?? "");
  }, [initialAvatarUrl]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ profileName?: string; breweryName?: string; profileAvatarUrl?: string }>)
        .detail;
      if (!detail || typeof detail !== "object") return;
      if (typeof detail.profileName === "string") setProfileName(detail.profileName);
      if (typeof detail.breweryName === "string") setBreweryName(detail.breweryName);
      if (typeof detail.profileAvatarUrl === "string") setAvatarUrl(detail.profileAvatarUrl.trim());
    };
    window.addEventListener("evglab-profile-updated", onProfileUpdated);
    return () => window.removeEventListener("evglab-profile-updated", onProfileUpdated);
  }, []);

  const displayName = (profileName || breweryName || userEmail || "BrewAI").trim();
  const sessionUser = {
    id: "session",
    name: displayName,
    email: userEmail || "",
    avatar: avatarUrl,
    role: breweryName || "Studio",
  };
  const accountUsers = [sessionUser];

  const handleLogout = useCallback(() => {
    submitSignOut();
  }, []);

  return (
    // reducedMotion="user": alle Framer-Animationen respektieren die Systemeinstellung.
    <MotionConfig reducedMotion="user">
    <TooltipProvider>
      <BillingCreditsProvider>
      <StudioShellContext.Provider value={shellApi}>
        <div className="brewai-admin">
          <SidebarProvider
            defaultOpen={defaultSidebarOpen}
            style={
              {
                "--sidebar-width": "calc(var(--spacing) * 68)",
              } as React.CSSProperties
            }
          >
            <BrewAiSidebar
              user={{ name: displayName, email: userEmail || "", avatar: avatarUrl }}
              variant={sidebarVariant}
            />
            <SidebarInset
              className={cn(
                "[html[data-content-layout=centered]_&>*]:mx-auto",
                "[html[data-content-layout=centered]_&>*]:w-full",
                "[html[data-content-layout=centered]_&>*]:max-w-screen-2xl",
                /* Full-Width: Soft-Cap gegen Ultrawide/4K-Dehnung */
                "[html[data-content-layout=full-width]_&>*]:mx-auto",
                "[html[data-content-layout=full-width]_&>*]:w-full",
                "[html[data-content-layout=full-width]_&>*]:max-w-[100rem]",
                "[--dashboard-header-height:--spacing(12)]",
                "min-w-0 overflow-x-clip",
                fullBleed &&
                  "md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:border-0 md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0 [html[data-content-layout=centered]_&>*]:mx-0 [html[data-content-layout=centered]_&>*]:max-w-none [html[data-content-layout=full-width]_&>*]:mx-0 [html[data-content-layout=full-width]_&>*]:max-w-none",
              )}
            >
              <header
                className={cn(
                  "flex h-12 shrink-0 items-center gap-2 border-b border-border transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
                  "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
                )}
              >
                <div className="flex w-full items-center justify-between px-4 lg:px-6 xl:px-8 2xl:px-10">
                  <div className="flex items-center gap-1 lg:gap-2">
                    <SidebarTrigger className="-ml-1" />
                    <Separator
                      orientation="vertical"
                      className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                    />
                    <SearchDialog />
                  </div>
                  <div className="flex items-center gap-2">
                    <AssetsFolderButton />
                    <ThemeSwitcher />
                    <AccountSwitcher users={accountUsers} onLogout={() => void handleLogout()} />
                  </div>
                </div>
              </header>
              <div
                ref={contentRef}
                className={cn(
                  "min-h-0 min-w-0 flex-1 overflow-x-hidden p-4 pb-24 md:p-6 xl:px-8 xl:pt-7 2xl:px-10 2xl:pt-8",
                  "has-data-[content-padding=false]:px-0 has-data-[content-padding=false]:pt-0 has-data-[content-padding=false]:pb-24",
                  "md:has-data-[content-padding=false]:p-0",
                  fullBleed && "relative flex flex-col overflow-hidden px-0 pt-0 pb-24 md:p-0",
                )}
                style={contentPadding ? { padding: contentPadding } : undefined}
                data-content-padding={fullBleed ? "false" : undefined}
              >
                {children}
              </div>
            </SidebarInset>
            <LumaBar />
          </SidebarProvider>
          <Toaster />
          <DashboardProductTour initialSeen={uiTourSeen} firstName={profileName} userId={userId} />
        </div>
      </StudioShellContext.Provider>
      </BillingCreditsProvider>
    </TooltipProvider>
    </MotionConfig>
  );
}

export function BrewAiAdminLayoutFallback() {
  return (
    <div className="brewai-admin flex min-h-[100dvh] items-center justify-center text-sm text-muted-foreground">
      Studio wird geladen …
    </div>
  );
}
