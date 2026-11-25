import { describe, expect, it } from "vitest";
import { BEER_STYLE_OPTIONS, correctAlcoholFreeStyle } from "../beer-styles";
import { GLAS_TYPEN, pouredGlassFillMl } from "../brewing-knowledge";
import type { HyperrealisticInput } from "../schemas";
import {
  buildBeerPhysicsFragment,
  buildGlassShapeLockFragment,
  buildUnfilteredLiquidLockFragment,
  resolveBeerClarity,
  resolveBeerPhysics,
} from "./hyperrealism-blocks";
import { applyClientIntentOverrides } from "./hyperrealistic";
import { buildImagePromptV3 } from "@/lib/inhalte-erstellen/image-prompt-v3";

const base: HyperrealisticInput = {
  etikettBild: "https://example.com/etikett.png",
  flaschenTyp: "nrw_500",
  flaschenfarbe: "braun",
  bierstil: "helles",
  glasTyp: "willibecher",
  szene: "biergarten_sommer",
  behaelter: "B",
  personImBild: false,
  personenModus: "A",
  tageszeit: "tageslicht",
  stimmung: "entspannt",
  aspectRatio: "4:5",
  quality: "medium",
  variantCount: 1,
};

describe("Brauer-Wissen: Sorten und Gläser", () => {
  it("hat für jede wählbare Sorte ein eigenes Farb-, Schaum- und Glasprofil", () => {
    for (const option of BEER_STYLE_OPTIONS) {
      const physics = resolveBeerPhysics(option.bierstil);
      expect(physics.liquid, option.bierstil).not.toMatch(/authentic craft beer color/);
      expect(physics.head, option.bierstil).toBeTruthy();
      expect(GLAS_TYPEN[option.glasTyp], option.bierstil).toBeDefined();
    }
  });

  it("serviert Bock im Pokal und Märzen im Seidel statt in einer halbvollen Maß", () => {
    const glass = (bierstil: string) => BEER_STYLE_OPTIONS.find((option) => option.bierstil === bierstil)?.glasTyp;
    expect(glass("bock")).toBe("pokal");
    expect(glass("maerzen")).toBe("seidel");
    expect(glass("stout")).toBe("nonic");
    expect(glass("festbier")).toBe("masskrug");
  });

  it("nennt die Schaumhöhe der Sorte — Pilskrone beim Pils, dünne Kappe beim Kölsch", () => {
    expect(buildBeerPhysicsFragment("pils", "B")).toMatch(/Pilskrone/);
    expect(buildBeerPhysicsFragment("koelsch", "B")).toMatch(/one-finger cap/);
  });

  it("lässt die Schaumhöhe aus der Glasbeschreibung heraus", () => {
    for (const glas of Object.values(GLAS_TYPEN)) {
      expect(glas.promptDescription).not.toMatch(/foam/i);
    }
  });

  it("zeigt den Eichstrich am deutschen Schankglas, nicht am Teku", () => {
    expect(buildGlassShapeLockFragment(base)).toMatch(/Eichstrich/);
    expect(buildGlassShapeLockFragment({ ...base, bierstil: "ipa", glasTyp: "ipa_teku" })).not.toMatch(/Eichstrich/);
  });

  it("macht den Steinkrug undurchsichtig", () => {
    const lock = buildGlassShapeLockFragment({ ...base, bierstil: "zwickel", glasTyp: "steinkrug" });
    expect(lock).toMatch(/opaque/);
    expect(lock).not.toMatch(/Eichstrich/);
  });

  it("rendert dunkles Weißbier trüb, aber nicht golden", () => {
    const input = { ...base, bierstil: "dunkles_weizen", glasTyp: "weizen" as const };
    expect(resolveBeerClarity(input)).toBe("trueb");
    expect(buildBeerPhysicsFragment("dunkles_weizen", "B", { clarity: "trueb" })).not.toMatch(/gold/i);
    expect(buildUnfilteredLiquidLockFragment(input)).not.toMatch(/golden/i);
  });

  it("beschreibt das Weißbier-Einschenken mit aufgeschwenkter Hefe", () => {
    expect(buildBeerPhysicsFragment("hefeweizen", "B")).toMatch(/swirled to rouse the yeast/);
    expect(buildBeerPhysicsFragment("hefeweizen", "G")).not.toMatch(/swirled/);
    expect(buildBeerPhysicsFragment("pils", "B")).not.toMatch(/swirled/);
  });
});

