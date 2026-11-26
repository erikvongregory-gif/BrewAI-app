import { test, expect, aiCalls, setAiMockMode } from "./fixtures/test";
import { ORIGIN_HEADERS, createTaskPayload, jobCount, mediaRows, remainingTokens, waitForJobsSettled } from "./fixtures/app";
import { sql } from "./fixtures/db/apply-schema";

// Generierung: es gibt in der UI genau einen Modus-Endpunkt (/api/inhalte-erstellen/create-task) mit drei Fotostilen.
// Die vier Alt-Modi (Ultra Realistic, Studio, Kampagne + Text, Freistellen; api/generate-*) haben keine UI → nicht getestet (C-2).
// KI-Aufrufe laufen serverseitig gegen den Mock in tests/e2e/fixtures/server-preload.mjs (keine Kosten).

const STYLES = [
  { radio: "Reportage", key: "reportage" as const },
  { radio: "Premium-Fotografie", key: "premium" as const },
  { radio: "Kampagnenmotiv", key: "campaign" as const },
];

test.describe("Generierung (Erstellen-Seite)", () => {
  test.afterEach(async ({ accounts }) => {
    setAiMockMode("500");
    await waitForJobsSettled(accounts.admin.id!, 30_000);
  });

  for (const style of STYLES) {
    test(`Happy Path (gemockt) – Fotostil ${style.radio}: Ergebnis, Mediathek-Eintrag, Tokens abgebucht`, async ({ as, accounts }) => {
      setAiMockMode("ok");
      const userId = accounts.admin.id!;
      const before = await remainingTokens(userId);
      const mediaBefore = (await mediaRows(userId)).length;
      const { page } = await as("admin");
      await page.goto("/inhalte-erstellen");
      await page.getByRole("radio", { name: style.radio }).click();
      await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill(`Drei Freunde stoßen im Biergarten an (${style.key})`);
      const post = page.waitForResponse((r) => r.url().includes("/api/inhalte-erstellen/create-task") && r.request().method() === "POST");
      await page.getByRole("button", { name: /Generieren/ }).click();
      const res = await post;
      expect(res.status(), await res.text().catch(() => "")).toBeLessThan(300);
      const body = res.request().postDataJSON() as { photoStyle: string };
      expect(body.photoStyle).toBe(style.key);
      await waitForJobsSettled(userId, 90_000);
      const job = (await sql<{ status: string; charged: number | null }>("select status,charged from public.generation_jobs where user_id=$1 order by created_at desc limit 1", [userId]))[0];
      expect(job.status).toBe("completed");
      await expect(page.locator("main img").first()).toBeVisible({ timeout: 30_000 });
      expect((await mediaRows(userId)).length).toBe(mediaBefore + 1);
      expect(await remainingTokens(userId)).toBeLessThan(before);
      expect(aiCalls().some((c) => c.host === "api.openai.com" && c.mode === "ok")).toBeTruthy();
    });
  }

  test("Leere Eingabe: Generieren ist deaktiviert", async ({ as }) => {
    const { page } = await as("admin");
    await page.goto("/inhalte-erstellen");
    await expect(page.getByRole("button", { name: /Generieren/ })).toBeDisabled();
    await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill("   ");
    await expect(page.getByRole("button", { name: /Generieren/ })).toBeDisabled();
  });

  test("Zu langer Prompt (5000 Zeichen): Nutzer wird über Grenze informiert, Anfrage bleibt gültig", async ({ as }) => {
    setAiMockMode("500");
    const { page } = await as("admin");
    await page.goto("/inhalte-erstellen");
    const box = page.getByRole("textbox", { name: "Beschreibe dein Bild…" });
    await box.fill("Biergarten ".repeat(455));
    const len = (await box.inputValue()).length;
    const hasLimitHint = await page.getByText(/(\d+\s*\/\s*\d+|Zeichen|zu lang|maximal)/i).count();
    const post = page.waitForResponse((r) => r.url().includes("/api/inhalte-erstellen/create-task"));
    await page.getByRole("button", { name: /Generieren/ }).click();
    const res = await post;
    const sent = (res.request().postDataJSON() as { zusatzWunsch: string }).zusatzWunsch;
    test.info().annotations.push({ type: "measure", description: `Textfeld-Länge ${len}, gesendet ${sent.length}, Hinweis sichtbar: ${hasLimitHint > 0}` });
    expect(res.status(), "keine 400 bei langem Prompt").not.toBe(400);
    expect(sent.length).toBeLessThanOrEqual(800);
    expect(len > 800 ? hasLimitHint : 1, "Hinweis auf Zeichengrenze bei stiller Kürzung auf 800 Zeichen").toBeGreaterThan(0);
  });

  test("Doppelklick auf Generieren erzeugt genau 1 Job", async ({ as, accounts }) => {
    setAiMockMode("500");
    const userId = accounts.admin.id!;
    const jobsBefore = await jobCount(userId);
    const { page } = await as("admin");
    await page.goto("/inhalte-erstellen");
    await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill("Doppelklick-Test Biergarten");
    let posts = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/inhalte-erstellen/create-task") && r.method() === "POST") posts++;
    });
    await page.getByRole("button", { name: /Generieren/ }).dblclick();
    await page.waitForTimeout(4000);
    await waitForJobsSettled(userId, 30_000);
    test.info().annotations.push({ type: "measure", description: `POSTs: ${posts}, neue Jobs: ${(await jobCount(userId)) - jobsBefore}` });
    expect(await jobCount(userId)).toBe(jobsBefore + 1);
  });

  test("Abbruch einer laufenden Generierung", async () => {
    test.skip(true, "Keine Abbrechen-Funktion in der UI (ruixen-moon-chat.tsx kennt nur Polling-Abbruch beim Verlassen, keinen Nutzer-Abbruch).");
  });

  test("Ungültiger Dateityp / zu große Datei im Erstellen-Dialog", async () => {
    test.skip(true, "Erstellen-Dialog hat keinen Datei-Upload (Sorte/Charakter kommen aus dem Markenprofil). Upload-Validierung wird in settings.e2e.ts (Profilbild) geprüft.");
  });

  for (const mode of ["500", "timeout"] as const) {
    test(`Provider-Fehler (${mode}) → deutsche Fehlermeldung, keine Tokens abgezogen`, async ({ as, accounts }) => {
      setAiMockMode(mode);
      const userId = accounts.admin.id!;
      const before = await remainingTokens(userId);
      const { page } = await as("admin");
      await page.goto("/inhalte-erstellen");
      await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill(`Fehlerfall ${mode} Biergarten`);
      await page.getByRole("button", { name: /Generieren/ }).click();
      const msg = page.getByText(/(fehlgeschlagen|gescheitert|nicht erreichbar|zu lange|versuch es|Bitte)/i).first();
      await expect(msg).toBeVisible({ timeout: 90_000 });
      const text = (await msg.innerText()).trim();
      test.info().annotations.push({ type: "measure", description: `Meldung: ${text.slice(0, 200)}` });
      expect(text).not.toMatch(/E2E-Mock|server_error|status code|undefined|Error:/);
      await waitForJobsSettled(userId, 60_000);
      const job = (await sql<{ status: string; charged: number | null }>("select status,charged from public.generation_jobs where user_id=$1 order by created_at desc limit 1", [userId]))[0];
      test.info().annotations.push({ type: "measure", description: `Job ${job.status}, charged ${job.charged}` });
      expect(await remainingTokens(userId), "Tokens nach Fehler").toBe(before);
    });
  }

  test("Unerwartete Provider-Antwort (zu kleines Bild) → verständliche Meldung statt technischer Rohfehler", async ({ as, accounts }) => {
    setAiMockMode("tiny");
    const userId = accounts.admin.id!;
    const before = await remainingTokens(userId);
    const { page } = await as("admin");
    await page.goto("/inhalte-erstellen");
    await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill("Unerwartete Antwort Biergarten");
    const post = page.waitForResponse((r) => r.url().includes("/api/inhalte-erstellen/create-task"));
    await page.getByRole("button", { name: /Generieren/ }).click();
    await post;
    const q = "select status s, result r from public.generation_jobs where user_id=$1 and result->'snapshot'->'payload'->>'zusatzWunsch' like 'Unerwartete Antwort%' order by created_at desc limit 1";
    await expect.poll(async () => (await sql<{ s: string }>(q, [userId]))[0]?.s, { timeout: 60_000 }).toBe("failed");
    const job = (await sql<{ r: { error?: string } }>(q, [userId]))[0];
    test.info().annotations.push({ type: "measure", description: `Job-Fehler: ${job.r?.error ?? "-"}` });
    await expect(page.getByText(/(fehlgeschlagen|gescheitert|versuch|extract_area|Error)/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/extract_area|bad extract area/)).toHaveCount(0);
    expect(await remainingTokens(userId)).toBe(before);
  });

  test("0 Credits: Generierung wird mit verständlicher Meldung abgelehnt, kein Job", async ({ as, accounts }) => {
    const { page } = await as("zeroCredits");
    const jobsBefore = await jobCount(accounts.zeroCredits.id!);
    await page.goto("/inhalte-erstellen");
    if (!page.url().includes("inhalte-erstellen")) {
      // Weiterleitung zur Preisseite ist ebenfalls eine zulässige Reaktion
      await expect(page).toHaveURL(/pricing/);
      return;
    }
    await page.getByRole("textbox", { name: "Beschreibe dein Bild…" }).fill("Kein Guthaben Test");
    const btn = page.getByRole("button", { name: /Generieren/ });
    if (await btn.isEnabled()) {
      await btn.click();
      await expect(page.getByText(/(Tokens|Guthaben|aufladen|Abo)/i).filter({ hasNotText: "Tokens übrig" }).first()).toBeVisible({ timeout: 30_000 });
    }
    expect(await jobCount(accounts.zeroCredits.id!)).toBe(jobsBefore);
  });

  test("Ohne Abo: Erstellen-Seite leitet zur Preisseite", async ({ as }) => {
    const { page } = await as("noSub");
    await page.goto("/inhalte-erstellen");
    await expect(page).toHaveURL(/pricing|abonnement|preise/);
  });

  test("Parallele Generierungen (3 gleichzeitig) → 3 Mediathek-Einträge, keine Duplikate", async ({ as, accounts }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "API-Test, viewport-unabhängig: einmal je Lauf.");
    setAiMockMode("ok");
    const userId = accounts.admin.id!;
    const before = await mediaRows(userId);
    const { page } = await as("admin");
    await page.goto("/dashboard/media");
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        page.request.post("/api/inhalte-erstellen/create-task", {
          headers: { ...ORIGIN_HEADERS, "idempotency-key": `e2e-par-${Date.now()}-${i}` },
          data: createTaskPayload(`Parallel ${i} ${Date.now()}`),
        }),
      ),
    );
    for (const r of results) expect(r.status(), await r.text()).toBeLessThan(300);
    await waitForJobsSettled(userId, 120_000);
    const after = await mediaRows(userId);
    const ids = after.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(after.length).toBe(before.length + 3);
    await page.reload();
    const tiles = page.getByRole("button", { name: /in Großansicht öffnen/ });
    await expect(tiles).toHaveCount(after.length);
  });

  test("Videos erstellen (Flag): Seite zeigt Hinweis statt Fehler", async ({ as }) => {
    const { page } = await as("admin");
    const res = await page.goto("/videos-erstellen");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading").first()).toBeVisible();
  });
});
