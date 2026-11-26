import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./env";

// Erzeugt die Testfall-Tabelle für docs/audit/E2E-REPORT.md aus dem JSON-Reporter.
// Aufruf: npx tsx tests/e2e/fixtures/report-table.ts > tabelle.md
type Res = { status: string; errors?: Array<{ message?: string }>; annotations?: Array<{ type: string; description?: string }> };
type Spec = { title: string; file: string; tests: Array<{ projectName: string; results: Res[]; annotations?: Array<{ type: string; description?: string }> }> };
type Suite = { title: string; file?: string; suites?: Suite[]; specs?: Spec[] };

const json = JSON.parse(readFileSync(join(ROOT, "tests", "e2e", ".artifacts", "results.json"), "utf8")) as { suites: Suite[]; stats: Record<string, number> };
const rows = new Map<string, { file: string; title: string; byProject: Record<string, { status: string; reason: string }> }>();
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
const label: Record<string, string> = { passed: "bestanden", failed: "fehlgeschlagen", timedOut: "fehlgeschlagen (Timeout)", skipped: "übersprungen", interrupted: "abgebrochen" };

function walk(s: Suite, prefix: string[]) {
  for (const x of s.suites ?? []) walk(x, x.file ? prefix : [...prefix, x.title]);
  for (const sp of s.specs ?? []) {
    const key = `${sp.file}::${[...prefix, sp.title].join(" › ")}`;
    const row = rows.get(key) ?? { file: sp.file.replace(/^.*[\\/]/, ""), title: sp.title, byProject: {} };
    for (const t of sp.tests) {
      const r = t.results[t.results.length - 1];
      const status = r?.status ?? "skipped";
      const skip = [...(t.annotations ?? []), ...(r?.annotations ?? [])].find((a) => a.type === "skip")?.description;
      const measure = [...(t.annotations ?? []), ...(r?.annotations ?? [])].filter((a) => a.type === "measure").map((a) => a.description).join("; ");
      const err = r?.errors?.[0]?.message ? strip(r.errors[0].message).slice(0, 180) : "";
      row.byProject[t.projectName] = { status: label[status] ?? status, reason: strip(skip || err || measure || "") };
    }
    rows.set(key, row);
  }
}
for (const s of json.suites) walk(s, []);

console.log("| Datei | Testfall | Desktop 1440 | Mobil 390 | Grund / Messwert |");
console.log("|---|---|---|---|---|");
for (const r of rows.values()) {
  if (r.byProject.setup) {
    console.log(`| ${r.file} | ${strip(r.title)} | ${r.byProject.setup.status} (Setup) | – | ${r.byProject.setup.reason} |`);
    continue;
  }
  const d = r.byProject.desktop, m = r.byProject.mobile;
  const reason = [d?.reason ? `D: ${d.reason}` : "", m?.reason && m.reason !== d?.reason ? `M: ${m.reason}` : ""].filter(Boolean).join(" · ");
  console.log(`| ${r.file} | ${strip(r.title)} | ${d?.status ?? "–"} | ${m?.status ?? "–"} | ${reason} |`);
}
console.log(`\nStatistik: ${JSON.stringify(json.stats)}`);
