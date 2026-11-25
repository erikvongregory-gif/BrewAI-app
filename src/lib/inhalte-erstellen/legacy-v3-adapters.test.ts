import { describe, expect, it } from "vitest";
import { campaignTextSchema, productStudioSchema } from "@/app/(dashboard)/inhalte-erstellen/lib/schemas";
import { buildCampaignPromptV3, buildStudioPromptV3 } from "./legacy-v3-adapters";
import { buildFreeformImagePromptV3 } from "./image-prompt-v3";

describe("V3 compatibility for older generation APIs", () => {
  it("preserves studio background, lighting, product and serving selection", () => {
    const input = productStudioSchema.parse({ referenzBild: "https://example.com/product.png", bierstil: "stout", hintergrundStil: "schiefer_dunkel", glasNebenFlasche: false, lichtStimmung: "hart_dramatisch" });
    const text = buildStudioPromptV3(input);
    expect(text).toContain("CUSTOMER SCENE (authoritative)");
    expect(text).toContain("dark matte slate");
    expect(text).toContain("hard directional light");
    expect(text).toContain("Container only; no poured glass.");
    expect(text).toContain("Natural, high-quality editorial photography");
  });

  it("preserves exact campaign text while applying V3 photography", () => {
    const input = campaignTextSchema.parse({ referenzBilder: Array(3).fill("https://example.com/ref.png"), postZiel: "produkt_launch", headline: "Unser neues Bier", subline: "Jetzt erhältlich", brauereiName: "Test" });
    const text = buildCampaignPromptV3(input);
    expect(text).toContain('"Unser neues Bier"');
    expect(text).toContain('"Jetzt erhältlich"');
    expect(text).toContain("commissioned brand campaign shoot on location");
  });

  it.each(["hyperreal", "product_studio", "campaign_social", "product_cutout"] as const)("uses V3 for provider image type %s without inventing product specifications", (imageType) => {
    const text = buildFreeformImagePromptV3({ scene: "A red bottle on a kitchen table", imageType, referenceCount: 1, strictLabel: true });
    expect(text).toContain("IMAGE DIRECTION V3");
    expect(text).toContain("CUSTOMER SCENE (authoritative): A red bottle on a kitchen table");
    expect(text).toContain("exact logo");
    expect(text).not.toMatch(/NRW|500 ml|helles|dirndl/i);
  });
});
