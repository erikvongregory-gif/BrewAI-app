import { describe, expect, it } from "vitest";
import {
  ALCOHOL_AD_RULES,
  COMPLIANCE_DISCLAIMER,
  COMPLIANCE_SOURCES,
  checkAdCompliance,
  checkAdComplianceMany,
  resolveBeverage,
  type ComplianceContentKind,
} from "./index";

function ruleIds(text: string, kind: ComplianceContentKind = "werbetext", alcoholFree?: boolean) {
  return checkAdCompliance({ text, kind, beverage: alcoholFree === undefined ? undefined : { alcoholFree } }).findings.map(
    (finding) => finding.ruleId,
  );
}

describe("checkAdCompliance – harmlose Texte schlagen nicht an", () => {
  const harmless: Array<[string, ComplianceContentKind]> = [
    ["Unser Helles: mild, spritzig und mit feiner Hopfennote. Perfekt für einen Abend im Biergarten mit Freunden. Prost!", "caption"],
    ["Frisch gezapft und eiskalt – das neue Kellerbier ist da. Jetzt in unserem Brauereiladen erhältlich.", "werbetext"],
    ["Gebraut nach dem Reinheitsgebot von 1516 in unserer Familienbrauerei seit 1888.", "werbetext"],
    ["Feierabend! Zeit für ein kühles Pils. Zum Wohl!", "caption"],
    ["Unser Bockbier zur Starkbierzeit – malzig, vollmundig, 7,2 % vol.", "werbetext"],
    ["Dichte Schaumkrone, goldene Farbe, feinperlige Kohlensäure.", "werbetext"],
    ["Kinderleicht bestellen in unserem Onlineshop. Happy Biertag!", "werbetext"],
    ["Prost und auf eure Gesundheit – wir feiern 125 Jahre Brauerei!", "caption"],
    ["#bier #craftbeer #brauerei #helles #franken #biergarten", "hashtags"],
    ["Unser Braumeister bei der Arbeit im Sudhaus – Handwerk seit Generationen.", "werbetext"],
    ["Berliner Kindl Weisse im Glas, frisch und spritzig.", "werbetext"],
    [
      "Golden lager in a frosted glass on a wooden table in a sunny beer garden, two adult friends around 30 years old toasting, shallow depth of field, natural light, candle-lit lanterns.",
      "bildprompt",
    ],
    ["Product shot of a brown 0.5 l bottle with condensation, studio lighting, dark slate background, one of a kind label design.", "bildprompt"],
    ["Happy Hour ab 16 Uhr im Bräustüberl.", "caption"],
  ];

  it.each(harmless)("keine Hinweise für: %s", (text, kind) => {
    const report = checkAdCompliance({ text, kind });
    expect(report.findings.map((f) => `${f.ruleId}:${f.match.text}`).filter((id) => !id.startsWith("excess-mild"))).toEqual([]);
    expect(report.highestSeverity === null || report.highestSeverity === "niedrig").toBe(true);
  });

  it("liefert für leeren oder fehlerhaften Input einen leeren Bericht", () => {
    expect(checkAdCompliance({ text: "" }).findings).toEqual([]);
    expect(checkAdCompliance({ text: undefined as unknown as string }).findings).toEqual([]);
    expect(checkAdCompliance({ text: "" }).summary).toContain("Keine typischen Risiko-Formulierungen");
  });
});

