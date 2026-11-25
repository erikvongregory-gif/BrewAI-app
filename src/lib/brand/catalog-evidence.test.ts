import { describe, expect, it } from "vitest";
import {
  annotateBeersWithEvidence,
  buildCatalogEvidenceCorpus,
  collectCatalogCards,
  inferBierstilWithEvidence,
} from "@/lib/brand/catalog-ai";
import { findNameEvidence } from "@/lib/brand/brand-evidence";
import { inferBierstilFromName, inferBierstilFromNameDetailed } from "@/app/(dashboard)/inhalte-erstellen/lib/beer-styles";
import type { SuggestedBeerVariety } from "@/lib/brand/beer-catalog-intake";

const SORTIMENT_HTML = `<html><head><title>Unsere Biere – Brauerei Sonnenhof</title></head><body>
<h2>Sortiment</h2>
<ul>
  <li><a href="/biere/schwarze-anna"><img src="/media/schwarze-anna-05.png" alt="Schwarze Anna Schwarzbier"><span>Schwarze Anna</span></a></li>
  <li><a href="/biere/hell"><img src="/media/sonnenhof-hell.png" alt="Sonnenhof Hell"><span>Sonnenhof Hell</span></a></li>
  <li><a href="/biere/jubilaeum"><img src="/media/jubi.png" alt="Jubiläumstrunk"><span>Jubiläumstrunk</span></a></li>
</ul></body></html>`;

function beer(name: string, extra: Partial<SuggestedBeerVariety> = {}): SuggestedBeerVariety {
  return {
    name,
    produktKategorie: "bier",
    bierstil: inferBierstilFromName(name),
    flaschenTyp: "nrw_500",
    flaschenfarbe: "braun",
    glasTyp: "willibecher",
    etikettUrl: "",
    ...extra,
  };
}

describe("Bierstil mit Beleg", () => {
  it("unterscheidet belegten Stil von „helles“ als Standard", () => {
    expect(inferBierstilFromNameDetailed("Sonnenhof Hell")).toEqual({ bierstil: "helles", matched: true });
    expect(inferBierstilFromNameDetailed("Jubiläumstrunk")).toEqual({ bierstil: "helles", matched: false });
    // Bestehendes Verhalten bleibt: ohne Hinweis weiterhin „helles“.
    expect(inferBierstilFromName("Jubiläumstrunk")).toBe("helles");
  });

  it("nutzt Alt-Text/Seitentitel nur, wenn sie genau diese Sorte nennen", () => {
    expect(inferBierstilWithEvidence({ name: "Schwarze Anna", imageAlt: "Schwarze Anna Schwarzbier" })).toEqual({
      bierstil: "schwarzbier",
      belegt: true,
    });
    // Übersichtsseite nennt andere Stile, aber nicht diese Sorte → kein Beleg.
    expect(
      inferBierstilWithEvidence({ name: "Jubiläumstrunk", pageTitle: "Unsere Biere: Pils, Weizen, Dunkel" }),
    ).toEqual({ bierstil: "helles", belegt: false });
  });
});

describe("Sortiment-Belege", () => {
  const { cards, pages } = collectCatalogCards({ "https://sonnenhof.example/biere": SORTIMENT_HTML });
  const corpus = buildCatalogEvidenceCorpus({
    cards,
    pages,
    rawHtmlByUrl: { "https://sonnenhof.example/biere": SORTIMENT_HTML },
  });

  it("findet echte Sorten im Quelltext und erkennt erfundene", () => {
    expect(findNameEvidence("Schwarze Anna", corpus).status).toBe("belegt");
    expect(findNameEvidence("Jubiläumstrunk", corpus).status).toBe("belegt");
    expect(findNameEvidence("Sonnenhof Kellerbier", corpus).status).toBe("unbestaetigt");
  });

  it("Regel-Erkennung bekommt Belege und Stil-Prüfhinweis, ohne Sorten zu verwerfen", () => {
    const result = annotateBeersWithEvidence(
      [beer("Sonnenhof Hell"), beer("Jubiläumstrunk"), beer("Sonnenhof Kellerbier")],
      { "https://sonnenhof.example/biere": SORTIMENT_HTML },
    );
    expect(result).toHaveLength(3);
    expect(result.map((entry) => entry.nachweis?.status)).toEqual(["belegt", "belegt", "unbestaetigt"]);
    expect(result.map((entry) => entry.bierstilBelegt)).toEqual([true, false, true]);
    expect(result[0]?.nachweis?.fundstelle).toBeTruthy();
  });

  it("vorhandene Belege werden nicht überschrieben", () => {
    const result = annotateBeersWithEvidence(
      [beer("X", { nachweis: { status: "belegt", fundstelle: "X" }, bierstilBelegt: true })],
      {},
    );
    expect(result[0]?.nachweis).toEqual({ status: "belegt", fundstelle: "X" });
    expect(result[0]?.bierstilBelegt).toBe(true);
  });
});

describe("Stil-Erkennung: Radler vor Pils (Fachkorrektur Audit 05)", () => {
  it("erkennt Pils-Radler und Alsterwasser als Radler", () => {
    expect(inferBierstilFromName("Pils Radler")).toBe("radler");
    expect(inferBierstilFromName("Pilsradler")).toBe("radler");
    expect(inferBierstilFromName("Alsterwasser")).toBe("radler");
    expect(inferBierstilFromName("Sonnenhof Pils")).toBe("pils");
  });
});
