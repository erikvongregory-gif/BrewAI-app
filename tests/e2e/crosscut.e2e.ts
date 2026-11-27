import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect, axeCheck, type Issue } from "./fixtures/test";
import type { AccountKey } from "./fixtures/accounts";
import { ROOT } from "./fixtures/env";

// Querschnitt je Seite und Viewport: Console-Errors/-Warnings, fehlgeschlagene Requests (4xx/5xx), Hydration, axe (WCAG 2 A/AA), Screenshot.
const PAGES: Array<{ path: string; user: AccountKey | null }> = [
  { path: "/anmelden", user: null },
  { path: "/registrieren", user: null },
  { path: "/passwort-vergessen", user: null },
  { path: "/dashboard", user: "userA" },
  { path: "/dashboard/assistant", user: "userA" },
  { path: "/inhalte-erstellen", user: "userA" },
  { path: "/videos-erstellen", user: "userA" },
  { path: "/dashboard/media", user: "userA" },
  { path: "/dashboard/brand", user: "userA" },
  { path: "/dashboard/team", user: "userA" },
  { path: "/dashboard/pricing", user: "userA" },
  { path: "/dashboard/settings", user: "userA" },
  { path: "/admin", user: "admin" },
];

// Bekanntes Rauschen, das kein App-Fehler ist (dev-only).
const IGNORE = [/Download the React DevTools/, /\[Fast Refresh\]/, /\[HMR\]/, /webpack-hmr|turbopack-hmr/,
  // Manche Chromium-Builds (Linux) kennen das Feature nicht; der Header bleibt bewusst streng.
  /Permissions-Policy header: Unrecognized feature: .bluetooth./];

for (const p of PAGES) {
  test(`Querschnitt ${p.path}`, async ({ as }, testInfo) => {
    const { page, issues } = await as(p.user);
    await page.goto(p.path);
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const dir = join(ROOT, "tests", "e2e", ".artifacts", "screens", testInfo.project.name);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: join(dir, `${p.path.replace(/\//g, "_") || "root"}.png`), fullPage: true });
    const { serious, all } = await axeCheck(page, testInfo, p.path.replace(/\//g, "_"));
    const relevant = issues.filter((i: Issue) => !IGNORE.some((re) => re.test(i.text)));
    await testInfo.attach("issues.json", { body: JSON.stringify(relevant, null, 2), contentType: "application/json" });
    const summary = {
      page: p.path,
      consoleErrors: relevant.filter((i) => i.kind === "console-error" || i.kind === "pageerror").map((i) => i.text.slice(0, 160)),
      consoleWarnings: relevant.filter((i) => i.kind === "console-warning").map((i) => i.text.slice(0, 160)),
      http: relevant.filter((i) => i.kind === "http" || i.kind === "requestfailed").map((i) => `${i.text} ${i.url}`),
      hydration: relevant.filter((i) => i.kind === "hydration").length,
      axeSerious: serious.map((v) => `${v.id}(${v.nodes.length})`),
      axeAll: all.map((v) => `${v.id}:${v.impact}`),
    };
    console.log(`[crosscut ${testInfo.project.name}] ${JSON.stringify(summary)}`);
    expect.soft(summary.hydration, "Hydration-Fehler").toBe(0);
    expect.soft(summary.consoleErrors, "Console-Errors").toEqual([]);
    expect.soft(summary.http, "fehlgeschlagene Requests").toEqual([]);
    expect.soft(summary.consoleWarnings, "Console-Warnings").toEqual([]);
    expect.soft(summary.axeSerious, "axe serious/critical").toEqual([]);
  });
}
