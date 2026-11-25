import { describe, expect, it } from "vitest";
import { buildCampaignTextPrompt } from "./campaign-text";
import { buildHyperrealisticPrompt, buildProductPlacementPrompt, applyClientIntentOverrides } from "./hyperrealistic";
import { buildProductIsolatePrompt } from "./product-isolate";
import { DEFAULT_GLAS_BY_STIL, buildProductStudioPrompt, resolveStudioGlas } from "./product-studio";
import { buildBottleShapeLockFragment, buildClosureLogicFragment, buildPhotoStyleLockFragment } from "./hyperrealism-blocks";
import { campaignTextSchema, hyperrealisticSchema, productIsolateSchema, productStudioSchema } from "../schemas";
import { applyContentPresetPrompt } from "@/lib/image-types/policy";

describe("inhalte-erstellen prompt builders", () => {
  it("activates the reusable Hyperreal prompt lock", () => {
    const prompt = applyContentPresetPrompt("A beer in a garden.", "hyperreal");
    expect(prompt).toContain("Preset lock (NON-NEGOTIABLE): Hyperreal Motif");
    expect(prompt).toContain("Preserve the selected photo style");
    expect(prompt).toContain("Camera and composition must follow the selected photo-style lock");
    expect(prompt).toContain("physically correct refraction");
    expect(prompt).toContain("Strictly forbid illustration");
    expect(prompt).toContain("filtered or naturtrüb");
    expect(prompt).not.toContain("transparent liquid");
    expect(prompt).not.toContain("film grain,");
  });

  it("keeps the three explicit photo-style locks visually distinct", () => {
    const base = {
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500" as const,
      flaschenfarbe: "braun" as const,
      bierstil: "helles",
      szene: "biergarten_sommer" as const,
      personImBild: false,
      tageszeit: "goldene_stunde" as const,
      stimmung: "entspannt" as const,
      aspectRatio: "4:5" as const,
      quality: "medium" as const,
      variantCount: 1 as const,
    };
    const reportage = buildPhotoStyleLockFragment({ ...base, photoStyle: "reportage" });
    const premium = buildPhotoStyleLockFragment({ ...base, photoStyle: "premium" });
    const campaign = buildPhotoStyleLockFragment({ ...base, photoStyle: "campaign" });

    expect(reportage).toMatch(/CANDID FLASH REPORTAGE/);
    expect(reportage).toMatch(/fill flash in daylight/);
    expect(reportage).toMatch(/never the polished hero/);
    expect(reportage).toMatch(/cigarettes or smoking/);
    expect(premium).toMatch(/QUIET PREMIUM PRODUCT PHOTOGRAPHY/);
    expect(premium).toMatch(/never on a studio pedestal/);
    expect(premium).toMatch(/People are optional and secondary/);
    expect(premium).toMatch(/Forbidden AI-gloss|beauty-retouched wax skin|on-camera direct flash|product thrust/i);
    expect(campaign).toMatch(/ART-DIRECTED CAMPAIGN MOTIF|product fills a large share|LOOK references' grammar/i);
    expect(campaign).toMatch(/Forbidden.*Premium|beer-garden table|Maßkrug postcard/i);
    expect(new Set([reportage, premium, campaign])).toHaveLength(3);
  });

  it("builds a hyperrealistic prompt snapshot", () => {
    expect(
      buildHyperrealisticPrompt({
        etikettBild: "https://example.com/etikett.png",
        flaschenTyp: "nrw_500",
        flaschenfarbe: "braun",
        bierstil: "pils",
        glasTyp: "pils_tulpe",
        szene: "biergarten_sommer",
        personImBild: true,
        tageszeit: "goldene_stunde",
        stimmung: "gesellig",
        zusatzWunsch: "Dezente Hopfenranken im Vordergrund.",
        aspectRatio: "4:5",
        quality: "high",
        variantCount: 3,
      }),
    ).toMatchSnapshot();
  });

  it("does not describe beer foam or hops for mineral water", () => {
    const prompt = buildHyperrealisticPrompt({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "klar",
      produktKategorie: "mineralwasser",
      bierstil: "mineralwasser",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      personImBild: false,
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      aspectRatio: "4:5",
      quality: "high",
      variantCount: 1,
    });
    expect(prompt).toMatch(/mineral-water bottle|mineral water/i);
    expect(prompt).not.toMatch(/SRM /);
    expect(prompt).toMatch(/no beer foam/i);
    expect(prompt).not.toMatch(/Hopfenranken|hop vines/i);
  });

  it("places mineral water without a poured beer glass", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "entspannt",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "klar",
      produktKategorie: "mineralwasser",
      bierstil: "mineralwasser",
      glasTyp: "willibecher",
      szene: "stadtbalkon_abend",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "abend_warm",
      etikettModus: "marke",
      stiltreue: "hoch",
      beerName: "Quelle Naturell",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(prompt).toMatch(/mineral-water bottle/i);
    expect(prompt).toMatch(/no beer foam/i);
    expect(prompt).not.toMatch(/poured beer glass/);
  });

  it("places the product photo without describing a brand name for the label", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "entspannt", etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "stadtbalkon_abend",
      behaelter: "B",
      personImBild: false,
      personenModus: "B",
      tageszeit: "abend_warm",
      etikettModus: "marke",
      stiltreue: "hoch",
      beerName: "ABK Hell",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 3,
    });
    expect(prompt).toMatch(/Image 1/);
    expect(prompt).toMatch(/entire printed label/);
    expect(prompt).not.toMatch(/ABK/);
    expect(prompt).not.toMatch(/EXACT TEXT/);
    expect(prompt).toMatch(/authentic real-camera photograph/i);
    expect(prompt).toMatch(/35mm point-and-shoot/i);
    expect(prompt).toMatch(/PRODUCT INTEGRATION — CRITICAL/);
    expect(prompt).toMatch(/never as a flat cutout, sticker, pasted layer, or composited object/);
    expect(prompt).toMatch(/Do NOT preserve the reference image's lighting/);
    expect(prompt).toMatch(/share the SAME camera, lens, focal plane/);
    expect(prompt).not.toMatch(/Keep unchanged from Image 1/i);
    expect(prompt).toMatch(/HYPERREALISM LOCK/);
    expect(prompt).toMatch(/NEGATIVE \(hyperreal\)/);
    expect(prompt).toMatch(/Forbidden/);
    expect(prompt).toMatch(/single pour/);
    expect(prompt).toMatch(/CLOSURE LOGIC/);
    expect(prompt).toMatch(/crown cap must NEVER sit on the bottle mouth/i);
    expect(prompt).not.toMatch(/cap design, and the entire printed label/);
  });

  it("unterscheidet Stiltreue normal vs hoch beim Label-Lock", () => {
    const hoch = buildProductPlacementPrompt({
      stimmung: "entspannt",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      etikettModus: "marke",
      stiltreue: "hoch",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    const normal = buildProductPlacementPrompt({
      stimmung: "entspannt",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      etikettModus: "marke",
      stiltreue: "normal",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(hoch).toMatch(/entire printed label/);
    expect(normal).toMatch(/faithful reference/);
    expect(normal).not.toMatch(/entire printed label/);
  });

  it("keeps free style fidelity internally consistent", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "entspannt",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      etikettModus: "generisch",
      stiltreue: "frei",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(prompt).toMatch(/vessel and material reference/i);
    expect(prompt).toMatch(/branding is not locked/i);
    expect(prompt).not.toMatch(/exact product and brand identity/i);
  });

  it("describes every attached reference by its actual role", () => {
    const prompt = buildProductPlacementPrompt(
      {
        stimmung: "entspannt",
        etikettBild: "https://example.com/etikett.png",
        flaschenTyp: "nrw_500",
        flaschenfarbe: "braun",
        bierstil: "helles",
        glasTyp: "willibecher",
        szene: "biergarten_sommer",
        behaelter: "B",
        personImBild: false,
        personenModus: "A",
        tageszeit: "goldene_stunde",
        etikettModus: "marke",
        stiltreue: "hoch",
        aspectRatio: "4:5",
        quality: "medium",
        variantCount: 1,
      },
      {
        referenceRoles: [
          { index: 1, role: "product" },
          { index: 2, role: "glass" },
          { index: 3, role: "look" },
        ],
      },
    );
    expect(prompt).toMatch(/Image 2 defines ONLY the glass silhouette/i);
    expect(prompt).toMatch(/Image 3 is a LOOK reference(?: only| and PRIMARY style guide)/i);
  });

  it("selects campaign camera direction instead of forcing a documentary film look", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "feierlich",
      stimmungTrend: "premium",
      contentPreset: "campaign_social",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "wirtshaus_innen",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "abend_warm",
      etikettModus: "marke",
      stiltreue: "hoch",
      aspectRatio: "4:5",
      quality: "high",
      variantCount: 1,
    });
    expect(prompt).toMatch(/low or forced perspective with the product dominant/i);
    expect(prompt).toMatch(/real photographed brand campaign|real camera campaign still/i);
    expect(prompt).not.toMatch(/Kodak Portra|fine analog grain/i);
  });

  it("lets an explicit reportage selection override the automatic social campaign style", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "feierlich",
      contentPreset: "campaign_social",
      photoStyle: "reportage",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      szene: "wirtshaus_innen",
      behaelter: "F",
      personImBild: true,
      personenModus: "D",
      tageszeit: "abend_warm",
      aspectRatio: "4:5",
      quality: "high",
      variantCount: 1,
    });
    expect(prompt).toMatch(/candid snapshot framing with imperfect edges|28–35mm/i);
    expect(prompt).toMatch(/candid flash snapshot from a real beer occasion/i);
    expect(prompt).not.toMatch(/low or forced perspective with the product dominant/i);
  });

  it("applies explicit premium photography independent of people and mood", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "gesellig",
      stimmungTrend: "nachhaltig",
      photoStyle: "premium",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      szene: "brauereihof",
      behaelter: "B",
      personImBild: true,
      personenModus: "D",
      tageszeit: "goldene_stunde",
      aspectRatio: "4:5",
      quality: "high",
      variantCount: 1,
    });
    expect(prompt).toMatch(/85mm lens at f\/4/i);
    expect(prompt).toMatch(/premium hospitality photography|LOOK-reference hospitality light/i);
    expect(prompt).toMatch(/real hospitality photography|ordinary guests|not a glossy AI lifestyle/i);
  });

  it("applies explicit campaign art direction outside the social preset", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "entspannt",
      photoStyle: "campaign",
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      szene: "biergarten_sommer",
      behaelter: "F",
      personImBild: false,
      personenModus: "A",
      tageszeit: "mittag",
      aspectRatio: "16:9",
      quality: "medium",
      variantCount: 1,
    });
    expect(prompt).toMatch(/low or forced perspective with the product dominant|product fills the foreground/i);
    expect(prompt).toMatch(/real photographed brand campaign|real camera campaign still|campaign still like the LOOK/i);
  });

  it("lets free-text intent override biergarten defaults for mountain toasting", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      zusatzWunsch: "auf dem berg anstoßen",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.szene).toBe("alpenpanorama");
    expect(next.personenModus).toBe("E");

    const prompt = buildProductPlacementPrompt(next);
    expect(prompt.startsWith("USER SCENE")).toBe(true);
    expect(prompt).toMatch(/HYPERREALISM LOCK/);
    expect(prompt).toMatch(/USER SCENE/);
    expect(prompt).toMatch(/auf dem berg anstoßen/);
    expect(prompt).toMatch(/COMPLETELY DISCARD Image 1's background/i);
    expect(prompt).toMatch(/hands holding glasses|mid-clink|Anstoßen/i);
    expect(prompt).toMatch(/floating bottle/i);
    expect(prompt).toMatch(/alpine mountain/i);
    expect(prompt).toMatch(/NEGATIVE \(hyperreal\)/);
  });

  it("maps brewery toasting freitext to brauereihof with people", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      zusatzWunsch: "in der brauerei wird angestoßen",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.szene).toBe("brauereihof");
    expect(next.personenModus).toBe("E");
    const prompt = buildProductPlacementPrompt(next);
    expect(prompt).toMatch(/hands holding glasses|Anstoßen/i);
    expect(prompt).not.toMatch(/No people and no hands/);
  });

  it("maps laughing brewer freitext to person hero + brewery scene", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      zusatzWunsch: "brauer lacht sich schlapp über neues bier",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.szene).toBe("brauereihof");
    expect(next.personenModus).toBe("D");
    expect(next.personImBild).toBe(true);

    const prompt = buildProductPlacementPrompt(next);
    expect(prompt).toMatch(/HERO PERSON|PEOPLE FROM USER SCENE|laughing|mandatory/i);
    expect(prompt).toMatch(/brauer lacht sich schlapp/i);
    expect(prompt).toMatch(/lonely bottle\+glass|still life|empty product table|omitting the people/i);
  });

  it("forces two older Bavarians into the prompt instead of No-people packshot", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      zusatzWunsch: "zwei alte urbayer trinken gemütlich auf einer parkbank am marienplatz in münchen ihr bier",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.personenModus).toBe("E");
    expect(next.personImBild).toBe(true);
    expect(next.gruppenAnzahl).toBe("2");
    expect(next.personAlter).toBe("aelter");

    const prompt = buildProductPlacementPrompt(next);
    expect(prompt).toMatch(/PEOPLE FROM USER SCENE|mandatory/i);
    expect(prompt).toMatch(/zwei alte urbayer/i);
    expect(prompt).not.toMatch(/No people and no hands/);
    expect(prompt).toMatch(/omitting the people|empty product table|lonely bottle/i);
  });

  it("never emits hard No-people when freitext exists even for unknown synonyms", () => {
    const prompt = buildProductPlacementPrompt({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      bierstil: "helles",
      glasTyp: "willibecher",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "goldene_stunde",
      stimmung: "gesellig",
      zusatzWunsch: "stammtischveteranen genießen ihr helles am rathausplatz",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(prompt).toMatch(/Follow USER SCENE for people/i);
    expect(prompt).toMatch(/stammtischveteranen/i);
    expect(prompt).not.toMatch(/No people and no hands/);
  });

  it("maps pour freitext to Flasche+Glas and wires the selected glass type", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "euro_longneck_330",
      flaschenfarbe: "braun",
      bierstil: "helles",
      // Client hat glasTyp vergessen — Stil-Default greift
      szene: "biergarten_sommer",
      personImBild: false,
      personenModus: "A",
      tageszeit: "mittag",
      stimmung: "gesellig",
      zusatzWunsch: "hanseat wird ins glas eingeschenkt naturtrüb",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.behaelter).toBe("B");
    expect(next.glasTyp).toBe("willibecher");

    const withCustomGlass = applyClientIntentOverrides({
      ...next,
      glasTyp: "pils_tulpe",
      zusatzWunsch: "hanseat wird eingeschenkt",
    });
    expect(withCustomGlass.glasTyp).toBe("pils_tulpe");
    expect(withCustomGlass.behaelter).toBe("B");

    const prompt = buildProductPlacementPrompt(withCustomGlass);
    expect(prompt).toMatch(/GLASS SHAPE LOCK/i);
    expect(prompt).toMatch(/Pilstulpe|stemmed German Pilstulpe/i);
    expect(prompt).toMatch(/LABEL ORIENTATION/i);
    expect(prompt).toMatch(/Anchor A|NECK\/shoulder|upright standing bottle/i);
  });

  it("forces cloudy liquid for helles when filtrierung is unfiltriert", () => {
    const next = applyClientIntentOverrides({
      etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "euro_longneck_330",
      flaschenfarbe: "braun",
      bierstil: "helles",
      filtrierung: "unfiltriert",
      glasTyp: "ipa_teku",
      szene: "biergarten_sommer",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "mittag",
      stimmung: "gesellig",
      zusatzWunsch: "eingeschenkt",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 1,
    });
    expect(next.zusatzWunsch).toMatch(/naturtrüb|unfiltriert/i);
    const prompt = buildProductPlacementPrompt(next);
    expect(prompt).toMatch(/NATURTRÜB|yeast haze|milky-cloudy|INVALID IF CLEAR/i);
    expect(prompt).toMatch(/IMAGE-1 LIQUID OVERRIDE/i);
    expect(prompt).not.toMatch(/crystal-clear pale golden lager with warm glow-through/i);
  });

  it("haelt das Glas auf Flaschenvolumen (kein 0,5-l-Krug neben 0,33 l)", () => {
    const prompt = buildProductPlacementPrompt({
      stimmung: "entspannt", etikettBild: "https://example.com/etikett.png",
      flaschenTyp: "euro_longneck_330",
      flaschenfarbe: "braun",
      bierstil: "bock",
      glasTyp: "masskrug",
      szene: "wirtshaus_innen",
      behaelter: "B",
      personImBild: false,
      personenModus: "A",
      tageszeit: "abend_warm",
      etikettModus: "marke",
      aspectRatio: "4:5",
      quality: "medium",
      variantCount: 3,
    });
    expect(prompt).toMatch(/0\.3 litre/);
    expect(prompt).toMatch(/NOT a 0\.5 litre/);
    expect(prompt).toMatch(/0\.33 L bottle/);
  });

  it("builds a product isolate prompt snapshot", () => {
    expect(
      buildProductIsolatePrompt({
        inputBild: "https://example.com/flasche.png",
        hintergrund: "transparent",
        schattenErhalten: true,
        outputFormat: "png",
      }),
    ).toMatchSnapshot();
  });

  it("builds a product studio prompt snapshot", () => {
    expect(
      buildProductStudioPrompt({
        referenzBild: "https://example.com/flasche.png",
        bierstil: "hefeweizen",
        hintergrundStil: "naturholz_warm",
        glasNebenFlasche: true,
        lichtStimmung: "weich_diffuse",
        aspectRatio: "1:1",
        quality: "high",
      }),
    ).toMatchSnapshot();
  });

  it("builds a campaign text prompt snapshot", () => {
    expect(
      buildCampaignTextPrompt({
        referenzBilder: [
          "https://example.com/feed-1.png",
          "https://example.com/feed-2.png",
          "https://example.com/feed-3.png",
        ],
        postZiel: "produkt_launch",
        headline: "Frisch eingebraut",
        subline: "Unser neues Helles ist da.",
        ctaText: "Jetzt probieren",
        brauereiName: "Hopfenhof",
        bierstilOderProdukt: "Helles Lager",
        zusatzKontext: "Sommerlich, hell und freundlich.",
        aspectRatio: "4:5",
        quality: "high",
      }),
    ).toMatchSnapshot();
  });
});

