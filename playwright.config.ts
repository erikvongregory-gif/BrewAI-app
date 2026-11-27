import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { twoFactorSecret } from "./tests/e2e/fixtures/accounts";
import { BASE_URL, E2E_PORT, ROOT, testEnv } from "./tests/e2e/fixtures/env";

/**
 * E2E-Suite: startet einen EIGENEN Next-Dev-Server (Port 3101) gegen das Supabase-TESTprojekt.
 * Alles, was in .env.local auf Produktion zeigt oder Geld kostet, wird hier per Prozess-Env überschrieben
 * (Next lädt .env-Dateien nur für Variablen, die in process.env noch nicht gesetzt sind).
 */
const t = testEnv();

function stripeTestKey(): string {
  const line = readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/).find((l) => l.startsWith("STRIPE_SECRET_KEY="));
  const key = line?.slice("STRIPE_SECRET_KEY=".length).trim() ?? "";
  // Nur Test-Modus zulassen; sonst Stripe komplett abschalten.
  return key.startsWith("sk_test_") ? key : "";
}

const preload = pathToFileURL(join(ROOT, "tests", "e2e", "fixtures", "server-preload.mjs")).href;

const serverEnv: Record<string, string> = {
  NODE_OPTIONS: `--import=${preload}`,
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: String(E2E_PORT),
  // Supabase: ausschließlich Testprojekt
  NEXT_PUBLIC_SUPABASE_URL: t.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_URL: t.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: t.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: t.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: t.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_GENERATED_IMAGES_BUCKET: "generated-images",
  // URLs: alles lokal
  NEXT_PUBLIC_APP_BASE_URL: BASE_URL,
  NEXT_PUBLIC_MARKETING_SITE_URL: BASE_URL,
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_PUBLIC_COOKIE_DOMAIN: process.env.E2E_PROD ? "none" : "",
  KIE_DOWNLOAD_ALLOWED_HOSTS: "",
  // KI: ungültige Keys (Fail-closed) + serverseitiger Mock im Preload
  OPENAI_API_KEY: "sk-e2e-invalid-key-no-cost",
  ANTHROPIC_API_KEY: "sk-ant-e2e-invalid-key-no-cost",
  KIE_API_KEY: "e2e-invalid",
  NANOBANANA_API_KEY: "e2e-invalid",
  ARK_API_KEY: "",
  PHOTOROOM_API_KEY: "",
  REMOVE_BG_API_KEY: "",
  OPENAI_IMAGE_TIMEOUT_MS: "8000",
  LABEL_FIDELITY_CHECK: "0",
  // Mail: aus (Passwort-Reset/2FA dürfen keine echten Mails senden)
  RESEND_API_KEY: "",
  RESEND_FROM_EMAIL: "",
  RESEND_FALLBACK_FROM_EMAIL: "",
  RESEND_DEV_FORWARD_TO: "",
  PASSWORD_RESET_FROM_EMAIL: "",
  ADMIN_2FA_FROM_EMAIL: "",
  // Secrets: eigene Testwerte
  ADMIN_2FA_SECRET: twoFactorSecret(),
  NEXTAUTH_SECRET: "",
  TOKEN_STATE_SECRET: twoFactorSecret().split("").reverse().join(""),
  OWNER_EMAILS: "",
  OWNER_2FA_BACKUP_CODE: "",
  LOGIN_WAITLIST_BYPASS_SECRET: "",
  CRON_SECRET: twoFactorSecret().slice(0, 40),
  VERCEL_OIDC_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  META_APP_ID: "",
  META_APP_SECRET: "",
  FACEBOOK_APP_ID: "",
  FACEBOOK_APP_SECRET: "",
  // Stripe: nur Test-Key, kein Webhook lokal
  STRIPE_SECRET_KEY: stripeTestKey(),
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_no_webhook_locally",
  // Produktions-Build wertet nur "off"/"false" als aus (src/lib/featureFlags.ts).
  NEXT_PUBLIC_LOGIN_WAITLIST_ENABLED: process.env.E2E_PROD ? "off" : "0",
};

export default defineConfig({
  testDir: "./tests/e2e",
  // *.e2e.ts statt *.spec.ts: vitest sammelt sonst die Playwright-Dateien ein.
  testMatch: /.*\.e2e\.ts$/,
  outputDir: "./tests/e2e/.artifacts/results",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Ein Worker: KI-Mock-Zustand und persistente Rate-Limits sind global.
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "./tests/e2e/.artifacts/results.json" }],
    ["html", { outputFolder: "./tests/e2e/.artifacts/html", open: "never" }],
  ],
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.e2e\.ts$/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "desktop",
      testIgnore: /auth\.setup\.e2e\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testIgnore: /auth\.setup\.e2e\.ts$/,
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    // E2E_PROD=1: Produktions-Build (next build && next start) statt Dev-Server, z. B. für Prefetch und echte Ladezeiten.
    command: process.env.E2E_PROD
      ? `node ./node_modules/next/dist/bin/next build && node --max-http-header-size=524288 ./node_modules/next/dist/bin/next start --port ${E2E_PORT}`
      : `node --max-http-header-size=524288 ./node_modules/next/dist/bin/next dev --turbopack --port ${E2E_PORT}`,
    url: `${BASE_URL}/anmelden`,
    // Nie einen fremden Server wiederverwenden (könnte mit Produktions-Env laufen).
    reuseExistingServer: false,
    timeout: process.env.E2E_PROD ? 900_000 : 300_000,
    env: serverEnv,
    stdout: "pipe",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
