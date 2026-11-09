import type { ComplianceSourceId } from "./sources";

/**
 * Regelwerk für Hinweise zu Alkoholwerbung (deterministisch, ohne KI).
 *
 * Grundlage: Verhaltensregeln des Deutschen Werberats für alkoholhaltige Getränke
 * (Selbstregulierung, Fassung Januar 2026), Art. 4 Abs. 3 Health-Claims-Verordnung,
 * BGH „bekömmlich“, § 5 UWG. Die Treffer sind Hinweise auf mögliche Risiken – keine
 * rechtliche Bewertung und keine Freigabe.
 */

export type ComplianceSeverity = "hoch" | "mittel" | "niedrig";

export type ComplianceContentKind = "werbetext" | "caption" | "hashtags" | "bildprompt";

export type ComplianceCategory =
  | "gesundheit"
  | "naehrwert"
  | "leistung"
  | "sport-sicherheit"
  | "strassenverkehr"
  | "jugendschutz"
  | "missbrauch"
  | "erfolg"
  | "stimmung"
  | "alkoholgehalt"
  | "alkoholfrei"
  | "irrefuehrung"
  | "persoenlichkeitsrecht";

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  gesundheit: "Gesundheitsbezogene Aussage",
  naehrwert: "Nährwertbezogene Aussage",
  leistung: "Leistungssteigerung",
  "sport-sicherheit": "Sport und Sicherheit",
  strassenverkehr: "Alkohol und Straßenverkehr",
  jugendschutz: "Kinder und Jugendliche",
  missbrauch: "Übermäßiger Konsum",
  erfolg: "Sozialer oder sexueller Erfolg",
  stimmung: "Enthemmung, Stress, Probleme",
  alkoholgehalt: "Alkoholgehalt als Kaufargument",
  alkoholfrei: "Alkoholfrei-Sonderfall",
  irrefuehrung: "Mögliche Irreführung",
  persoenlichkeitsrecht: "Reale Personen",
};

export type AlcoholAdRule = {
  id: string;
  category: ComplianceCategory;
  /** Schweregrad je Getränkeart; `null` = Regel greift dort nicht. */
  severity: { alkoholhaltig: ComplianceSeverity | null; alkoholfrei: ComplianceSeverity | null };
  /** Standard: alle Textarten. */
  kinds?: readonly ComplianceContentKind[];
  title: string;
  message: string;
  /** Abweichender Hinweis für alkoholfreie Getränke (≤ 1,2 % vol bzw. als alkoholfrei bezeichnet). */
  alcoholFreeMessage?: string;
  suggestion: string;
  patterns: readonly RegExp[];
  /** Verneinung kurz vor dem Treffer („kein Alkohol am Steuer“) hebt den Treffer auf. */
  negatable?: boolean;
  sources: readonly ComplianceSourceId[];
};

const BOUNDARY = String.raw`[\p{L}\p{N}]`;

function umlautize(pattern: string): string {
  return pattern
    .replace(/ä/g, "(?:ä|ae)")
    .replace(/ö/g, "(?:ö|oe)")
    .replace(/ü/g, "(?:ü|ue)")
    .replace(/ß/g, "(?:ß|ss)");
}

/** Ganze Wörter/Wortgruppen, Groß-/Kleinschreibung egal, Umlaute auch als ae/oe/ue/ss. */
export function termPattern(...alternatives: string[]): RegExp {
  const body = alternatives.map(umlautize).join("|");
  return new RegExp(`(?<!${BOUNDARY})(?:${body})(?!${BOUNDARY})`, "giu");
}

const W = String.raw`\p{L}*`;
const S = String.raw`\s+`;

const WERBERAT_FREE_NOTE =
  "Die Werberat-Regeln gelten nicht für Getränke, die als alkoholfrei bezeichnet werden dürfen. Bei Werbung unter einer Dachmarke kann die Aussage trotzdem auf die alkoholhaltigen Produkte ausstrahlen (Einschätzung).";

