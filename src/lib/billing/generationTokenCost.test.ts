import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateGenerationTokenCost, calculatePerVariantTokenCost, calculateSeedanceVideoTokenCost, estimateStudioImageTokenCost, resolveImageBillingResolution } from "./generationTokenCost";

describe("generationTokenCost", () => {
  it("berechnet 2K + Referenz + Strict pro Variante", () => {
    expect(
      calculatePerVariantTokenCost({
        resolution: "2K",
        hasReferenceImage: true,
        strictLabelMode: true,
      }),
    ).toBe(11);
  });

  it("multipliziert mit Variantenanzahl", () => {
    expect(
      calculateGenerationTokenCost({
        resolution: "2K",
        hasReferenceImage: true,
        strictLabelMode: true,
        variantCount: 3,
      }),
    ).toBe(33);
  });

  it("Studio-Vorschau entspricht Server-Kosten mit Produktfoto", () => {
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: true,
        etikettModus: "marke",
        variantCount: 3,
      }),
    ).toBe(33);
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: true,
        etikettModus: "marke",
        variantCount: 1,
        requestedQuality: "medium",
      }),
    ).toBe(8);
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: false,
        extraReferenceCount: 2,
        etikettModus: "generisch",
        variantCount: 1,
      }),
    ).toBe(5);
  });

  it("User-Qualität schlägt Produktfoto-Default", () => {
    expect(
      resolveImageBillingResolution({
        hasProductPhoto: true,
        compiledOrRequestedQuality: "medium",
      }),
    ).toBe("1K");
    expect(
      resolveImageBillingResolution({
        hasProductPhoto: true,
        compiledOrRequestedQuality: "high",
      }),
    ).toBe("2K");
    expect(
      resolveImageBillingResolution({
        hasProductPhoto: false,
        compiledOrRequestedQuality: "ultra",
      }),
    ).toBe("4K");
  });

  it("4K Markenbild kostet 17 Tokens", () => {
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: true,
        etikettModus: "marke",
        variantCount: 1,
        requestedQuality: "ultra",
      }),
    ).toBe(17);
  });

  it("berücksichtigt Qualitäts-Env und Request-Qualität ohne Produktfoto", () => {
    expect(
      resolveImageBillingResolution({
        hasProductPhoto: false,
        qualityEnv: "high",
      }),
    ).toBe("2K");
    expect(
      resolveImageBillingResolution({
        hasProductPhoto: true,
        qualityEnv: "low",
      }),
    ).toBe("1K");
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: false,
        hasShapeReference: true,
        etikettModus: "generisch",
        variantCount: 1,
        qualityEnv: "high",
      }),
    ).toBe(8);
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: false,
        etikettModus: "generisch",
        variantCount: 1,
        requestedQuality: "high",
      }),
    ).toBe(6);
  });

  it("1K ohne Referenz = 3 Tokens", () => {
    expect(
      calculatePerVariantTokenCost({
        resolution: "1K",
        hasReferenceImage: false,
      }),
    ).toBe(3);
  });

  it("Video: Dauer × Auflösung (Seedance 2, ohne Audio)", () => {
    expect(calculateSeedanceVideoTokenCost({ resolution: "480p", duration: 4 })).toBe(20);
    expect(calculateSeedanceVideoTokenCost({ resolution: "480p", duration: 5 })).toBe(25);
    expect(calculateSeedanceVideoTokenCost({ resolution: "480p", duration: 6 })).toBe(30);
    expect(calculateSeedanceVideoTokenCost({ resolution: "720p", duration: 4 })).toBe(40);
    expect(calculateSeedanceVideoTokenCost({ resolution: "720p", duration: 5 })).toBe(50);
    expect(calculateSeedanceVideoTokenCost({ resolution: "720p", duration: 6 })).toBe(60);
    expect(calculateSeedanceVideoTokenCost({ resolution: "1080p", duration: 5 })).toBe(120);
  });

  it("Video: Audio ohne Aufschlag, Modell-Multiplikator, Varianten 1:1", () => {
    expect(
      calculateSeedanceVideoTokenCost({
        resolution: "720p",
        duration: 5,
        generateAudio: true,
      }),
    ).toBe(50);
    expect(
      calculateSeedanceVideoTokenCost({
        resolution: "720p",
        duration: 5,
        modelId: "seedance-2-mini",
      }),
    ).toBe(28);
    expect(
      calculateSeedanceVideoTokenCost({
        resolution: "720p",
        duration: 5,
        modelId: "seedance-2.5",
      }),
    ).toBe(75);
    expect(
      calculateSeedanceVideoTokenCost({
        resolution: "720p",
        duration: 5,
        generateAudio: true,
        variantCount: 4,
      }),
    ).toBe(200);
  });

  it("Client-Vorschau medium entspricht Request-Qualitaet ohne Produktfoto", () => {
    expect(
      estimateStudioImageTokenCost({
        usesProductPhoto: false,
        etikettModus: "generisch",
        variantCount: 1,
        requestedQuality: "medium",
      }),
    ).toBe(
      calculateGenerationTokenCost({
        resolution: resolveImageBillingResolution({
          hasProductPhoto: false,
          compiledOrRequestedQuality: "medium",
        }),
        hasReferenceImage: false,
        strictLabelMode: false,
        variantCount: 1,
      }),
    );
  });
});

describe("Preisangaben Video passen zur Abrechnung", () => {
  // Hermetisch: ein lokal gesetzter Pauschalpreis (KIE_SEEDANCE_TOKEN_COST) darf das Ergebnis nicht verfälschen.
  beforeEach(() => vi.stubEnv("KIE_SEEDANCE_TOKEN_COST", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("Seedance 2.5 kostet im Standardfall 75, Seedance 2 50 Tokens", () => {
    const base = { resolution: "720p" as const, duration: 5, generateAudio: true };
    expect(calculateSeedanceVideoTokenCost({ ...base, modelId: "seedance-2" })).toBe(50);
    expect(calculateSeedanceVideoTokenCost({ ...base, modelId: "seedance-2.5" })).toBe(75);
  });

  it("Hinweistext nennt beide tatsächlich berechneten Werte", async () => {
    const { SEEDANCE_VIDEO_TOKEN_HINT } = await import("./planCatalog");
    expect(SEEDANCE_VIDEO_TOKEN_HINT).toContain("Seedance 2 50 Tokens");
    expect(SEEDANCE_VIDEO_TOKEN_HINT).toContain("Seedance 2.5 75 Tokens");
  });

  it("Tarifspanne rechnet die Untergrenze mit Seedance 2.5 (Start: 400 Tokens)", async () => {
    const { formatPlanVideoEstimate } = await import("./generationTokenCost");
    // 400 / 180 (12 s, 2.5) = 2 · 400 / 50 (5 s, Seedance 2) = 8
    expect(formatPlanVideoEstimate(400)).toBe("ca. 2–8 Videos");
  });
});