describe("checkAdCompliance – Gesundheits- und Nährwertaussagen", () => {
  it("erkennt „bekömmlich“ mit Fundstelle und BGH-Quelle", () => {
    const text = "Unser Pils ist besonders bekömmlich.";
    const report = checkAdCompliance({ text });
    const finding = report.findings.find((f) => f.ruleId === "health-bekoemmlich");
    expect(finding?.severity).toBe("hoch");
    expect(finding?.match.text).toBe("bekömmlich");
    expect(finding?.match.index).toBe(text.indexOf("bekömmlich"));
    expect(finding?.sources.map((s) => s.id)).toEqual(["bgh-bekoemmlich", "hcvo"]);
    expect(report.highestSeverity).toBe("hoch");
  });

  it("erkennt Umschreibungen ohne Umlaut und in Großschreibung", () => {
    expect(ruleIds("BEKOEMMLICH und frisch")).toContain("health-bekoemmlich");
    expect(ruleIds("Das bekömmlichste Bier im Landkreis")).toContain("health-bekoemmlich");
  });

  it("erkennt Gesundheitsversprechen in Deutsch und Englisch", () => {
    expect(ruleIds("Gesund und lecker – unser Weißbier")).toContain("health-claim");
    expect(ruleIds("Bier ist die beste Medizin")).toContain("health-claim");
    expect(ruleIds("Gut für die Verdauung nach dem Schweinebraten")).toContain("health-claim");
    expect(ruleIds("Stärkt das Immunsystem im Winter")).toContain("health-claim");
    expect(ruleIds("A healthy choice for every barbecue", "caption")).toContain("health-claim");
  });

  it("stuft Gesundheitsaussagen bei alkoholfreien Getränken als mittel ein", () => {
    const report = checkAdCompliance({ text: "Isotonisch und gesund nach dem Sport", beverage: { alcoholFree: true } });
    expect(report.beverageAssumption).toBe("alkoholfrei");
    expect(report.findings.map((f) => [f.ruleId, f.severity])).toEqual([
      ["health-sport-claim", "mittel"],
      ["health-claim", "mittel"],
    ]);
    expect(report.findings[1]?.message).toContain("alkoholfreien");
  });

  it("nutzt den Alkoholgehalt: bis 1,2 % vol wie alkoholfrei, darüber wie alkoholhaltig", () => {
    expect(checkAdCompliance({ text: "isotonisch", beverage: { abv: 0.4 } }).findings[0]?.severity).toBe("mittel");
    expect(checkAdCompliance({ text: "isotonisch", beverage: { abv: 4.9 } }).findings[0]?.severity).toBe("hoch");
  });

  it("markiert nährwertbezogene Angaben bei alkoholhaltigen Getränken", () => {
    const report = checkAdCompliance({ text: "Zuckerfrei und kalorienarm – das neue Pils" });
    expect(report.findings.map((f) => f.ruleId)).toEqual(["nutrition-claim", "nutrition-claim"]);
    expect(report.findings.every((f) => f.severity === "mittel")).toBe(true);
  });

  it("weist auf den Trinkspruch „Wohl bekomm's“ nur gering hin", () => {
    const report = checkAdCompliance({ text: "Wohl bekomm's!" });
    expect(report.findings.map((f) => [f.ruleId, f.severity])).toEqual([["health-wohl-bekomms", "niedrig"]]);
  });

  it("erkennt Heilberufe in Bild-Prompts", () => {
    expect(ruleIds("A doctor in a white lab coat holding a beer", "bildprompt")).toContain("health-professional");
    expect(ruleIds("Hausärztin empfiehlt unser Dunkles")).toContain("health-professional");
  });
});

