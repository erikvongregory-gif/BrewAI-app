# 03 – Brand Intelligence & Markenscanner (Agent 3)

Stand: 2026-11-09, 20:10–20:50. Alle Aussagen beziehen sich auf den Arbeitsbaum zu diesem Zeitpunkt. Nicht getestete Punkte sind als solche markiert. Es wurden **keine** KI-/API-Aufrufe ausgeführt (nur Unit-Tests mit HTML-Fixtures).

## (a) Ausgangszustand: So arbeitet der Scanner heute

### Datenfluss

```
Browser (BrandProfileSetupModal, NDJSON-Stream mit Fortschritt)
  │ POST /api/brand/analyze-url {websiteUrl}
  ▼
route.ts: Rate-Limit (8/min) → Same-Origin → Login → 2FA → Team-Recht → zod(Body) → normalizeWebsiteUrl
  │
  ├─ browser-intake.fetchHtml (publicFetch, SSRF-Schutz)  ── Alters-/Cookie-Gate? → Playwright/Chromium,
  │                                                         dessen Requests ebenfalls über publicFetch laufen
  ├─ website-intake.parseWebsiteHtml (Cheerio): Text ≤ 6.000 Zeichen/Seite, ≤ 9.000 gesamt, Bildkandidaten
  ├─ catalog-crawl.crawlCatalogPages: Unterseiten (Sortiment, Über uns …)
  │
  ├─ parallel (Timeout 150 s): product-catalog-crawl → catalog-ai.detectCatalogWithAi
  │     1. collectCatalogCards: jedes Bild + Umfeld (Alt, Text, Link, Rubrik), Seiten (Titel, Überschriften, Eckdaten)
  │     2. Claude (Text): Sorten, Kategorie, Gebinde, Bild-IDs  (max_tokens 5.000)
  │     3. Claude Vision: Bild zeigt diese Flasche? Gebinde, Glasfarbe (Batches à 16 Bilder, 448 px)
  │     4. Nachsuche für Sorten ohne Bild (bis 24 Sorten × 6 Bilder, je 1 Aufruf)
  │     Fallback ohne KI: beer-catalog-intake.extractBeerVarietiesFromIntake (Regeln über Slugs/Dateinamen)
  │
  ├─ downloadCandidateImages → pickBrandReferenceImages (Heuristik) → optional Claude-Vision-Vorauswahl
  ├─ brand-analysis.analyzeWebsiteBrand: Claude (Text + ≤ 6 Bilder) → breweryName, brandTone,
  │     brandColors, brandDos, brandDonts (5 Freitextfelder)
  ├─ persistSuggestedBeerLabels: Sortenbilder freistellen (sharp) → eigener Storage (Budget 30 s)
  ├─ extract-brand-fonts: Headline-Schrift aus CSS/Google Fonts → Storage
  └─ assessBrandAnalysisFields: high/medium/low je Feld aus Mengen (Textlänge, Bildanzahl)
  ▼
Antwort: suggestion (Profilfelder, suggestedBeers, Referenz-URLs, Etikett-URL, Schrift) + sourceMeta
  ▼
BrandReviewPanel (Prüfschritt) → POST /api/brand/activate-profile (zod, strippt unbekannte Felder)
  ▼
save-brand-profile.persistBrandProfileForUser
  ├─ Profilfelder → auth.user_metadata.dashboard.settings (sanitizeDashboardSettings, feste Feldliste)
  └─ Sortiment → Tabelle public.dashboard_beers (replaceSuggestedBeers + replaceDashboardBeers force)
  ▼
Generierung: getBrandProfileFromMetadata → buildBrandProfilePromptContext (Text-Block STRICT/BALANCED/LOOSE)
  → api/claude/prompt, api/openai/image2/generate, api/kie/nano-banana/create-task, suggest-copy,
    run-studio-generation; image-prompt-v3 übernimmt den Block als „BRAND CONTEXT“;
    Etikett/Flasche über etikettUrl, brandLabelReferenceUrl und die *Reference.ts-Bildreferenzen.
```

### Modelle und grobe Kosten pro Scan (Schätzung, nicht gemessen)

