import { randomBytes, createHash } from "node:crypto";
import { test, expect, addTrustedDevice, loginViaUi } from "./fixtures/test";
import { adminClient } from "./fixtures/seed";
import { sql } from "./fixtures/db/apply-schema";
import { BASE_URL } from "./fixtures/env";
import { PENDING_COOKIE, pendingToken, trustedDeviceToken, TRUSTED_DEVICE_COOKIE } from "./fixtures/two-factor";

const PROTECTED = ["/dashboard", "/dashboard/media", "/dashboard/team", "/dashboard/brand", "/dashboard/settings", "/dashboard/pricing", "/dashboard/assistant", "/inhalte-erstellen", "/videos-erstellen", "/admin", "/onboarding"];

test.describe("Auth", () => {
  test("Login mit gültigen Daten führt ins Dashboard", async ({ page, context, accounts }) => {
    await addTrustedDevice(context, accounts.userB.id!);
    await loginViaUi(page, accounts.userB.email, accounts.userB.password);
    await expect(page).toHaveURL(/\/dashboard(\?|$)/);
    await expect(page.getByRole("button", { name: /Tokens übrig/ }).first()).toBeVisible();
  });

  test("Falsches Passwort zeigt deutsche Fehlermeldung, kein Login", async ({ page, accounts }) => {
    await loginViaUi(page, accounts.userB.email, "falsches-Passwort-123");
    await expect(page).toHaveURL(/\/anmelden/);
    await expect(page.getByText("E-Mail oder Passwort ist falsch", { exact: false })).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name.includes("auth-token"))).toBeFalsy();
  });

  test("Login ohne bekanntes Gerät verlangt 2FA (Mailversand im Test aus → verständliche Meldung)", async ({ page, accounts }) => {
    await loginViaUi(page, accounts.userB.email, accounts.userB.password);
    await expect(page).toHaveURL(/\/dashboard\/2fa-email/);
    await expect(page.getByRole("alert").filter({ hasText: "Code konnte nicht gesendet werden" })).toBeVisible();
    // Ohne 2FA kein Dashboard
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard\/2fa-email/);
  });

  test("2FA-Code-Eingabe mit gültigem Code führt ins Dashboard", async ({ page, context, accounts }) => {
    await loginViaUi(page, accounts.userB.email, accounts.userB.password);
    await expect(page).toHaveURL(/\/dashboard\/2fa-email/);
    // Pending-Token mit bekanntem Code setzen (entspricht dem Zustand nach erfolgreichem Mailversand).
    await context.addCookies([{ name: PENDING_COOKIE, value: pendingToken(accounts.userB.id!, accounts.userB.email, "424242"), url: BASE_URL, httpOnly: true }]);
    await page.goto("/dashboard/2fa-email");
    await page.locator("input[data-input-otp], input[autocomplete='one-time-code']").first().focus().catch(() => {});
    await page.keyboard.type("424242");
    await page.getByRole("button", { name: "Bestätigen" }).click();
    await expect(page).toHaveURL(/\/dashboard(\?|$|\/)(?!2fa)/, { timeout: 30_000 });
  });

  // resetUser statt userB: signOut() widerruft alle Sessions des Kontos (auch gespeicherte storageStates).
  test("Logout beendet die Session", async ({ page, context, accounts }) => {
    await addTrustedDevice(context, accounts.resetUser.id!);
    await loginViaUi(page, accounts.resetUser.email, accounts.resetUser.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/anmelden/, { timeout: 30_000 });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/anmelden/);
  });

  test("Abgelaufene/ungültige Session → Redirect zum Login, API 401", async ({ as }) => {
    const { context, page } = await as("userB");
    const cookies = await context.cookies();
    const auth = cookies.filter((c) => c.name.includes("auth-token"));
    expect(auth.length).toBeGreaterThan(0);
    // Session-Cookie durch abgelaufenes JWT ersetzen
    const expiredJwt = ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ sub: "x", exp: 1 })).toString("base64url"), "sig"].join(".");
    const value = "base64-" + Buffer.from(JSON.stringify({ access_token: expiredJwt, refresh_token: "invalid", expires_at: 1, token_type: "bearer", user: { id: "x" } })).toString("base64url");
    await context.clearCookies();
    await context.addCookies([{ name: auth[0].name.replace(/\.\d+$/, ""), value, url: BASE_URL }]);
    await page.goto("/dashboard/media");
    await expect(page).toHaveURL(/\/anmelden/);
    const res = await page.request.get("/api/dashboard/summary");
    expect(res.status()).toBe(401);
  });

  for (const path of PROTECTED) {
    test(`Geschützte Route ohne Login → Login: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/anmelden/);
    });
  }

  test("Registrierung ohne Einladung ist gesperrt (AUTH_INVITE_ONLY)", async ({ page }) => {
    await page.goto("/registrieren");
    await expect(page.getByRole("status").filter({ hasText: "Registrierung ist derzeit geschlossen" })).toBeVisible();
  });

  for (const entry of ["invite-page", "anmelden-register"] as const)
  test(`Registrierung mit Einladung legt Konto an (${entry === "invite-page" ? "Link /invite/<token> aus Admin-Einladung" : "/anmelden?mode=register&invite=<token>"})`, async ({ page }, testInfo) => {
    const email = `e2e-signup-${testInfo.project.name}-${randomBytes(3).toString("hex")}@example.com`;
    const token = randomBytes(24).toString("base64url");
    await sql("insert into public.invites(email,token_hash,expires_at) values ($1,$2,now()+interval '1 day')", [email, createHash("sha256").update(token).digest("hex")]);
    const admin = adminClient();
    try {
      await page.goto(entry === "invite-page" ? `/invite/${token}` : `/anmelden?mode=register&invite=${token}`);
      await page.locator('input[name="email"]').fill(email);
      const pw = `E2e!${randomBytes(10).toString("base64url")}`;
      await page.locator('input[name="password"]').first().fill(pw);
      const confirm = page.locator('input[name="passwordConfirm"]');
      if (await confirm.count()) await confirm.first().fill(pw);
      const terms = page.locator('input[type="checkbox"]');
      if (await terms.count()) await terms.first().check({ force: true });
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL((u) => !u.pathname.startsWith("/invite") && !u.pathname.startsWith("/auth/signup"), { timeout: 60_000 });
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      expect(data.users.some((u) => u.email === email), "Konto wurde angelegt").toBeTruthy();
      // Neues Konto muss 2FA oder Onboarding durchlaufen, nicht direkt ins Dashboard
      await expect(page).toHaveURL(/\/(dashboard\/2fa-email|onboarding|anmelden)/);
    } finally {
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = data.users.find((x) => x.email === email);
      if (u) await admin.auth.admin.deleteUser(u.id);
    }
  });

  test("Passwort vergessen: Anfrage zeigt deutsche Rückmeldung", async ({ page, accounts }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Nur ein Lauf je Suite: Supabase-Standardmailer des Testprojekts ist stark limitiert (Mail an example.com).");
    await page.goto("/passwort-vergessen");
    await page.getByRole("textbox", { name: "E-Mail" }).fill(accounts.resetUser.email);
    await page.getByRole("button", { name: "Link senden" }).click();
    await expect(page).toHaveURL(/passwort-vergessen\?(notice=sent|error=)/, { timeout: 30_000 });
    // Egal ob versendet oder Mailer-Fehler: es muss eine deutsche Meldung sichtbar sein, kein Rohfehler.
    await expect(page.locator("[role=alert], [role=status], p").filter({ hasText: /(E-Mail|Link|gesendet|versuch|Postfach)/ }).first()).toBeVisible();
  });

  test("Passwort zurücksetzen über Recovery-Link, danach Login mit neuem Passwort", async ({ page, context, accounts }) => {
    const admin = adminClient();
    const acc = accounts.resetUser;
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: acc.email });
    expect(error).toBeNull();
    const hashed = data.properties?.hashed_token;
    expect(hashed).toBeTruthy();
    await page.goto(`/auth/callback?token_hash=${hashed}&type=recovery&next=/passwort-zuruecksetzen`);
    await expect(page).toHaveURL(/passwort-zuruecksetzen/, { timeout: 30_000 });
    const newPw = `E2e!${randomBytes(10).toString("base64url")}`;
    const pwInputs = page.locator('input[type="password"]');
    await expect(pwInputs.first()).toBeVisible({ timeout: 30_000 });
    await pwInputs.nth(0).fill(newPw);
    if ((await pwInputs.count()) > 1) await pwInputs.nth(1).fill(newPw);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/passwort-zuruecksetzen") || u.search.includes("notice"), { timeout: 30_000 });
    // Neues Passwort funktioniert (Passwort-Epoche wechselt → neues Trusted-Device-Token nötig)
    const fresh = await admin.auth.admin.getUserById(acc.id!);
    const epoch = Number(fresh.data.user?.app_metadata?.password_epoch ?? fresh.data.user?.user_metadata?.password_epoch ?? 0);
    await context.clearCookies();
    await context.addCookies([{ name: TRUSTED_DEVICE_COOKIE, value: trustedDeviceToken(acc.id!, epoch), url: BASE_URL, httpOnly: true }]);
    await loginViaUi(page, acc.email, newPw);
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
    // Ausgangszustand wiederherstellen
    await admin.auth.admin.updateUserById(acc.id!, { password: acc.password });
  });
});
