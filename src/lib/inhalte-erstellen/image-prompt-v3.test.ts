import { describe, expect, it } from "vitest";
import { hyperrealisticSchema } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { buildImagePromptV3, normalizeV3Input, V3_PHOTO_PRESETS } from "./image-prompt-v3";
import { BEER_PHYSICS } from "@/lib/beverages/beer-appearance";

function prompt(overrides: Record<string, unknown> = {}) {
  return buildImagePromptV3({
    input: hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "helles", szene: "biergarten_sommer", behaelter: "B", ...overrides }),
    references: [{ index: 1, role: "product" }],
    breweryName: "ABK",
    labelText: [],
  });
}

describe("independent V3 image direction", () => {
  it("adds the large-format finishing rule only for the 4K tier", () => {
    expect(prompt({ quality: "ultra" })).toContain("LARGE-FORMAT FINISHING");
    expect(prompt({ quality: "high" })).not.toContain("LARGE-FORMAT FINISHING");
    expect(prompt()).not.toContain("LARGE-FORMAT FINISHING");
  });
  it("gives premium coherent photographic optics and physical detail without forcing blur or clutter", () => {
    const text = prompt({ photoStyle: "premium" });
    expect(text).toContain("one credible photographic exposure from one camera position");
    expect(text).toContain("rather than automatically maximizing background blur");
    expect(text).toContain("contact shadows, occlusion and reflected color");
    expect(text).toContain("plausible thickness, refraction, transparent overlaps");
    expect(text).toContain("plausible posture, weight distribution, joints, fingers and grip");
    expect(text).toContain("natural surface variation must not damage or rewrite labels");
    expect(text).toContain("do not add noise, scratches, light leaks or lens defects");
    expect(text).toContain("do not add subjects, props, blemishes on products or environmental clutter");
    for (const photoStyle of ["reportage", "campaign"]) {
      expect(prompt({ photoStyle })).not.toContain("one credible photographic exposure from one camera position");
    }
  });
  it("gives premium individual unretouched skin without changing selected identities", () => {
    const text = prompt({ photoStyle: "premium" });
    expect(text).toContain("visible pores in the focal plane");
    expect(text).toContain("freckles or small moles");
    expect(text).toContain("vary these details between individuals");
    expect(text).toContain("do not invent new moles, scars or freckles that change that identity");
    expect(text).toContain("without beauty retouching, skin smoothing, airbrushing");
    expect(V3_PHOTO_PRESETS.reportage).not.toContain("freckles or small moles");
    expect(V3_PHOTO_PRESETS.campaign).not.toContain("freckles or small moles");
  });
  it("keeps the Radler prompt consistent with the database color and citrus haze", () => {
    const input = hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "radler", szene: "biergarten_sommer", behaelter: "B" });
    const text = buildImagePromptV3({ input, references: [], beerAppearance: { ...BEER_PHYSICS.radler, hex: "#DDE055" } });
    expect(text).toContain("#DDE055");
    expect(text).toContain("natural citrus haze");
    expect(text).not.toContain("dense natural yeast haze");
    expect(text).not.toContain("filtered, transparent");
  });
  it("uses a locked Dunkel label instead of a stale Helles selection", () => {
    const input = hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "helles", glasTyp: "willibecher", behaelter: "B", szene: "biergarten_sommer", keepLabel: true });
    const text = buildImagePromptV3({ input, references: [{ index: 1, role: "product" }, { index: 2, role: "liquid" }], labelText: ["ABK", "DUNKEL"] });
    expect(text).toContain("SELECTED BEER IN EVERY GLASS: dunkel");
    expect(text).toContain("deep chestnut-brown");
    expect(text).not.toContain("pale golden lager");
    expect(text).toContain("selected beer color swatch only");
  });

  it("does not infer Helles from an arbitrary product name or change unlocked artwork", () => {
    const input = hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "dunkel", beerName: "Hausmarke", szene: "biergarten_sommer" });
    expect(normalizeV3Input(input).bierstil).toBe("dunkel");
    expect(normalizeV3Input({ ...input, keepLabel: false }, ["HELL"]).bierstil).toBe("dunkel");
  });
  it("makes reportage a dominant direct-flash snapshot without prescribing scene content", () => {
    const text = prompt({ photoStyle: "reportage" });
    expect(text).toContain("Direct on-camera flash is the dominant light");
    expect(text).toContain("including in daylight");
    expect(text).toContain("small hard shadows");
    expect(text).toContain("darker ambient background");
    expect(text).not.toContain("flash balanced with ambient light");
    expect(text).toContain("35mm point-and-shoot");
    expect(text).toContain("off-centre framing");
    expect(text).toContain("mid-action, mid-laugh or mid-sentence");
    expect(text).toContain("not an isolated hero product");
    expect(text).not.toContain("clean and professional across the entire frame");
  });

  it("keeps reportage ground resolved naturally without adding scenery or portrait blur", () => {
    const text = prompt({ photoStyle: "reportage", zusatzWunsch: "Eine Flasche auf einem Tisch im Innenraum" });
    expect(text).toContain("resolve the subjects and the ground around their feet together");
    expect(text).toContain("do not apply portrait-mode background blur to nearby ground");
    expect(text).toContain("If grass is already present");
    expect(text).toContain("If gravel or stone is already present");
    expect(text).toContain("without localized soft patches, melted grass, smeared gravel");
    expect(text).toContain("must not add grass, gravel or scenery to the customer scene");
    expect(text).toContain("CUSTOMER SCENE (authoritative): Eine Flasche auf einem Tisch im Innenraum");
    for (const photoStyle of ["premium", "campaign"]) {
      expect(prompt({ photoStyle })).not.toContain("do not apply portrait-mode background blur to nearby ground");
    }
  });

  it.each(["dunkel", "Dunkel", "Dunkles Bier", "Dunkel-Lager"])("preserves %s color under flash instead of falling back to pale lager", (bierstil) => {
    const text = prompt({ bierstil, photoStyle: "reportage", filtrierung: "filtriert" });
    expect(text).toContain("SELECTED BEER IN EVERY GLASS: dunkel");
    expect(text).toContain("deep chestnut-brown");
    expect(text).toContain("visibly dark brown even under flash or backlight");
    expect(text).toContain("No pale yellow or golden lager in any glass");
    expect(text).toContain("transparent within its own beer color");
    expect(text).not.toContain("pale golden lager");
  });
  it.each(["reportage", "premium", "campaign"])("keeps %s free of cultural wardrobe, casting and locations", (photoStyle) => {
    const text = prompt({ photoStyle });
    expect(text).not.toMatch(/tracht|dirndl|lederhosen|bavarian|beer garden|chestnut|pretzel|two women|85mm portrait/i);
    expect(text).not.toContain("biergarten_sommer");
    expect(text).toContain("do not infer cultural dress");
    expect(V3_PHOTO_PRESETS[photoStyle as keyof typeof V3_PHOTO_PRESETS]).not.toMatch(/woman|people|outfit|garden|toast/i);
  });

  it("preserves an explicit customer scene exactly without a competing setting", () => {
    const scene = "Drei Frauen in Lederhosen am Strand trinken Dunkles";
    const text = prompt({ photoStyle: "reportage", zusatzWunsch: scene, bierstil: "dunkel" });
    expect(text).toContain(`CUSTOMER SCENE (authoritative): ${scene}`);
    expect(text).not.toContain("Product-only image");
    expect(text).not.toContain("Bavarian");
  });

  it("keeps bottle volume, glass matching and different liquid colors", () => {
    const light = prompt({ bierstil: "helles", flaschenTyp: "nrw_500" });
    const dark = prompt({ bierstil: "dunkel", flaschenTyp: "nrw_500" });
    expect(light).toContain("500 ml");
    expect(light).toMatch(/Willibecher/i);
    expect(light).toContain("pale golden");
    expect(dark).toMatch(/mahogany|brown/i);
    expect(dark).toMatch(/Seidel|mug/i);
    expect(light).toContain("Eichstrich");
  });

  it("keeps unfiltered wheat beer and its tall glass with foam", () => {
    const text = prompt({ bierstil: "hefeweizen", filtrierung: "unfiltriert" });
    expect(text).toMatch(/Weizen/i);
    expect(text).toContain("naturtrüb");
    expect(text).toContain("3–4 cm");
  });

  it("does not describe poured beer or a glass in bottle-only mode", () => {
    const text = prompt({ behaelter: "F" });
    expect(text).not.toContain("Beer color:");
    expect(text).not.toContain("Glass:");
    expect(text).toContain("Container only; no poured glass");
  });

  it("keeps water colorless and without beer foam", () => {
    const text = prompt({ produktKategorie: "mineralwasser", bierstil: "mineralwasser", behaelter: "G" });
    expect(text).toContain("Colorless mineral water");
    expect(text).not.toContain("SRM");
    expect(text).toContain("Glass only");
  });

  it("preserves customer reference roles, label text and a selected character", () => {
    const input = hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "helles", szene: "biergarten_sommer" });
    const text = buildImagePromptV3({ input, references: [{ index: 1, role: "character" }, { index: 2, role: "product" }], character: { appearanceLock: "Customer-defined red jacket" }, labelText: ["ABK", "DUNKEL"] });
    expect(text).toContain("Image 1: the explicitly selected character identity only");
    expect(text).toContain('Exact label words: "ABK", "DUNKEL"');
    // Etikett-Sperre zeigt auf das Produktfoto (hier Bild 2), samt Kleingedrucktem.
    expect(text).toContain("LABEL LOCK: Reproduce the label of Image 2 as printed, line for line");
    expect(text).toContain("Small print keeps its position and original wording");
    expect(text).toContain("instead of inventing new legible text");
    const free = buildImagePromptV3({ input: { ...input, keepLabel: false, etikettModus: "generisch" }, references: [{ index: 1, role: "product" }], labelText: ["ABK"] });
    expect(free).not.toContain("LABEL LOCK");
    expect(text).toContain("Customer-defined red jacket");
    expect(text).not.toContain("Invent new, distinct adult identities");
  });

  it("normalizes product fields without adding scene or personality defaults", () => {
    const input = hyperrealisticSchema.parse({ etikettBild: "https://example.com/product.png", flaschenTyp: "nrw_500", bierstil: "alkoholfrei_pilsner", beerName: "Helles Alkoholfrei", szene: "biergarten_sommer", keepLabel: false });
    const result = normalizeV3Input(input);
    expect(result.bierstil).toBe("helles");
    expect(result.glasTyp).toBe("willibecher");
    expect(result.behaelter).toBe("F");
    expect(result.etikettModus).toBe("generisch");
    expect(result.zusatzWunsch).toBeUndefined();
    expect(result.personBeschreibung).toBeUndefined();
  });
});
