import { describe, expect, it } from "vitest";
import {
  buildBrandProfilePromptContext,
  buildGenericBrandProfilePatch,
  getBrandProfileFromMetadata,
  parseBrandFieldStatus,
  isBrandProfileComplete,
  isBrandProfileCompleteFromSettings,
  type BrandProfile,
} from "@/lib/dashboard/brandProfile";
import { mergeDashboardSettings, sanitizeDashboardSettings } from "@/lib/dashboard/settingsPayload";

function makeProfile(overrides: Partial<BrandProfile> = {}): BrandProfile {
  return {
    brandProfileMode: "guided",
    brandInstagramUrl: "https://instagram.com/brauerei",
    brandWebsiteUrl: "https://brauerei-falter.de",
    brandProfileSource: "url",
    brandLockLevel: "strict",
    breweryName: "Brauerei Falter",
    brandTone: "Traditionell, bodenständig",
    brandColors: "#1A3C2E, #E8B84B",
    brandDos: "Warmes Licht, Biergarten-Szenen",
    brandDonts: "Keine sterilen Studio-Hintergründe",
    brandReferenceImageUrls: ["https://cdn.example.com/szene.jpg"],
    brandLabelReferenceUrl: "https://cdn.example.com/flasche.png",
    brandHeadlineFontName: "Falter Display",
    brandFontFileUrl: "https://cdn.example.com/font.woff2",
    brandFontWeight: "700",
    ...overrides,
  };
}

describe("buildGenericBrandProfilePatch", () => {
  it("clears brand fields and switches to skip mode", () => {
    const base = sanitizeDashboardSettings({
      profileName: "Erik",
      breweryName: "Paulaner",
      brandProfileMode: "guided",
      brandWebsiteUrl: "https://paulaner.de",
      brandTone: "Traditionell",
      brandColors: "#E8772E",
      brandDos: "Warmes Licht",
      brandDonts: "Keine Sportbanner",
      brandReferenceImageUrls: ["https://example.com/ref.jpg"],
      brandAnalyzedAt: "2026-06-06T12:00:00.000Z",
    });

    const merged = mergeDashboardSettings(base, buildGenericBrandProfilePatch());

    expect(merged.brandProfileMode).toBe("skip");
    expect(merged.brandProfileSource).toBe("skip");
    expect(merged.brandWebsiteUrl).toBe("");
    expect(merged.brandTone).toBe("");
    expect(merged.brandReferenceImageUrls).toEqual([]);
    expect(merged.profileName).toBe("Erik");
    expect(merged.breweryName).toBe("Paulaner");
    expect(merged.brandLabelReferenceUrl).toBe("");
    expect(merged).not.toHaveProperty("brandAnalyzedAt");
  });
});

describe("buildBrandProfilePromptContext", () => {
  it("returns empty string for skip and undecided modes", () => {
    expect(buildBrandProfilePromptContext(makeProfile({ brandProfileMode: "skip" }))).toBe("");
    expect(buildBrandProfilePromptContext(makeProfile({ brandProfileMode: "undecided" }))).toBe("");
  });

  it("returns empty string for guided profile without any content", () => {
    const empty = makeProfile({
      breweryName: "",
      brandTone: "",
      brandColors: "",
      brandDos: "",
      brandDonts: "",
    });
    expect(buildBrandProfilePromptContext(empty)).toBe("");
  });

  it("includes only filled fields and never raw URLs", () => {
    const context = buildBrandProfilePromptContext(
      makeProfile({ brandTone: "", brandDonts: "" }),
    );
    expect(context).toContain("Brand/Brewery: Brauerei Falter");
    expect(context).toContain("Brand color palette: #1A3C2E, #E8B84B");
    expect(context).not.toContain("Brand tone");
    expect(context).not.toContain("never:");
    expect(context).not.toContain("http");
    expect(context).not.toContain("Reference image");
  });

  it("strict lock resolves conflicts in favor of the brand profile", () => {
    const context = buildBrandProfilePromptContext(makeProfile({ brandLockLevel: "strict" }));
    expect(context).toContain("STRICT lock");
    expect(context).toContain("the brand profile wins");
  });

  it("balanced lock keeps tone and colors but allows the brief to lead", () => {
    const context = buildBrandProfilePromptContext(makeProfile({ brandLockLevel: "balanced" }));
    expect(context).toContain("BALANCED lock");
    expect(context).toContain("keep brand tone and colors intact");
    expect(context).not.toContain("mandatory");
  });

  it("loose lock keeps only the never-rules binding", () => {
    const context = buildBrandProfilePromptContext(makeProfile({ brandLockLevel: "loose" }));
    expect(context).toContain("LOOSE lock");
    expect(context).toContain('Only the "never" rules above are binding');
  });
});

