import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import {
  handleDashboardTabClick,
  navigateDashboardTab,
  registerDashboardTabNavigator,
} from "./dashboard-tab-nav";

function click(href: string, init: Partial<MouseEvent<HTMLAnchorElement>> = {}, target = "") {
  let prevented = false;
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    currentTarget: { href, target, hasAttribute: () => false },
    preventDefault: () => {
      prevented = true;
    },
    ...init,
  } as unknown as MouseEvent<HTMLAnchorElement>;
  handleDashboardTabClick(event);
  return prevented;
}

describe("dashboard-tab-nav", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { href: "https://app.test/dashboard", origin: "https://app.test" } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("navigiert normal, solange die Dashboard-Seite nicht gemountet ist", () => {
    expect(navigateDashboardTab("/dashboard/media")).toBe(false);
  });

  it("fängt nur einfache Linksklicks auf Abschnitte ab", () => {
    const nav = vi.fn();
    const unregister = registerDashboardTabNavigator(nav);
    expect(click("https://app.test/dashboard/media")).toBe(true);
    expect(nav).toHaveBeenCalledWith("https://app.test/dashboard/media");
    expect(click("https://app.test/dashboard/media", { ctrlKey: true })).toBe(false);
    expect(click("https://app.test/dashboard/media", { button: 1 })).toBe(false);
    expect(click("https://app.test/dashboard/media", {}, "_blank")).toBe(false);
    expect(click("https://app.test/dashboard/2fa-email")).toBe(false);
    expect(click("https://app.test/inhalte-erstellen")).toBe(false);
    expect(click("https://other.test/dashboard")).toBe(false);
    unregister();
    expect(click("https://app.test/dashboard/media")).toBe(false);
    expect(nav).toHaveBeenCalledTimes(1);
  });
});