export const ALCOHOL_AD_RULES: readonly AlcoholAdRule[] = [
  {
    id: "health-bekoemmlich",
    category: "gesundheit",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "„bekömmlich“",
    message:
      "Der BGH hat „bekömmlich“ in der Bierwerbung als gesundheitsbezogene Angabe eingeordnet. Für Getränke mit mehr als 1,2 % vol sind solche Angaben nach Art. 4 Abs. 3 HCVO nicht erlaubt.",
    alcoholFreeMessage:
      "„bekömmlich“ gilt nach BGH als gesundheitsbezogene Angabe. Auch bei alkoholfreien Getränken sind solche Angaben nur unter den Voraussetzungen der HCVO zulässig – bitte prüfen lassen.",
    suggestion: "Geschmack statt Wirkung beschreiben, z. B. „mild“, „ausgewogen“, „feinherb“.",
    patterns: [termPattern(`bekömmlich${W}`, `wohlbekömmlich${W}`)],
    sources: ["bgh-bekoemmlich", "hcvo"],
  },
  {
    id: "health-claim",
    category: "gesundheit",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "Gesundheitsversprechen",
    message:
      "Aussagen über eine gesundheitliche Wirkung sind bei Getränken mit mehr als 1,2 % vol nach Art. 4 Abs. 3 HCVO unzulässig. Der Werberat lehnt zudem Heil- oder Vorbeugungsaussagen ab (Ziff. 6).",
    alcoholFreeMessage:
      "Gesundheitsbezogene Angaben sind auch bei alkoholfreien Getränken nur unter den Voraussetzungen der HCVO zulässig (insbesondere zugelassene Angaben) – bitte prüfen lassen.",
    suggestion: "Auf Genuss, Herkunft, Handwerk und Geschmack setzen statt auf Wirkung.",
    patterns: [
      termPattern(
        "gesund",
        "gesünder",
        `gesundheitsfördernd${W}`,
        `gut${S}für${S}(?:die|deine|ihre|eure|den|dein|das|ihren|deinen)${S}(?:gesundheit|verdauung|herz|magen|darm|immunsystem|abwehrkräfte|körper|nerven|figur|haut|seele)`,
        `verdauungsfördernd${W}`,
        `magenfreundlich${W}`,
        `magenschonend${W}`,
        `heil(?:end|wirkung|kraft|mittel|sam)${W}`,
        `stärkt${S}(?:das|die|dein|deine|ihr|ihre|euer|eure)${S}(?:immunsystem|abwehr${W}|herz|nerven)`,
        `senkt${S}(?:den|das|die|dein|deinen)${S}(?:cholesterin${W}|blutdruck|blutzucker|risiko)`,
        String.raw`beugt${S}\p{L}+${S}vor`,
        `vorbeugend${W}`,
        "detox",
        "superfood",
        `vitaminreich${W}`,
        `reich${S}an${S}vitaminen`,
        `voller${S}vitamine`,
        `medizinisch${W}`,
        "medizin",
        `wohltuend${W}`,
        `leicht${S}verdaulich${W}`,
        "healthy",
        `good${S}for${S}(?:your${S})?(?:health|digestion|heart|body|gut)`,
        `boosts?${S}(?:your${S})?immun${W}`,
      ),
    ],
    sources: ["hcvo", "werberat-alkohol"],
  },
  {
    id: "health-sport-claim",
    category: "gesundheit",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "„isotonisch“ / Regeneration",
    message:
      "Aussagen wie „isotonisch“ oder „fördert die Regeneration“ beschreiben eine Wirkung auf den Körper. Bei Getränken mit mehr als 1,2 % vol sind gesundheitsbezogene Angaben nach Art. 4 Abs. 3 HCVO unzulässig.",
    alcoholFreeMessage:
      "Bei alkoholfreien Getränken können „isotonisch“ oder Regenerationsaussagen als nährwert- bzw. gesundheitsbezogene Angaben gelten. Zulässig nur, wenn die Voraussetzungen der HCVO erfüllt sind – bitte mit Analysewerten prüfen lassen.",
    suggestion: "Nur belegte und zugelassene Angaben verwenden; im Zweifel „erfrischend“ statt Wirkversprechen.",
    patterns: [
      termPattern(
        `isotonisch${W}`,
        "isotonic",
        `elektrolyt${W}`,
        `regenerationsgetränk${W}`,
        `fördert${S}(?:die${S})?regeneration`,
        `regeneriert${W}`,
        `recovery${S}drinks?`,
      ),
    ],
    sources: ["hcvo"],
  },
  {
    id: "health-wohl-bekomms",
    category: "gesundheit",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: "niedrig" },
    title: "Trinkspruch nahe „bekömmlich“",
    message:
      "„Wohl bekomm’s“ ist ein traditioneller Trinkspruch, steht aber sprachlich nahe an „bekömmlich“ (BGH I ZR 252/16 betraf das Wort „bekömmlich“). Nicht automatisch unzulässig – Einzelfall prüfen lassen.",
    suggestion: "Alternativ „Prost!“ oder „Zum Wohl!“ verwenden.",
    patterns: [termPattern(`wohl${S}bekomm['’]?s`, `wohlbekomm['’]?s`)],
    sources: ["bgh-bekoemmlich"],
  },
  {
    id: "health-professional",
    category: "gesundheit",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Heilberufe im Motiv",
    message:
      "Der Werberat lehnt in Alkoholwerbung Personen in Berufskleidung von Heilberufen ab (Ziff. 6). Das kann als medizinische Empfehlung wirken.",
    alcoholFreeMessage: `Heilberufe im Motiv können als medizinische Empfehlung wirken. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Keine Ärzte, Apotheker oder Pflegekräfte bzw. deren Kleidung zeigen oder zitieren.",
    patterns: [
      termPattern(
        `${W}arzt${W}`,
        `${W}ärzt${W}`,
        `doktor${W}`,
        `apotheke${W}`,
        `krankenschwester${W}`,
        `krankenpfleger${W}`,
        `heilpraktiker${W}`,
        `laborkittel${W}`,
        `arztkittel${W}`,
        `weiße[mnr]?${S}kittel${W}`,
        "doctors?",
        "nurses?",
        "physicians?",
        "pharmacists?",
        `lab${S}coats?`,
        `white${S}coats?`,
        `medical${S}(?:staff|professionals?|scrubs|uniform)`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "nutrition-claim",
    category: "naehrwert",
    severity: { alkoholhaltig: "mittel", alkoholfrei: "niedrig" },
    title: "Nährwertbezogene Angabe",
    message:
      "Für Getränke mit mehr als 1,2 % vol erlaubt Art. 4 Abs. 3 HCVO nur nährwertbezogene Angaben zu einem geringen oder reduzierten Alkoholgehalt oder zu einem reduzierten Brennwert.",
    alcoholFreeMessage:
      "Nährwertbezogene Angaben sind bei alkoholfreien Getränken nur zulässig, wenn die Bedingungen der HCVO erfüllt sind (Analysewerte bereithalten).",
    suggestion: "Nur Angaben verwenden, die zum Getränk und zur HCVO passen; Werte belegen können.",
    patterns: [
      termPattern(
        `zuckerfrei${W}`,
        `ohne${S}zucker`,
        `zuckerarm${W}`,
        `kalorienarm${W}`,
        `kalorienfrei${W}`,
        `fettfrei${W}`,
        `eiweißreich${W}`,
        `proteinreich${W}`,
        `ballaststoffreich${W}`,
        `mineralstoffreich${W}`,
        `reich${S}an${S}(?:mineralstoffen|ballaststoffen|eiweiß|protein|magnesium|kalium|b-vitaminen)`,
        String.raw`low[-\s]?carb`,
        String.raw`sugar[-\s]?free`,
        `high${S}protein`,
      ),
    ],
    sources: ["hcvo"],
  },
  {
    id: "performance-claim",
    category: "leistung",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "Leistungsversprechen",
    message:
      "Der Werberat lehnt Aussagen ab, Alkohol verbessere die körperliche Leistungsfähigkeit (Ziff. 9.1). Wirkversprechen können zugleich gesundheitsbezogene Angaben im Sinne der HCVO sein.",
    alcoholFreeMessage:
      "Leistungs- und Wirkversprechen können gesundheitsbezogene Angaben im Sinne der HCVO sein und sind dann nur unter deren Voraussetzungen zulässig – bitte prüfen lassen.",
    suggestion: "Genussmomente beschreiben statt Leistung, Fitness oder Kraft zu versprechen.",
    patterns: [
      termPattern(
        `leistungssteigernd${W}`,
        `steigert${S}(?:die|deine|ihre|eure)${S}(?:leistung${W}|konzentration|ausdauer|kraft|fitness)`,
        `leistung${S}steigern`,
        `macht${S}(?:dich${S}|sie${S}|euch${S})?(?:fit|stark|stärker|leistungsfähig${W}|wach)`,
        `muskel${W}`,
        String.raw`fitness[-\s]?drinks?`,
        String.raw`performance[-\s]?boost${W}`,
        `boosts?${S}(?:your${S})?(?:performance|stamina|strength)`,
      ),
    ],
    sources: ["werberat-alkohol", "hcvo", "google-ads-alkohol"],
  },
  {
    id: "performance-phrase",
    category: "leistung",
    severity: { alkoholhaltig: "mittel", alkoholfrei: "niedrig" },
    title: "Energie- oder Kraftversprechen",
    message:
      "Formulierungen wie „mehr Power“ oder „Kraft tanken“ können als Leistungsversprechen verstanden werden (Werberat Ziff. 9.1).",
    alcoholFreeMessage: `Energie- und Kraftaussagen können als Wirkversprechen verstanden werden. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Lieber Stimmung und Moment beschreiben, z. B. „Feierabend genießen“.",
    patterns: [
      termPattern(
        `mehr${S}(?:power|energie|ausdauer|kraft)`,
        `volle${S}power`,
        `power${S}für`,
        `energie(?:kick|schub|booster)${W}`,
        `(?:kraft|energie)${S}tanken`,
        `energy${S}boost${W}`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "sport-active",
    category: "sport-sicherheit",
    severity: { alkoholhaltig: "mittel", alkoholfrei: null },
    title: "Konsum beim Sport",
    message:
      "Der Werberat lehnt Werbung ab, die aktive Leistungssportler beim Konsum zeigt oder sie zum Trinken auffordern lässt (Ziff. 3). Konsum während sportlicher Aktivität ist ein Risiko.",
    suggestion: "Sport und Konsum zeitlich und bildlich trennen; Fans und Geselligkeit statt aktiver Sportler zeigen.",
    patterns: [
      termPattern(
        `leistungssportler${W}`,
        `profisportler${W}`,
        `athlet${W}`,
        "athletes?",
        `beim${S}(?:training|sport|joggen|laufen|radfahren|klettern|schwimmen|tauchen|surfen|skifahren|bergsteigen)`,
        `während${S}des${S}(?:trainings|wettkampfs|laufs|rennens)`,
        `vor${S}dem${S}(?:training|wettkampf|lauf|rennen)`,
        `workout${W}`,
        "gym",
        `fitnessstudio${W}`,
        `marathon${W}`,
        `triathlon${W}`,
        `during${S}(?:a${S}|the${S})?(?:workout|training|match|race)`,
        `while${S}(?:running|cycling|swimming|climbing|surfing|skiing)`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "sport-after",
    category: "sport-sicherheit",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Sportkontext",
    message:
      "Direkter Sportbezug bei alkoholhaltigen Getränken: darauf achten, dass keine aktiven Sportler beim Konsum gezeigt werden (Werberat Ziff. 3).",
    suggestion: "Bei alkoholfreien Sorten ist der Sportbezug unkritischer – dann die Sorte klar als alkoholfrei kennzeichnen.",
    patterns: [
      termPattern(
        `nach${S}dem${S}(?:training|sport|workout|lauf|marathon|wettkampf)`,
        `after${S}(?:the${S}|a${S}|your${S})?(?:workout|training|run|race)`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "dangerous-situations",
    category: "sport-sicherheit",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Gefährliche Tätigkeit",
    message:
      "Kein Konsum in gefährlichen Situationen, etwa beim Bedienen von Maschinen; das Gebot der Punktnüchternheit ist zu beachten (Werberat Ziff. 5). Relevant, wenn Konsum und Tätigkeit verbunden werden.",
    suggestion: "Arbeit und Genuss klar trennen, z. B. „nach Feierabend“.",
    patterns: [
      termPattern(
        `maschine${W}${S}bedien${W}`,
        `bedien${W}${S}(?:von${S})?maschine${W}`,
        `baustelle${W}`,
        `gabelstapler${W}`,
        `kettensäge${W}`,
        `heavy${S}machinery`,
        `construction${S}sites?`,
        "forklifts?",
        "chainsaws?",
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "pregnancy",
    category: "missbrauch",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "Schwangerschaft und Stillzeit",
    message: "Der Werberat lehnt die Darstellung von Konsum in Schwangerschaft und Stillzeit ab (Ziff. 1).",
    alcoholFreeMessage:
      "Als „alkoholfrei“ bezeichnetes Bier kann nach deutscher Verkehrsauffassung geringe Mengen Restalkohol enthalten (Annahme, üblich bis 0,5 % vol). Empfehlungen für Schwangere/Stillende nur bei 0,0 % und nach Prüfung.",
    suggestion: "Schwangere und Stillende nicht als Zielgruppe ansprechen oder zeigen.",
    patterns: [
      termPattern(
        `schwanger${W}`,
        "stillzeit",
        `stillend${W}`,
        `werdende${S}mütter`,
        `babybauch${W}`,
        `pregnan${W}`,
        "breastfeeding",
        `expecting${S}mothers?`,
      ),
    ],
    sources: ["werberat-alkohol", "google-ads-alkohol"],
  },
  {
    id: "driving",
    category: "strassenverkehr",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Alkohol und Fahren",
    message:
      "Der Werberat lehnt jede Verbindung von Alkoholkonsum und dem Führen von Fahrzeugen ab (Ziff. 4). Auch indirekte Bezüge („danach noch heimfahren“) sind riskant.",
    alcoholFreeMessage:
      "Als „alkoholfrei“ bezeichnetes Bier kann Restalkohol enthalten (Annahme, üblich bis 0,5 % vol). Aussagen zum Autofahren nur mit 0,0 %-Produkten und zurückhaltend formulieren.",
    suggestion: "Fahrzeuge und Konsum nicht verbinden; ggf. Hinweis „Wer fährt, trinkt nicht“.",
    negatable: true,
    patterns: [
      termPattern(
        `autofahr${W}`,
        `auto${S}fahren`,
        `am${S}steuer`,
        `hinterm${S}steuer`,
        `hinter${S}dem${S}steuer`,
        `beim${S}fahren`,
        `vor${S}der${S}fahrt`,
        `noch${S}fahren`,
        `(?:nach${S}hause|heim)${S}fahren`,
        `heimfahrt${W}`,
        `fahrersitz${W}`,
        "driving",
        `drive${S}home`,
        `behind${S}the${S}wheel`,
        `steering${S}wheel`,
        `driver'?s?${S}seat`,
        `car${S}interior`,
        `in${S}(?:a|the|his|her|their)${S}car`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "vehicle-mention",
    category: "strassenverkehr",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Fahrzeug im Motiv oder Text",
    message:
      "Ein Fahrzeug im Bild ist nicht verboten, aber Konsum und Fahren dürfen nicht verbunden werden (Werberat Ziff. 4) – z. B. kein Glas am Steuer oder an einer fahrbereiten Person.",
    suggestion: "Fahrzeug nur als Kulisse ohne Bezug zum Trinken zeigen oder weglassen.",
    patterns: [
      termPattern(
        "cars?",
        "trucks?",
        "vehicles?",
        `fahrzeug${W}`,
        "pkw",
        `traktor${W}`,
        "tractors?",
        `motorrad${W}`,
        "motorcycles?",
        "motorbikes?",
        `roadtrip${W}`,
        `road${S}trip`,
        `cabrio${W}`,
        `mit${S}dem${S}auto`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "minors-direct",
    category: "jugendschutz",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Kinder und Jugendliche",
    message:
      "Alkoholwerbung darf sich nur an Personen über dem gesetzlichen Mindestalter richten; alle gezeigten Personen müssen mindestens 18 Jahre alt sein und so wirken (Werberat Ziff. 2).",
    alcoholFreeMessage: `Bezug zu Kindern oder Jugendlichen. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Keine Minderjährigen zeigen oder ansprechen; Personen klar erwachsen darstellen.",
    negatable: true,
    patterns: [
      termPattern(
        "kinder",
        "kindern",
        "kids?",
        `teenager${W}`,
        `teenie${W}`,
        "teens?",
        `jugendlich${W}`,
        `minderjährig${W}`,
        `schüler${W}`,
        "schulhof",
        "pausenhof",
        `schulparty${W}`,
        `schulfest${W}`,
        `klassenfahrt${W}`,
        String.raw`abi-?(?:party|feier|ball|fahrt|streich)${W}`,
        "abschlussfahrt",
        `unter${S}(?:16|18)${S}jahr${W}`,
        `ab${S}(?:12|14|16)${S}jahr${W}`,
        "u-?1[68]",
        String.raw`1[4-7]-?jährig${W}`,
        "children",
        "child",
        String.raw`under-?age`,
        "minors",
        "schoolgirls?",
        "schoolboys?",
        `school${S}uniforms?`,
        `high${S}school`,
        String.raw`baby(?![s-]+(?:blue|pink|blau|rosa|shower))`,
        "babys",
        "babies",
        `kleinkind${W}`,
      ),
    ],
    sources: ["werberat-alkohol", "werberat-jugend", "google-ads-alkohol"],
  },
  {
    id: "minors-image",
    category: "jugendschutz",
    severity: { alkoholhaltig: "mittel", alkoholfrei: null },
    kinds: ["bildprompt"],
    title: "Jugendlicher Alterseindruck",
    message:
      "Der Begriff kann bei der Bildgenerierung einen jugendlichen Alterseindruck erzeugen. Gezeigte Personen müssen mindestens 18 Jahre alt sein und so wirken (Werberat Ziff. 2).",
    suggestion: "Konkret formulieren, z. B. „erwachsene Frau, etwa 30 Jahre“ statt „girl“.",
    patterns: [
      termPattern(
        "girls?",
        "boys?",
        String.raw`young[-\s]looking`,
        "youthful",
        String.raw`teen-?aged?`,
        `college${S}(?:party|students?)`,
        `frat${S}party`,
        `spring${S}break`,
        "mädchen",
        `junge${S}mädchen`,
      ),
    ],
    sources: ["werberat-alkohol", "werberat-jugend"],
  },
  {
    id: "youth-appeal",
    category: "jugendschutz",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Kinder- oder jugendaffine Gestaltung",
    message:
      "Je mehr jugendaffine Gestaltungselemente verwendet werden, desto eher kann Werbung als gezielte Ansprache Minderjähriger gelten (Werberat-Leitfaden „Kinder und Jugendliche“).",
    suggestion: "Gestaltung an Erwachsenen ausrichten; Comic-, Spielzeug- oder Süßigkeiten-Optik vermeiden.",
    patterns: [
      termPattern(
        `comic${W}`,
        `zeichentrick${W}`,
        `cartoon${W}`,
        "anime",
        "manga",
        `spielzeug${W}`,
        "toys?",
        `süßigkeit${W}`,
        "candy",
        "lollis?",
        "lollipops?",
        `einhorn${W}`,
        "unicorns?",
        `teddy${W}`,
        `superheld${W}`,
        "superheroes?",
        "fortnite",
        "minecraft",
        "roblox",
      ),
    ],
    sources: ["werberat-jugend"],
  },
  {
    id: "youth-slang",
    category: "jugendschutz",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    kinds: ["werbetext", "caption", "hashtags"],
    title: "Jugendsprache",
    message:
      "Jugendtypische Sprache erhöht das Risiko, dass Werbung als Ansprache Minderjähriger verstanden wird (Werberat-Leitfaden „Kinder und Jugendliche“).",
    suggestion: "Tonalität an erwachsene Zielgruppen anpassen.",
    patterns: [termPattern("digga", "diggah", "cringe", `no${S}cap`, "rizz", "bruh", "yolo", "slay", "sus")],
    sources: ["werberat-jugend"],
  },
  {
    id: "excess-consumption",
    category: "missbrauch",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Übermäßiger Konsum",
    message:
      "Der Werberat lehnt Aufforderungen zu missbräuchlichem Konsum, dessen Verharmlosung und erkennbar übermäßig Trinkende ab; Flatrate-Angebote, die auf verantwortungslosen Konsum abzielen, gelten als Verstoß (Ziff. 1).",
    alcoholFreeMessage: `Formulierung erinnert an übermäßigen Konsum. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Genuss und Qualität betonen, nicht Menge oder Rausch.",
    negatable: true,
    patterns: [
      termPattern(
        "saufen",
        `sauf${W}`,
        "gesoffen",
        `besauf${W}`,
        `besoffen${W}`,
        `stockbesoffen${W}`,
        `komasauf${W}`,
        `kampftrinken${W}`,
        `wettsaufen${W}`,
        `wetttrinken${W}`,
        `vorglühen${W}`,
        `vorgeglüht${W}`,
        `bis${S}zum${S}umfallen`,
        `bis${S}der${S}arzt${S}kommt`,
        `bis${S}zum${S}filmriss`,
        `filmriss${W}`,
        `(?:sich|uns|euch|dich|mich)${S}abschießen`,
        `exzess${W}`,
        "rausch",
        `vollrausch${W}`,
        `betrunken${W}`,
        `sturzbetrunken${W}`,
        `sternhagelvoll${W}`,
        `hackedicht${W}`,
        String.raw`voll${S}wie${S}(?:eine?${S})?\p{L}+`,
        `auf${S}ex`,
        "exen",
        `trinkspiel${W}`,
        `saufspiel${W}`,
        String.raw`beer${S}?pong`,
        `bierpong${W}`,
        `flunkyball${W}`,
        `all${S}you${S}can${S}drink`,
        `flatrate${W}`,
        `trinken${S}(?:ohne${S}(?:limit|ende|grenzen)|bis${S}zum${S}(?:schluss|morgen))`,
        `ohne${S}limit`,
        `literweise`,
        `kistenweise`,
        `so${S}viel${S}(?:du|ihr|sie)${S}(?:kannst|könnt|können|willst|wollt|wollen|schaffst|schafft)`,
        `binge${W}`,
        "drunk",
        "wasted",
        "hammered",
        "blackout",
        `passed${S}out`,
        "chugging",
        "chug",
        "shotgunning",
        `keg${S}stands?`,
        `beer${S}bongs?`,
        `drinking${S}games?`,
        "bottomless",
      ),
    ],
    sources: ["werberat-alkohol", "google-ads-alkohol"],
  },
  {
    id: "excess-mild",
    category: "missbrauch",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Mengenbezug",
    message:
      "Kann als Aufforderung zu mehr Konsum oder als Verharmlosung verstanden werden (Werberat Ziff. 1). Im Zusammenhang prüfen.",
    suggestion: "Genuss statt Menge in den Mittelpunkt stellen.",
    patterns: [
      termPattern(
        `kater${W}`,
        "promille",
        `(?:eins|einer|eine)${S}geht${S}(?:noch|immer)`,
        `ein${S}bier${S}ist${S}kein${S}bier`,
        `happy${S}hour`,
        String.raw`2\s*(?:für|for|4)\s*1`,
        `freibier${W}`,
        `maß${S}um${S}maß`,
        `runde${S}um${S}runde`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "abstinence-disparaging",
    category: "missbrauch",
    severity: { alkoholhaltig: "mittel", alkoholfrei: null },
    title: "Abwertung von Abstinenz",
    message:
      "Werbung darf Alkoholabstinenz oder moderaten Konsum nicht abwertend darstellen (Werberat Ziff. 1.4).",
    suggestion: "Niemanden für Verzicht oder Maß abwerten; inklusive Tonalität wählen.",
    patterns: [
      termPattern(
        `wasser${S}(?:ist|trinken)${S}(?:nur${S})?(?:was${S})?für${S}(?:die${S})?(?:fische|frösche|schwächlinge|weicheier|kinder|langweiler)`,
        `spaßbremse${W}`,
        `weichei${W}`,
        `warmduscher${W}`,
        `wer${S}nicht${S}(?:mit)?trinkt`,
        `nur${S}(?:feiglinge|langweiler|weicheier|luschen)`,
        `echte${S}(?:männer|kerle)${S}trinken`,
        `real${S}men${S}drink`,
        String.raw`nüchtern${S}(?:ist|sein${S}ist)${S}(?:langweilig|öde|für${S}\p{L}+)`,
        `sober${S}is${S}boring`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "social-sexual-success",
    category: "erfolg",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Sozialer oder sexueller Erfolg",
    message:
      "Der Werberat lehnt den Eindruck ab, Alkohol fördere sozialen oder sexuellen Erfolg (Ziff. 9.2 und 9.3).",
    alcoholFreeMessage: `Erfolgsversprechen durch ein Getränk. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Geselligkeit zeigen, ohne Erfolg, Attraktivität oder Beliebtheit dem Getränk zuzuschreiben.",
    patterns: [
      termPattern(
        `macht${S}(?:dich${S}|sie${S}|euch${S}|ihn${S})?(?:sexy|attraktiv${W}|begehrenswert${W}|unwiderstehlich${W}|beliebt${W}|cooler|erfolgreich${W}|selbstbewusst${W}|mutig${W}|locker${W})`,
        `erfolg${S}bei${S}(?:den${S})?(?:frauen|männern|mädels|jungs)`,
        `flirt(?:garantie|erfolg|booster|hilfe)${W}`,
        `klappt['’]?s${S}(?:auch${S})?(?:beim|mit${S}dem)${S}(?:flirten|date|dating|anbaggern)`,
        `beim${S}flirten`,
        "abschleppen",
        "rumkriegen",
        String.raw`date-?garantie`,
        `nie${S}mehr${S}(?:allein|single|einsam)`,
        `ohne${S}bier${S}(?:keine|kein)${S}(?:party|spaß|freunde|stimmung)`,
        `partykönig${W}`,
        `partylöwe${W}`,
        `star${S}der${S}party`,
        `mittelpunkt${S}der${S}party`,
        `makes?${S}you${S}(?:sexy|attractive|popular|irresistible|confident|cool)`,
        `get${S}the${S}girl`,
      ),
    ],
    sources: ["werberat-alkohol", "google-ads-alkohol"],
  },
  {
    id: "sexualized-image",
    category: "erfolg",
    severity: { alkoholhaltig: "mittel", alkoholfrei: null },
    kinds: ["bildprompt"],
    title: "Sexualisierte Darstellung",
    message:
      "Sexualisierte Motive in Alkoholwerbung bergen das Risiko, sexuellen Erfolg mit dem Konsum zu verbinden (Werberat Ziff. 9.3).",
    suggestion: "Personen natürlich und angezogen zeigen; Fokus auf Getränk, Ort und Geselligkeit.",
    patterns: [
      termPattern(
        "sexy",
        "seductive",
        `verführerisch${W}`,
        "lingerie",
        "dessous",
        `unterwäsche${W}`,
        `nackt${W}`,
        "nude",
        "naked",
        `oben${S}ohne`,
        "topless",
        `erotic${W}`,
        `erotisch${W}`,
        "cleavage",
        `provocative${S}pose`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "mood-anxiety",
    category: "stimmung",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "niedrig" },
    title: "Enthemmung oder Problemlösung",
    message:
      "Der Werberat lehnt Aussagen zur enthemmenden Wirkung sowie Versprechen ab, Alkohol lindere Ängste oder löse Konflikte und Probleme (Ziff. 8).",
    alcoholFreeMessage: `Wirkversprechen gegen Stress oder Probleme. ${WERBERAT_FREE_NOTE}`,
    suggestion: "Entspannte Momente zeigen, ohne dem Getränk eine Wirkung gegen Stress oder Probleme zuzuschreiben.",
    patterns: [
      termPattern(
        `gegen${S}(?:den${S})?(?:stress|frust|kummer|sorgen|ängste?|einsamkeit|traurigkeit|liebeskummer)`,
        `stress${S}(?:weg|vergessen|abbauen|ade)`,
        `vergiss${S}(?:deinen|den|deine|die|alle)${S}(?:stress|sorgen|probleme|ärger|kummer|frust)`,
        `(?:sorgen|probleme|kummer|frust)${S}(?:vergessen|ertränken|wegspülen|runterspülen)`,
        `seelentröster${W}`,
        `problemlöser${W}`,
        `nervenberuhig${W}`,
        `beruhigt${S}(?:die${S})?nerven`,
        `mut${S}an(?:zu)?trinken`,
        `mut${S}angetrunken`,
        `liquid${S}courage`,
        `hemmungen${S}(?:verlieren|ablegen|fallen${S}lassen)`,
        `alle${S}hemmungen`,
        `enthemm${W}`,
        `drown${S}(?:your${S})?sorrows`,
        `forget${S}(?:your${S}|all${S}your${S})?(?:problems|worries|stress)`,
        `stress${S}relief`,
        String.raw`anti-?stress`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "alcohol-strength",
    category: "alkoholgehalt",
    severity: { alkoholhaltig: "mittel", alkoholfrei: null },
    title: "Hoher Alkoholgehalt als Kaufanreiz",
    message:
      "Angaben zum Alkoholgehalt sind zulässig, ein hoher Gehalt soll aber nicht als Kaufanreiz herausgestellt werden (Werberat Ziff. 7.1).",
    suggestion: "Gehalt sachlich nennen (z. B. „7,2 % vol“), Geschmack statt Stärke bewerben.",
    patterns: [
      termPattern(
        `extra${S}stark${W}`,
        `besonders${S}stark${W}`,
        `hochprozentig${W}`,
        `mehr${S}(?:alkohol|umdrehungen|promille)`,
        `(?:ordentlich|viel|richtig)${S}umdrehungen`,
        `haut${S}(?:richtig${S}|ordentlich${S})?rein`,
        `dröhnung${W}`,
        `macht${S}(?:richtig${S}|schnell${S})?(?:betrunken|blau)`,
        `gets?${S}you${S}drunk`,
        `strongest${S}beer`,
        `extra${S}strong`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "alcohol-strength-ambiguous",
    category: "alkoholgehalt",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: null },
    title: "Mehrdeutige Stärke-Aussage",
    message:
      "Kann als Hinweis auf eine starke Rauschwirkung verstanden werden (Werberat Ziff. 7.1). Wenn der Geschmack gemeint ist, eindeutig formulieren.",
    suggestion: "Eindeutig auf Geschmack beziehen, z. B. „kräftig im Geschmack“.",
    patterns: [termPattern(`knallt${W}`, `ballert${W}`, `kickt${W}`, "umdrehungen")],
    sources: ["werberat-alkohol"],
  },
  {
    id: "low-alcohol-safe",
    category: "alkoholgehalt",
    severity: { alkoholhaltig: "hoch", alkoholfrei: "mittel" },
    title: "Geringer Gehalt als Freibrief",
    message:
      "Ein niedriger Alkoholgehalt darf nicht als Schutz vor Missbrauch dargestellt werden (Werberat Ziff. 7.2).",
    alcoholFreeMessage:
      "Auch bei alkoholfreien Sorten zurückhaltend formulieren: „alkoholfrei“ kann Restalkohol enthalten (Annahme, üblich bis 0,5 % vol).",
    suggestion: "Keine Aussagen wie „bedenkenlos“ oder „trotzdem fahren“.",
    patterns: [
      termPattern(
        `(?:bedenkenlos|unbedenklich|ohne${S}reue|ohne${S}bedenken)${S}(?:trinken|genießen|fahren|weitertrinken)`,
        `ist${S}ja${S}(?:nur${S})?(?:leicht|light|alkoholarm)`,
        `trotzdem${S}(?:noch${S})?fahren`,
        `danach${S}(?:noch${S})?(?:auto${S})?fahren`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "alcohol-free-target-groups",
    category: "alkoholfrei",
    severity: { alkoholhaltig: null, alkoholfrei: "mittel" },
    title: "Alkoholfrei für sensible Gruppen",
    message: "",
    alcoholFreeMessage:
      "„alkoholfrei“ kann bei Bier Restalkohol enthalten (Annahme, üblich bis 0,5 % vol). Empfehlungen für Schwangere, Kinder oder Autofahrer nur bei 0,0 % und nach Prüfung.",
    suggestion: "Bei 0,0 % den Gehalt ausdrücklich nennen; sonst sensible Gruppen nicht gezielt ansprechen.",
    patterns: [
      termPattern(
        `(?:auch${S})?für${S}(?:schwangere|stillende|werdende${S}mütter|kinder|autofahrer${W}|fahrer${W}|jugendliche)`,
        `ideal${S}(?:zum|beim|vor${S}dem)${S}(?:auto)?fahren`,
      ),
    ],
    sources: ["werberat-alkohol"],
  },
  {
    id: "uwg-superlative",
    category: "irrefuehrung",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: "niedrig" },
    title: "Spitzenstellung oder Auszeichnung",
    message:
      "Allein- oder Spitzenstellungsbehauptungen, Testsiege und Auszeichnungen müssen zutreffen und belegbar sein; sonst droht Irreführung (§ 5 UWG).",
    suggestion: "Nur belegbare Aussagen verwenden und Quelle bzw. Jahr der Auszeichnung nennen.",
    patterns: [
      termPattern(
        String.raw`(?:das|der|die)${S}beste${W}${S}(?:bier|pils|helle|weißbier|weizen|brauerei)${W}(?:${S}(?:der${S}welt|deutschlands|bayerns|frankens|europas|der${S}stadt|der${S}region))?`,
        `bestes${S}bier${W}`,
        String.raw`(?:nummer|nr\.?)${S}?(?:1|eins)`,
        `weltbeste${W}`,
        `unschlagbar${W}`,
        `preisgekrönt${W}`,
        `testsieger${W}`,
        `klinisch${S}getestet`,
        `wissenschaftlich${S}(?:belegt|bewiesen)`,
        `best${S}beer${S}in${S}the${S}world`,
        "world'?s\\s+best",
      ),
    ],
    sources: ["uwg"],
  },
  {
    id: "uwg-selbstverstaendlichkeit",
    category: "irrefuehrung",
    severity: { alkoholhaltig: "niedrig", alkoholfrei: "niedrig" },
    title: "Werbung mit Selbstverständlichkeiten",
    message:
      "Hebt die Werbung Eigenschaften hervor, die alle vergleichbaren Biere ohnehin haben müssen, kann das irreführen (§ 5 UWG; Einschätzung, lebensmittelrechtliche Sonderregeln nicht abschließend geprüft).",
    suggestion: "Lieber konkrete Besonderheiten nennen (Rohstoffe, Herkunft, Brauverfahren).",
    patterns: [
      termPattern(
        `ohne${S}(?:konservierungsstoffe|zusatzstoffe|chemie|geschmacksverstärker|künstliche${S}(?:aromen|zusätze|farbstoffe))`,
        `frei${S}von${S}(?:konservierungsstoffen|zusatzstoffen|chemie)`,
      ),
    ],
    sources: ["uwg"],
  },
  {
    id: "real-person-likeness",
    category: "persoenlichkeitsrecht",
    severity: { alkoholhaltig: "mittel", alkoholfrei: "mittel" },
    kinds: ["bildprompt"],
    title: "Reale oder prominente Person",
    message:
      "Erkennbare reale Personen oder deren Nachahmung können Persönlichkeitsrechte verletzen (Einschätzung). Täuschend echte KI-Darstellungen realer Personen sind nach Art. 50 Abs. 4 KI-VO offenzulegen.",
    suggestion: "Fiktive Personen verwenden; keine Namen realer Personen im Prompt.",
    patterns: [
      termPattern(
        "lookalike",
        String.raw`look-alike`,
        `doppelgänger${W}`,
        "celebrit(?:y|ies)",
        "promis?",
        `prominente${W}`,
        `deepfake${W}`,
        `famous${S}(?:actor|actress|singer|footballer|athlete|person)s?`,
        `berühmte${W}${S}(?:schauspieler|sänger|fußballer|sportler|person)${W}`,
      ),
    ],
    sources: ["eu-ai-act"],
  },
];
