import type { Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { DASHBOARD_ROUTES, clickNav, isMobile, isRscRequest } from "./fixtures/app";

const DATA_APIS = ["/api/dashboard/media", "/api/dashboard/summary", "/api/dashboard/team", "/api/dashboard/settings", "/api/billing/state"];

/** Zeichnet Requests einer Phase auf: RSC/Seitenaufrufe + Daten-APIs. */
function recorder(page: Page) {
  let reqs: Request[] = [];
  page.on("request", (r) => reqs.push(r));
  return {
    reset: () => (reqs = []),
    summary: () => {
      const rsc = reqs.filter(isRscRequest).length;
      const documents = reqs.filter((r) => r.resourceType() === "document").length;
      const api: Record<string, number> = {};
      for (const r of reqs) {
        const p = new URL(r.url()).pathname;
        if (DATA_APIS.includes(p)) api[p] = (api[p] ?? 0) + 1;
      }
      return { rsc, documents, api, apiTotal: Object.values(api).reduce((a, b) => a + b, 0) };
    },
  };
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}

test.describe("Navigation", () => {
  for (const route of DASHBOARD_ROUTES) {
    test(`Direktaufruf ${route.path}`, async ({ as }) => {
      const { page } = await as("userA");
      const res = await page.goto(route.path);
      expect(res?.status()).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/") + "(\\?|$)"));
      if (route.heading) await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    });

    test(`Per Klick erreichbar + Reload: ${route.path}`, async ({ as }, testInfo) => {
      const { page } = await as("userA");
      await page.goto(route.path === "/dashboard" ? "/dashboard/settings" : "/dashboard");
      await settle(page);
      await clickNav(page, testInfo, route);
      await expect(page).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/") + "(\\?|$)"));
      await page.reload();
      await expect(page).toHaveURL(new RegExp(route.path.replace(/\//g, "\\/") + "(\\?|$)"));
      if (route.heading) await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    });
  }

  test("Browser Zurück/Vor über mehrere Bereiche", async ({ as }, testInfo) => {
    const { page } = await as("userA");
    await page.goto("/dashboard");
    await settle(page);
    const seq = [DASHBOARD_ROUTES[3], DASHBOARD_ROUTES[7], DASHBOARD_ROUTES[2]];
    for (const r of seq) {
      await clickNav(page, testInfo, r);
      await expect(page).toHaveURL(new RegExp(r.path.replace(/\//g, "\\/")));
      await settle(page);
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/media/);
    await expect(page.getByRole("heading", { level: 1, name: "Mediathek" })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByRole("heading", { level: 1, name: "Einstellungen" })).toBeVisible();
  });

  test("Deep-Link Legacy ?tab=media leitet auf /dashboard/media um und behält weitere Parameter", async ({ as }) => {
    const { page } = await as("userA");
    await page.goto("/dashboard?tab=media&q=motiv");
    await expect(page).toHaveURL(/\/dashboard\/media\?q=motiv/);
    await expect(page.getByRole("heading", { level: 1, name: "Mediathek" })).toBeVisible();
  });

  test("B-5: Unbekannter Abschnitt /dashboard/gibtsnicht zeigt 404 statt still die Übersicht", async ({ as }) => {
    const { page } = await as("userA");
    const res = await page.goto("/dashboard/gibtsnicht");
    expect(res?.status(), "erwartet 404 für unbekannten Abschnitt").toBe(404);
  });

  test("B-1: Tabwechsel im Dashboard ohne Server-Roundtrip und ohne Neuladen der Daten (Remount-Nachweis)", async ({ as }, testInfo) => {
    const { page } = await as("userA");
    await page.goto("/dashboard");
    await settle(page);
    const rec = recorder(page);
    const results: Array<{ to: string; rsc: number; apiTotal: number; api: Record<string, number>; ms: number }> = [];
    for (const r of [DASHBOARD_ROUTES[3], DASHBOARD_ROUTES[7], DASHBOARD_ROUTES[0], DASHBOARD_ROUTES[3]]) {
      // Remount-Nachweis: summary/team/settings werden nur im Mount-Effekt (deps []) von DashboardRedesignShell geladen.
      rec.reset();
      const t0 = Date.now();
      await clickNav(page, testInfo, r);
      await expect(page).toHaveURL(new RegExp(r.path.replace(/\//g, "\\/") + "(\\?|$)"));
      await settle(page);
      const ms = Date.now() - t0;
      const s = rec.summary();
      results.push({ to: r.path, rsc: s.rsc, apiTotal: s.apiTotal, api: s.api, ms });
    }
    await testInfo.attach("b1-requests.json", { body: JSON.stringify(results, null, 2), contentType: "application/json" });
    console.log(`[B-1 ${testInfo.project.name}]`, JSON.stringify(results));
    for (const r of results) {
      expect.soft(r.rsc, `Server-Roundtrip (RSC) beim Wechsel nach ${r.to}`).toBe(0);
      expect.soft(r.api["/api/dashboard/summary"] ?? 0, `summary neu geladen beim Wechsel nach ${r.to}`).toBe(0);
      expect.soft(r.api["/api/dashboard/team"] ?? 0, `team neu geladen beim Wechsel nach ${r.to}`).toBe(0);
      expect.soft(r.api["/api/dashboard/settings"] ?? 0, `settings neu geladen beim Wechsel nach ${r.to}`).toBe(0);
    }
  });

  test("B-1: Mediathek-Scrollposition bleibt nach Tabwechsel und Zurück erhalten", async ({ as }, testInfo) => {
    const { page } = await as("userA");
    await page.goto("/dashboard/media");
    await expect(page.getByRole("button", { name: /E2E Motiv 47 in Großansicht/ })).toBeVisible();
    await page.getByRole("button", { name: /E2E Motiv 47 in Großansicht/ }).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => Math.max(window.scrollY, document.querySelector("main")?.scrollTop ?? 0, ...Array.from(document.querySelectorAll("*")).filter((e) => e.scrollTop > 0).map((e) => e.scrollTop)));
    expect(before).toBeGreaterThan(100);
    await clickNav(page, testInfo, DASHBOARD_ROUTES[7]);
    await expect(page).toHaveURL(/settings/);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/media/);
    await settle(page);
    const after = await page.evaluate(() => Math.max(window.scrollY, document.querySelector("main")?.scrollTop ?? 0, ...Array.from(document.querySelectorAll("*")).filter((e) => e.scrollTop > 0).map((e) => e.scrollTop)));
    expect(after, "Scrollposition nach Zurück").toBeGreaterThan(before * 0.5);
  });

  test("B-2: Sichtbare Reaktion < 300 ms nach Klick, Prefetch der Navigationsziele", async ({ as }, testInfo) => {
    const { page } = await as("userA");
    await page.goto("/dashboard");
    await settle(page);
    // Prefetch: nach dem Laden + Hover dürfen Navigationsziele vorab geladen sein
    const prefetched: string[] = [];
    page.on("request", (r) => {
      if (isRscRequest(r) && r.headers()["next-router-prefetch"]) prefetched.push(new URL(r.url()).pathname);
    });
    const target = isMobile(testInfo) ? page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Erstellen" }) : page.locator('[data-slot="sidebar"]').getByRole("link", { name: "Bilder erstellen", exact: true }).first();
    await target.hover().catch(() => {});
    await page.waitForTimeout(1500);
    // Reaktion messen: URL-Wechsel ODER Lade-/Pending-Anzeige ODER Wechsel des Inhalts
    const t0 = Date.now();
    await page.evaluate(() => {
      const w = window as unknown as { __e2eReact: number | null; __e2eStart: number };
      w.__e2eReact = null;
      w.__e2eStart = performance.now();
      const startPath = location.pathname;
      const mainHtml = document.querySelector("main")?.innerHTML.length ?? 0;
      const tick = () => {
        const busy = document.querySelector("[aria-busy='true'], [data-pending='true'], .animate-pulse, [role='progressbar']");
        const changed = location.pathname !== startPath || Math.abs((document.querySelector("main")?.innerHTML.length ?? 0) - mainHtml) > 200;
        if (busy || changed) w.__e2eReact = performance.now() - w.__e2eStart;
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await target.click();
    await expect(page).toHaveURL(/inhalte-erstellen/);
    const urlMs = Date.now() - t0;
    await expect(page.getByRole("button", { name: /Generieren/ })).toBeVisible();
    const contentMs = Date.now() - t0;
    const reactMs = await page.evaluate(() => (window as unknown as { __e2eReact: number | null }).__e2eReact);
    const data = { reactMs, urlMs, contentMs, prefetched };
    await testInfo.attach("b2-timing.json", { body: JSON.stringify(data, null, 2), contentType: "application/json" });
    console.log(`[B-2 ${testInfo.project.name}]`, JSON.stringify(data));
    expect.soft(prefetched.length, "Navigationsziele werden vorab geladen (Prefetch)").toBeGreaterThan(0);
    expect(reactMs ?? 99_999, "erste sichtbare Reaktion nach Klick (ms)").toBeLessThan(300);
  });

  test("B-3: Prompt und Auswahl bleiben nach Wechsel in die Mediathek und zurück erhalten", async ({ as }, testInfo) => {
    const { page } = await as("userA");
    await page.goto("/inhalte-erstellen");
    const box = page.getByRole("textbox", { name: "Beschreibe dein Bild…" });
    await box.fill("Drei Freunde stoßen im Biergarten an");
    await page.getByRole("radio", { name: "Premium-Fotografie" }).click();
    await clickNav(page, testInfo, DASHBOARD_ROUTES[3]);
    await expect(page).toHaveURL(/\/dashboard\/media/);
    await clickNav(page, testInfo, DASHBOARD_ROUTES[2]);
    await expect(page).toHaveURL(/inhalte-erstellen/);
    await expect.soft(page.getByRole("radio", { name: "Premium-Fotografie" }), "Fotostil erhalten").toBeChecked();
    await expect(page.getByRole("textbox", { name: "Beschreibe dein Bild…" }), "Prompt erhalten").toHaveValue("Drei Freunde stoßen im Biergarten an");
  });

  test("Schneller Tabwechsel 10x hin und her: stabil, kein Fehler, kein leerer Inhalt, keine Layout-Sprünge", async ({ as }, testInfo) => {
    const { page, issues } = await as("userA");
    await page.goto("/dashboard/media");
    await settle(page);
    await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __blank: number };
      w.__cls = 0;
      w.__blank = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value;
      }).observe({ type: "layout-shift", buffered: false });
      setInterval(() => {
        const main = document.querySelector("main");
        const txt = (main?.innerText ?? "").replace(/Suchen|Schnellsuche|Tokens übrig|Mediathek \/ Assets öffnen/g, "").trim();
        if (txt.length < 20) w.__blank += 1;
      }, 50);
    });
    const rec = recorder(page);
    rec.reset();
    for (let i = 0; i < 10; i++) {
      await clickNav(page, testInfo, i % 2 === 0 ? DASHBOARD_ROUTES[7] : DASHBOARD_ROUTES[3]);
      await page.waitForTimeout(150);
    }
    await expect(page).toHaveURL(/\/dashboard\/media/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Mediathek" })).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E Motiv 0 in Großansicht/ })).toBeVisible();
    await settle(page);
    const { cls, blank } = await page.evaluate(() => ({ cls: (window as unknown as { __cls: number }).__cls, blank: (window as unknown as { __blank: number }).__blank }));
    const s = rec.summary();
    const r429 = issues.filter((i) => i.kind === "http" && i.text.startsWith("429"));
    const data = { cls, blankSamples50ms: blank, ...s, http429: r429.length };
    await testInfo.attach("rapid-switch.json", { body: JSON.stringify(data, null, 2), contentType: "application/json" });
    console.log(`[rapid ${testInfo.project.name}]`, JSON.stringify(data));
    expect(issues.filter((i) => i.kind === "pageerror")).toEqual([]);
    expect.soft(r429.length, "429 durch Tabwechsel").toBe(0);
    expect.soft(blank, "Anzahl 50-ms-Proben mit leerem Inhaltsbereich (weißer Flash)").toBe(0);
    expect.soft(cls, "Cumulative Layout Shift während 10 Wechseln").toBeLessThan(0.1);
  });

  test("C-3: 35 Tabwechsel in < 60 s lösen kein Rate-Limit der Team-API aus", async ({ as }, testInfo) => {
    test.skip(isMobile(testInfo), "Einmal je Lauf (Desktop): das Rate-Limit ist pro Nutzer, nicht pro Viewport.");
    test.setTimeout(180_000);
    const { page } = await as("userB");
    await page.goto("/dashboard");
    await settle(page);
    const statuses: number[] = [];
    page.on("response", (r) => {
      if (new URL(r.url()).pathname === "/api/dashboard/team") statuses.push(r.status());
    });
    const t0 = Date.now();
    for (let i = 0; i < 35 && Date.now() - t0 < 55_000; i++) {
      await clickNav(page, testInfo, i % 2 === 0 ? DASHBOARD_ROUTES[3] : DASHBOARD_ROUTES[0]);
      await page.waitForURL(i % 2 === 0 ? /\/dashboard\/media/ : /\/dashboard(\?|$)/);
    }
    await clickNav(page, testInfo, DASHBOARD_ROUTES[5]);
    await settle(page);
    const data = { teamCalls: statuses.length, http429: statuses.filter((s) => s === 429).length, seconds: (Date.now() - t0) / 1000 };
    await testInfo.attach("c3.json", { body: JSON.stringify(data), contentType: "application/json" });
    console.log("[C-3]", JSON.stringify(data));
    expect.soft(data.http429, "429 auf /api/dashboard/team").toBe(0);
    await expect(page.getByText("Teamdaten konnten nicht geladen werden")).toHaveCount(0);
  });
});