describe("isBrandProfileComplete alignment", () => {
  it("Website allein reicht nicht — weder Server noch Settings-Adapter", () => {
    const profile = makeProfile({ breweryName: "" });
    expect(isBrandProfileComplete(profile)).toBe(false);
    expect(
      isBrandProfileCompleteFromSettings({
        brandProfileMode: "guided",
        breweryName: "",
        brandWebsiteUrl: "https://brauerei.de",
        brandTone: profile.brandTone,
        brandColors: profile.brandColors,
        brandDos: profile.brandDos,
        brandDonts: profile.brandDonts,
      }),
    ).toBe(false);
  });

  it("Brauereiname + Felder gelten als complete", () => {
    expect(isBrandProfileComplete(makeProfile())).toBe(true);
    expect(
      isBrandProfileCompleteFromSettings({
        brandProfileMode: "guided",
        breweryName: "Falter",
        brandWebsiteUrl: "",
        brandTone: "a",
        brandColors: "b",
        brandDos: "c",
        brandDonts: "d",
      }),
    ).toBe(true);
  });
});

describe("buildBrandProfilePromptContext mit Belegstatus", () => {
  it("ohne Belegstatus (Altbestand) bleibt die Ausgabe unverändert hart", () => {
    const legacy = buildBrandProfilePromptContext(makeProfile());
    expect(legacy).toContain("STRICT lock");
    expect(legacy).not.toContain("Unconfirmed brand hints");
  });

  it("nur belegte oder bestätigte Felder sind harte Vorgaben, Schätzungen werden weiche Hinweise", () => {
    const context = buildBrandProfilePromptContext(
      makeProfile({
        brandFieldStatus: {
          breweryName: "belegt",
          brandColors: "bestaetigt",
          brandTone: "geschaetzt",
          brandDos: "geschaetzt",
          brandDonts: "geschaetzt",
        },
      }),
    );
    const [hard, soft] = context.split("Unconfirmed brand hints");
    expect(hard).toContain("- Brand/Brewery: Brauerei Falter");
    expect(hard).toContain("- Brand color palette: #1A3C2E, #E8B84B");
    expect(hard).not.toContain("Brand tone & character");
    expect(soft).toContain("- Brand tone & character: Traditionell, bodenständig");
    expect(soft).toContain("- Visual style, always:");
  });

  it("nur Schätzungen → kein STRICT-Block, nur weiche Hinweise", () => {
    const context = buildBrandProfilePromptContext(
      makeProfile({ brandFieldStatus: { breweryName: "geschaetzt", brandTone: "geschaetzt", brandColors: "geschaetzt", brandDos: "geschaetzt", brandDonts: "geschaetzt" } }),
    );
    expect(context).not.toContain("STRICT lock");
    expect(context.startsWith("Unconfirmed brand hints")).toBe(true);
  });

  it("liest den Belegstatus tolerant aus den Metadaten", () => {
    expect(parseBrandFieldStatus({ brandTone: "geschaetzt", brandColors: "erfunden", fremd: "belegt" })).toEqual({
      brandTone: "geschaetzt",
    });
    expect(parseBrandFieldStatus("kaputt")).toBeUndefined();
    const profile = getBrandProfileFromMetadata({
      dashboard: { settings: { brandProfileMode: "guided", breweryName: "X", brandFieldStatus: { breweryName: "bestaetigt" } } },
    });
    expect(profile.brandFieldStatus).toEqual({ breweryName: "bestaetigt" });
    expect(getBrandProfileFromMetadata({ dashboard: { settings: { breweryName: "X" } } })).not.toHaveProperty("brandFieldStatus");
  });
});
