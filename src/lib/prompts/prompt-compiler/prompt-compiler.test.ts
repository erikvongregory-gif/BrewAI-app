import { describe, expect, it } from "vitest";
import { FLASCHEN_TYPEN } from "@/app/(dashboard)/inhalte-erstellen/lib/brewing-knowledge";
import { hyperrealisticSchema, type HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import {
  assembleMasterPrompt,
  compileBrief,
  masterPromptHasRequiredSections,
  MASTER_PROMPT_SECTIONS,
  validateBriefForGeneration,
} from "./index";

const baseInput = {
  etikettBild: "https://example.com/etikett.png",
  flaschenTyp: "nrw_500" as const,
  flaschenfarbe: "braun" as const,
  bierstil: "helles",
  glasTyp: "willibecher" as const,
  szene: "biergarten_sommer" as const,
  behaelter: "B" as const,
  personImBild: false,
  personenModus: "A" as const,
  tageszeit: "goldene_stunde" as const,
  stimmung: "gesellig" as const,
  etikettModus: "marke" as const,
  stiltreue: "hoch" as const,
  aspectRatio: "4:5" as const,
  quality: "medium" as const,
  variantCount: 1 as const,
  zusatzWunsch: "in der brauerei wird angestoßen",
} satisfies HyperrealisticInput;

describe("prompt-compiler", () => {
  it("rejects complete but reordered master sections", () => {
    expect(masterPromptHasRequiredSections([...MASTER_PROMPT_SECTIONS].reverse().join("\n"))).toBe(false);
    expect(masterPromptHasRequiredSections(MASTER_PROMPT_SECTIONS.slice(1).join("\n"))).toBe(false);
  });

  it("keeps user direction above look references and provides one camera section", () => {
    const prompt = assembleMasterPrompt({
      input: baseInput,
      hasProductPhoto: true,
      hasShapeReference: true,
      referenceRoles: [{ index: 1, role: "product" }, { index: 2, role: "look" }],
    });
    expect(prompt).toContain("never replace the requested action or location");
    expect(prompt.indexOf(baseInput.zusatzWunsch)).toBeLessThan(prompt.indexOf("Image 1"));
    expect(prompt.match(/KOMPOSITION UND KAMERA/g)).toHaveLength(1);
    expect(prompt).toContain("Image 2 (look)");
  });
  it.each([401, 800])("preserves a valid %i-character brief in the product-photo path", async (length) => {
    const brief = "Biergarten mit warmem Licht. ".repeat(40).slice(0, length - 5) + "ENDE.";
    const input = hyperrealisticSchema.parse({ ...baseInput, zusatzWunsch: brief });
    const compiled = await compileBrief({
      anthropic: null,
      input,
      hasProductPhoto: true,
      hasShapeReference: true,
    });
    expect(compiled.blocking_issues).toEqual([]);
    expect(compiled.normalized_brief.scene).toBe(brief);
    expect(compiled.image_prompt).toContain(brief);
  });

  it("returns actionable blocking issues for a long brief without a required photo", async () => {
    const input = hyperrealisticSchema.parse({ ...baseInput, zusatzWunsch: "Biergarten. ".repeat(60) });
    const compiled = await compileBrief({
      anthropic: null,
      input,
      hasProductPhoto: false,
      hasShapeReference: true,
    });
    expect(compiled.blocking_issues.some((issue) => /Produktfoto/i.test(issue))).toBe(true);
    expect(compiled.normalized_brief.scene).toBe(input.zusatzWunsch);
  });

  it("exposes structured bottle catalog fields", () => {
    const nrw = FLASCHEN_TYPEN.nrw_500;
    expect(nrw.display_name).toContain("NRW");
    expect(nrw.geometry_profile.length).toBeGreaterThan(10);
    expect(nrw.closure).toBe("kronkorken");
    expect(nrw.hasShapeReference).toBe(true);
    expect(nrw.preserve).toContain("Silhouette");
    expect(FLASCHEN_TYPEN.longneck_500.hasShapeReference).toBe(false);
  });

  it("blocks marke without product photo", () => {
    const result = validateBriefForGeneration({
      input: baseInput,
      hasProductPhoto: false,
      hasShapeReference: true,
      hasUsableBrief: true,
    });
    expect(result.blocking_issues.some((i) => /Produktfoto/i.test(i))).toBe(true);
  });

  it("blocks inventing bottle shape without photo or shape ref", () => {
    const result = validateBriefForGeneration({
      input: { ...baseInput, flaschenTyp: "longneck_500", etikettModus: "generisch", stiltreue: "frei" },
      hasProductPhoto: false,
      hasShapeReference: false,
      hasUsableBrief: true,
    });
    expect(result.blocking_issues.some((i) => /Formreferenz|erfunden/i.test(i))).toBe(true);
  });

  it("allows nrw with shape ref when generisch (no marke photo required)", () => {
    const result = validateBriefForGeneration({
      input: { ...baseInput, etikettModus: "generisch", stiltreue: "frei" },
      hasProductPhoto: false,
      hasShapeReference: true,
      hasUsableBrief: true,
    });
    expect(result.blocking_issues.filter((i) => /Produktfoto/i.test(i))).toHaveLength(0);
  });

  it("assembles master prompt with required section order", () => {
    const prompt = assembleMasterPrompt({
      input: baseInput,
      breweryName: "ABK",
      hasProductPhoto: true,
      hasShapeReference: true,
    });
    expect(masterPromptHasRequiredSections(prompt)).toBe(true);
    let last = -1;
    for (const section of MASTER_PROMPT_SECTIONS) {
      const idx = prompt.indexOf(section);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
    expect(prompt).toMatch(/in der brauerei wird angestoßen/);
    expect(prompt).toMatch(/NRW/);
    expect(prompt).toMatch(/no cap may remain on the mouth/);
    expect(prompt).toMatch(/beer bottle/);
  });

  it("uses water language instead of beer bottle for mineral water", () => {
    const prompt = assembleMasterPrompt({
      input: { ...baseInput, produktKategorie: "mineralwasser", bierstil: "mineralwasser", flaschenfarbe: "klar" },
      breweryName: "ABK",
      hasProductPhoto: true,
      hasShapeReference: true,
    });
    expect(prompt).toMatch(/mineral-water bottle/);
    expect(prompt).toMatch(/Wasser farblos/);
    expect(prompt).toMatch(/kein Hopfen/);
    expect(prompt).not.toMatch(/beer bottle/);
  });

  it("compileBrief returns blocking issues without calling Claude", async () => {
    const compiled = await compileBrief({
      anthropic: null,
      input: baseInput,
      hasProductPhoto: false,
      hasShapeReference: true,
    });
    expect(compiled.blocking_issues.length).toBeGreaterThan(0);
    expect(masterPromptHasRequiredSections(compiled.image_prompt)).toBe(true);
  });

  it("compileBrief builds usable prompt when product photo present", async () => {
    const compiled = await compileBrief({
      anthropic: null,
      input: baseInput,
      breweryName: "ABK",
      hasProductPhoto: true,
      hasShapeReference: true,
    });
    expect(compiled.blocking_issues).toEqual([]);
    expect(compiled.image_prompt.length).toBeGreaterThan(100);
    expect(masterPromptHasRequiredSections(compiled.image_prompt)).toBe(true);
  });
});