describe("checkAdCompliance – Werberat-Themen", () => {
  it("erkennt Aufforderungen zu übermäßigem Konsum", () => {
    const report = checkAdCompliance({ text: "Heute wird gesoffen! Flatrate bis zum Umfallen." });
    expect(report.findings.filter((f) => f.ruleId === "excess-consumption")).toHaveLength(3);
    expect(report.counts.hoch).toBeGreaterThanOrEqual(3);
  });

  it("erkennt Exzess-Motive in englischen Bild-Prompts", () => {
    expect(ruleIds("Group of drunk people playing beer pong at a party", "bildprompt")).toEqual(
      expect.arrayContaining(["excess-consumption"]),
    );
  });

  it("erkennt die Ansprache Minderjähriger", () => {
    expect(ruleIds("Das perfekte Bier für die Abifeier")).toContain("minors-direct");
    expect(ruleIds("Schon ab 16 Jahren dabei – Prost!")).toContain("minors-direct");
    expect(ruleIds("teenage girl holding a beer bottle", "bildprompt")).toEqual(
      expect.arrayContaining(["minors-image"]),
    );
    expect(ruleIds("Schoolgirls cheering with beer", "bildprompt")).toContain("minors-direct");
  });

  it("hebt verantwortungsvolle Hinweise mit Verneinung nicht hervor", () => {
    expect(ruleIds("Kein Alkohol an Kinder und Jugendliche.")).toEqual([]);
    expect(ruleIds("Abgabe nicht an Personen unter 18 Jahren.")).toEqual([]);
    expect(ruleIds("Kein Bier am Steuer.")).toEqual([]);
    expect(ruleIds("Nicht saufen, genießen!")).toEqual([]);
  });

  it("lässt „nicht nur“ nicht als Verneinung gelten", () => {
    expect(ruleIds("Nicht nur für Kinder ein Erlebnis")).toContain("minors-direct");
  });

  it("verbindet Alkohol und Fahren als hohes Risiko", () => {
    const report = checkAdCompliance({ text: "Noch ein Helles und dann ab nach Hause fahren." });
    expect(report.findings.find((f) => f.ruleId === "driving")?.severity).toBe("hoch");
    expect(ruleIds("Man drinking beer behind the wheel of a car", "bildprompt")).toEqual(
      expect.arrayContaining(["driving", "vehicle-mention"]),
    );
  });

  it("erkennt Leistungs-, Sport- und Erfolgsversprechen", () => {
    expect(ruleIds("Macht dich fit für jedes Workout")).toEqual(expect.arrayContaining(["performance-claim", "sport-active"]));
    expect(ruleIds("Mehr Power für den Feierabend")).toContain("performance-phrase");
    expect(ruleIds("Mit diesem Bier klappt's beim Flirten")).toContain("social-sexual-success");
    expect(ruleIds("Macht dich unwiderstehlich")).toContain("social-sexual-success");
    expect(ruleIds("sexy woman in lingerie with a beer", "bildprompt")).toContain("sexualized-image");
  });

  it("erkennt Stress-, Problem- und Enthemmungsversprechen", () => {
    expect(ruleIds("Vergiss deinen Stress – ein Bier und alles ist gut")).toContain("mood-anxiety");
    expect(ruleIds("Erstmal Mut antrinken")).toContain("mood-anxiety");
  });

  it("erkennt den Alkoholgehalt als Kaufargument, aber nicht sachliche Angaben", () => {
    expect(ruleIds("Extra stark – haut richtig rein")).toEqual(["alcohol-strength", "alcohol-strength"]);
    expect(ruleIds("Unser Doppelbock mit 7,5 % vol")).toEqual([]);
  });

  it("erkennt die Abwertung von Abstinenz", () => {
    expect(ruleIds("Wasser ist was für Weicheier")).toContain("abstinence-disparaging");
  });

  it("erkennt Schwangerschaft als Zielgruppe", () => {
    expect(ruleIds("Auch in der Schwangerschaft ein Genuss")).toContain("pregnancy");
  });
});

describe("checkAdCompliance – Alkoholfrei-Sonderfälle", () => {
  it("lässt Sportbezug bei alkoholfreien Sorten zu", () => {
    expect(ruleIds("Alkoholfreies Weißbier – erfrischend nach dem Sport", "caption", true)).toEqual([]);
  });

  it("weist bei alkoholfrei und sensiblen Gruppen auf Restalkohol hin", () => {
    const report = checkAdCompliance({ text: "Alkoholfrei und ideal für Autofahrer", beverage: { alcoholFree: true } });
    const finding = report.findings.find((f) => f.ruleId === "alcohol-free-target-groups");
    expect(finding?.severity).toBe("mittel");
    expect(finding?.message).toContain("Restalkohol");
  });

  it("nimmt ohne Angabe vorsichtshalber ein alkoholhaltiges Getränk an", () => {
    const report = checkAdCompliance({ text: "isotonisch" });
    expect(report.beverageAssumed).toBe(true);
    expect(report.summary).toContain("Annahme: alkoholhaltiges Getränk");
    expect(resolveBeverage({ alcoholFree: false })).toEqual({ assumption: "alkoholhaltig", assumed: false });
  });
});

