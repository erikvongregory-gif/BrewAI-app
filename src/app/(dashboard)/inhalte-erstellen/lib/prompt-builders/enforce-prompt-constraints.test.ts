import { describe, expect, it } from "vitest";
import type { HyperrealisticInput } from "../schemas";
import {
  enforceHyperrealisticPromptConstraints,
  shouldUseImageReferenceForGeneration,
} from "./enforce-prompt-constraints";
import { ensureProductGeometryLocks } from "./hyperrealism-blocks";
import { buildHyperrealisticPrompt } from "./hyperrealistic";

const baseInput: HyperrealisticInput = {
  etikettBild: "https://example.com/label.png",
  flaschenTyp: "nrw_500",
  flaschenfarbe: "braun",
  bierstil: "hefeweizen",
  glasTyp: "weizen",
  szene: "biergarten_sommer",
  behaelter: "G",
  personImBild: true,
  personenModus: "E",
  gruppenAnzahl: "3",
  gruppenTyp: "gemischt",
  gruppenDynamik: "E3",
  tageszeit: "goldene_stunde",
  stimmungTrend: "aktiv",
  stimmung: "gesellig",
  etikettModus: "marke",
  aspectRatio: "9:16",
  quality: "high",
  variantCount: 3,
};

describe("enforceHyperrealisticPromptConstraints", () => {
  it("appends glass-only lock when behaelter is G", () => {
    const out = enforceHyperrealisticPromptConstraints("A group with beer bottles on the table.", baseInput, "Paulaner");
    expect(out).toMatch(/GLASS-ONLY/i);
    expect(out).toMatch(/INVALID if any bottle/i);
    expect(out).toMatch(/Paulaner/i);
  });

  it("appends hyperrealism directives for Claude-generated prompts", () => {
    const out = enforceHyperrealisticPromptConstraints("A beer in a garden.", baseInput, "Paulaner");
    expect(out).toMatch(/HYPERREALISM LOCK/i);
    expect(out).toMatch(/LIQUID PHYSICS/i);
    expect(out).toMatch(/SRM/i);
    expect(out).toMatch(/HUMAN REALISM/i);
  });

  it("locks bottle shape from the spec and optional shape photo, not by ignoring references", () => {
    const out = enforceHyperrealisticPromptConstraints("A beer bottle on a table.", {
      ...baseInput,
      behaelter: "B",
      glasTyp: "willibecher",
      flaschenTyp: "nrw_500",
      beerName: "ABK Hell",
    });
    expect(out).toMatch(/BOTTLE SHAPE LOCK/i);
    expect(out).toMatch(/MEDIUM-LENGTH neck/i);
    expect(out).not.toMatch(/Do NOT copy the bottle silhouette/i);
    expect(out).toMatch(/GLASS SHAPE LOCK/i);
    expect(out).toMatch(/Willibecher/i);
    expect(out).toMatch(/NOT a stemmed Pilsner/i);
    expect(out).toMatch(/LABEL LOCK 1:1/i);
    expect(out).toMatch(/ABK Hell/i);
    expect(out).toMatch(/LABEL ORIENTATION/i);
    expect(out).toMatch(/Anchor A|NECK\/shoulder|upright standing bottle/i);
    expect(out).toMatch(/CLOSURE LOGIC/i);
    expect(out).toMatch(/crown cap must NEVER sit on the bottle mouth/i);
    expect(out).toMatch(/OPEN SERVING/i);
  });

  it("does not force an open bottle when there is no poured glass", () => {
    const out = enforceHyperrealisticPromptConstraints("A sealed beer bottle on a table.", {
      ...baseInput,
      behaelter: "F",
      glasTyp: undefined,
    });
    expect(out).not.toMatch(/OPEN SERVING/i);
    expect(out).toMatch(/only correct when nobody drinks from it/i);
  });

  it("skips image reference for glass-only generation", () => {
    expect(shouldUseImageReferenceForGeneration(baseInput)).toBe(false);
    expect(shouldUseImageReferenceForGeneration({ ...baseInput, behaelter: "B" })).toBe(true);
  });
});

describe("ensureProductGeometryLocks", () => {
  it("puts clarity lock first even when already mid-prompt", () => {
    const longBody = `SCENE BODY MARKER ${"x".repeat(120)} LIQUID CLARITY LOCK (MANDATORY) stale mid`;
    const out = ensureProductGeometryLocks(longBody, {
      ...baseInput,
      behaelter: "B",
      glasTyp: "ipa_teku",
      flaschenTyp: "euro_longneck_330",
      filtrierung: "unfiltriert",
      bierstil: "helles",
      etikettModus: "marke",
    });
    expect(out.indexOf("LIQUID CLARITY LOCK")).toBe(0);
    expect(out).toMatch(/INVALID IF CLEAR/i);
    expect(out).toMatch(/naturtrüb|Kellerbier|yeast haze/i);
  });
});

describe("buildHyperrealisticPrompt glass-only", () => {
  it("does not describe a bottle in the subject when behaelter is G", () => {
    const prompt = buildHyperrealisticPrompt(baseInput, { breweryName: "Paulaner" });
    expect(prompt).not.toMatch(/A amber-brown.* bottle\. The label/i);
    expect(prompt).toMatch(/ONLY the glass, absolutely NO bottle/);
    expect(prompt).toMatch(/EXACT TEXT on the glass: "Paulaner"/);
    expect(prompt).toMatch(/beer bottle, bottle on table/i);
  });

  it("uses glasses not bottles in group E4 when behaelter is G", () => {
    const prompt = buildHyperrealisticPrompt(
      { ...baseInput, gruppenDynamik: "E4" },
      { breweryName: "Paulaner" },
    );
    expect(prompt).not.toMatch(/holding beer bottles/i);
    expect(prompt).toMatch(/branded beer glasses/i);
  });

  it("uses public viewing schauplatz for group mode instead of legacy biergarten setting", () => {
    const prompt = buildHyperrealisticPrompt(
      {
        ...baseInput,
        szene: "fussball_public_viewing",
        gruppenSetting: "biergarten",
        gruppenDynamik: "E3",
      },
      { breweryName: "Paulaner" },
    );
    expect(prompt).toMatch(/football public viewing|public viewing party/i);
    expect(prompt).not.toMatch(/in a traditional Biergarten/i);
    expect(prompt).not.toMatch(/rustic wooden table/i);
    expect(prompt).toMatch(/SCENE:.*public viewing/i);
  });
});
