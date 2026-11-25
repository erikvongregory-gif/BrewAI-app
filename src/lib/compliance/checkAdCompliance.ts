import {
  ALCOHOL_AD_RULES,
  COMPLIANCE_CATEGORY_LABELS,
  type AlcoholAdRule,
  type ComplianceCategory,
  type ComplianceContentKind,
  type ComplianceSeverity,
} from "./alcoholAdRules";
import { getComplianceSources, type ComplianceSource } from "./sources";

export const COMPLIANCE_DISCLAIMER =
  "Automatische Hinweise auf mögliche Risiken – keine Rechtsberatung und keine Freigabe. Erkannt werden nur typische Formulierungen; Bild und Gesamteindruck müssen zusätzlich geprüft werden.";

export type BeverageContext = {
  /** Getränk ist als „alkoholfrei“ bezeichnet. */
  alcoholFree?: boolean;
  /** Alkoholgehalt in % vol, falls bekannt. */
  abv?: number | null;
};

export type ComplianceCheckInput = {
  text: string;
  kind?: ComplianceContentKind;
  beverage?: BeverageContext;
};

export type ComplianceMatch = {
  /** Gefundene Textstelle im Originaltext. */
  text: string;
  /** Zeichenposition im Originaltext (0-basiert). */
  index: number;
  length: number;
  /** Kurzer Ausschnitt rund um die Fundstelle. */
  context: string;
};

export type ComplianceFinding = {
  ruleId: string;
  category: ComplianceCategory;
  categoryLabel: string;
  severity: ComplianceSeverity;
  title: string;
  message: string;
  suggestion: string;
  match: ComplianceMatch;
  sources: ComplianceSource[];
};

export type ComplianceReport = {
  kind: ComplianceContentKind;
  /** Für die Prüfung angenommene Getränkeart. */
  beverageAssumption: "alkoholhaltig" | "alkoholfrei";
  /** true, wenn keine Getränkeangabe vorlag und vorsichtshalber „alkoholhaltig“ angenommen wurde. */
  beverageAssumed: boolean;
  findings: ComplianceFinding[];
  highestSeverity: ComplianceSeverity | null;
  counts: Record<ComplianceSeverity, number>;
  summary: string;
  disclaimer: string;
};

