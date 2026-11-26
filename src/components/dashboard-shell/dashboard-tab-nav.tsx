"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

/**
 * Abschnittswechsel im Dashboard ohne Remount: Die Dashboard-Seite meldet hier ihren Navigator an
 * (pushState + Tab-State). Links aus Shell und Navigation rufen ihn beim einfachen Linksklick auf.
 * Ist die Seite nicht gemountet (andere Route), navigieren sie ganz normal über next/link.
 */
type TabNavigator = (href: string) => void;

let tabNavigator: TabNavigator | null = null;

/** Exakt die Abschnitte der Dashboard-Seite (nicht /dashboard/2fa-email o. ä.). */
const DASHBOARD_TAB_PATH = /^\/dashboard(?:\/(media|team|brand|settings|pricing|assistant))?\/?$/i;

export function registerDashboardTabNavigator(navigate: TabNavigator): () => void {
  tabNavigator = navigate;
  return () => {
    if (tabNavigator === navigate) tabNavigator = null;
  };
}

/** true, wenn die Dashboard-Seite gemountet ist und href einer ihrer Abschnitte ist. */
export function canNavigateDashboardTab(href: string): boolean {
  if (!tabNavigator || typeof window === "undefined") return false;
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin && DASHBOARD_TAB_PATH.test(url.pathname);
}

/** Wechselt clientseitig den Abschnitt; false, wenn der Aufrufer normal navigieren muss. */
export function navigateDashboardTab(href: string): boolean {
  if (!canNavigateDashboardTab(href)) return false;
  tabNavigator?.(href);
  return true;
}

/** Nur der einfache Linksklick wird abgefangen; Strg/Cmd/Shift/Mittelklick öffnen weiter einen neuen Tab. */
export function handleDashboardTabClick(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.currentTarget;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
  if (navigateDashboardTab(anchor.href)) event.preventDefault();
}

/** next/link mit Abschnittswechsel ohne Remount. Echtes href bleibt (Rechtsklick, neuer Tab, Prefetch). */
export function DashboardTabLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        handleDashboardTabClick(event);
      }}
    />
  );
}