describe("studio glass auto mapping", () => {
  it("maps every supported beer style to its expected glass", () => {
    for (const [bierstil, glasTyp] of Object.entries(DEFAULT_GLAS_BY_STIL)) {
      expect(resolveStudioGlas({ bierstil: bierstil as keyof typeof DEFAULT_GLAS_BY_STIL })).toBe(glasTyp);
    }
  });
});

describe("mode schemas", () => {
  it("rejects missing required fields", () => {
    expect(hyperrealisticSchema.safeParse({}).success).toBe(false);
    expect(productIsolateSchema.safeParse({}).success).toBe(false);
    expect(productStudioSchema.safeParse({}).success).toBe(false);
    expect(campaignTextSchema.safeParse({}).success).toBe(false);
  });
});

describe("Bügelverschluss und Hand an der Flasche", () => {
  const pour = {
    etikettBild: "https://example.com/etikett.png",
    flaschenTyp: "buegel_500" as const,
    flaschenfarbe: "braun" as const,
    bierstil: "kellerbier",
    szene: "biergarten_sommer" as const,
    personImBild: true,
    personenModus: "B" as const,
    behaelter: "B" as const,
    glasTyp: "willibecher" as const,
    tageszeit: "goldene_stunde" as const,
    stimmung: "entspannt" as const,
    aspectRatio: "4:5" as const,
    quality: "medium" as const,
    variantCount: 1 as const,
  };

  it("beschreibt den offenen Bügelverschluss als eine echte Mechanik", () => {
    const text = buildClosureLogicFragment(pour);
    expect(text).toMatch(/ONE thin wire ring/);
    expect(text).toMatch(/NO second wire loop/);
    expect(text).toMatch(/hangs down/);
  });

  it("verbietet Finger in oder hinter der Flasche", () => {
    expect(buildClosureLogicFragment(pour)).toMatch(/never inside the bottle|ever inside the bottle/);
  });

  it("zählt genau einen Stopfen", () => {
    expect(buildClosureLogicFragment(pour)).toMatch(/exactly ONE stopper/);
  });

  it("macht 0,33 l sichtbar klein und ignoriert andere Größen auf dem Produktfoto", () => {
    const small = buildBottleShapeLockFragment({ ...pour, flaschenTyp: "buegel_330" as const });
    expect(small).toContain("SMALL SIZE (330 ml)");
    expect(small).toContain("ONLY the 0.33 L one");
    expect(buildBottleShapeLockFragment(pour)).not.toMatch(/SMALL SIZE/);
  });
});

