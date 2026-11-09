import { describe, expect, it } from "vitest";
import {
  clampBrandSettingsFields,
  confirmEditedBrandFields,
  mergeDashboardSettings,
  sanitizeDashboardSettings,
} from "@/lib/dashboard/settingsPayload";

describe("settingsPayload", () => {
  it("strips client-only fields and applies defaults", () => {
    const out = sanitizeDashboardSettings({
      brandReferenceImagesStale: true,
      brandProfileMode: "guided",
      breweryName: "Lang Bräu",
      brandTone: "Warm",
      brandColors: "#fff",
      brandDos: "Licht",
      brandDonts: "Neon",
    });
    expect(out).not.toHaveProperty("brandReferenceImagesStale");
    expect(out.brandProfileMode).toBe("guided");
    expect(out.emailNotifications).toBe(true);
    expect(out.brandLockLevel).toBe("strict");
  });

  it("clamps long brand fields from AI output", () => {
    const out = clampBrandSettingsFields({
      brandDos: "x".repeat(900),
      brandTone: "y".repeat(400),
    });
    expect(out.brandDos).toHaveLength(600);
    expect(out.brandTone).toHaveLength(300);
  });

  it("merges brand scan patch onto base settings", () => {
    const base = sanitizeDashboardSettings({
      profileName: "Erik",
      brandProfileMode: "undecided",
    });
    const merged = mergeDashboardSettings(base, {
      brandProfileMode: "guided",
      breweryName: "Test Brauerei",
      brandTone: "Craft",
      brandColors: "#111111",
      brandDos: "Do",
      brandDonts: "Dont",
      brandWebsiteUrl: "https://example.com",
    });
    expect(merged.brandProfileMode).toBe("guided");
    expect(merged.profileName).toBe("Erik");
    expect(merged.breweryName).toBe("Test Brauerei");
  });
});

describe("Belegstatus im Markenprofil (brandFieldStatus)", () => {
  const scanned = sanitizeDashboardSettings({
    brandProfileMode: "guided",
    breweryName: "Lang Bräu",
    brandTone: "bodenständig",
    brandColors: "#123456",
    brandFieldStatus: { breweryName: "belegt", brandTone: "geschaetzt", brandColors: "geschaetzt", unbekannt: "x" },
  });

  it("übernimmt gültige Statuswerte und verwirft unbekannte Felder", () => {
    expect(scanned.brandFieldStatus).toEqual({ breweryName: "belegt", brandTone: "geschaetzt", brandColors: "geschaetzt" });
  });

  it("lässt Altbestand ohne Belegstatus unverändert", () => {
    const legacy = sanitizeDashboardSettings({ breweryName: "Alt Bräu", brandTone: "warm" });
    expect(legacy).not.toHaveProperty("brandFieldStatus");
    const merged = mergeDashboardSettings(legacy, { brandTone: "frech" });
    expect(merged).not.toHaveProperty("brandFieldStatus");
    expect(confirmEditedBrandFields(legacy, { brandTone: "frech" })).toBeUndefined();
  });

  it("markiert vom Nutzer geänderte Markentexte als bestätigt, geleerte als fehlend", () => {
    const merged = mergeDashboardSettings(scanned, { brandTone: "frech und regional", brandColors: "" });
    expect(merged.brandFieldStatus).toEqual({ breweryName: "belegt", brandTone: "bestaetigt", brandColors: "fehlt" });
  });

  it("ändert nichts, wenn der Text gleich bleibt (auch mit Leerzeichen)", () => {
    const merged = mergeDashboardSettings(scanned, { brandTone: "  bodenständig " });
    expect(merged.brandFieldStatus?.brandTone).toBe("geschaetzt");
  });

  it("ein explizit mitgegebener Status (Scanner-Aktivierung) gewinnt", () => {
    const merged = mergeDashboardSettings(scanned, {
      brandTone: "neu gescannt",
      brandFieldStatus: { brandTone: "geschaetzt" },
    });
    expect(merged.brandFieldStatus).toEqual({ brandTone: "geschaetzt" });
  });

  it("generisches Profil (brandFieldStatus: undefined) entfernt alte Belege", () => {
    const merged = mergeDashboardSettings(scanned, { brandProfileMode: "skip", brandFieldStatus: undefined });
    expect(merged).not.toHaveProperty("brandFieldStatus");
  });
});
