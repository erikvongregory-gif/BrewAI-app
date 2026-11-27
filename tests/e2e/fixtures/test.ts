import { test as base, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadAccounts, type AccountKey } from "./accounts";
import { BASE_URL, MOCK_DIR, isForbiddenHost, TEST_SUPABASE_HOST } from "./env";
import { trustedDeviceToken, TRUSTED_DEVICE_COOKIE } from "./two-factor";
import { prepareContext } from "./app";

export { expect };

export type Issue = { kind: "console-error" | "console-warning" | "pageerror" | "http" | "requestfailed" | "hydration"; text: string; url?: string };

export const authFile = (key: AccountKey) => join(MOCK_DIR, `auth-${key}.json`);

/** Browser-Guard: jede Anfrage an *.brewai.de / Prod-Supabase wird abgebrochen und lässt den Test scheitern. */
export async function installGuard(context: BrowserContext, violations: string[]) {
  await context.route(
    (url) => isForbiddenHost(url.hostname),
    async (route) => {
      violations.push(route.request().url());
      await route.abort("blockedbyclient");
    },
  );
}

/** Sammelt Console-/Netzwerk-Probleme einer Seite. */
export function collectIssues(page: Page): Issue[] {
  const issues: Issue[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/hydrat/i.test(text) && msg.type() === "error") issues.push({ kind: "hydration", text: text.slice(0, 500) });
    if (msg.type() === "error") issues.push({ kind: "console-error", text: text.slice(0, 500), url: msg.location().url });
    if (msg.type() === "warning") issues.push({ kind: "console-warning", text: text.slice(0, 500), url: msg.location().url });
  });
  page.on("pageerror", (err) => issues.push({ kind: "pageerror", text: String(err.message).slice(0, 500) }));
  page.on("response", (res) => {
    if (res.status() >= 400) issues.push({ kind: "http", text: `${res.status()} ${res.request().method()}`, url: res.url() });
  });
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "";
    // Abgebrochene Navigationen/Prefetches sind kein Fehler der Seite.
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(err)) return;
    issues.push({ kind: "requestfailed", text: err, url: req.url() });
  });
  return issues;
}

export async function newContextAs(browser: import("@playwright/test").Browser, key: AccountKey | null, testInfo: TestInfo, violations: string[]) {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    ...use,
    baseURL: BASE_URL,
    storageState: key && existsSync(authFile(key)) ? authFile(key) : undefined,
  });
  await installGuard(context, violations);
  await prepareContext(context);
  return context;
}

/** Trusted-Device-Cookie setzen, damit der Login den E-Mail-Code-Schritt überspringt. */
export async function addTrustedDevice(context: BrowserContext, userId: string) {
  await context.addCookies([{ name: TRUSTED_DEVICE_COOKIE, value: trustedDeviceToken(userId), url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/anmelden");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
}

export async function axeCheck(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  await testInfo.attach(`axe-${label}.json`, { body: JSON.stringify(results.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target) })), null, 2), contentType: "application/json" });
  return { all: results.violations, serious };
}

export function setAiMockMode(mode: "ok" | "500" | "timeout" | "tiny") {
  writeFileSync(join(MOCK_DIR, "ai-mock.json"), JSON.stringify({ mode }));
}

export function aiCalls(): Array<{ host: string; path: string; mode: string; t: string }> {
  const f = join(MOCK_DIR, "ai-calls.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function serverGuardViolations(): string[] {
  const f = join(MOCK_DIR, "guard-violations.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean);
}

type Fixtures = {
  violations: string[];
  accounts: ReturnType<typeof loadAccounts>;
  issues: Issue[];
  /** Neuer, eingeloggter Kontext für ein bestimmtes Konto (inkl. Guard). */
  as: (key: AccountKey | null) => Promise<{ context: BrowserContext; page: Page; issues: Issue[] }>;
};

export const test = base.extend<Fixtures>({
  violations: async ({}, use) => {
    const v: string[] = [];
    await use(v);
  },
  accounts: async ({}, use) => {
    await use(loadAccounts());
  },
  context: async ({ context, violations }, use) => {
    await installGuard(context, violations);
    await prepareContext(context);
    await use(context);
  },
  issues: async ({ page }, use, testInfo) => {
    const issues = collectIssues(page);
    await use(issues);
    if (issues.length) await testInfo.attach("issues.json", { body: JSON.stringify(issues, null, 2), contentType: "application/json" });
  },
  as: async ({ browser, violations }, use, testInfo) => {
    const opened: BrowserContext[] = [];
    await use(async (key) => {
      const context = await newContextAs(browser, key, testInfo, violations);
      opened.push(context);
      const page = await context.newPage();
      const issues = collectIssues(page);
      return { context, page, issues };
    });
    for (const c of opened) await c.close();
  },
});

// Nach jedem Test: kein Kontakt zu Produktion (Browser + Server).
test.afterEach(async ({ violations }) => {
  expect(violations, "Browser-Anfrage an Produktionshost").toEqual([]);
  expect(serverGuardViolations(), "Server-Anfrage an Produktionshost").toEqual([]);
});

export const SUPABASE_TEST_HOST = TEST_SUPABASE_HOST;