describe("checkAdCompliance – Irreführung und reale Personen", () => {
  it("weist auf Spitzenstellungs- und Selbstverständlichkeitswerbung hin", () => {
    expect(ruleIds("Das beste Bier der Welt")).toContain("uwg-superlative");
    expect(ruleIds("Ohne Konservierungsstoffe gebraut")).toContain("uwg-selbstverstaendlichkeit");
    expect(ruleIds("Die Nr. 1 in Franken")).toContain("uwg-superlative");
  });

  it("erkennt Prominente und Deepfakes nur in Bild-Prompts", () => {
    expect(ruleIds("famous actor drinking our lager", "bildprompt")).toContain("real-person-likeness");
    expect(ruleIds("famous actor drinking our lager", "caption")).not.toContain("real-person-likeness");
    expect(ruleIds("Promille-Grenze beachten", "bildprompt")).not.toContain("real-person-likeness");
  });
});

describe("checkAdCompliance – Berichtsformat", () => {
  it("sortiert nach Schweregrad, dedupliziert Überlappungen und bleibt deterministisch", () => {
    const text = "Wohl bekomm's! Unser Bier ist gesund und macht dich fit fürs Autofahren.";
    const first = checkAdCompliance({ text, kind: "caption" });
    const second = checkAdCompliance({ text, kind: "caption" });
    expect(first).toEqual(second);
    const severities = first.findings.map((f) => f.severity);
    expect(severities).toEqual([...severities].sort((a, b) => ({ hoch: 3, mittel: 2, niedrig: 1 })[b] - ({ hoch: 3, mittel: 2, niedrig: 1 })[a]));
    expect(first.summary).toMatch(/Hinweise auf mögliche Risiken/);
  });

  it("formuliert nie eine Freigabe oder Rechtssicherheit", () => {
    const texts = [COMPLIANCE_DISCLAIMER, ...ALCOHOL_AD_RULES.flatMap((rule) => [rule.message, rule.alcoholFreeMessage ?? "", rule.suggestion])];
    for (const text of texts) {
      expect(text).not.toMatch(/rechtssicher|rechtlich geprüft|freigegeben|garantiert zulässig/i);
    }
    expect(COMPLIANCE_DISCLAIMER).toContain("keine Rechtsberatung");
  });

  it("verweist jede Regel auf mindestens eine registrierte Quelle mit Abrufdatum", () => {
    for (const rule of ALCOHOL_AD_RULES) {
      expect(rule.sources.length).toBeGreaterThan(0);
      for (const id of rule.sources) {
        expect(COMPLIANCE_SOURCES[id].url).toMatch(/^https:\/\//);
        expect(COMPLIANCE_SOURCES[id].retrievedAt).toBe("2026-11-09");
      }
    }
    expect(new Set(ALCOHOL_AD_RULES.map((rule) => rule.id)).size).toBe(ALCOHOL_AD_RULES.length);
  });

  it("begrenzt Treffer je Regel und kürzt sehr lange Texte", () => {
    const report = checkAdCompliance({ text: "saufen ".repeat(50) });
    expect(report.findings.filter((f) => f.ruleId === "excess-consumption")).toHaveLength(3);
    const long = checkAdCompliance({ text: `${"a".repeat(25_000)} bekömmlich` });
    expect(long.findings).toEqual([]);
  });

  it("prüft mehrere Varianten in gleicher Reihenfolge", () => {
    const reports = checkAdComplianceMany([{ text: "Prost!" }, { text: "bekömmlich" }]);
    expect(reports.map((r) => r.findings.length)).toEqual([0, 1]);
  });
});
