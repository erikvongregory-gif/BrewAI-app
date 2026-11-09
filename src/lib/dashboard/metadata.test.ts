import { describe, expect, it } from "vitest";
import { MAX_MY_BEERS, hasUsableBeerEtikett, markUserEditedBeers, sanitizeDashboardBeers } from "./metadata";

describe("sanitizeDashboardBeers", () => {
  it("liefert leere Liste fuer ungueltige Eingaben", () => {
    expect(sanitizeDashboardBeers(undefined)).toEqual([]);
    expect(sanitizeDashboardBeers("nope")).toEqual([]);
    expect(sanitizeDashboardBeers([{ name: "ohne id" }, { id: "ohne-name" }])).toEqual([]);
  });

  it("uebernimmt gueltige Biere und setzt Defaults", () => {
    const [beer] = sanitizeDashboardBeers([
      { id: "b1", name: "  Falter Hell  ", flaschenfarbe: "lila" },
    ]);
    expect(beer).toEqual({
      id: "b1",
      name: "Falter Hell",
      produktKategorie: "bier",
      bierstil: "helles",
      flaschenTyp: "nrw_500",
      flaschenfarbe: "braun",
      etikettUrl: "",
      createdAt: "",
    });
  });

  it("behaelt gueltige Werte bei", () => {
    const [beer] = sanitizeDashboardBeers([
      {
        id: "b2",
        name: "Wiesn Märzen",
        bierstil: "maerzen",
        flaschenTyp: "buegel_500",
        flaschenfarbe: "gruen",
        etikettUrl: "https://cdn.example.com/etikett.jpg",
        createdAt: "2026-08-25T10:00:00.000Z",
      },
    ]);
    expect(beer.bierstil).toBe("maerzen");
    expect(beer.flaschenTyp).toBe("buegel_500");
    expect(beer.flaschenfarbe).toBe("gruen");
    expect(beer.etikettUrl).toBe("https://cdn.example.com/etikett.jpg");
  });

  it("setzt fehlende Kategorie auf Bier und behaelt Limonade", () => {
    const [legacy] = sanitizeDashboardBeers([{ id: "b3", name: "Helles" }]);
    expect(legacy?.produktKategorie).toBe("bier");
    const [limo] = sanitizeDashboardBeers([
      { id: "b4", name: "Spezi", produktKategorie: "limonade", bierstil: "spezi" },
    ]);
    expect(limo?.produktKategorie).toBe("limonade");
    expect(limo?.bierstil).toBe("spezi");
    expect(limo?.flaschenfarbe).toBe("klar");
  });

  it("deckelt auf MAX_MY_BEERS Eintraege", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `b${i}`, name: `Bier ${i}` }));
    expect(sanitizeDashboardBeers(many)).toHaveLength(MAX_MY_BEERS);
  });
});

describe("hasUsableBeerEtikett", () => {
  it("erkennt nur dauerhaft ladbare HTTPS-URLs als nutzbar", () => {
    expect(hasUsableBeerEtikett("https://cdn.example.com/etikett.jpg")).toBe(true);
    expect(hasUsableBeerEtikett("https://tempfile.redpandaai.co/abc.jpg")).toBe(false);
    expect(hasUsableBeerEtikett("https://foo.tempfile.ai/x.png")).toBe(false);
    expect(hasUsableBeerEtikett("")).toBe(false);
    expect(hasUsableBeerEtikett("data:image/jpeg;base64,aaa")).toBe(false);
  });
});

describe("Scan-Belege und Nutzerbestätigung im Sortiment", () => {
  const scannedBeer = {
    id: "beer-1",
    name: "Lang Bräu Helles",
    bierstil: "helles",
    flaschenTyp: "nrw_500",
    flaschenfarbe: "braun" as const,
    etikettUrl: "https://lang.example/helles.jpg",
    createdAt: "2026-01-01T00:00:00.000Z",
    nachweisStatus: "belegt" as const,
    bierstilBelegt: false,
  };

  it("sanitizeDashboardBeers behält nur gültige Beleg-Felder", () => {
    const [beer] = sanitizeDashboardBeers([{ ...scannedBeer, nutzerBestaetigt: "ja", nachweisStatus: "vielleicht" }]);
    expect(beer?.bierstilBelegt).toBe(false);
    expect(beer).not.toHaveProperty("nachweisStatus");
    expect(beer).not.toHaveProperty("nutzerBestaetigt");
  });

  it("markUserEditedBeers: unverändert behält Scan-Belege, geändert wird bestätigt, neu ist bestätigt", () => {
    const stored = sanitizeDashboardBeers([scannedBeer]);
    // Das API-Schema kennt die Beleg-Felder nicht: eingehende Sorten kommen ohne sie an.
    const { nachweisStatus: _n, bierstilBelegt: _b, ...incomingSame } = scannedBeer;
    void _n;
    void _b;
    const [same] = markUserEditedBeers([incomingSame], stored);
    expect(same?.nachweisStatus).toBe("belegt");
    expect(same?.bierstilBelegt).toBe(false);
    expect(same).not.toHaveProperty("nutzerBestaetigt");

    const [edited] = markUserEditedBeers([{ ...incomingSame, bierstil: "dunkel" }], stored);
    expect(edited?.nutzerBestaetigt).toBe(true);
    expect(edited?.bierstil).toBe("dunkel");

    const [created] = markUserEditedBeers([{ ...incomingSame, id: "beer-neu", name: "Festbier" }], stored);
    expect(created?.nutzerBestaetigt).toBe(true);
  });
});
