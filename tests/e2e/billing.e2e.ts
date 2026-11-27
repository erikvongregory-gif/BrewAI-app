import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/test";
import { remainingTokens } from "./fixtures/app";
import { sql } from "./fixtures/db/apply-schema";
import { loadAccounts, saveAccounts } from "./fixtures/accounts";

async function rememberCustomer(userId: string) {
  const id = (await sql<{ c: string | null }>("select stripe_customer_id c from billing_subscriptions where user_id=$1", [userId]))[0]?.c;
  if (id && !id.startsWith("cus_e2e_")) {
    const acc = loadAccounts();
    acc.userB.stripeCustomerId = id;
    saveAccounts(acc);
  }
}

// Stripe nur im Test-Modus (sk_test_ aus .env.local, im Config geprüft). Keine Produkte/Preise/Webhooks anlegen.
// Gutschrift ohne Webhook: Die App bestätigt Token-Packs nach Rückkehr über /api/billing/confirm-session.

/** Sucht ein Element in allen Frames (Stripe Checkout rendert das Zahlungsformular in verschachtelten iFrames). */
async function inAnyFrame(page: Page, selector: string, timeoutMs = 30_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    for (const f of page.frames()) {
      const loc = f.locator(selector).first();
      if (await loc.isVisible().catch(() => false)) return loc;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`Stripe-Feld nicht gefunden: ${selector}`);
}

async function fillStripeCard(page: Page, card: string) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  // Zahlungsart "Karte" (Radio-Zeile) in einem der Stripe-Frames wählen
  await expect(async () => {
    for (const f of page.frames()) {
      const card = f.getByText("Karte", { exact: true }).first();
      if (await card.isVisible().catch(() => false)) {
        await card.click();
        return;
      }
    }
    throw new Error("Zahlungsart Karte nicht gefunden");
  }).toPass({ timeout: 30_000 });
  await (await inAnyFrame(page, '#cardNumber, input[name="cardNumber"], input[autocomplete="cc-number"]')).fill(card);
  await (await inAnyFrame(page, '#cardExpiry, input[name="cardExpiry"], input[autocomplete="cc-exp"]')).fill("12 / 34");
  await (await inAnyFrame(page, '#cardCvc, input[name="cardCvc"], input[autocomplete="cc-csc"]')).fill("123");
  const name = await inAnyFrame(page, '#billingName, input[name="billingName"], input[autocomplete="cc-name"]', 3_000).catch(() => null);
  if (name) await name.fill("E2E Test");
  const postal = await inAnyFrame(page, '#billingPostalCode, input[autocomplete="postal-code"]', 1_500).catch(() => null);
  if (postal) await postal.fill("10115");
  await expect(async () => {
    for (const f of page.frames()) {
      const pay = f.getByRole("button", { name: "Bezahlen", exact: true }).first();
      if (await pay.isVisible().catch(() => false)) {
        await pay.click();
        return;
      }
    }
    throw new Error("Bezahlen-Button nicht gefunden");
  }).toPass({ timeout: 30_000 });
}