- Modell: `createAnthropicMessageWithModelFallback` → `ANTHROPIC_MODEL` bzw. `claude-sonnet-4-6`, Fallback `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001` (`src/lib/anthropic/modelCandidates.ts:8-11`).
- Aufrufe je Scan: 1× Markenanalyse (≈ 3 k Text-Token + bis 6 Bilder), 0–1× Bild-Vorauswahl (bis 12 Bilder), 1–2× Sortiment-Extraktion (bis 260 Karten, grob 20–45 k Eingabe-Token, ≤ 5 k Ausgabe), n× Vision-Prüfung (16 Bilder à 448 px je Batch), bis 24× Nachsuche (je ≤ 6 Bilder).
- Grobe Größenordnung: 60–150 k Eingabe-Token je Scan bei mittlerem Sortiment. Mit Sonnet-Preisen liegt das im Bereich einiger Zehn Cent pro Scan. **Annahme**, keine Messung: Für eine belastbare Zahl `usage` der Antworten protokollieren (siehe offene Punkte).

### Speicherung

- Profiltexte, Referenz-URLs, Etikett-URL, Schrift: `user_metadata.dashboard.settings` (feste Feldliste in `src/lib/dashboard/settingsPayload.ts:75ff`, Agent 1).
- Sortiment: `public.dashboard_beers` (Spalte `item`, bereinigt durch `sanitizeDashboardBeers`, Agent 1).
- Bilder: Supabase Storage (Referenzbilder, freigestellte Sortenbilder, Schriftdatei).

## (b) Befunde (priorisiert)

