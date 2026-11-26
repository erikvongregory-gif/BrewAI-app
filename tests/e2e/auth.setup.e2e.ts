import { test, expect, addTrustedDevice, authFile, loginViaUi, SUPABASE_TEST_HOST } from "./fixtures/test";
import type { AccountKey } from "./fixtures/accounts";
import { isForbiddenHost } from "./fixtures/env";

// Login aller Test-Accounts über die echte Login-Seite; Session wird als storageState für die übrigen Tests gespeichert.
const KEYS: AccountKey[] = ["userA", "userB", "zeroCredits", "noSub", "admin", "teamMember", "teamOwnerExpired"];

test.describe.configure({ mode: "serial" });

test("Testserver spricht nur mit dem Supabase-Testprojekt", async ({ page, accounts, context }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).hostname));
  await addTrustedDevice(context, accounts.userA.id!);
  await loginViaUi(page, accounts.userA.email, accounts.userA.password);
  // Die Zugangsdaten existieren nur im Testprojekt: erfolgreicher Login beweist, dass der Server dorthin spricht.
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 90_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  const supabaseHosts = [...hosts].filter((h) => h.endsWith("supabase.co") || h.endsWith("brewai.de"));
  expect(supabaseHosts.every((h) => h === SUPABASE_TEST_HOST)).toBeTruthy();
  expect([...hosts].some(isForbiddenHost)).toBeFalsy();
  // Inlined NEXT_PUBLIC_SUPABASE_URL im Client-Bundle prüfen (Turbopack-Cache könnte alte Werte enthalten).
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.src).filter(Boolean));
  let sawTestHost = false;
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text();
    expect(body.includes("auth.brewai.de/") && body.includes("NEXT_PUBLIC_SUPABASE_URL")).toBeFalsy();
    if (body.includes(SUPABASE_TEST_HOST)) sawTestHost = true;
  }
  expect(sawTestHost, "Client-Bundle enthält die Test-Supabase-URL").toBeTruthy();
});

for (const key of KEYS) {
  test(`Login + Session speichern: ${key}`, async ({ page, accounts, context }) => {
    const acc = accounts[key];
    await addTrustedDevice(context, acc.id!);
    await loginViaUi(page, acc.email, acc.password);
    await page.waitForURL((u) => !u.pathname.startsWith("/anmelden") && !u.pathname.startsWith("/auth/"), { timeout: 90_000 }).catch(() => {});
    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token")), "Supabase-Session-Cookie gesetzt").toBeTruthy();
    await context.storageState({ path: authFile(key) });
  });
}