async function textInAnyFrame(page: Page, re: RegExp, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    for (const f of page.frames()) if (await f.getByText(re).first().isVisible().catch(() => false)) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function checkConsent(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  const consent = page.getByRole("checkbox", { name: /Ich stimme zu, dass BrewAI/ });
  await expect(consent).toBeVisible();
  // Klick vor abgeschlossener Hydration geht verloren → wiederholen, bis der Zustand umspringt.
  await expect(async () => {
    if ((await consent.getAttribute("aria-checked")) !== "true") await consent.click();
    await expect(consent).toHaveAttribute("aria-checked", "true", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function startTokenPurchase(page: Page) {
  await page.goto("/dashboard/pricing");
  await checkConsent(page);
  await page.getByRole("article", { name: "+500 Tokens" }).getByRole("button", { name: "Jetzt kaufen" }).click();
}

test.describe("Credits & Billing", () => {
  test("Token-Anzeige entspricht der Datenbank", async ({ as, accounts }) => {
    const remaining = await remainingTokens(accounts.userA.id!);
    const { page } = await as("userA");
    await page.goto("/dashboard");
    const formatted = remaining.toLocaleString("de-DE");
    await expect(page.getByRole("button", { name: new RegExp(`${formatted.replace(".", "\\.")} von [\\d.]+ Tokens übrig`) }).first()).toBeVisible();
  });

  test("0 Credits: Anzeige zeigt 0 und Hinweis zum Aufladen", async ({ as }) => {
    const { page } = await as("zeroCredits");
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /^0 von [\d.]+ Tokens übrig/ }).first()).toBeVisible();
  });

  test("Kauf Token-Pack mit Testkarte 4242 → Gutschrift nach Rückkehr", async ({ as, accounts }) => {
    test.setTimeout(180_000);
    const before = await remainingTokens(accounts.userB.id!);
    const { page } = await as("userB");
    await startTokenPurchase(page);
    await fillStripeCard(page, "4242 4242 4242 4242");
    await rememberCustomer(accounts.userB.id!);
    await page.waitForURL(/localhost:\d+\/dashboard\?billing=success_tokens/, { timeout: 90_000 });
    await expect.poll(() => remainingTokens(accounts.userB.id!), { timeout: 60_000 }).toBe(before + 500);
    await expect(page.getByRole("button", { name: new RegExp(`${(before + 500).toLocaleString("de-DE").replace(".", "\\.")} von`) }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("Abgelehnte Karte 4000 0000 0000 0002 → Fehlermeldung bei Stripe, keine Gutschrift", async ({ as, accounts }) => {
    test.setTimeout(180_000);
    const before = await remainingTokens(accounts.userB.id!);
    const { page } = await as("userB");
    await startTokenPurchase(page);
    await fillStripeCard(page, "4000 0000 0000 0002");
    expect(await textInAnyFrame(page, /(abgelehnt|declined)/i), "Ablehnungsmeldung bei Stripe").toBeTruthy();
    expect(page.url()).toContain("checkout.stripe.com");
    expect(await remainingTokens(accounts.userB.id!)).toBe(before);
  });

  test("3DS-Karte 4000 0025 0000 3155 → Authentifizierung erforderlich", async ({ as }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Einmal je Lauf.");
    test.setTimeout(180_000);
    const { page } = await as("userB");
    await startTokenPurchase(page);
    await fillStripeCard(page, "4000 0025 0000 3155");
    // Stripe zeigt die 3DS-Testseite in einem iFrame
    expect(await textInAnyFrame(page, /(3D Secure|Authentifizierung|authentication|Complete|Fail)/i), "3DS-Abfrage sichtbar").toBeTruthy();
  });

  test("Abo-Kauf (Checkout) startet Stripe-Checkout im Test-Modus", async ({ as, accounts }) => {
    test.setTimeout(120_000);
    // Offenen Checkout-Lock (24 h) aus früheren Läufen entfernen, damit der Test unabhängig ist.
    await sql("delete from public.billing_checkout_locks where user_id=$1", [accounts.noSub.id]);
    const { page } = await as("noSub");
    await page.goto("/dashboard/pricing");
    await checkConsent(page);
    await page.getByRole("button", { name: "Monatlich" }).click();
    await page.getByRole("article", { name: "Brauerei Start" }).getByRole("button", { name: "Plan wählen" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    expect(page.url()).toMatch(/cs_test_/);
  });

  test("Checkout abbrechen und erneut starten (gleicher Plan) führt wieder zu Stripe", async ({ as, accounts }, testInfo) => {
    test.setTimeout(150_000);
    // Offenen Checkout-Lock (24 h) aus früheren Läufen entfernen, damit der Test unabhängig ist.
    await sql("delete from public.billing_checkout_locks where user_id=$1", [accounts.noSub.id]);
    const { page } = await as("noSub");
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto("/dashboard/pricing");
      await checkConsent(page);
      await page.getByRole("button", { name: "Monatlich" }).click();
      const res = page.waitForResponse((r) => r.url().includes("/api/billing/checkout") && r.request().method() === "POST");
      await page.getByRole("article", { name: "Brauerei Start" }).getByRole("button", { name: "Plan wählen" }).click();
      const r = await res;
      const body = r.status() === 200 ? "" : await r.text().catch(() => "");
      testInfo.annotations.push({ type: "measure", description: `Versuch ${attempt}: HTTP ${r.status()} ${body.slice(0, 160)}` });
      expect(r.status(), `Versuch ${attempt}: ${body.slice(0, 200)}`).toBe(200);
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    }
  });

  test("Abo-Gutschrift nach Abschluss", async () => {
    test.skip(true, "Übersprungen (kein Webhook lokal): Abo-Aktivierung läuft über checkout.session.completed/customer.subscription.* am Stripe-Webhook.");
  });

  test("C-1: Teammitglied, dessen Inhaber-Abo abgelaufen ist, sieht eine erklärende Seite statt Next-Fehlerseite", async ({ as }) => {
    const { page } = await as("teamMember");
    const res = await page.goto("/dashboard");
    const body = await page.locator("body").innerText();
    test.info().annotations.push({ type: "measure", description: `HTTP ${res?.status()}, Text: ${body.slice(0, 200).replace(/\s+/g, " ")}` });
    expect(body).not.toMatch(/Application error|This page could not be found|Internal Server Error|server-side exception|This page couldn.t load|A server error occurred/i);
    await expect(page.getByText(/(Abo|Team).*(abgelaufen|pausiert|nicht aktiv)/i).first()).toBeVisible();
  });

  test("Teaminhaber mit abgelaufenem Abo: Dashboard lädt, Status sichtbar", async ({ as }) => {
    const { page } = await as("teamOwnerExpired");
    const res = await page.goto("/dashboard");
    expect(res?.status()).toBeLessThan(400);
    await page.goto("/inhalte-erstellen");
    // Restguthaben (Lots laufen nach Kündigung weiter) erlaubt laut access.ts weiterhin Generieren → nur protokollieren
    test.info().annotations.push({ type: "measure", description: `Erstellen-Seite → ${new URL(page.url()).pathname}` });
    await page.goto("/dashboard/pricing");
    await expect(page.locator("main")).toContainText(/(gekündigt|abgelaufen|Kein aktives|Plan wählen)/i);
  });
});
