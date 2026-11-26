import { test, expect } from "./fixtures/test";
import { DASHBOARD_ROUTES, clickNav } from "./fixtures/app";

const NEXT_DEFAULT_404 = /This page could not be found/;
// Next-16-Standardfehlerseite (global-error fehlt): "This page couldn’t load / A server error occurred".
const NEXT_DEFAULT_ERROR = /Application error: a (server|client)-side exception has occurred|Internal Server Error|This page couldn.t load|A server error occurred/;

test.describe("Fehlerzustände", () => {
  test("Offline: Navigation/Laden zeigt verständliche Meldung statt weißer Seite", async ({ as }, testInfo) => {
    const { page, context } = await as("userA");
    await page.goto("/dashboard/media");
    await expect(page.getByRole("heading", { level: 1, name: "Mediathek" })).toBeVisible();
    await context.setOffline(true);
    await clickNav(page, testInfo, DASHBOARD_ROUTES[7]).catch(() => {});
    await page.waitForTimeout(3000);
    const text = (await page.locator("body").innerText()).trim();
    test.info().annotations.push({ type: "measure", description: `URL ${page.url()}; sichtbarer Text ${text.length} Zeichen` });
    expect(text.length, "Seite darf nicht leer werden").toBeGreaterThan(50);
    await context.setOffline(false);
  });

  test("API offline beim Laden der Mediathek → „Keine Verbindung“-Meldung", async ({ as }) => {
    const { page } = await as("userA");
    await page.route("**/api/dashboard/media**", (r) => r.abort("internetdisconnected"));
    await page.goto("/dashboard/media");
    await expect(page.getByText(/Keine Verbindung|Mediathek konnte nicht geladen werden/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("Langsames Netz (2 s Verzögerung auf Daten-APIs): Ladezustand sichtbar, kein leerer Bereich", async ({ as }) => {
    const { page } = await as("userA");
    await page.route("**/api/dashboard/**", async (r) => {
      await new Promise((res) => setTimeout(res, 2000));
      await r.continue().catch(() => {});
    });
    await page.goto("/dashboard/media", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const busy = await page.locator("[aria-busy='true'], .animate-pulse, [data-slot='skeleton'], [role='progressbar'], [role='status']").count();
    const text = (await page.locator("main").innerText().catch(() => "")).trim();
    test.info().annotations.push({ type: "measure", description: `Ladeindikatoren: ${busy}, Text im main: ${text.length}` });
    expect(busy > 0 || text.length > 30, "während des Ladens ist ein Ladezustand oder Inhalt sichtbar").toBeTruthy();
    await expect(page.getByRole("button", { name: /E2E Motiv 0 in Großansicht/ })).toBeVisible({ timeout: 30_000 });
  });

  test("404-Route zeigt eigene Seite (nicht Next-Standard) mit Weg zurück", async ({ page }) => {
    const res = await page.goto("/diese-seite-gibt-es-nicht");
    expect(res?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText(NEXT_DEFAULT_404);
    await expect(page.getByRole("link").first()).toBeVisible();
  });

  test("Server-Fehler im Dashboard (getWorkspace wirft) zeigt eigene Fehlerseite statt Next-Standard (C-1)", async ({ as }) => {
    const { page } = await as("teamMember");
    const res = await page.goto("/dashboard/media");
    const body = await page.locator("body").innerText();
    test.info().annotations.push({ type: "measure", description: `HTTP ${res?.status()}: ${body.slice(0, 160).replace(/\s+/g, " ")}` });
    expect(body).not.toMatch(NEXT_DEFAULT_ERROR);
    expect(body.trim().length).toBeGreaterThan(40);
    await expect(page.getByRole("link").or(page.getByRole("button")).first()).toBeVisible();
  });

  test("API-Fehler 500 der Übersicht → verständliche Meldung im Dashboard", async ({ as }) => {
    const { page } = await as("userA");
    await page.route("**/api/dashboard/summary", (r) => r.fulfill({ status: 500, body: JSON.stringify({ error: "x" }), contentType: "application/json" }));
    await page.goto("/dashboard");
    await expect(page.getByText(/Übersicht konnte nicht geladen werden/)).toBeVisible({ timeout: 30_000 });
  });
});
