import { describe, expect, it, beforeEach } from "vitest";
import { hyperrealisticInputToBrauereiBrief } from "@/lib/prompts/brauerei-bild/map-hyperrealistic-brief";
import {
  clearBrauereiBildSkillCache,
  getBrauereiBildSkillMarkdown,
  getBreweryImageSkillSystemPrompt,
} from "@/lib/prompts/brewerySkill";

describe("brauerei-bild skill", () => {
  beforeEach(() => {
    clearBrauereiBildSkillCache();
  });

  it("loads the full SKILL.md content", () => {
    const markdown = getBrauereiBildSkillMarkdown();
    expect(markdown).toContain("Skill: brauerei-bild");
    expect(markdown).toContain("Glastyp-Mapping");
    expect(markdown).toContain("PROPORTIONEN-KOMPATIBILITÄTSTABELLE");
    expect(markdown).toContain("SRM-Skala");
    expect(markdown).toContain("platform_gpt_image_2");
    expect(markdown).toContain("[E] GRUPPE");
    expect(markdown).toContain("Selfie-POV");
  });

  it("exposes skill via getBreweryImageSkillSystemPrompt", () => {
    expect(getBreweryImageSkillSystemPrompt()).toContain("GPT Image 2");
  });

  it("maps hyperrealistic dashboard input to brauerei brief", () => {
    const brief = hyperrealisticInputToBrauereiBrief(
      {
        etikettBild: "https://example.com/label.png",
        flaschenTyp: "nrw_500",
        flaschenfarbe: "braun",
        bierstil: "helles",
        glasTyp: "willibecher",
        szene: "biergarten_sommer",
        personImBild: false,
        tageszeit: "goldene_stunde",
        stimmung: "entspannt",
        aspectRatio: "4:5",
        quality: "high",
        variantCount: 3,
      },
      { breweryName: "Paulaner" },
    );

    expect(brief.markenname).toBe("Paulaner");
    expect(brief.glasTyp).toBe("Willibecher");
    expect(brief.kiPlattform).toBe("GPT Image 2.5 Sunburst (OpenAI gpt-image-2.5-sunburst)");
    expect(brief.produktKategorie).toBe("bier");
  });

  it("maps mineral water without beer type", () => {
    const brief = hyperrealisticInputToBrauereiBrief({
      etikettBild: "https://example.com/label.png",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "klar",
      produktKategorie: "mineralwasser",
      bierstil: "mineralwasser",
      szene: "biergarten_sommer",
      personImBild: false,
      tageszeit: "goldene_stunde",
      stimmung: "entspannt",
      aspectRatio: "4:5",
      quality: "high",
      variantCount: 1,
    });
    expect(brief.produktKategorie).toBe("mineralwasser");
    expect(brief.getraenk).toBe("mineral water");
    expect(brief.biertyp).toBe("mineral water");
  });
});