| # | Prio | Ort | Befund | Wirkung auf Ergebnisqualität |
|---|---|---|---|---|
| 1 | kritisch | `src/lib/dashboard/brandProfile.ts:225` (vorher `:184`) | Alle fünf Profilfelder gehen als „STRICT lock, mandatory … must match exactly“ in jede Generierung, obwohl `brandTone`, `brandDos`, `brandDonts` reine KI-Interpretationen und `brandColors` KI-Schätzungen sind. Es gibt keinerlei Unterscheidung belegt/geschätzt. | Erfundene Farben oder Bildregeln werden zur harten Vorgabe und überstimmen das Briefing („brand profile wins“). |
| 2 | kritisch | `src/lib/brand/catalog-ai.ts:536` (vorher `:445`) | KI-Sortennamen wurden nie gegen den Quelltext geprüft. Das Modell darf Namen „so wie der Hersteller sie nennt“ formulieren, tatsächlich aber auch normalisieren, ergänzen oder erfinden. | Falsche oder erfundene Sorten landen im Sortiment und werden später als Produkt generiert. |
| 3 | hoch | `src/app/(dashboard)/inhalte-erstellen/lib/beer-styles.ts:102` (vorher `:93`) | `inferBierstilFromName` liefert bei Fantasienamen ohne Stilwort („Schwarze Anna“, „Jubiläumstrunk“, „Urtyp“, „Rotbier“, „Pale Ale“) stillschweigend `"helles"`. Der Scanner übernimmt das ohne Prüfhinweis; der Prüfschritt hatte **kein** Bierstil-Feld. | Dunkle/rote Biere werden als goldgelbes Helles generiert (falsche Bierfarbe, falsches Glas). |
| 4 | hoch | `src/lib/brand/brand-analysis.ts` (HEAD `:249`), `catalog-ai.ts` Extraktion | Website-Text, Alt-Texte und Dateinamen gingen ohne Abgrenzung in die Prompts; kein Hinweis, dass Seiteninhalte keine Anweisungen sind; Modell-Ausgaben nur auf „ist String“ geprüft. | Prompt Injection über präparierte Seiten (z. B. falscher Markenname, Links in Bildregeln) möglich. |
| 5 | hoch | `brand-analysis.ts` (HEAD `:80`) | Prompt erzwang „genau 5 Hex-Farbcodes“. Gibt es weniger erkennbare Farben, muss das Modell welche erfinden. Farben aus dem CSS der Website wurden nicht genutzt. | Erfundene Palette → falsche Farbwelt in jedem Bild (wegen #1 als Pflicht). |
| 6 | hoch | `src/lib/brand/save-brand-profile.ts:231-232`, `beer-catalog-intake.ts:373-396` | Erneutes Aktivieren: Scan ist „Quelle der Wahrheit“; Sorten, die der Nutzer selbst angelegt hat, werden gelöscht, und Stil/Gebinde/Glas bestehender Sorten werden mit Scan-Werten überschrieben. Ein Feld „vom Nutzer bestätigt“ existiert nicht. | Nutzerkorrekturen gehen bei jedem Neuscan verloren. |
| 7 | mittel | `src/lib/dashboard/settingsPayload.ts:86ff` (Agent 1) | `sanitizeDashboardSettings` baut ein festes Objekt; neue Felder (z. B. Belegstatus) werden beim Speichern verworfen. Gleiches gilt für `sanitizeDashboardBeers` in `metadata.ts`. | Belege und Nutzerbestätigungen können derzeit nicht gespeichert werden (siehe Änderungswünsche). |
| 8 | mittel | `src/lib/brand/brand-profile-display.ts:6` | `parseHexSwatches` liefert bei weniger als 2 Hex-Codes die Platzhalter-Palette `FALLBACK_SWATCHES`; der Prüfschritt zeigt sie wie erkannte Farben. Entfernt der Nutzer eine Farbe, werden die übrigen Platzhalter als Markenfarben gespeichert. Der manuelle Express-Weg speichert sie direkt (`BrandProfileSetupModal.tsx:115`). | Fremde Standardfarben als „Markenfarben“. Nicht geändert (UI-Komponente `ColorPaletteCard` mit leerer Liste ungetestet). |
| 9 | mittel | `brand-analysis.ts:455` | Vertrauen „label: high“, sobald irgendein Packshot gefunden wurde, unabhängig davon, ob er zur Marke passt; `overall` ist ein Mittelwert aus Mengenregeln. | Scheinsicherheit im Prüfschritt. |
| 10 | mittel | `BrandProfileSetupModal.tsx:162-166`, `activate-profile/route.ts:42-56` | Fehlt der Bierstil, setzt der Client „helles“; die Aktivierung strippt alle Zusatzinfos (Belege, Bildstatus). | Unsicherheit geht zwischen Scan und Speicherung verloren. |
| 11 | niedrig | `catalog-ai.ts` Vision/Nachsuche | Text in Bildern (Banner/Etiketten) konnte als Anweisung gelesen werden (visuelle Prompt Injection). | Gering, aber ohne Regel nicht ausgeschlossen. |
| 12 | niedrig | Farben | Externe Stylesheets werden nicht geladen; Farbbelege stammen nur aus Inline-CSS, `style=""` und `theme-color`. | Bei Seiten mit rein externem CSS bleiben Farben „geschätzt“. |

Positiv: Alle Abrufe des Scanners laufen über `publicFetch` (auch Playwright-Requests per Route-Interception, `browser-intake.ts:120`). Guards in den drei Routen (Rate-Limit, Same-Origin, Login, 2FA, Team) sind vorhanden und unverändert.

## (c) Umgesetzte Änderungen

Alle Änderungen sind abwärtskompatibel: neue Felder optional, bestehende gespeicherte Profile funktionieren ohne Migration, keine Änderung an DB-Tabellen, keine Änderung am Bildstil der Prompt-Builder.

1. **Neues Belegmodell** `src/lib/brand/brand-evidence-model.ts` (zod, ohne Cheerio, auch im Browser nutzbar): Status `belegt | geschaetzt | fehlt | bestaetigt`, Quellenarten (Website-Text, Seitentitel, CSS, Dateiname, Bild, Etikett, KI-Schätzung, Nutzer) mit URL und Auszug, Berichtsschema, tolerante Parser, `evidenceStrength` (stark/einfach/schwach/keine aus Anzahl und Art der Belege, **keine Prozentwerte**), `isHardEvidence`.
2. **Belegprüfung** `src/lib/brand/brand-evidence.ts` (Server): deutsch-toleranter Namensabgleich in **einem** Textabschnitt (ä/ae, ß/ss, Bindestriche, Zusammenschreibung; über die Seite verteilte Wörter zählen nicht), Text-Abschnitte aus HTML, CSS-Farben aus Inline-CSS/`style`/`theme-color` mit Grau-Markierung, Farbabgleich KI ↔ CSS (RGB-Abstand ≤ 36), Gesamtbewertung `assessBrandEvidence` und Prompt-Injection-Bausteine (`UNTRUSTED_CONTENT_RULE`, `wrapUntrustedWebsiteContent` mit Längenlimit, Steuerzeichen-Filter und Neutralisierung gefälschter Endmarken).
3. **Markenanalyse gehärtet** `src/lib/brand/brand-analysis.ts`: Website-Text und Bild-Hinweise als abgegrenzter Datenblock, Sicherheitsregel im System-Prompt, Ausgaben per zod validiert und bereinigt (keine URLs/HTML/Steuerzeichen, Längen wie `BRAND_SETTINGS_LIMITS`), „3 bis 5“ statt „genau 5“ Farben, nur tatsächlich vorkommende Farben, belegte CSS-Farben werden mitgegeben, Hex-Ausgabe normalisiert. `buildWebsiteAnalysisUserText` exportiert (testbar ohne KI-Aufruf).
4. **Sortiment gegen Quelltext geprüft** `src/lib/brand/catalog-ai.ts`: Datenblock abgegrenzt (≤ 140.000 Zeichen), Regel „nur Namen, die in den Daten vorkommen“, Bildtext-Regel in Vision/Nachsuche, jeder Sortenname bekommt `nachweis` (belegt mit Fundstelle/URL oder unbestätigt; **nicht verworfen**, der Nutzer entscheidet), Bierstil mit Beleg (`inferBierstilWithEvidence`: Name, sonst Seitentitel/Alt-Text nur wenn sie genau diese Sorte nennen), Zähler `stats.unconfirmed`, `annotateBeersWithEvidence` für den Regel-Fallback.
5. `src/lib/brand/beer-catalog-intake.ts`: `SuggestedBeerVariety` um optionale Felder `nachweis`, `bierstilBelegt` erweitert.
6. `src/app/(dashboard)/inhalte-erstellen/lib/beer-styles.ts`: `inferBierstilFromNameDetailed` (sagt, ob der Stil im Namen steht); `inferBierstilFromName` verhält sich unverändert.
7. `src/app/api/brand/analyze-url/route.ts`: CSS-Farbbelege an die Analyse, Belegbericht `sourceMeta.evidence`, `sourceMeta.beersUnconfirmed`, Prüfhinweise „Name nicht auf der Website gefunden — prüfen oder entfernen“ und „Bierstil nicht angegeben — bitte auswählen“. Guards unverändert.
8. **Prüfschritt** `BrandReviewPanel.tsx`, `BrandProfileSetupModal.tsx`, `brand-review-utils.ts`, `src/lib/brand/brand-profile-display.ts`: aufklappbarer Block „Woher stammen die Angaben?“ je Feld (✓ belegt mit Fundstelle, ? KI-Einschätzung, – fehlt), je Sorte Hinweise „Name nicht auf der Website gefunden“ / „Bierstil prüfen“, Fundstelle als Tooltip, **neues Bierstil-Auswahlfeld** (setzt passendes Glas und markiert den Stil als vom Nutzer gewählt). Client parst die neuen Felder tolerant.
9. **Übergabe an die Bildgenerierung** `src/lib/dashboard/brandProfile.ts`: optionales `brandFieldStatus` im Profil (tolerant gelesen, `parseBrandFieldStatus`). Ist es vorhanden, gehen nur `belegt`/`bestaetigt`-Felder als harte Vorgaben ein, alles andere als kurzer Block „Unconfirmed brand hints (soft inspiration only …)“. **Ohne** Feld (alle heutigen Profile) ist die Ausgabe Byte-gleich zur bisherigen (bestehende Tests unverändert grün).
10. **„Vom Nutzer bestätigt“ beim Aktivieren** (meine Seite der Kette fertig): `brand-profile-display.buildFieldStatusForActivation` (im Prüfschritt geänderte Felder → `bestaetigt`, unveränderte behalten den Scan-Status), `BrandProfileSetupModal` merkt sich den unveränderten Scan-Vorschlag und sendet `brandFieldStatus` nur bei Website-Scans, `activate-profile` nimmt das Feld tolerant an (ungültig → verworfen, nie 400), `save-brand-profile` setzt es immer (auch `undefined`, damit kein alter Status an neuen Werten hängen bleibt). **Gespeichert wird es erst mit F1**, bis dahin verwirft `sanitizeDashboardSettings` das Feld (keine Verhaltensänderung).
11. **Fachkorrekturen von Agent 5** (Bericht 05, Abschnitt f), fachlich geprüft und übernommen:
    - `brewing-knowledge.ts`: NRW-`geometry_profile` passend zur eigenen Beschreibung (schlank, Ø 67,5 mm, ~26 cm); Euroflasche ~23 cm/~7 cm breit statt 25–26 cm, Kommentar zum historischen Schlüssel `vichy_500`; Longneck-Ausschluss korrigiert (NRW ist ~1 cm kürzer, nicht höher); Requisiten: keine Zitronenscheibe/„Bananenblätter“ bei Hefe-/Kristallweizen, kein Koriander bei Saison, Rauchbier „Buchenholzscheite“ statt „Holzkohleakzente“. **Abweichung:** „Holztisch im Biergarten“ nicht als Studio-Requisit übernommen (Szene, kein Requisit; würde Studio-Freisteller mit Biergarten-Kulisse versehen), stattdessen „Brezel“.
    - `src/lib/beverages/beer-appearance.ts`: IPA SRM 6–14, „medium gold to light reddish-amber“, Hex `#E0A040` (Vorschlag Agent 5, visuell noch nicht gegen `beerColorReference` geprüft); Schwarzbier SRM 19–30; Radler ohne Fruchtpartikel.
    - `beer-styles.ts`: Radler-Muster vor Pils, „Alster“ ergänzt (+ Test: „Pils Radler“, „Pilsradler“, „Alsterwasser“ → radler, „Sonnenhof Pils“ → pils).
    - `occasion-templates.ts` „Vatertag-Tour“: maßvoller Genuss, Erwachsene 30+, kein Bollerwagen mit Kästen, keine Trunkenheit (auf ≤ 200 Zeichen gekürzt, Test-Limit).

Neue Tests: `src/lib/brand/brand-evidence.test.ts`, `src/lib/brand/catalog-evidence.test.ts`, neuer Block in `src/lib/dashboard/brandProfile.test.ts`.

**Snapshot-Änderung (bewusst, 1 Zeile):** `prompt-builders/__snapshots__/prompt-builders.test.ts.snap`, Test „builds a product studio prompt snapshot“: `STYLING / PROPS … Zitronenscheibe, frische Weizenähren, Bananenblätter dezent` → `… frische Weizenähren, Brezel`. Grund: Fachkorrektur Requisiten Hefeweizen (Agent 5, Punkt 7). Sonst keine Snapshot-Zeile geändert (per `git diff` geprüft). Bildstil-Texte der V3-/Reportage-/Hautdetail-Arbeit des Gründers nicht angefasst.

## (d) Tests (tatsächlich ausgeführt)

| Befehl | Ergebnis |
|---|---|
| `npx vitest run src/lib/brand/brand-evidence.test.ts src/lib/brand/brand-analysis.test.ts` | 2 Dateien, 18 Tests bestanden |
| `npx vitest run src/lib/brand/catalog-evidence.test.ts src/lib/dashboard/brandProfile.test.ts` | 2 Dateien, 18 Tests bestanden |
| `npx vitest run src/lib/brand src/lib/prompts "src/app/(dashboard)/inhalte-erstellen/lib" src/lib/dashboard/brandProfile.test.ts src/lib/dashboard/beer-store.test.ts src/lib/inhalte-erstellen/image-prompt-v3.test.ts src/lib/openai/beerColorReference.test.ts src/lib/openai/styleLookReferences.test.ts` | 33 Dateien, 271 Tests bestanden, keine Snapshot-Änderung |
| `npx tsc --noEmit --incremental false` (Lauf 1, 20:26) | 2 Fehler, beide in `src/lib/openai/generateImage.test.ts:43` (Agent 6, parallele Arbeit). In meinen Dateien 0 Fehler. |
| `npx tsc …` (Lauf 2, 20:36) | Fehler nur in fremden Dateien: `src/lib/openai/aiWatermark.ts:71/84` (Agent 4), `src/lib/security/fileSignature.test.ts:78` (Agent 1). In meinen Dateien 0 Fehler. |
| `npx tsc …` (Lauf 3, 20:37) | 0 Fehler im gesamten Projekt (die Fehler anderer Agenten waren inzwischen behoben). Die danach geänderte Rauchbier-Requisite ist eine reine Textänderung. |
| Abschlusslauf 20:38 (gleicher Vitest-Befehl + `src/lib/beverages`) | 34 Dateien, 276 Tests bestanden; Snapshot-Diff weiterhin genau 1 Zeile |
| `npx eslint <alle geänderten/neuen Dateien>` | 0 Fehler; Warnungen nur in bestehendem Code (`_payloads` ungenutzt, `react-hooks/set-state-in-effect` in `BrandProfileSetupModal.tsx` und `BrandReviewPanel.tsx`) |
| Nach Übernahme der Fachkorrekturen: gleicher Vitest-Befehl + `src/lib/beverages` | 34 Dateien, 276 Tests bestanden; vorher 2 Fehlschläge (Snapshot Requisiten, Vatertag-Notiz > 200 Zeichen), beide bewusst behoben (Snapshot-Update mit Begründung oben, Notiz gekürzt) |

Der Prompt-Injection-Test nutzt eine präparierte Brauerei-Seite (Anweisungen im Text, im Alt-Text, gefälschte `</website_daten>`-Marke) und prüft: Injection steht vollständig im Datenblock, genau eine schließende Marke, Längenlimit, Ausgabevalidierung entfernt Links/HTML, URL als Markenname wird verworfen. **Nicht getestet:** Verhalten eines echten Modells gegenüber der Seite (bewusst kein kostenpflichtiger Aufruf). UI-Änderungen nur per Typecheck/ESLint geprüft, nicht im Browser angesehen.

## (e) Offene Punkte und Risiken

- **Persistenz fehlt noch:** Belegstatus und „vom Nutzer bestätigt“ werden erst gespeichert, wenn F1/F2 umgesetzt sind. Bis dahin wirkt die Belegprüfung nur im Prüfschritt (Hinweise, Korrektur vor dem Aktivieren). Die Aktivierungskette auf meiner Seite ist fertig.
- **Wichtig für F1:** Wird `brandFieldStatus` gespeichert, ohne dass spätere Bearbeitungen in der Profilansicht das Feld auf `bestaetigt` setzen, bliebe ein dort vom Nutzer neu geschriebener Wert „geschätzt“ und damit nur weich. Deshalb gehört die Merge-Regel in F1 zwingend dazu.
- **Anzeige im Prüfschritt:** Der Belegblock zeigt den Stand des Scans. Ändert der Nutzer z. B. den Namen, steht dort weiter „belegt“ für den alten Wert; beim Aktivieren wird das Feld aber korrekt als `bestaetigt` gesendet.
- **Fachkorrekturen:** IPA-Hex `#E0A040` ist ein Vorschlag von Agent 5, visuell noch nicht gegen die Farbreferenz geprüft. Nicht übernommen (kein Glastyp/keine Stilvariante vorhanden, wäre Datenmodell-Erweiterung): eigener „Altbierbecher“ statt Kölsch-Stange, helles Weizenbock (wird weiterhin dunkel gerendert). Beides an den Orchestrator.
- **Unbestätigte Sorten** werden markiert, nicht verworfen. Falsch-negativ möglich, wenn eine Sorte nur im Bild (Etikett) steht oder auf nicht gecrawlten Seiten; deshalb kein automatisches Löschen.
- **Bierstil „helles“ als Standard** bleibt gespeichert, wenn der Nutzer nichts wählt (Datenformat verlangt einen Stil). Die Generierung behandelt ihn weiterhin als belegt → F3.
- Farbbelege nur aus Inline-CSS (externe Stylesheets nicht geladen). Ein Abruf der ersten 1–2 Stylesheets über `publicFetch` wäre der nächste Schritt (Kosten: zusätzliche Requests, kein KI-Aufruf).
- Kosten pro Scan sind geschätzt, nicht gemessen.
- Konflikte Bierfarbe ↔ Bierstil und Flasche ↔ Gebinde in den Prompt-Buildern habe ich in der Zeit nicht vertieft geprüft (`enforce-prompt-constraints.ts` existiert und hat Tests).
- Read-only-Hinweis: Ich habe einmal versehentlich `git stash list` ausgeführt (nur Auflistung, keine Änderung am Arbeitsbaum oder an Stashes).

## (f) Änderungswünsche an andere Bereiche

**F1 – Agent 1: Belegstatus in den Settings speichern** (`src/lib/dashboard/metadata.ts`, `src/lib/dashboard/settingsPayload.ts`)

```diff
--- a/src/lib/dashboard/metadata.ts  (type DashboardSettings)
+  /** Belegstatus je Markenfeld (Scanner bzw. „vom Nutzer bestätigt“). Optional, Altbestand ohne Feld. */
+  brandFieldStatus?: Partial<
+    Record<"breweryName" | "brandTone" | "brandColors" | "brandDos" | "brandDonts" | "label",
+      "belegt" | "geschaetzt" | "fehlt" | "bestaetigt">
+  >;
--- a/src/lib/dashboard/settingsPayload.ts  (sanitizeDashboardSettings, im return-Objekt)
+import { parseBrandFieldStatus } from "@/lib/dashboard/brandProfile";
 ...
+    ...(parseBrandFieldStatus(cleaned.brandFieldStatus)
+      ? { brandFieldStatus: parseBrandFieldStatus(cleaned.brandFieldStatus) }
+      : {}),
```

Zusätzlich **zwingend** in `mergeDashboardSettings` (bzw. `api/dashboard/settings`): Enthält ein Patch einen der Texte `breweryName`, `brandTone`, `brandColors`, `brandDos`, `brandDonts` mit geändertem Wert und **kein** eigenes `brandFieldStatus`, dann für genau dieses Feld `bestaetigt` setzen:

```ts
const BRAND_TEXT_FIELDS = ["breweryName", "brandTone", "brandColors", "brandDos", "brandDonts"] as const;
if (current.brandFieldStatus && !("brandFieldStatus" in patch)) {
  const next = { ...current.brandFieldStatus };
  for (const field of BRAND_TEXT_FIELDS) {
    if (typeof patch[field] === "string" && patch[field] !== current[field]) next[field] = "bestaetigt";
  }
  merged.brandFieldStatus = next;
}
```

Und in `buildGenericBrandProfilePatch` (meine Datei, sobald der Typ existiert) `brandFieldStatus: undefined` ergänzen. Die Aktivierungskette (Modal → `activate-profile` → `buildActivatedBrandSettings`) ist auf meiner Seite bereits umgesetzt.

**F2 – Agent 1: Sorten-Belege und Nutzerbestätigung erhalten** (`sanitizeDashboardBeers` in `metadata.ts`)

```diff
+  /** optional: Beleg der Sorte und ob der Nutzer Stil/Gebinde selbst gewählt hat */
+  nachweisStatus?: "belegt" | "unbestaetigt";
+  bierstilBelegt?: boolean;
+  nutzerBestaetigt?: boolean;
```

in Typ und Sanitizer (nur diese drei Felder, Werte prüfen). Danach kann `replaceSuggestedBeers` (meine Datei) bei Neuscans Stil/Gebinde/Glas von `nutzerBestaetigt`-Sorten behalten und selbst angelegte Sorten nicht mehr löschen.

**F3 – Agent 6 / Orchestrator: unbelegten Bierstil weich behandeln.** Wenn F2 umgesetzt ist und `bierstilBelegt === false`, sollte die Generierung die SRM-Bierfarbe nicht als harte Vorgabe setzen (oder vorher nachfragen). Kein Diff, betrifft die Generierungspipeline.

**F4 – Orchestrator: Scan-Kosten messen.** In `catalog-ai.askClaude` und `brand-analysis.runClaudeAnalysis` `response.usage` summieren und in `sourceMeta` (nur Zahlen) zurückgeben. Kann ich umsetzen, wenn gewünscht (eigene Dateien).

## (g) Tatsächliche Arbeitsschritte

| Uhrzeit | Schritt |
|---|---|
| 20:10 | Arbeitsplan gelesen, Dateizuständigkeit geklärt |
| 20:10–20:13 | Route `analyze-url`, `brand-analysis`, `catalog-ai`, `save-brand-profile`, `brandProfile`, Prompt-Übergabe, Review-UI gelesen |
| 20:13 | `settingsPayload`/`metadata` geprüft: unbekannte Felder werden verworfen → Persistenz als Änderungswunsch |
| 20:14–20:17 | `brand-evidence.ts` (Belegmodell, Namensabgleich, CSS-Farben, Injection-Schutz) geschrieben |
| 20:17–20:19 | `brand-analysis.ts` gehärtet; `beer-styles.ts`, `beer-catalog-intake.ts`, `catalog-ai.ts`, Route integriert |
| 20:19–20:21 | Modell in `brand-evidence-model.ts` ausgelagert (kein Cheerio im Browser-Bundle), UI-Anpassungen |
| 20:21–20:22 | `brandProfile.ts`: weiche Übergabe unbestätigter Felder |
| 20:23–20:25 | Tests geschrieben und ausgeführt (23 neue Testfälle: 14 + 5 + 4, alle grün), Gesamtlauf 271/271 |
| 20:25–20:28 | `tsc` (1 Lauf), ESLint, zwei ungenutzte eslint-disable entfernt |
| 20:28–20:31 | Bericht (erste Fassung), Zahlen gegengeprüft (Testanzahl korrigiert) |
| 20:31–20:33 | Aktivierungskette `brandFieldStatus` (Modal, `activate-profile`, `save-brand-profile`) |
| 20:33–20:37 | Fachkorrekturen Agent 5 (Punkte 1–8 + Vatertag + Rauchbier-Requisit), Radler-Test, 1 Snapshot bewusst aktualisiert, Gesamtlauf 276/276, `tsc` Lauf 2, ESLint |
| 20:37–20:45 | Bericht ergänzt, `tsc` Lauf 3, abschließender Testlauf |

## (h) Bewertung: Prompt-lösbar oder technisch/modellseitig

| Problem | Prompt-lösbar? | Technische Lösung |
|---|---|---|
| Erfundene Farben | teilweise („3–5, nur vorkommende“, umgesetzt) | CSS-/Logo-Pixel-Belege (CSS umgesetzt; Logo-Pixel per sharp-Quantisierung offen), Belegstatus in der Übergabe (vorbereitet) |
| Erfundene/normalisierte Sortennamen | gering | Quelltext-Abgleich (umgesetzt), Nutzerprüfung (umgesetzt) |
| Falscher Bierstil bei Fantasienamen | nein | Belegpflicht + Auswahlfeld (umgesetzt), Produktseiten-Eckdaten parsen, weiche Übergabe (F3) |
| Prompt Injection | teilweise (Regel + Abgrenzung, umgesetzt) | Schema-Validierung und Ausgabebereinigung (umgesetzt); Restrisiko bleibt modellseitig |
| Logo/Etikett im Bild falsch | nein | Logo-/Etikett-Compositing statt KI-Malen; echte Flaschenfotos als Referenz (teilweise vorhanden über `etikettUrl`) |
| Bild passt nicht zur Marke | nein | Automatische Nachprüfung: Vision-Vergleich generiertes Bild ↔ Etikett-Referenz und Palette (ΔE der dominanten Farben gegen belegte Farben), bei Abweichung Hinweis statt stiller Auslieferung |

**Konzepte (nicht umgesetzt):**
- *Versionierung:* Jeder Scan als unveränderlicher Datensatz (eigene Tabelle `brand_profile_versions` mit Belegbericht, Quell-URLs, Zeitstempel, Modell-ID); das aktive Profil verweist auf eine Version. Rücksprung und Vergleich „was hat sich geändert“ werden damit möglich.
- *Markenänderungen erkennen:* periodischer, KI-freier Vorab-Check (Hash von Titel, CSS-Farben, Sortimentsnamen, Etikett-Bild-Hash); nur bei Abweichung ein neuer KI-Scan und ein Hinweis an den Nutzer.
- *Wiederholbare Analysen:* `temperature: 0` überall (Markenanalyse nutzt 0,3), Modell-ID und Prompt-Version im Belegbericht speichern, Fixtures echter Brauerei-Seiten als Regressionstests.
- *PDF-Brand-Guidelines:* Upload, Textextraktion (pdf-parse o. ä.), Farben/Schriften per Regex aus dem Text als `belegt` mit Quelle „Guideline S. x“; Vorrang vor Website-Schätzungen.
- *Quellenangaben:* liegen jetzt im Belegbericht je Feld und je Sorte vor; mit F1/F2 dauerhaft speicherbar.
