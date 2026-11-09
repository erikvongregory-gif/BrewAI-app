import type { ComplianceReport, ComplianceSeverity } from "@/lib/compliance";

const SEVERITY_LABEL: Record<ComplianceSeverity, string> = {
  hoch: "Mögliches hohes Risiko",
  mittel: "Mögliches Risiko",
  niedrig: "Hinweis",
};

const SEVERITY_CLASS: Record<ComplianceSeverity, string> = {
  hoch: "border-red-500/40 bg-red-500/5",
  mittel: "border-amber-500/40 bg-amber-500/5",
  niedrig: "border-border bg-muted/40",
};

type ComplianceHintsProps = {
  report: ComplianceReport | null | undefined;
  /** Überschrift über der Liste; Standard: „Hinweise zur Alkoholwerbung“. */
  title?: string;
  className?: string;
};

/**
 * Zurückhaltende Anzeige der automatischen Werbe-Hinweise. Zeigt nichts, wenn es keine
 * Treffer gibt. Formuliert bewusst als Hinweis – nie als Freigabe.
 */
export function ComplianceHints({ report, title = "Hinweise zur Alkoholwerbung", className }: ComplianceHintsProps) {
  if (!report || report.findings.length === 0) return null;
  return (
    <section aria-label={title} className={["space-y-2 text-sm", className].filter(Boolean).join(" ")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{report.summary}</p>
      </div>
      <ul className="space-y-2">
        {report.findings.map((finding) => (
          <li
            key={`${finding.ruleId}-${finding.match.index}`}
            className={`rounded-md border p-3 ${SEVERITY_CLASS[finding.severity]}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide">
              {SEVERITY_LABEL[finding.severity]} · {finding.categoryLabel}
            </p>
            <p className="mt-1">
              <span className="font-medium">„{finding.match.text}“</span> – {finding.message}
            </p>
            <p className="text-muted-foreground mt-1">Vorschlag: {finding.suggestion}</p>
            <details className="text-muted-foreground mt-1 text-xs">
              <summary className="cursor-pointer">Quelle</summary>
              <ul className="mt-1 space-y-0.5">
                {finding.sources.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">{report.disclaimer}</p>
    </section>
  );
}
