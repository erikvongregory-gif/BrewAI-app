import { test, expect } from "./fixtures/test";
import { mediaRows } from "./fixtures/app";
import { seedMedia } from "./fixtures/seed";

test.describe("Mediathek", () => {
  test("Reihenfolge: neueste zuerst", async ({ as }) => {
    const { page } = await as("userA");
    await page.goto("/dashboard/media");
    const tiles = page.getByRole("button", { name: /in Großansicht öffnen/ });
    await expect(tiles.first()).toBeVisible();
    const names = await tiles.evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute("aria-label") ?? ""));
    expect(names).toEqual([0, 1, 2, 3, 4].map((i) => `E2E Motiv ${i} in Großansicht öffnen`));
  });

  test("Pagination: 48 zuerst, „Weitere Motive laden“ lädt den Rest ohne Duplikate", async ({ as }) => {
    const { page } = await as("userA");
    await page.goto("/dashboard/media");
    const tiles = page.getByRole("button", { name: /in Großansicht öffnen/ });
    await expect(tiles).toHaveCount(48);
    await page.getByRole("button", { name: "Weitere Motive laden" }).click();
    await expect(tiles).toHaveCount(60);
    const names = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(60);
    await expect(page.getByRole("button", { name: "Weitere Motive laden" })).toHaveCount(0);
  });

  test("Leerer Zustand", async ({ as }) => {
    const { page } = await as("zeroCredits");
    await page.goto("/dashboard/media");
    await expect(page.getByText("Noch keine Motive in der Mediathek")).toBeVisible();
    await expect(page.getByRole("link", { name: "Erstes Motiv erstellen" })).toBeVisible();
  });

  test("Download eines Motivs liefert ein Bild", async ({ as }) => {
    const { page } = await as("userA");
    await page.goto("/dashboard/media");
    await page.getByRole("button", { name: "E2E Motiv 0 in Großansicht öffnen" }).click();
    const dl = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: "Herunterladen" }).click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const buf = readFileSync(path!);
    expect(buf.subarray(1, 4).toString()).toBe("PNG");
  });

  test("Löschen eines Motivs entfernt es aus Liste und DB", async ({ as, accounts }) => {
    const userId = accounts.userB.id!;
    await seedMedia(userId, 2, { prefix: "b", hue: 30 });
    const { page } = await as("userB");
    await page.goto("/dashboard/media");
    await page.getByRole("button", { name: "E2E Motiv 1 in Großansicht öffnen" }).click();
    await page.getByRole("button", { name: "Löschen" }).first().click();
    // Bestätigungsdialog (falls vorhanden)
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: /^Löschen$|Endgültig/ });
    if (await confirm.count()) await confirm.last().click();
    await expect(page.getByRole("button", { name: "E2E Motiv 1 in Großansicht öffnen" })).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByRole("button", { name: "E2E Motiv 0 in Großansicht öffnen" })).toBeVisible();
    expect((await mediaRows(userId)).map((m) => m.id)).toEqual(["b-000"]);
    await page.reload();
    await expect(page.getByRole("button", { name: /in Großansicht öffnen/ })).toHaveCount(1);
    await seedMedia(userId, 2, { prefix: "b", hue: 30 });
  });

  test("C-5: Nach Löschen und „Weitere Motive laden“ fehlt kein Motiv", async ({ as, accounts }) => {
    // Eigene 60 Einträge für userB, damit userA unverändert bleibt
    const userId = accounts.userB.id!;
    await seedMedia(userId, 60, { prefix: "c", hue: 90 });
    try {
      const { page } = await as("userB");
      await page.goto("/dashboard/media");
      const tiles = page.getByRole("button", { name: /in Großansicht öffnen/ });
      await expect(tiles).toHaveCount(48);
      await page.getByRole("button", { name: "E2E Motiv 0 in Großansicht öffnen" }).click();
      await page.getByRole("button", { name: "Löschen" }).first().click();
      const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).getByRole("button", { name: /^Löschen$|Endgültig/ });
      if (await confirm.count()) await confirm.last().click();
      await expect(page.getByRole("button", { name: "E2E Motiv 0 in Großansicht öffnen" })).toHaveCount(0, { timeout: 20_000 });
      await page.keyboard.press("Escape").catch(() => {});
      await page.getByRole("button", { name: "Weitere Motive laden" }).click();
      await expect(tiles).toHaveCount(59, { timeout: 20_000 });
      const names = await tiles.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
      expect(names, "Motiv 48 darf beim Nachladen nicht übersprungen werden").toContain("E2E Motiv 48 in Großansicht öffnen");
    } finally {
      await seedMedia(userId, 2, { prefix: "b", hue: 30 });
    }
  });
});