const SEVERITY_RANK: Record<ComplianceSeverity, number> = { hoch: 3, mittel: 2, niedrig: 1 };
const MAX_MATCHES_PER_RULE = 3;
const MAX_TEXT_LENGTH = 20_000;
const NEGATION_WINDOW = 40;
const NEGATION =
  /(?<![\p{L}\p{N}])(?:nicht|kein|keine|keinen|keiner|keinem|keines|nie|niemals|never|no|not|don['’]?t|do\s+not)(?![\p{L}\p{N}])(?!\s+(?:nur|only)(?![\p{L}\p{N}]))/iu;

export function compareSeverity(a: ComplianceSeverity, b: ComplianceSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

/** Vorsichtige Annahme: ohne Angabe gilt das Getränk als alkoholhaltig (> 1,2 % vol). */
export function resolveBeverage(beverage?: BeverageContext): {
  assumption: "alkoholhaltig" | "alkoholfrei";
  assumed: boolean;
} {
  if (beverage?.alcoholFree === true) return { assumption: "alkoholfrei", assumed: false };
  if (typeof beverage?.abv === "number" && Number.isFinite(beverage.abv)) {
    return { assumption: beverage.abv <= 1.2 ? "alkoholfrei" : "alkoholhaltig", assumed: false };
  }
  if (beverage?.alcoholFree === false) return { assumption: "alkoholhaltig", assumed: false };
  return { assumption: "alkoholhaltig", assumed: true };
}

function isNegated(text: string, index: number): boolean {
  const windowStart = Math.max(0, index - NEGATION_WINDOW);
  const before = text.slice(windowStart, index);
  const clauseStart = Math.max(...[".", "!", "?", ";", ",", "\n"].map((sep) => before.lastIndexOf(sep)));
  const clause = clauseStart >= 0 ? before.slice(clauseStart + 1) : before;
  return NEGATION.test(clause);
}

function buildContext(text: string, index: number, length: number): string {
  const radius = 40;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${snippet}${end < text.length ? "…" : ""}`;
}

function ruleApplies(rule: AlcoholAdRule, kind: ComplianceContentKind): boolean {
  return !rule.kinds || rule.kinds.includes(kind);
}

function overlaps(a: ComplianceMatch, b: ComplianceMatch): boolean {
  return a.index < b.index + b.length && b.index < a.index + a.length;
}

/**
 * Prüft einen Werbetext, eine Caption, Hashtags oder einen Bild-Prompt auf typische
 * Risiko-Formulierungen in der Alkoholwerbung. Rein deterministisch, ohne Netzwerk.
 */
export function checkAdCompliance(input: ComplianceCheckInput): ComplianceReport {
  const kind: ComplianceContentKind = input.kind ?? "werbetext";
  const text = typeof input.text === "string" ? input.text.slice(0, MAX_TEXT_LENGTH) : "";
  const { assumption, assumed } = resolveBeverage(input.beverage);
  const candidates: ComplianceFinding[] = [];

  for (const rule of ALCOHOL_AD_RULES) {
    if (!ruleApplies(rule, kind)) continue;
    const severity = rule.severity[assumption];
    if (!severity) continue;
    const message = assumption === "alkoholfrei" && rule.alcoholFreeMessage ? rule.alcoholFreeMessage : rule.message;
    let matchesForRule = 0;
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
      for (const match of text.matchAll(regex)) {
        if (matchesForRule >= MAX_MATCHES_PER_RULE) break;
        const index = match.index ?? 0;
        const found = match[0];
        if (!found) continue;
        if (rule.negatable && isNegated(text, index)) continue;
        candidates.push({
          ruleId: rule.id,
          category: rule.category,
          categoryLabel: COMPLIANCE_CATEGORY_LABELS[rule.category],
          severity,
          title: rule.title,
          message,
          suggestion: rule.suggestion,
          match: { text: found, index, length: found.length, context: buildContext(text, index, found.length) },
          sources: getComplianceSources(rule.sources),
        });
        matchesForRule += 1;
      }
    }
  }

  // Innerhalb einer Kategorie überlappende Treffer zusammenfassen (höchster Schweregrad gewinnt).
  candidates.sort(
    (a, b) => compareSeverity(b.severity, a.severity) || a.match.index - b.match.index || a.ruleId.localeCompare(b.ruleId),
  );
  const findings: ComplianceFinding[] = [];
  for (const candidate of candidates) {
    const duplicate = findings.some(
      (kept) => kept.category === candidate.category && overlaps(kept.match, candidate.match),
    );
    if (!duplicate) findings.push(candidate);
  }

  const counts: Record<ComplianceSeverity, number> = { hoch: 0, mittel: 0, niedrig: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  const highestSeverity = findings[0]?.severity ?? null;

  return {
    kind,
    beverageAssumption: assumption,
    beverageAssumed: assumed,
    findings,
    highestSeverity,
    counts,
    summary: summarize(counts, assumption, assumed),
    disclaimer: COMPLIANCE_DISCLAIMER,
  };
}

function summarize(
  counts: Record<ComplianceSeverity, number>,
  assumption: "alkoholhaltig" | "alkoholfrei",
  assumed: boolean,
): string {
  const total = counts.hoch + counts.mittel + counts.niedrig;
  const basis = assumed
    ? " Annahme: alkoholhaltiges Getränk (keine Angabe zur Sorte)."
    : assumption === "alkoholfrei"
      ? " Geprüft als alkoholfreies Getränk."
      : "";
  if (total === 0) return `Keine typischen Risiko-Formulierungen gefunden.${basis}`;
  const parts: string[] = [];
  if (counts.hoch) parts.push(`${counts.hoch} mit hohem Risiko`);
  if (counts.mittel) parts.push(`${counts.mittel} mit mittlerem Risiko`);
  if (counts.niedrig) parts.push(`${counts.niedrig} mit geringem Risiko`);
  return `${total} ${total === 1 ? "Hinweis" : "Hinweise"} auf mögliche Risiken (${parts.join(", ")}).${basis}`;
}

/** Prüft mehrere Texte (z. B. Caption-Varianten) und liefert die Berichte in gleicher Reihenfolge. */
export function checkAdComplianceMany(inputs: readonly ComplianceCheckInput[]): ComplianceReport[] {
  return inputs.map((input) => checkAdCompliance(input));
}