describe("Produkt sitzt im Foto statt reinkopiert", () => {
  const base = {
    etikettBild: "https://example.com/etikett.png",
    flaschenTyp: "nrw_500" as const,
    flaschenfarbe: "braun" as const,
    bierstil: "helles",
    szene: "biergarten_sommer" as const,
    personImBild: false,
    tageszeit: "goldene_stunde" as const,
    stimmung: "entspannt" as const,
    aspectRatio: "4:5" as const,
    quality: "medium" as const,
    variantCount: 1 as const,
    photoStyle: "premium" as const,
  };

  it("verlangt bei Premium Szenenlicht, gewölbtes Etikett und Kontaktschatten statt Sticker-Schärfe", () => {
    const lock = buildPhotoStyleLockFragment(base);
    expect(lock).toMatch(/PRODUCT IN-CAMERA INTEGRATION/);
    expect(lock).toMatch(/follows the cylinder/);
    expect(lock).toMatch(/contact shadow/);
    expect(lock).not.toMatch(/razor-sharp/);
    expect(lock).toMatch(/ordinary local adults, not models/);
    expect(lock).toMatch(/never look-alike faces/);
  });

  it("holt bei Nur-Glas-Motiven keine Flasche ins Bild", () => {
    expect(buildPhotoStyleLockFragment({ ...base, behaelter: "G" as const, glasTyp: "willibecher" as const })).not.toMatch(
      /PRODUCT IN-CAMERA INTEGRATION/,
    );
  });
});
