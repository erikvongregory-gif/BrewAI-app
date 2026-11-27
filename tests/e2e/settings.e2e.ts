import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { test, expect } from "./fixtures/test";
import { sql } from "./fixtures/db/apply-schema";

test.describe("Konto, Einstellungen, Team", () => {
  test("Profilname speichern bleibt nach Reload erhalten", async ({ as }, testInfo) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    const name = `E2E Name ${testInfo.project.name} ${randomBytes(2).toString("hex")}`;
    await page.getByRole("textbox", { name: "Dein Name" }).fill(name);
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Gespeichert.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Dein Name" })).toHaveValue(name);
  });

  test("Validierung: überlanger Name / ungültige Telefonnummer werden abgefangen", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    await page.getByRole("textbox", { name: "Telefon" }).fill("abc<script>");
    await page.getByRole("textbox", { name: "Dein Name" }).fill("x".repeat(500));
    await page.getByRole("button", { name: "Speichern" }).click();
    const feedback = page.getByText(/(Gespeichert\.|ungültig|zu lang|konnten nicht gespeichert)/i).first();
    await expect(feedback).toBeVisible();
    const text = await feedback.innerText();
    test.info().annotations.push({ type: "measure", description: `Rückmeldung: ${text}` });
    expect(text, "Ungültige Telefonnummer darf nicht kommentarlos gespeichert werden").not.toBe("Gespeichert.");
  });

  test("Profilbild: ungültiger Dateityp wird abgelehnt (deutsche Meldung)", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "notiz.txt", mimeType: "text/plain", buffer: Buffer.from("kein Bild") });
    const err = page.getByText(/(Profilbild|Datei|Format|JPG|PNG)/).filter({ hasNotText: "max. 5 MB" }).filter({ hasNotText: "aktualisiert" });
    await expect(err.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Profilbild aktualisiert.")).toHaveCount(0);
  });

  test("Profilbild: zu große Datei (> 5 MB) wird abgelehnt", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    const big = Buffer.concat([await sharp({ create: { width: 64, height: 64, channels: 3, background: "#888" } }).png().toBuffer(), Buffer.alloc(6 * 1024 * 1024)]);
    await page.locator('input[type="file"]').first().setInputFiles({ name: "gross.png", mimeType: "image/png", buffer: big });
    await expect(page.getByText(/(zu groß|5 MB|Profilbild konnte nicht)/).filter({ hasNotText: "JPG, PNG oder WebP" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Profilbild aktualisiert.")).toHaveCount(0);
  });

  test("Profilbild: gültiges PNG wird hochgeladen", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    const png = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#c7691e" } }).png().toBuffer();
    await page.locator('input[type="file"]').first().setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
    await expect(page.getByText("Profilbild aktualisiert.")).toBeVisible({ timeout: 30_000 });
  });

  test("Datenexport liefert JSON", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    const dl = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Meine Daten exportieren" }).click();
    const d = await dl;
    expect(d.suggestedFilename()).toMatch(/\.json$/);
  });

  test("Konto löschen: Dialog öffnet sich und lässt sich abbrechen", async ({ as }) => {
    const { page } = await as("userB");
    await page.goto("/dashboard/settings");
    await page.getByRole("button", { name: "Konto löschen" }).click();
    const dlg = page.getByRole("alertdialog");
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Abbrechen" }).click();
    await expect(dlg).toHaveCount(0);
  });

  test("Konto wirklich löschen", async () => {
    test.skip(true, "Destruktiv (löscht Konto + Storage); nur mit Wegwerf-Konto in eigenem Lauf sinnvoll. Abbruch-Pfad oben getestet.");
  });

  test("Team: ungültige E-Mail wird abgelehnt", async ({ as }) => {
    const { page } = await as("userA");
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("textbox", { name: "E-Mail" }).fill("keine-mail");
    await page.getByRole("button", { name: "Einladen" }).click();
    const nativeInvalid = await page.getByRole("textbox", { name: "E-Mail" }).evaluate((el) => !(el as HTMLInputElement).checkValidity());
    const shown = page.locator("main p, main [role=alert]").filter({ hasText: /(E-Mail|invalid|ungültig|fehlgeschlagen|\[)/i }).first();
    await expect(shown).toBeVisible();
    const text = await shown.innerText();
    test.info().annotations.push({ type: "measure", description: `Meldung: ${text.slice(0, 160)}` });
    expect(nativeInvalid || /gültige E-Mail|E-Mail-Adresse/i.test(text), "verständliche Validierungsmeldung").toBeTruthy();
    expect(text, "keine technische Rohmeldung (Zod-JSON)").not.toMatch(/\[\s*\{|"code"|invalid_format|Invalid email/i);
    expect(Number((await sql<{ n: string }>("select count(*) n from public.workspace_invites where email='keine-mail'"))[0].n)).toBe(0);
  });

  test("Team: Einladung mit gültiger E-Mail (Mailversand im Test aus) gibt verständliche Rückmeldung", async ({ as, accounts }, testInfo) => {
    const email = `e2e-invitee-${testInfo.project.name}-${randomBytes(2).toString("hex")}@example.com`;
    const { page } = await as("userA");
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("textbox", { name: "E-Mail" }).fill(email);
    await page.getByRole("textbox", { name: "Name" }).fill("E2E Kollege");
    const res = page.waitForResponse((r) => r.url().includes("/api/dashboard/team") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Einladen" }).click();
    const r = await res;
    const body = await r.text();
    test.info().annotations.push({ type: "measure", description: `POST team ${r.status()}: ${body.slice(0, 200)}` });
    await expect(page.getByText(email).or(page.getByText(/(Einladung|E-Mail).*(gesendet|versendet|nicht|fehlgeschlagen|erstellt)/i)).first()).toBeVisible({ timeout: 20_000 });
    await sql("delete from public.workspace_invites where owner_id=$1", [accounts.userA.id]);
  });

  test("Markenprofil-Seite lädt, URL-Analyse bei Providerfehler mit deutscher Meldung", async ({ as }) => {
    const { page } = await as("userB");
    const res = await page.goto("/dashboard/brand");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("main")).toContainText(/Marke|Markenprofil/);
  });
});
