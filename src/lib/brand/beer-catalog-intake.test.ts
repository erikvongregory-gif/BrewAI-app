import { describe, expect, it } from "vitest";
import {
  extractBeerVarietiesFromIntake,
  humanizeBeerSlug,
  inferBierstilFromName,
  inferPackagingFromEvidence,
  mergeSuggestedBeers,
  replaceSuggestedBeers,
  suggestedBeersToDashboard,
} from "@/lib/brand/beer-catalog-intake";
import type { ImageCandidate } from "@/lib/brand/website-intake";
import type { DownloadedImage } from "@/lib/brand/website-intake";

function catalogImage(url: string): DownloadedImage {
  return {
    url,
    alt: "",
    score: 56,
    productScore: 56,
    lifestyleScore: 40,
    isPackshot: true,
    base64: "",
    mediaType: "image/jpeg",
    mime: "image/jpeg",
    sizeBytes: 1000,
  };
}

describe("beer-catalog-intake", () => {
  function scan(html: string, images: DownloadedImage[] = []) {
    const pageUrl = "https://bier-brauerei.de/biere/";
    return extractBeerVarietiesFromIntake({
      pages: [{ pageUrl, title: "Sortiment", textBlocks: [], textExcerpt: "", imageCandidates: [] }],
      downloadedImages: images,
      breweryName: "Testbrauerei",
      rawHtmlByUrl: { [pageUrl]: html },
    });
  }

  it("imports mixed drinks and keeps radler plus alcohol-free beer as beer", () => {
    const beers = ["Natur Pils", "Helles", "Hefeweizen", "Hazy NEIPA", "Alkoholfreies Pils", "Natur Radler"];
    const softdrinks = ["Limonade", "Cola", "Mineralwasser", "Tafelwasser"];
    const other = ["Alkoholfrei", "Bierglas", "Pils Glas", "Weizen Tasse", "Bier T-Shirt", "Bier Gutschein", "Bierbrand", "Bierpaket", "Premium Original", "Unsere Biere", "Bier erleben", "Wasser", "Getränke"];
    const html = [...beers, ...softdrinks, ...other].map((name) => `<h2>${name}</h2>`).join("");
    const result = scan(html);
    expect(result.map((beer) => beer.name).sort()).toEqual([...beers, ...softdrinks].sort());
    expect(result.find((item) => item.name === "Natur Radler")?.produktKategorie).toBe("bier");
    expect(result.find((item) => item.name === "Alkoholfreies Pils")?.produktKategorie).toBe("bier");
    expect(result.find((item) => item.name === "Limonade")?.produktKategorie).toBe("limonade");
    expect(result.find((item) => item.name === "Cola")?.produktKategorie).toBe("limonade");
    expect(result.find((item) => item.name === "Tafelwasser")?.produktKategorie).toBe("tafelwasser");
    expect(result.find((item) => item.name === "Mineralwasser")?.produktKategorie).toBe("mineralwasser");
    expect(result.find((item) => item.name === "Helles")?.packagingNeedsReview).toBe(true);
  });

  it("infers packaging from product evidence and marks unknowns for review", () => {
    expect(inferPackagingFromEvidence("IPA Dose 0,33 l", "bier")).toMatchObject({
      flaschenTyp: "dose_330",
      packagingNeedsReview: false,
    });
    expect(inferPackagingFromEvidence("Kellerbier Bügelflasche braun 0,5l", "bier")).toMatchObject({
      flaschenTyp: "buegel_500",
      flaschenfarbe: "braun",
      packagingNeedsReview: false,
    });
    expect(inferPackagingFromEvidence("Helles", "bier").packagingNeedsReview).toBe(true);

    const result = scan("<h2>IPA Dose 500ml</h2><h2>Pils</h2>");
    expect(result.find((item) => item.name === "IPA Dose 500ml")).toMatchObject({
      flaschenTyp: "dose_500",
      packagingNeedsReview: false,
    });
    expect(result.find((item) => item.name === "Pils")?.packagingNeedsReview).toBe(true);
  });

  it("recognizes flavours in a lemonade section and keeps their lazy-loaded images local", () => {
    const result = scan(`<section><h2>Unsere Limonaden</h2>
      <article><h3>Zitrone</h3><img src="data:image/gif;base64,AA" data-src="/assets/4711.webp"></article>
      <article><h3>Orange</h3><picture><source srcset="/assets/4712.webp 800w"><img src="/placeholder.png"></picture></article>
      </section><section><h2>Unser Team</h2><h3>Holunder</h3></section>`);
    expect(result.map((item) => [item.name, item.produktKategorie, item.etikettUrl])).toEqual([
      ["Orange", "limonade", "https://bier-brauerei.de/assets/4712.webp"],
      ["Zitrone", "limonade", "https://bier-brauerei.de/assets/4711.webp"],
    ]);
  });

  it("reads nested JSON-LD products with category evidence and image objects", () => {
    const result = scan(`<script type="application/ld+json">${JSON.stringify({ "@graph": [
      { "@type": "Product", name: "Zitrone", category: "Limonaden", image: { contentUrl: "/zitrone.webp" } },
      { "@type": "Product", name: "Pils Glas", category: "Bier", image: "/glas.jpg" },
    ] })}</script>`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Zitrone", produktKategorie: "limonade", etikettUrl: "https://bier-brauerei.de/zitrone.webp" });
  });

  it("deduplicates packaging, brand prefixes and image sizes without merging variants", () => {
    const result = scan("<h2>Testbrauerei Pils</h2><h2>Pils 0,5 l</h2><h2>Pils alkoholfrei</h2>", [
      catalogImage("https://example.com/pils-flasche-300x600.png"),
      catalogImage("https://example.com/pils-flasche-600x1200.png"),
      catalogImage("https://example.com/pils-alkoholfrei.png"),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((item) => item.name === "Testbrauerei Pils")?.etikettUrl).toContain("pils-flasche");
    expect(result.find((item) => item.name === "Pils alkoholfrei")?.etikettUrl).toContain("pils-alkoholfrei");
  });

  it("never assigns regular cola to zero or a different flavour by shared category", () => {
    const result = scan("<h2>Cola</h2><h2>Cola Zero</h2><h2>Limonade Orange</h2><h2>Limonade Zitrone</h2>", [
      catalogImage("https://example.com/cola.png"), catalogImage("https://example.com/limonade-orange.png"),
    ]);
    expect(result).toHaveLength(4);
    expect(result.find((item) => item.name === "Cola Zero")?.etikettUrl).toBe("");
    expect(result.find((item) => item.name === "Limonade Zitrone")?.etikettUrl).toBe("");
  });

  it("keeps multiple beer varieties even when the only image is an ambiguous pils", () => {
    const result = scan("<h2>Natur Pils</h2><h2>Premium Pils</h2>", [catalogImage("https://example.com/pils.png")]);
    expect(result.map((item) => item.name)).toEqual(["Natur Pils", "Premium Pils"]);
    expect(result.every((item) => !item.etikettUrl)).toBe(true);
  });

  it("rejects shared assortment artwork and keeps flavours from a page-level lemonade title", () => {
    const result = scan(`<h1>Limonaden</h1><article><h2>Zitrone</h2><img src="/sortiment.jpg"></article>
      <article><h2>Orange</h2><img src="/sortiment.jpg"></article>`);
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.produktKategorie === "limonade" && !item.etikettUrl)).toBe(true);
  });

  it("deduplicates spelling and packaging again when saving repeated scans", () => {
    const original = suggestedBeersToDashboard(scan("<h2>Müller Pils</h2>"));
    const suggestions = scan("<h2>Mueller-Pils 0,5 l</h2><h2>Mueller Pils</h2>");
    const replaced = replaceSuggestedBeers(original, suggestions);
    expect(replaced).toHaveLength(1);
    expect(replaced[0].id).toBe(original[0].id);
    expect(mergeSuggestedBeers(original, suggestions)).toHaveLength(1);
  });

  it("does not promote arbitrary packshots, CMS filenames or brewery paths to beers", () => {
    const files = ["tasse", "premium-original", "csm_Brauerei-geschenk_abcdef12", "pils-glas", "bier-shirt", "alkoholfrei", "flasche", "label", "original", "wasser"];
    const images = files.map((file) => catalogImage(`https://bier-brauerei.de/biere/${file}.jpg`));
    expect(scan("<h2>Willkommen</h2><h2>Getränke</h2>", images)).toEqual([]);
  });

  it("does not create varieties from image alt text or beer filenames alone", () => {
    const images = [
      { ...catalogImage("https://example.com/product-4711.jpg"), alt: "Sonnen Pils" },
      { ...catalogImage("https://example.com/helles.jpg"), alt: "Helles Bierglas" },
    ];
    const result = scan("", images);
    expect(result).toEqual([]);
    const confirmed = scan("<h2>Sonnen Pils</h2>", images);
    expect(confirmed.map((beer) => beer.name)).toEqual(["Sonnen Pils"]);
    expect(confirmed[0].etikettUrl).toContain("product-4711");
  });

  it("does not infer beers from substring matches such as saison or ipa", () => {
    expect(scan("<h2>Saison Angebote</h2><h2>Marzipan</h2><h2>Helles Glas</h2><h2>Lager Verkauf</h2>").map((beer) => beer.name)).toEqual([]);
  });

  it("keeps confirmed products without turning unrelated website images into varieties", () => {
    const pageUrl = "https://example.com/biere";
    const campaign = { ...catalogImage("https://example.com/sommer-bier-freunde.jpg"), alt: "Sommer Bier Freunde" };
    const result = extractBeerVarietiesFromIntake({
      pages: [{ pageUrl, title: "Biere", textBlocks: [], textExcerpt: "", imageCandidates: [campaign] }],
      downloadedImages: [catalogImage("https://example.com/helles-biergarten.jpg")],
      imageCandidates: [{ ...campaign, url: "https://example.com/pils-party.jpg", alt: "Pils Party" }],
      breweryName: "Testbrauerei",
      rawHtmlByUrl: { [pageUrl]: `<article><h2>Natur Pils</h2><img src="/natur-pils.png"></article>
        <img src="/weissbier-sommer.jpg" alt="Weissbier Sommer">` },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Natur Pils", etikettUrl: "https://example.com/natur-pils.png" });
  });

  it("maps common beer names to bierstil codes", () => {
    expect(inferBierstilFromName("Augustiner Pils")).toBe("pils");
    expect(inferBierstilFromName("Weissbier")).toBe("hefeweizen");
    expect(inferBierstilFromName("Alkoholfrei")).toBe("alkoholfrei_pilsner");
  });

  it("treats alkoholfrei as a property, not a style — Hell Alkoholfrei stays a Helles", () => {
    expect(inferBierstilFromName("ABK Hell Alkoholfrei")).toBe("helles");
    expect(inferBierstilFromName("Weißbier Alkoholfrei")).toBe("hefeweizen");
    expect(inferBierstilFromName("Radler alkoholfrei")).toBe("radler");
    expect(inferBierstilFromName("Pils 0,0")).toBe("pils");
  });

  it("keeps dark and festive German styles apart instead of rendering them as Helles or Märzen", () => {
    expect(inferBierstilFromName("Münchner Dunkel")).toBe("dunkel");
    expect(inferBierstilFromName("Dunkles Hefeweizen")).toBe("dunkles_weizen");
    expect(inferBierstilFromName("Weissbier Dunkel")).toBe("dunkles_weizen");
    expect(inferBierstilFromName("Aventinus Weizenbock")).toBe("weizenbock");
    expect(inferBierstilFromName("Salvator")).toBe("doppelbock");
    expect(inferBierstilFromName("Maibock")).toBe("maibock");
    expect(inferBierstilFromName("Oktoberfest Festbier")).toBe("festbier");
    expect(inferBierstilFromName("Märzen")).toBe("maerzen");
    expect(inferBierstilFromName("Köstritzer Schwarzbier")).toBe("schwarzbier");
    expect(inferBierstilFromName("Zwickel")).toBe("zwickel");
    expect(inferBierstilFromName("Moderator Pils")).toBe("pils");
    expect(inferBierstilFromName("Export Hell")).toBe("export");
  });

  it("humanizes product slugs with brewery prefix", () => {
    expect(humanizeBeerSlug("pils", "Augustiner-Bräu München")).toBe("Augustiner Pils");
  });

  it("does not infer an assortment even from plausible catalog image filenames", () => {
    const varieties = extractBeerVarietiesFromIntake({
      pages: [
        {
          pageUrl: "https://www.augustiner-braeu.de/unser-bier/",
          title: "Unser Bier",
          textBlocks: [],
          textExcerpt: "",
          imageCandidates: [],
        },
      ],
      downloadedImages: [
        catalogImage(
          "https://www.augustiner-braeu.de/fileadmin/_processed_/b/4/csm_Augustiner-pils_ce71e2324b.jpg",
        ),
        catalogImage(
          "https://www.augustiner-braeu.de/fileadmin/_processed_/f/7/csm_Augustiner-weissbier_0c0c0d5850.jpg",
        ),
        { ...catalogImage(
          "https://www.augustiner-braeu.de/fileadmin/_processed_/5/4/csm_Augustiner-alkoholfrei_60650aa974.jpg",
        ), alt: "Augustiner Alkoholfreies Bier" },
      ],
      breweryName: "Augustiner-Bräu München",
    });

    expect(varieties).toEqual([]);
  });

  it("maps long HTML names to shorter product image slugs", () => {
    const catalogImages: ImageCandidate[] = [
      {
        url: "https://brauerei.de/fileadmin/csm_Augustiner-alkoholfrei_60650aa974.jpg",
        alt: "",
        score: 56,
        productScore: 56,
        lifestyleScore: 40,
      },
      {
        url: "https://brauerei.de/fileadmin/csm_Augustiner-bock_8b0082fad4.jpg",
        alt: "",
        score: 56,
        productScore: 56,
        lifestyleScore: 40,
      },
      {
        url: "https://brauerei.de/fileadmin/csm_Augustiner-hell_d9ab0bfbf8.jpg",
        alt: "",
        score: 56,
        productScore: 56,
        lifestyleScore: 40,
      },
    ];
    const html = `
      <h2>Augustiner Alkoholfrei Hell</h2>
      <h2>Augustiner Heller Bock</h2>
      <h2>Augustiner Lagerbier Hell</h2>
    `;
    const varieties = extractBeerVarietiesFromIntake({
      pages: [
        {
          pageUrl: "https://brauerei.de/unser-bier/",
          title: "Sortiment",
          textBlocks: [],
          textExcerpt: "",
          imageCandidates: catalogImages,
        },
      ],
      downloadedImages: [],
      imageCandidates: catalogImages,
      breweryName: "Augustiner-Bräu München",
      rawHtmlByUrl: { "https://brauerei.de/unser-bier/": html },
    });

    const byName = Object.fromEntries(varieties.map((beer) => [beer.name, beer.etikettUrl]));
    expect(byName["Augustiner Alkoholfrei Hell"]).toContain("alkoholfrei");
    expect(byName["Augustiner Heller Bock"]).toContain("bock");
    expect(byName["Augustiner Lagerbier Hell"]).toContain("hell");
  });

  it("resolves etikett URLs from image candidates without download", () => {
    const varieties = extractBeerVarietiesFromIntake({
      pages: [
        {
          pageUrl: "https://www.augustiner-braeu.de/unser-bier/",
          title: "Unser Bier",
          textBlocks: [],
          textExcerpt: "",
          imageCandidates: [
            {
              url: "https://www.augustiner-braeu.de/fileadmin/_processed_/b/4/csm_Augustiner-pils_ce71e2324b.jpg",
              alt: "",
              score: 56,
              productScore: 56,
              lifestyleScore: 40,
            },
          ],
        },
      ],
      downloadedImages: [],
      imageCandidates: [
        {
          url: "https://www.augustiner-braeu.de/fileadmin/_processed_/b/4/csm_Augustiner-pils_ce71e2324b.jpg",
          alt: "",
          score: 56,
          productScore: 56,
          lifestyleScore: 40,
        },
      ],
      breweryName: "Augustiner-Bräu München",
      rawHtmlByUrl: { "https://www.augustiner-braeu.de/unser-bier/": "<h2>Augustiner Pils</h2>" },
    });

    expect(varieties.some((beer) => /pils/i.test(beer.name) && beer.etikettUrl.includes("Augustiner-pils"))).toBe(true);
  });

  it("backfills etikett on existing beers with matching names", () => {
    const merged = mergeSuggestedBeers(
      [{ id: "beer-1", name: "Augustiner Pils", bierstil: "pils", flaschenTyp: "nrw_500", flaschenfarbe: "braun", etikettUrl: "", createdAt: "" }],
      [
        {
          name: "Augustiner Pils",
          bierstil: "pils",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          glasTyp: "pils_tulpe",
          etikettUrl: "https://example.com/pils.jpg",
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.etikettUrl).toBe("https://example.com/pils.jpg");
  });

  it("matches generic WordPress product filenames and alt text to beer names", () => {
    const html = `
      <h2>Da Helles</h2>
      <img src="/wp-content/uploads/da-helles-flasche.jpg" alt="Da Helles Flasche" />
      <h2>Da Pils</h2>
      <img src="/wp-content/uploads/da-pils.jpg" alt="Da Pils" />
    `;
    const varieties = extractBeerVarietiesFromIntake({
      pages: [
        {
          pageUrl: "https://brauerei-beispiel.de/biere/",
          title: "Biere",
          textBlocks: [],
          textExcerpt: "",
          imageCandidates: [],
        },
      ],
      downloadedImages: [],
      breweryName: "Brauerei Beispiel",
      rawHtmlByUrl: { "https://brauerei-beispiel.de/biere/": html },
    });

    const byName = Object.fromEntries(varieties.map((beer) => [beer.name, beer.etikettUrl]));
    expect(byName["Da Helles"]).toContain("da-helles-flasche");
    expect(byName["Da Pils"]).toContain("da-pils");
  });

  it("merges suggested beers without duplicating existing names", () => {
    const merged = mergeSuggestedBeers(
      [{ id: "beer-1", name: "Augustiner Pils", bierstil: "pils", flaschenTyp: "nrw_500", flaschenfarbe: "braun", etikettUrl: "", createdAt: "" }],
      [
        {
          name: "Augustiner Pils",
          bierstil: "pils",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          glasTyp: "pils_tulpe",
          etikettUrl: "https://example.com/pils.jpg",
        },
        {
          name: "Augustiner Dunkel",
          bierstil: "helles",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          glasTyp: "willibecher",
          etikettUrl: "https://example.com/dunkel.jpg",
        },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged.some((beer) => beer.name === "Augustiner Dunkel")).toBe(true);
  });

  it("suggestedBeersToDashboard replaces instead of keeping foreign brands", () => {
    const replaced = suggestedBeersToDashboard([
      {
        name: "Lang Bräu Helles",
        bierstil: "helles",
        flaschenTyp: "nrw_500",
        flaschenfarbe: "braun",
        glasTyp: "willibecher",
        etikettUrl: "https://langbraeu.de/helles.jpg",
      },
    ]);

    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.name).toBe("Lang Bräu Helles");
  });

  it("replaceSuggestedBeers drops foreign brands but keeps matching etikett", () => {
    const replaced = replaceSuggestedBeers(
      [
        {
          id: "beer-abk",
          name: "Abk Beer",
          bierstil: "helles",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          etikettUrl: "https://abk.example/abk.jpg",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "beer-lang",
          name: "Lang Bräu Helles",
          bierstil: "helles",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          etikettUrl: "https://lang.example/helles.jpg",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          name: "Lang Bräu Helles",
          bierstil: "helles",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          glasTyp: "willibecher",
          etikettUrl: "",
        },
        {
          name: "Lang Bräu Pils",
          bierstil: "pils",
          flaschenTyp: "nrw_500",
          flaschenfarbe: "braun",
          glasTyp: "pils_tulpe",
          etikettUrl: "https://lang.example/pils.jpg",
        },
      ],
    );

    expect(replaced.map((beer) => beer.name)).toEqual(["Lang Bräu Helles", "Lang Bräu Pils"]);
    expect(replaced[0]?.id).toBe("beer-lang");
    expect(replaced[0]?.etikettUrl).toBe("https://lang.example/helles.jpg");
    expect(replaced.some((beer) => beer.name === "Abk Beer")).toBe(false);
  });
});

describe("replaceSuggestedBeers bei Neuscan derselben Marke", () => {
  const userBeer = {
    id: "beer-eigen",
    name: "Lang Bräu Festbier",
    bierstil: "festbier",
    flaschenTyp: "euro_500",
    flaschenfarbe: "braun" as const,
    etikettUrl: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    nutzerBestaetigt: true,
  };
  const correctedBeer = {
    id: "beer-helles",
    name: "Lang Bräu Helles",
    bierstil: "helles",
    flaschenTyp: "steinie_500",
    flaschenfarbe: "gruen" as const,
    glasTyp: "masskrug",
    etikettUrl: "https://lang.example/helles.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    nutzerBestaetigt: true,
  };
  const scan = [
    {
      name: "Lang Bräu Helles",
      bierstil: "helles",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun" as const,
      glasTyp: "willibecher",
      etikettUrl: "https://lang.example/neu.jpg",
      nachweis: { status: "belegt" as const },
      bierstilBelegt: true,
    },
    {
      name: "Lang Bräu Pils",
      bierstil: "pils",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "gruen" as const,
      glasTyp: "pilstulpe",
      etikettUrl: "",
      nachweis: { status: "unbestaetigt" as const },
      bierstilBelegt: false,
    },
  ];

  it("behält vom Nutzer angelegte Sorten und seine Korrekturen", () => {
    const replaced = replaceSuggestedBeers([userBeer, correctedBeer], scan, { keepUserConfirmed: true });
    const helles = replaced.find((beer) => beer.id === "beer-helles");
    expect(helles?.flaschenTyp).toBe("steinie_500");
    expect(helles?.glasTyp).toBe("masskrug");
    expect(helles?.etikettUrl).toBe("https://lang.example/helles.jpg");
    expect(helles?.nachweisStatus).toBe("belegt");
    expect(replaced.some((beer) => beer.id === "beer-eigen")).toBe(true);
    const pils = replaced.find((beer) => beer.name === "Lang Bräu Pils");
    expect(pils?.nachweisStatus).toBe("unbestaetigt");
    expect(pils?.bierstilBelegt).toBe(false);
  });

  it("ohne Option (Markenwechsel) bleibt das bisherige Verhalten: Scan ersetzt das Sortiment", () => {
    const replaced = replaceSuggestedBeers([userBeer, correctedBeer], scan);
    expect(replaced.some((beer) => beer.id === "beer-eigen")).toBe(false);
    expect(replaced.find((beer) => beer.id === "beer-helles")?.flaschenTyp).toBe("nrw_500");
  });
});
