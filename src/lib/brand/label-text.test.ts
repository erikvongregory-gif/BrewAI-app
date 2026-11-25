import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { checkGeneratedLabel, missingLabelWords, parseLabelTextResponse } from "./label-text";

describe("parseLabelTextResponse", () => {
  it("keeps exact spelling and drops duplicates, quotes and overlong lines", () => {
    expect(parseLabelTextResponse('Sure: ["Hausbräu", "EDEL", "edel", "Spe\\"zial", "' + "x".repeat(50) + '"]')).toEqual([
      "Hausbräu",
      "EDEL",
      "Spezial",
    ]);
  });

  it("returns nothing for unclear answers", () => {
    expect(parseLabelTextResponse("[]")).toEqual([]);
    expect(parseLabelTextResponse("I cannot read it")).toEqual([]);
    expect(parseLabelTextResponse('{"a": 1}')).toEqual([]);
  });

  it("caps the list at four words", () => {
    expect(parseLabelTextResponse('["A1","B2","C3","D4","E5"]')).toHaveLength(4);
  });
});

describe("label post-check", () => {
  const image = () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#fff" } }).png().toBuffer();

  it("ignores case, spacing and punctuation but catches changed letters", () => {
    expect(missingLabelWords(["Hausbräu", "EDEL-HELL"], ["HAUSBRÄU", "Edel Hell"])).toEqual([]);
    expect(missingLabelWords(["Hausbräu", "DUNKEL"], ["Hausbrau", "DUNKEL"])).toEqual(["Hausbräu"]);
  });

  it("reports ok, drift and unreadable without guessing", async () => {
    const read = (words: string[]) => async (ref: { mime: string }) => {
      expect(ref.mime).toBe("image/jpeg");
      return words;
    };
    expect(await checkGeneratedLabel(await image(), ["ABK", "DUNKEL"], read(["ABK", "Dunkel"]))).toEqual({ status: "ok", missing: [] });
    expect(await checkGeneratedLabel(await image(), ["ABK", "DUNKEL"], read(["ABK", "DUNKLE"]))).toEqual({ status: "drift", missing: ["DUNKEL"] });
    expect(await checkGeneratedLabel(await image(), ["ABK"], read([]))).toEqual({ status: "unreadable", missing: ["ABK"] });
  });
});
