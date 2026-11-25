import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HyperrealisticInput } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { LOOK_LIBRARY, loadStyleLookReferences, selectLookReferences } from "./styleLookReferences";

const baseInput: HyperrealisticInput = {
  etikettBild: "https://example.com/product.png",
  flaschenTyp: "nrw_500",
  flaschenfarbe: "braun",
  bierstil: "helles",
  szene: "biergarten_sommer",
  personImBild: false,
  personenModus: "A",
  tageszeit: "tageslicht",
  stimmung: "entspannt",
  aspectRatio: "4:5",
  quality: "medium",
  variantCount: 1,
};

describe("style look library", () => {
  it("points only at files that exist", () => {
    for (const { dir, refs } of Object.values(LOOK_LIBRARY)) {
      for (const ref of refs) {
        expect(existsSync(path.join(process.cwd(), "assets", dir, ref.file)), `${dir}/${ref.file}`).toBe(true);
      }
    }
  });

  it("never gives a bottle brand a can-only campaign look", () => {
    for (let variant = 0; variant < 6; variant += 1) {
      const refs = selectLookReferences({ ...baseInput, photoStyle: "campaign" }, 2, variant);
      expect(refs).toHaveLength(2);
      expect(refs.every((ref) => ref.container !== "can")).toBe(true);
    }
  });

  it("prefers can looks for cans", () => {
    const refs = selectLookReferences({ ...baseInput, flaschenTyp: "dose_330", photoStyle: "campaign" }, 2);
    expect(refs.some((ref) => ref.container === "can")).toBe(true);
    expect(refs.every((ref) => ref.container !== "bottle")).toBe(true);
  });

  it("prefers day looks by day and night looks by night, but never sends reportage without a look", () => {
    const day = selectLookReferences({ ...baseInput, photoStyle: "reportage" }, 2);
    expect(day).toHaveLength(2);
    expect(day.every((ref) => ref.light !== "night")).toBe(true);
    const night = selectLookReferences({ ...baseInput, photoStyle: "reportage", tageszeit: "nacht" }, 2);
    expect(night).toHaveLength(2);
    expect(night.every((ref) => ref.light !== "day")).toBe(true);
  });

  it("falls back to another light instead of sending no look at all", () => {
    // Premium hat (noch) nur Tagbilder — nachts greift trotzdem eins.
    expect(selectLookReferences({ ...baseInput, photoStyle: "premium", tageszeit: "nacht" }, 2).length).toBeGreaterThan(0);
  });

  it("blurs own reportage and premium looks only lightly so the look survives", () => {
    expect(LOOK_LIBRARY.reportage.refs.every((ref) => (ref.blur ?? 22) <= 4)).toBe(true);
    expect(LOOK_LIBRARY.premium.refs.every((ref) => (ref.blur ?? 22) <= 4)).toBe(true);
  });

  it("smears the faces of every lightly blurred look so no person travels into customer images", () => {
    const light = Object.values(LOOK_LIBRARY).flatMap((style) => style.refs).filter((ref) => (ref.blur ?? 22) <= 4);
    for (const ref of light) {
      expect(ref.faces?.length, ref.file).toBeGreaterThan(0);
      for (const [x0, y0, x1, y1] of ref.faces ?? []) {
        expect(x0 >= 0 && y0 >= 0 && x1 <= 100 && y1 <= 100 && x1 > x0 && y1 > y0, ref.file).toBe(true);
      }
    }
  });

  it("rotates looks between variants", () => {
    const input = { ...baseInput, photoStyle: "campaign" as const };
    const first = selectLookReferences(input, 1, 0).map((ref) => ref.file);
    const second = selectLookReferences(input, 1, 1).map((ref) => ref.file);
    expect(first).not.toEqual(second);
  });

  it("loads blurred jpeg references only when a photo style is set", async () => {
    const references = await loadStyleLookReferences({ ...baseInput, photoStyle: "campaign" }, 2);
    expect(references).toHaveLength(2);
    expect(references.every((reference) => reference.mime === "image/jpeg" && reference.base64.length > 10_000)).toBe(true);
    await expect(loadStyleLookReferences(baseInput, 2)).resolves.toEqual([]);
  });
});
