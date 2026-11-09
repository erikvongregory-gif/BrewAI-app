/**
 * Quellenverzeichnis für die Werbe-Compliance-Hinweise.
 *
 * Nur Quellen, die beim Audit am 2026-11-09 tatsächlich abgerufen bzw. über die
 * offizielle Pressestelle bestätigt wurden. Die Hinweise des Moduls sind keine
 * Rechtsberatung und ersetzen keine anwaltliche Prüfung.
 */
export type ComplianceSourceId =
  | "werberat-alkohol"
  | "werberat-jugend"
  | "hcvo"
  | "bgh-bekoemmlich"
  | "uwg"
  | "eu-ai-act"
  | "google-ads-alkohol";

export type ComplianceSource = {
  id: ComplianceSourceId;
  /** Kurzbezeichnung für die UI, z. B. „Deutscher Werberat, Ziff. 2“. */
  label: string;
  url: string;
  /** Art der Quelle: verbindliche Norm, Rechtsprechung oder Selbstregulierung. */
  kind: "norm" | "rechtsprechung" | "selbstregulierung" | "plattformregel";
  retrievedAt: string;
};

export const COMPLIANCE_SOURCES: Record<ComplianceSourceId, ComplianceSource> = {
  "werberat-alkohol": {
    id: "werberat-alkohol",
    label: "Deutscher Werberat – Verhaltensregeln für alkoholhaltige Getränke (Fassung Januar 2026)",
    url: "https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/",
    kind: "selbstregulierung",
    retrievedAt: "2026-11-09",
  },
  "werberat-jugend": {
    id: "werberat-jugend",
    label: "Deutscher Werberat – Leitfaden „Kinder und Jugendliche“ (alkoholhaltige Getränke)",
    url: "https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/kinder-und-jugendliche/",
    kind: "selbstregulierung",
    retrievedAt: "2026-11-09",
  },
  hcvo: {
    id: "hcvo",
    label: "Verordnung (EG) Nr. 1924/2006 (Health-Claims-Verordnung), Art. 4 Abs. 3",
    url: "https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:32006R1924",
    kind: "norm",
    retrievedAt: "2026-11-09",
  },
  "bgh-bekoemmlich": {
    id: "bgh-bekoemmlich",
    label: "BGH, Urteil vom 17.05.2018 – I ZR 252/16 („bekömmlich“, Art. 4 Abs. 3 Buchst. a HCVO), Pressemitteilung Nr. 93/18",
    url: "https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2018/2018093.html",
    kind: "rechtsprechung",
    retrievedAt: "2026-11-09",
  },
  uwg: {
    id: "uwg",
    label: "Gesetz gegen den unlauteren Wettbewerb (UWG), § 5 Irreführende geschäftliche Handlungen",
    url: "https://www.gesetze-im-internet.de/uwg_2004/__5.html",
    kind: "norm",
    retrievedAt: "2026-11-09",
  },
  "google-ads-alkohol": {
    id: "google-ads-alkohol",
    label: "Google Ads – Richtlinie zu Alkohol (Plattformregel, keine Rechtsnorm)",
    url: "https://support.google.com/adspolicy/answer/6012382?hl=de",
    kind: "plattformregel",
    retrievedAt: "2026-11-09",
  },
  "eu-ai-act": {
    id: "eu-ai-act",
    label: "Verordnung (EU) 2024/1689 (KI-Verordnung), Art. 50",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/deu",
    kind: "norm",
    retrievedAt: "2026-11-09",
  },
};

export function getComplianceSources(ids: readonly ComplianceSourceId[]): ComplianceSource[] {
  return ids.map((id) => COMPLIANCE_SOURCES[id]);
}