describe("Verdrahtung Sorte → Glas → Gebinde", () => {
  it("stellt neben die 0,5-l-Flasche nie ein 0,3er-Glas", () => {
    const lock = buildGlassShapeLockFragment({ ...base, glasTyp: "pils_tulpe", flaschenTyp: "nrw_500" });
    expect(lock).toMatch(/Serving size 0\.5 litre/);
    expect(lock).toMatch(/NOT a small 0\.2–0\.3 litre glass/);
    expect(pouredGlassFillMl("pils_tulpe", "nrw_500", "B")).toBe(500);
  });

  it("stellt neben die 0,33 ein 0,3er-Glas, keine Halbe", () => {
    const lock = buildGlassShapeLockFragment({ ...base, glasTyp: "willibecher", flaschenTyp: "euro_steinie_330" });
    expect(lock).toMatch(/0\.3 litre Willibecher/);
    expect(lock).toMatch(/NOT a 0\.5 litre Seidel or Willibecher/);
  });

  it("macht aus „Hell Alkoholfrei“ ein Helles mit Willibecher", () => {
    expect(correctAlcoholFreeStyle("alkoholfrei_pilsner", "pils_tulpe", "ABK Hell Alkoholfrei")).toEqual({
      bierstil: "helles",
      glasTyp: "willibecher",
    });
    expect(correctAlcoholFreeStyle("alkoholfrei_pilsner", "weizen", "Weißbier Alkoholfrei")).toEqual({
      bierstil: "hefeweizen",
      glasTyp: "weizen",
    });
    expect(correctAlcoholFreeStyle("alkoholfrei_pilsner", "pils_tulpe", "Alkoholfrei")).toEqual({
      bierstil: "alkoholfrei_pilsner",
      glasTyp: "pils_tulpe",
    });
    const input = applyClientIntentOverrides({
      ...base,
      bierstil: "alkoholfrei_pilsner",
      glasTyp: "pils_tulpe",
      beerName: "ABK Hell Alkoholfrei",
    });
    expect(input.bierstil).toBe("helles");
    expect(input.glasTyp).toBe("willibecher");
  });

  it("erzwingt nicht in jedem Bild Flasche + Glas", () => {
    const noBehaelter = { ...base, behaelter: undefined };
    expect(applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Zwei Freunde fahren nachts im Auto" }).behaelter).toBe("F");
    expect(applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Freunde stoßen mit Gläsern an" }).behaelter).toBe("B");
    expect(applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Der Wirt schenkt ein" }).behaelter).toBe("B");
    expect(applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Nur Glas auf dem Tresen" }).behaelter).toBe("G");
    expect(applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Glasflasche im Kühlschrank" }).behaelter).toBe("F");
    expect(applyClientIntentOverrides(noBehaelter).behaelter).toBe("F");
    // Vorlage mit Flasche + Glas bleibt.
    expect(applyClientIntentOverrides({ ...base, zusatzWunsch: "Zwei Freunde am Stammtisch" }).behaelter).toBe("B");
  });
});

describe("Fahrzeug-Szenen", () => {
  const noBehaelter = { ...base, behaelter: undefined };

  it("gibt dem Fahrer nie ein Getränk und lässt im Auto kein Glas einschenken", () => {
    const input = applyClientIntentOverrides({ ...base, zusatzWunsch: "Zwei Freunde fahren nachts im Auto und lachen" });
    expect(input.behaelter).toBe("F");
    const prompt = buildImagePromptV3({ input, references: [] });
    expect(prompt).toContain("Alcohol is held or consumed only by adults.");
    expect(prompt).toContain("Container only; no poured glass.");
  });

  it("erlaubt ein Glas im Auto nur, wenn der Kunde es ausdrücklich will", () => {
    const input = applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Beifahrerin mit einem Glas Helles im parkenden Auto" });
    expect(input.behaelter).toBe("B");
    const prompt = buildImagePromptV3({ input, references: [] });
    expect(prompt).toContain("Alcohol is held or consumed only by adults.");
    expect(prompt).not.toMatch(/No poured glass inside a vehicle/);
  });

  it("fügt außerhalb von Fahrzeugen keine Fahrzeugregel hinzu", () => {
    const input = applyClientIntentOverrides({ ...noBehaelter, zusatzWunsch: "Stammtisch im Wirtshaus" });
    expect(buildImagePromptV3({ input, references: [] })).not.toMatch(/driver never holds/);
  });

  it("beschreibt den Willibecher mit Bauch und eingezogenem Rand", () => {
    expect(buildGlassShapeLockFragment(base)).toMatch(/rounded belly in the upper third that curves slightly back in toward the rim/);
  });
});
