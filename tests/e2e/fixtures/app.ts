import type { BrowserContext, Page, Request, TestInfo } from "@playwright/test";
import { sql } from "./db/apply-schema";
import { BASE_URL } from "./env";

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === "mobile";

/** Dashboard-Routen laut src/navigation/sidebar/sidebar-items.ts (Admin separat). */
export const DASHBOARD_ROUTES = [
  { path: "/dashboard", label: "Dashboard", mobileNav: "Dashboard", heading: null as string | null },
  { path: "/dashboard/assistant", label: "BrewAI", mobileNav: "BrewAI", heading: null },
  { path: "/inhalte-erstellen", label: "Bilder erstellen", mobileNav: "Erstellen", heading: null },
  { path: "/dashboard/media", label: "Mediathek", mobileNav: "Mediathek", heading: "Mediathek" },
  { path: "/dashboard/brand", label: "Markenprofil", mobileNav: "Marke", heading: null },
  { path: "/dashboard/team", label: "Team", mobileNav: null as string | null, heading: "Team" },
  { path: "/dashboard/pricing", label: "Abonnement", mobileNav: null, heading: "Pläne & Preise" },
  { path: "/dashboard/settings", label: "Einstellungen", mobileNav: "Einstellungen", heading: "Einstellungen" },
];

/** Gemeinsame Vorbereitung jedes Kontexts: Marken-Auswahldialog als „in dieser Sitzung gesehen“, Next-Dev-Indikator ausblenden. */
export async function prepareContext(context: BrowserContext, { brandDialog = false } = {}) {
  await context.addInitScript((showBrandDialog) => {
    try {
      if (!showBrandDialog) window.sessionStorage.setItem("evglab:brandChoiceShown", "1");
    } catch {
      /* ignore */
    }
    const hide = () => {
      if (document.getElementById("e2e-hide-dev")) return;
      const s = document.createElement("style");
      s.id = "e2e-hide-dev";
      // Next-Dev-Indikator liegt mobil über der Bottom-Navigation und fängt Klicks ab (gibt es in Produktion nicht).
      s.textContent = "nextjs-portal{display:none!important}";
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide);
    else hide();
  }, brandDialog);
}

/** Klickt einen Navigationspunkt wie ein Nutzer: Desktop-Sidebar bzw. mobile Bottom-Navigation / Sidebar-Sheet. */
export async function clickNav(page: Page, testInfo: TestInfo, route: (typeof DASHBOARD_ROUTES)[number]) {
  if (!isMobile(testInfo)) {
    await page.locator('[data-sidebar="sidebar"], [data-slot="sidebar"]').getByRole("link", { name: route.label, exact: true }).first().click();
    return;
  }
  if (route.mobileNav) {
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: route.mobileNav, exact: true }).click();
    return;
  }
  await page.getByRole("button", { name: "Seitenleiste ein- oder ausblenden" }).click();
  await page.getByRole("dialog").getByRole("link", { name: route.label, exact: true }).first().click();
}

export function isRscRequest(r: Request) {
  const h = r.headers();
  return Boolean(h["rsc"] || h["next-router-state-tree"] || r.url().includes("_rsc="));
}

export async function remainingTokens(userId: string): Promise<number> {
  const rows = await sql<{ n: number }>("select monthly_tokens-used_tokens as n from public.billing_subscriptions where user_id=$1", [userId]);
  return rows[0]?.n ?? 0;
}

export async function jobCount(userId: string): Promise<number> {
  return Number((await sql<{ n: string }>("select count(*) n from public.generation_jobs where user_id=$1", [userId]))[0].n);
}

export async function mediaRows(userId: string): Promise<Array<{ id: string; createdAt: string }>> {
  return (await sql<{ id: string; item: { createdAt: string } }>("select id,item from public.dashboard_media where user_id=$1", [userId])).map((r) => ({ id: r.id, createdAt: r.item.createdAt }));
}

/** Same-Origin-Header, wie ihn der Browser bei fetch() mitsendet (enforceSameOrigin). */
export const ORIGIN_HEADERS = { origin: BASE_URL, "content-type": "application/json" };

/** Beispiel-Payload für /api/inhalte-erstellen/create-task (wie ruixen-moon-chat.tsx baut). */
export function createTaskPayload(prompt: string, photoStyle: "reportage" | "premium" | "campaign" = "reportage") {
  return {
    etikettBild: "https://example.com/placeholder.png",
    flaschenTyp: "nrw_500",
    flaschenfarbe: "braun",
    bierstil: "helles",
    szene: "biergarten_sommer",
    tageszeit: "tageslicht",
    aspectRatio: "4:5",
    etikettModus: "generisch",
    stiltreue: "frei",
    keepLabel: false,
    photoStyle,
    zusatzWunsch: prompt,
    quality: "medium",
    variantCount: 1,
  };
}

export async function waitForJobsSettled(userId: string, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const open = Number((await sql<{ n: string }>("select count(*) n from public.generation_jobs where user_id=$1 and status='reserved'", [userId]))[0].n);
    if (open === 0) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
