"use client";

import { DashboardTabLink } from "@/components/dashboard-shell/dashboard-tab-nav";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { StudioIcon } from "@/components/studio/icons";
import { cn } from "@/lib/utils";

type NavItem = {
  id: string;
  href: string;
  icon: string;
  label: string;
  match: (pathname: string) => boolean;
};

const items: NavItem[] = [
  {
    id: "dashboard",
    href: "/dashboard",
    icon: "dash",
    label: "Dashboard",
    match: (p) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    id: "assistant",
    href: "/dashboard/assistant",
    icon: "chat",
    label: "BrewAI",
    match: (p) => p.startsWith("/dashboard/assistant"),
  },
  {
    id: "create",
    href: "/inhalte-erstellen",
    icon: "spark",
    label: "Erstellen",
    match: (p) => p.startsWith("/inhalte-erstellen"),
  },
  {
    id: "media",
    href: "/dashboard/media",
    icon: "media",
    label: "Mediathek",
    match: (p) => p.startsWith("/dashboard/media"),
  },
  {
    id: "brand",
    href: "/dashboard/brand",
    icon: "brand",
    label: "Marke",
    match: (p) => p.startsWith("/dashboard/brand"),
  },
  {
    id: "settings",
    href: "/dashboard/settings",
    icon: "gear",
    label: "Einstellungen",
    match: (p) => p.startsWith("/dashboard/settings"),
  },
];

export default function LumaBar() {
  const pathname = usePathname() || "/dashboard";
  const reduceMotion = useReducedMotion();
  const activeIndex = items.findIndex((item) => item.match(pathname));
  const hasActive = activeIndex >= 0;

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      aria-label="Hauptnavigation"
    >
      <div className="pointer-events-auto relative flex w-full max-w-lg items-center justify-between gap-1 overflow-hidden rounded-full border border-border/60 bg-background/75 px-3 py-2 shadow-lg backdrop-blur-2xl dark:bg-background/60">
        {hasActive ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-1 w-[16.666%] rounded-full bg-[color-mix(in_srgb,var(--primary)_22%,transparent)] blur-xl"
            animate={{
              left: `${(activeIndex / items.length) * 100}%`,
            }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 420, damping: 32 }
            }
          />
        ) : null}

        {items.map((item, index) => {
          const isActive = index === activeIndex;
          return (
            <div key={item.id} className="relative flex min-w-0 flex-1 flex-col items-center">
              <motion.div
                className="relative flex w-full justify-center"
                whileHover={reduceMotion ? undefined : { scale: 1.08 }}
                animate={reduceMotion ? undefined : { scale: isActive ? 1.12 : 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                {isActive ? (
                  <motion.span
                    layoutId="luma-active-pill"
                    className="absolute inset-x-1 inset-y-0 rounded-full bg-[color-mix(in_srgb,var(--primary)_14%,transparent)]"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 480, damping: 34 }
                    }
                  />
                ) : null}
                <DashboardTabLink
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    "relative z-10 flex h-11 w-full items-center justify-center rounded-full text-muted-foreground transition-colors",
                    isActive && "text-primary",
                  )}
                >
                  <StudioIcon name={item.icon} size={22} />
                </DashboardTabLink>
              </motion.div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
