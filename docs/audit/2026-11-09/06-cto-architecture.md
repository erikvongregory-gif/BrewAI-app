# 06 – CTO, Architektur und Qualitätssicherung (Agent 6)

Audit vom 2026-11-09, 20:10–20:44. Bereich laut Arbeitsplan: `src/lib/{generation,kie,ai,http,anthropic,video-studio,social,images,image-types}/**`, `src/lib/openai/{generateImage,imageAspectRatio}.ts`, `inhalte-erstellen/lib/image-clients/**`, `src/lib/inhalte-erstellen/**` (ohne Dateien von Agent 2/3/4), `.github/workflows/**`, `vitest.config.ts`, `eslint.config.mjs`, `docs/architecture/**`.

Kurzfassung: Die teuerste Stelle des Produkts, die Bildgenerierung, lief ohne Zeitlimit und mit Wiederholungen nach Timeouts. Dadurch konnte BrewAI ein Bild doppelt bezahlen, und die Serverfunktion konnte mitten im bezahlten Aufruf abbrechen. Das ist behoben. Ein möglicher Margenfehler bei 1K-Bildern hängt an einer Produktions-Umgebungsvariable und muss sofort geprüft werden (K1). Der Flaky-Test `atomicBilling` läuft jetzt stabil.

---

## (a) Ausgangszustand

- Next.js 16.3.8, React 19.2.4, TypeScript strict, Supabase, Stripe, Vercel. Laut Arbeitsplan 618 TS/TSX-Dateien, 88 Testdateien, 71 Route-Handler. Baseline 20:00: 535 Tests, davon 2 rot (`atomicBilling.test.ts` mit Timeout, `imageApiKey.test.ts` mit Klartext-Key, gehört Agent 1). `tsc` ohne Fehler.
- Eigene Messung um 20:11 (`atomicBilling` und `goLiveBilling` einzeln): 30/30 grün. Der Test „backfills a legacy balance…“ dauert allein schon **2,3 s**, weil er eine zweite PGlite-Datenbank (WASM) startet und Schema plus Migration einspielt. Im Gesamtlauf teilen sich alle Worker die CPU, dazu kamen sechs parallel arbeitende Agenten. Damit reißt der Vitest-Standard (5 s je Test, 10 s je Hook). Ursache ist also CPU-Konkurrenz, kein Logikfehler.
- **KI-Aufrufpfade (Hauptpfad):**
  - Browser → `POST /api/inhalte-erstellen/create-task|social-post` mit Idempotency-Key.
  - Guard → Abo und Token-Stand → `generation_reserve` (RPC) → Antwort 202.
  - `after()` → `executeStudioGeneration`: bis zu 3 Varianten **nacheinander**, je Variante OpenAI `images/edits|generations` oder KIE Nano Banana.
  - Danach Upload in Supabase Storage → `generation_finish` (berechnet nur fertige Varianten).
  - Der Browser pollt `/api/dashboard/jobs`. Ein Cron (GitHub Actions, alle 15 min) gleicht hängende Jobs ab.
  - Übersicht als Diagramm: `docs/architecture/README.md`.
- **Retry- und Timeout-Lage vorher:**
  - `withProviderRetry`: 3 Versuche bei 429, 5xx, Timeout und unbekannten Fehlern, egal ob der Aufruf bezahlt wird.
  - `generateOpenAiImage`: `fetch` ohne AbortSignal, also undici-Default 300 s.
  - Anthropic-Clients: `new Anthropic({ apiKey })` mit SDK-Default von 2 Retries und 10 min Timeout, zusätzlich in `withProviderRetry` verpackt.
  - Client-`fetchWithRetry`: wiederholte auch POST bei 5xx und 429.

---

## (b) Befunde (priorisiert)

### Kritisch

**K1 – Möglicher Verlust je Bild bei 1K-Aufträgen. Hängt an `OPENAI_IMAGE_QUALITY` in Produktion (ungeprüft).**
`src/lib/inhalte-erstellen/run-studio-generation.ts:413-426` (vor meinen Änderungen 388-399).

- Aufträge mit Qualität „medium“ oder ganz ohne Qualitätswahl werden als **1K** abgerechnet: 3 Tokens, +2 mit Referenz, +3 mit Etikett.
- Generiert wird aber mit OpenAI-Qualität **„high“**, solange `OPENAI_IMAGE_QUALITY` nicht gesetzt ist (Zeile 422-426). In `.env.example` ist die Variable nur auskommentiert.
- Belegter OpenAI-Preis für gpt-image-2 „high“ 1024×1536: **0,165 $ allein für den Output**, Referenzbilder kommen dazu.
- Erlös für 3 Tokens im Jahresabo: Start 0,20 €, Growth 0,15 €, Pro 0,12 €, Enterprise 0,09 €.
- Bei Pro und Enterprise liegt der Erlös damit unter den Anbieterkosten (Annahme 1 € ≈ 1,1 $, Kurs nicht geprüft).
- Wirkung: negative Bruttomarge genau bei Vielnutzern. Ist die Variable in Produktion auf `medium` gesetzt, entfällt der Befund (dann 0,041 $ Output).
- Entscheidung des Gründers nötig (siehe f-7). Ich habe nichts geändert, weil jede Lösung entweder die Bildqualität oder den Preis ändert.

### Hoch

**H1 – Bezahlte Bildaufrufe wurden nach Timeout bzw. unbekanntem Fehler wiederholt, ganz ohne Zeitlimit.** `src/lib/openai/generateImage.ts:78` (alt). *Behoben.*

- Ein Timeout nach fertig gerechnetem Bild wird bei OpenAI trotzdem berechnet. Die Wiederholung kostete dann ein zweites Bild.
- Ohne AbortSignal hing ein toter Socket bis zu 300 s.
- Auch „200 ohne Bild“ wurde als 5xx wiederholt, obwohl die Antwort schon bezahlt war.

**H2 – Kein Zeitbudget in der Studio-Pipeline.** `run-studio-generation.ts`, Variantenschleife. *Behoben.*

- `maxDuration = 300` gilt für die Arbeit in `after()` mit.
- Drei Varianten in „Ultra“ (xhigh, 4K) mit bis zu 2 min je Bild (Aussage von OpenAI) passen nicht hinein.
- Folgen: Die Plattform beendet die Funktion während eines bezahlten Aufrufs. Der Job bleibt `reserved`, bis der Reconcile nach ≥ 30 min aufräumt. Der Nutzer wartet umsonst.

**H3 – Doppelte Retry-Schicht bei Anthropic.** `src/lib/anthropic/modelCandidates.ts:57` (alt). *Behoben.*

- SDK-Retries (2) mal `withProviderRetry` (3) ergaben bis zu 9 Anfragen je Modell bei Überlast.
- Der SDK-Timeout von 10 min lag weit über jeder Funktionslaufzeit. Das verstärkte Retry-Stürme.

**H4 – SSRF im Freisteller-Pfad.** `src/app/(dashboard)/inhalte-erstellen/lib/image-clients/background-removal.ts:13` (alt). *Behoben.*

- `/api/generate-isolate` akzeptiert `inputBild: z.string().url()`, und der Server lud diese URL per nacktem `fetch`.
- Damit waren beliebige Ziele erreichbar, auch interne Adressen. Der Status kam über die Fehlermeldung zurück.
- Nutzbar für eingeloggte, zahlende Nutzer.
- Zusätzlich gibt die Route rohe Fehlertexte von Photoroom und remove.bg an den Client weiter (offen, f-3).

**H5 – Reconcile-Cron mit Kopfblockade.** `src/app/api/internal/reconcile/route.ts:16-30` (Agent 1).

- Je Lauf werden nur die 10 ältesten `reserved`-Jobs geprüft.
- Jobs mit Provider-Task, deren Status nie endgültig wird (unbekannter Status, Fehler bei der Abfrage, abgelaufener Task), bleiben für immer vorne in der Schlange.
- Ab 10 solchen Jobs werden neuere hängende Reservierungen nie mehr freigegeben. Kunden-Tokens bleiben blockiert.
- *Behoben in meinen Dateien* (Änderungswunsch F-4 von Agent 1, umgesetzt 20:40–20:41): `src/lib/kie/reconcileJob.ts` und `src/lib/generation/reconcileJob.ts` schließen jetzt ab:
  - Jobs älter als 24 h, auch wenn der Anbieter den Task nicht mehr kennt (404, Netzfehler). Bereits gelieferte Studio-Varianten werden berechnet, der Rest freigegeben.
  - „Erfolg ohne Medien“ nach 15 min Karenz.
- Route-Änderung f-2 ist damit nur noch optional (GET-Handler für Vercel Cron).

**H6 – Zehn KI- und Medien-Routen sind in Produktion erreichbar, die keine UI mehr aufruft.**

- Betroffen: `/api/openai/image2/generate`, `/api/generate-studio`, `/api/generate-hyperrealistic`, `/api/generate-campaign`, `/api/generate-isolate`, `/api/kie/nano-banana/create-task`, `/api/kie/nano-banana/task-status`, `/api/kie/seedance/create-task`, `/api/claude/prompt`, `/api/kie/media`.
- Sie sind abgesichert (Login, Abrechnung), haben aber typische Altlasten:
  - `maxDuration` von 30–90 s bei Bildaufrufen bis 2 min.
  - `/api/openai/image2/generate` sendet `response_format`. Laut Kommentar in `generateImage.ts:57` lehnen GPT-Image-Modelle das ab; zur Laufzeit nicht geprüft.
  - Fängt diese Route nach `reserveGeneration` eine Exception, gibt sie 500 zurück, ohne den Job abzuschließen (`route.ts:287`).
  - Jede Route ist doppelt gepflegte Angriffs- und Kostenfläche.
- Änderungswunsch f-3.

**H7 – Kein Fehler-Tracking und kein Alerting.** Es gibt kein Sentry, kein OpenTelemetry und keine `instrumentation.ts`. Fehler landen nur als Konsolenzeilen in den Vercel-Logs. Ein Quota- oder Auth-Ausfall beim Bildanbieter fällt erst über Kundenbeschwerden auf.

**H8 – Kein Tagesdeckel je Konto.**

- Owner-Konten reservieren 0 Tokens (`src/lib/billing/generationJobs.ts:90`) und haben damit gar keine Grenze.
- Fehlgeschlagene Aufträge werden voll erstattet, obwohl der Anbieter teils trotzdem abrechnet. Eine Schleife aus Fehlversuchen ist für Nutzer gratis.
- *Bibliothek gebaut* (`src/lib/ai/costGuard.ts`), Einbindung als f-1.

**H9 – Lieferkette im nächtlichen Prüf-Workflow.**

- `.github/workflows/brand-catalog-nightly.yml` startet `npx --yes tsx`.
- `tsx` steht nicht im Lockfile (nur optionale Peer-Abhängigkeit von Vite). Jede Nacht wird also die jeweils neueste Version aus der Registry geladen und ausgeführt, während `ANTHROPIC_API_KEY` in der Umgebung liegt.
- Änderungswunsch f-4.

**H10 – Nano Banana läuft mit `nsfw_checker: false`.** `src/lib/kie/nanoBananaCharacterGenerate.ts:193` (`createTask`-Body).

- Gilt für Generierungen mit hochgeladenen Fotos realer Personen (Charaktere). Das ist ein Missbrauchsrisiko (Deepfakes).
- Produktentscheidung, deshalb nicht geändert (f-5).

### Mittel

- **M1 – Client-Retry wiederholte nicht idempotente POSTs.** `src/lib/http/fetchWithRetry.ts`. *Behoben.*
  - `/api/brand/analyze-url` (Claude + Vision + Browser, `maxDuration 300`) wurde bei 5xx, 504 oder 429 bis zu zweimal komplett neu gestartet.
  - Das bedeutet bis zu 3 volle Scans und bis zu 15 min Wartezeit. `Retry-After` wurde ignoriert.
- **M2 – Migrationsstrategie ohne einzige Quelle.**
  - 13 Schema- und Migrationsdateien liegen in `docs/*.sql`, darunter `billing-schema.sql`, `generation-jobs-migration.sql`, `request-rate-limits-migration.sql`, `workspaces-migration.sql` und `go-live-security-migration.sql`.
  - Nur 7 neuere liegen in `supabase/migrations/`.
  - Die Reihenfolge ist nirgends festgehalten. Die Tests spielen `docs/*.sql` ein. Eine frische Umgebung lässt sich nicht reproduzierbar aufsetzen.
- **M3 – ModelArk-Client ohne Timeouts.** `src/lib/generation/modelark.ts`, `send`. *Behoben.* Eine hängende Statusabfrage blockierte den ganzen Reconcile-Lauf, auch die nachfolgenden Kontolöschungen.
- **M4 – KIE ohne Timeouts.** Upload und `createTask` hatten kein Limit. Das Polling (180 s) kannte kein Funktionsbudget. *Behoben.*
- **M5 – Alter OpenAI-SDK-Client mit Default-Einstellungen.** `image-clients/openai-image.ts`: 2 stille Retries und 10 min Timeout bei bezahlten Bildaufrufen. *Behoben.*
- **M6 – Keine Kostenmessung je Bild.**
  - Das Feld `usage` der Images API (Tokenzahlen) wurde verworfen. Kosten je Bild und je Konto waren nicht messbar, der Margenbefund K1 nicht überprüfbar.
  - *Behoben:* strukturierte Zeile `domain:"ai-cost"`.
- **M7 – Modell-Lebenszyklus.**
  - `claude-sonnet-4-5-20250929` ist abgekündigt und wird am **2026-11-30** abgeschaltet (Quelle: Anthropic-Modellliste im claude-api-Skill). *Aus der Fallback-Liste entfernt.*
  - Risiko beim SDK-Upgrade: `@anthropic-ai/sdk` 1.0.0 schaltet auf API-Version 2026-10-21. Dort führt `temperature` bei allen Modellen zu HTTP 400.
  - In `src/` stehen 16 Stellen mit `temperature:`, z. B. `catalog-ai.ts` und `compile.ts`.
  - Heute geschützt: `^0.125.0` erlaubt bei 0.x nur Patch-Updates.
- **M8 – CI ohne `concurrency` und `timeout-minutes`.** Ein hängender Job darf bis zu 6 h laufen. `tsc` lief erst nach den Tests. *Behoben.*
- **M9 – Sehr große Client-Komponenten.** `src/components/ui/inhalte-erstellen-studio.tsx` (1.956 Zeilen), `studio-media-library.tsx` (1.320), `ruixen-moon-chat.tsx` (1.195), `onboarding-tour-flow.tsx` (1.148). Das schadet Wartbarkeit und Bundle (Agent 2).
- **M10 – Toter Code.**
  - `src/components/dashboard-stubs/**`: kein Import von außerhalb, allein `chat/data.ts` hat 1.262 Zeilen.
  - `src/app/codex-gallery-preview/`: leerer Ordner, keine Route.
  - `compileBrief` in `src/lib/prompts/prompt-compiler` (3.500 max_tokens): kein Aufrufer außer `index.ts`.
  - `marketing-preview` ist in Produktion per `notFound()` gesperrt, außer `ALLOW_MARKETING_PREVIEW=1` ist gesetzt. Das ist in Ordnung.
- **M11 – GitHub-Cron für den Reconcile.**
  - Alle 15 min sind rund 2.880 Läufe im Monat. GitHub rundet jeden Job auf eine volle Minute auf.
  - Ist das Repo privat (nicht geprüft), übersteigt das allein das Freikontingent von GitHub Free (2.000 min). Je nach Ausgabenlimit kostet das oder der Cron stoppt still.
  - GitHub-Crons laufen zudem oft verspätet. Empfehlung: Vercel Cron (siehe e).

### Niedrig

- **N1 – Polling-Grenzen passen nicht ganz zusammen.** Der Client pollt 2,4 → 7 s und gibt nach 4 min auf; der Server arbeitet bis 270 s. In den letzten ~30 s zeigt der Client „pending“. Harmlos, die Mediathek holt das Ergebnis nach.
- **N2 – Etikett-OCR nur im Instanzspeicher gecacht.** `label-text.ts` cacht in einer `Map` je Instanz. Nach jedem Kaltstart läuft ein neuer Sonnet-Vision-Aufruf. Persistieren im Markenprofil wäre besser (Agent 3).
- **N3 – Prompt Caching lohnt sich kaum.** Die System-Prompts sind meist kürzer als die Cache-Mindestlänge (Sonnet 4.6: 1.024 Tokens, Haiku 4.5: 4.096). `COMPILER_SYSTEM` hat ~2 KB, also ~600 Tokens. Kandidat ist nur die Vision-Schleife in `catalog-ai.ts`, vorher messen.
- **N4 – Typisierung ist gut.** 1 × `any` außerhalb von Tests, 42 `eslint-disable`.
- **N5 – Vitest-Konfigurationswarnung.** Meldung „ESM syntax in a file loaded as CommonJS (vitest.config.ts)“. Rein kosmetisch. Später in `vitest.config.mts` umbenennen.

---

## (c) Umgesetzte Änderungen

| Datei | Änderung | Nutzen |
|---|---|---|
| `vitest.config.ts` | `testTimeout 30 s`, `hookTimeout 60 s`, Ausschluss lokaler Kopien (`_template_dashboard`, `_t*-preview`, `graphify-out` u. a.) | Behebt den Flaky-Test `atomicBilling` ohne Änderung der Testdatei; verhindert, dass Vorlagen-Ordner als Tests laufen |
| `src/lib/ai/providerRequest.ts` | Neue Optionen für `withProviderRetry`, Standardverhalten unverändert (siehe unten) | Kein Doppelbezug, kein Lauf über das Funktionsende |
| `src/lib/openai/generateImage.ts` | Policy `paid`, Timeout, Budget, Kostenlog (siehe unten) | Kosten, Stabilität, messbare Kosten je Bild |
| `src/lib/inhalte-erstellen/run-studio-generation.ts` | Zeitbudget mit `remainingVariantBudgetMs` (siehe unten) | Keine abgeschossenen bezahlten Läufe; berechnet wird weiterhin nur, was fertig ist |
| `src/lib/kie/nanoBananaCharacterGenerate.ts` | Timeouts für Upload (30 s) und createTask (45 s); Polling durch `budgetMs` begrenzt (max. 180 s) | Stabilität |
| `src/lib/anthropic/modelCandidates.ts` | Retry nur noch an einer Stelle, Timeout je Versuch, Budget, Fallback-Liste bereinigt (siehe unten) | Kein 9-facher Retry-Sturm, vorhersehbare Laufzeit |
| `src/lib/http/fetchWithRetry.ts` | Status-Retries nur noch idempotent, `Retry-After` beachtet (siehe unten) | Kein dreifacher Markenscan; Rate-Limits werden respektiert |
| `src/lib/generation/modelark.ts` | Timeouts GET 20 s, POST 60 s | Reconcile-Lauf kann nicht mehr hängen |
| `src/lib/generation/staleJob.ts` (neu) | Gemeinsame Regeln für abgelaufene Jobs: 24 h, 15 min Karenz für „Erfolg ohne Medien“, Berechnung nur gelieferter Varianten | Einheitliches Verhalten KIE/ModelArk |
| `src/lib/kie/reconcileJob.ts` | F-4: Erfolg ohne Medien nach Karenz abschließen; > 24 h auch bei 404/Netzfehler abschließen | Keine Kopfblockade im Reconcile, keine dauerhaft blockierten Tokens (H5) |
| `src/lib/generation/reconcileJob.ts` | Gleiche Regeln für ModelArk-Videos; Rückgabetyp `GenerationStatus \| null` (Aufrufer ignorieren den Wert) | wie oben |
| `image-clients/background-removal.ts` | Nutzer-URL nur noch über `publicFetch` (SSRF-Schutz, 20 MB, 8 s); Anbieter-Timeout 20 s (passt in `maxDuration 30`) | Sicherheit (H4), Stabilität |
| `image-clients/openai-image.ts` | OpenAI-SDK `maxRetries: 0`, `timeout: 170 s` | Kein stiller Doppelbezug in den Altrouten |
| `src/lib/ai/costGuard.ts` (neu) | Tagesdeckel je Konto (siehe unten) | Schutz vor unbegrenzter Nutzung (H8) |
| `.github/workflows/ci.yml` | `concurrency` mit `cancel-in-progress`, `timeout-minutes: 30`; Reihenfolge lint → tsc → test → audit → build | Schnelleres Feedback, keine 6-h-Hänger, weniger Minuten |
| `.github/workflows/reconcile.yml` | `concurrency` ohne Abbruch, `timeout-minutes: 10` | Keine überlappenden Abgleiche |
| `docs/architecture/README.md` (neu) | Knappe Architektur- und Datenflussübersicht | Einarbeitung, Wartbarkeit |

Details zu den Änderungen mit Kurzbeschreibung „siehe unten“:

- **`src/lib/ai/providerRequest.ts`:**
  - Neue Optionen für `withProviderRetry`: `policy: "default"|"paid"`, `attemptTimeoutMs` (AbortSignal je Versuch an die Operation), `budgetMs` (kein Retry mehr, wenn Wartezeit plus 5 s nicht mehr ins Budget passen), `signal`.
  - Neu `isRetryAllowed`. `paid` wiederholt nur 429 und ausdrückliche 5xx-Antworten (nicht 504), keine Timeouts, Abbrüche oder unbekannten Netzfehler.
  - Das Standardverhalten bleibt unverändert.
- **`src/lib/openai/generateImage.ts`:**
  - Policy `paid`, AbortSignal an `fetch`, Timeout 180 s (`OPENAI_IMAGE_TIMEOUT_MS`, 10–290 s), optional `budgetMs`/`signal`.
  - „200 ohne Bild“ wird nicht mehr wiederholt.
  - Neue Logzeile `domain:"ai-cost"` mit Modell, Größe, Qualität, Referenzanzahl, Dauer, Tokens aus `usage` und geschätzten USD. Ohne Prompt und ohne Nutzerdaten.
  - Neue Helfer `parseOpenAiImageUsage`, `estimateOpenAiImageCostUsd`, `resolveOpenAiImageTimeoutMs`.
- **`src/lib/inhalte-erstellen/run-studio-generation.ts`:**
  - Zeitbudget 270 s ab Request-Start (`STUDIO_FUNCTION_BUDGET_MS`), 25 s Reserve für Persistenz.
  - Weitere Varianten starten nur, wenn noch ≥ 60 s bleiben. Sonst gibt es eine Teil-Lieferung mit Hinweis „Zeitlimit erreicht, nicht erstellt und nicht berechnet“.
  - Restbudget wird an OpenAI bzw. KIE übergeben. Neue reine Funktion `remainingVariantBudgetMs`.
- **`src/lib/anthropic/modelCandidates.ts`:**
  - Retries nur noch in `withProviderRetry` (`maxRetries: 0` am SDK).
  - Timeout je Versuch aus `max_tokens` (45–150 s), Budget 240 s.
  - Optionaler dritter Parameter (`timeoutMs`, `budgetMs`, `signal`), abwärtskompatibel.
  - Abgekündigtes Sonnet 4.5 aus den Fallbacks entfernt.
- **`src/lib/http/fetchWithRetry.ts`:**
  - Status-Retries (5xx, 429, 408) nur noch für idempotente Methoden, ein vorhandenes `Idempotency-Key` oder `idempotent: true`.
  - `Retry-After` wird beachtet; über 10 s gibt es keinen Auto-Retry, die Antwort geht direkt zurück.
  - Netzwerkfehler werden weiterhin wiederholt.
  - Nutzt `globalThis.setTimeout` statt `window`, damit die Funktion testbar ist.
- **`src/lib/ai/costGuard.ts` (neu):**
  - Tagesdeckel je Konto: Aufträge pro Tag, Fehlversuche pro Tag und Tokens pro Tag, mit Tarif-Standards und Env-Notbremse (`AI_COST_GUARD_*`, `AI_COST_GUARD_DISABLED`).
  - `loadCostGuardUsage` liest `generation_jobs` des UTC-Tages. Bei Lesefehlern liefert es `null`, der Aufrufer kann dann zulassen.
  - Deutsche Meldungen mit `Retry-After`.

Neue Tests:

- `src/lib/ai/providerRequest.test.ts`: 8 Fälle (Paid-Policy, Budget, AbortSignal, vorab abgebrochen).
- `src/lib/ai/costGuard.test.ts`: 9 Fälle.
- `src/lib/openai/generateImage.test.ts`: 7 Fälle (Signal, kein Retry nach Timeout, kein Retry bei „200 ohne Bild“ oder bei Inhaltsablehnung, Usage- und Kostenrechnung, Timeout-Grenzen).
- `src/lib/http/fetchWithRetry.test.ts`: 8 Fälle.
- `src/lib/kie/reconcileJob.test.ts`: 8 Fälle; `src/lib/generation/reconcileJob.test.ts`: 6 Fälle (F-4).

Erweiterte Tests:

- `src/lib/anthropic/modelCandidates.test.ts`: `maxRetries: 0` und Timeout, 404-Fallback, Timeout-Formel.
- `src/lib/inhalte-erstellen/run-studio-generation.test.ts`: 3 Budget-Fälle.

Bewusst **nicht** geändert:

- Bildqualität und Preise (K1).
- `nsfw_checker` (H10).
- Der Zeitplan des nächtlichen Prüf-Workflows (Geschäftsentscheidung).
- Die Reihenfolge der Varianten. Eine Parallelisierung hätte den Spar-Abbruch nach einer Inhaltsablehnung ausgehebelt.

---

## (d) Tests (Befehl → tatsächliches Ergebnis)

| Zeit | Befehl | Ergebnis |
|---|---|---|
| 20:11 | `npx vitest run src/lib/billing/atomicBilling.test.ts src/lib/billing/goLiveBilling.test.ts --reporter=verbose` (vor der Änderung) | 2 Dateien, 30/30 grün; Legacy-Backfill-Test 2.319 ms allein |
| 20:26 | `npx vitest run src/lib/ai src/lib/openai/generateImage.test.ts src/lib/http src/lib/anthropic src/lib/inhalte-erstellen/run-studio-generation.test.ts src/lib/kie` | 8 Dateien, 60/60 grün |
| 20:29 | `npx tsc --noEmit --incremental false` (Lauf 1) | 4 Fehler: 2 in meiner `generateImage.test.ts`, sofort behoben. Fremd: `.next/dev/types/validator.ts` (Route `/api/account/export`, veraltete .next-Typen) und `src/lib/security/fileSignature.test.ts:78` |
| 20:29 | `npx eslint <alle meine geänderten Dateien>` | 0 Probleme |
| 20:30 | `npx vitest run --exclude src/lib/openai/imageApiKey.test.ts` (Gesamtlauf, einmalig) | **101 Dateien, 685/685 grün**, 12,8 s, einschließlich `atomicBilling` unter Volllast |
| 20:31 | `npx vitest run src/lib/kie src/lib/inhalte-erstellen/run-studio-generation.test.ts src/lib/openai/generateImage.test.ts` (nach KIE-Budget) | 3 Dateien, 26/26 grün |
| 20:33 | `npx tsc --noEmit --incremental false` (Lauf 2) | Meine Dateien fehlerfrei. Fremd: `src/lib/openai/aiWatermark.ts:71,84` (TS2503, Namespace `sharp`, Agent 4) und `fileSignature.test.ts:78` (Agent 1) |
| 20:34 | `npx vitest run src/lib/anthropic` (nach Bereinigung der Fallback-Liste) | 5/5 grün |
| 20:41 | `npx vitest run src/lib/kie src/lib/generation` (nach F-4, neue Tests `kie/reconcileJob.test.ts` mit 8 und `generation/reconcileJob.test.ts` mit 6 Fällen) | 4 Dateien, 23/23 grün; ESLint 0 Probleme |
| 20:43 | `npx tsc --noEmit --incremental false` (Lauf 3, letzter) | **0 Fehler, Exit 0** (gesamtes Projekt) |

Ungetestet:

- Echte Anbieteraufrufe. Verboten, also keine Messung echter Latenzen oder Kosten.
- Die geänderten Workflow-Dateien. YAML ist nicht ausgeführt, nur gelesen.
- Der `publicFetch`-Pfad im Freisteller. Kein eigener Test, die Route ist ungenutzt.
- Der Gesamtlauf nach den späteren Änderungen (KIE-Budget, Fallback-Liste, Reconcile F-4). Laut Regel lief der Gesamtlauf nur einmal; danach nur gezielte Tests.
- `npm run build`. Den macht der Orchestrator.

---

## (e) Offene Punkte, Risiken, technische Schulden

### Kosten je Generierungsart

Erlös je Token im Jahresabo (`planCatalog.ts` `monthly` / `tokenState.ts`):

| Tarif | Erlös je Token |
|---|---|
| Start | 0,0658 € (79 € / 1.200) |
| Growth | 0,0497 € |
| Pro | 0,0399 € |
| Enterprise | 0,0300 € (599 € / 20.000) |

Beim Monatsabo liegt der Erlös höher (`compareAtMonthly`).

Anbieterpreise:

- OpenAI: developers.openai.com/api/docs/pricing und Leitfaden „Image generation“, abgerufen 2026-11-09. `gpt-image-2.5-sunburst` kostet je 1 Mio. Tokens 5 $ Text-Input, 8 $ Bild-Input und 30 $ Bild-Output; Batch kostet die Hälfte. Bildpreise stammen aus der Tabelle „Historical output costs“ von gpt-image-2. Für xhigh/max und Custom-Größen gibt es keine Tabelle.
- KIE: kie.ai/pricing, abgerufen 2026-11-09, nur „ab“-Preise, 1 Credit ≈ 0,005 $.
- Anthropic: Preistabelle im claude-api-Skill, Stand 2026-10-06. Sonnet 4.6 kostet 3 $ Input und 15 $ Output je 1 Mio. Tokens, Haiku 4.5 kostet 1 $ und 5 $.

| Generierungsart | Anbieter | Belegter Anbieterpreis | Tokens | Erlös (Start … Enterprise) | Bewertung |
|---|---|---|---|---|---|
| Bild 1K, Qualität high (Default ohne Env), ohne Referenz | OpenAI | 0,165–0,211 $ (nur Output) | 3 | 0,20 … 0,09 € | **Pro/Enterprise unter Kosten** (K1) |
| Bild 1K, Qualität medium (wenn Env = medium) | OpenAI | 0,041–0,053 $ (nur Output) | 3 bis 8 | 0,20 … 0,09 € (3 Tokens) | positiv |
| Bild 2K high + Referenz + Etikett (Produktfoto-Standard) | OpenAI | **nicht belegt** (Custom-Größe bis 2560 px) | 11 | 0,72 … 0,33 € | unbekannt; falls Output-Tokens mit der Pixelzahl wachsen (Annahme, nicht belegt): ≈ 0,5 $, also über dem Enterprise-Erlös |
| Bild 4K „Ultra“ (xhigh) | OpenAI | **nicht belegt** | 12 bis 17 | 0,79 … 0,36 € bis 1,12 … 0,51 € | höchstes Risiko, zuerst messen |
| Bild mit Charakter | KIE Nano Banana Pro | ab 18 Credits ≈ 0,09 $ (ohne Auflösungsaufschlag) | 8 bis 11 (2K) | 0,53 … 0,24 € (8 Tokens) | positiv, sofern der 2K-Aufschlag moderat ist |
| Video Seedance 2.5, 720p, 5 s, Audio | BytePlus ModelArk direkt | **nicht belegt**; Vergleich KIE ab 0,085 $/s ≈ 0,43 $ (Wiederverkäufer) | 100 | 6,58 … 3,00 € | deutlich positiv (Annahme) |
| Etikett-OCR je Auftrag | Sonnet 4.6 | Token-Preise oben | 0 | – | geschätzt 0,005–0,01 $ je Aufruf (~1,5 k Input, ≤ 120 Output) |
| Texthilfe (suggest-copy, improve-scene, Assistent) | Sonnet 4.6 | Token-Preise oben | 0 | – | geschätzt 0,005–0,015 $ je Aufruf; Schutz nur über Rate-Limits |
| Markenscan (Extraktion 5.000, Vision 1.800 je Batch, Auswahl 400 max_tokens) | Sonnet 4.6 | Token-Preise oben | 0 | – | geschätzt 0,05–0,30 $ je Scan, unbelegt |
| Nächtlicher Prüfsatz (7 Brauereien) | Sonnet 4.6 | Token-Preise oben | – | – | geschätzt 0,35–2,10 $ je Nacht ≈ 11–64 $ im Monat; wöchentlich spart ~85 % |

Alle „geschätzt“-Werte sind Annahmen aus `max_tokens` und Prompt-Längen, nicht gemessen. Messen lässt sich das ab sofort über die `ai-cost`-Logzeilen (Bilder). Für Texte empfiehlt sich das Gleiche mit `response.usage`.

### Risiken und Schulden (Aufwand/Nutzen)

| # | Punkt | Aufwand | Nutzen | Priorität |
|---|---|---|---|---|
| 1 | K1 entscheiden: Qualität an die gewählte Stufe koppeln (medium → `medium`) **oder** 1K-high teurer abrechnen; Prod-Env prüfen | 0,5 h | Marge je Bild | P0 |
| 2 | `ai-cost`-Logs auswerten (Vercel Log Drain/Observability), `usage` zusätzlich in `generation_jobs.result` speichern (Datei von Agent 1) | 2 h | Echte Kosten je Bild und Konto, Preisgrundlage | P1 |
| 3 | Fehler-Tracking und Alerting: Sentry (Next.js) oder Vercel-Alerts auf `domain:"ai-provider"`-Zeilen mit `error` (Quota/Auth) | 2–4 h | Ausfälle in Minuten statt Tagen | P1 |
| 4 | `costGuard` einbinden (f-1) | 1 h | Deckel für Owner, Skripte und Fehlerschleifen | P1 |
| 5 | Reconcile entblocken (f-2); Cron auf Vercel Cron umziehen (Vercel sendet `Authorization: Bearer $CRON_SECRET` selbst; die Route braucht dafür einen `GET`-Handler; Hobby-Tarif nur täglich) | 1–2 h | Keine dauerhaft blockierten Tokens; kein Minutenverbrauch bei GitHub | P1 |
| 6 | Altrouten löschen (f-3) nach Prüfung der Vercel-Logs (30 Tage) auf Aufrufe | 1–2 h | Weniger Angriffs- und Kostenfläche | P1 |
| 7 | Job-Queue für Bilder statt `after()` (Vercel Queues/Workflow, Inngest oder Supabase-Worker): eine Nachricht je Variante, Parallelität 2, Wiederaufnahme ohne Doppelbezug | 1–3 Tage | Kein 300-s-Limit, 4K mit 3 Varianten sicher, schnellere Lieferung | P2 |
| 8 | Bis dahin: Varianten 2 und 3 parallel starten, nachdem Variante 1 nicht wegen Inhaltsprüfung abgelehnt wurde | 2 h | Halbiert die Wartezeit bei 3 Varianten | P2 |
| 9 | Migrationen konsolidieren: Baseline aus `docs/*.sql` nach `supabase/migrations/`, CI-Job spielt alle Migrationen in PGlite ein | 0,5–1 Tag | Reproduzierbare Umgebungen, keine Drift | P2 |
| 10 | Große Client-Komponenten zerlegen und per `dynamic()` nachladen (M9) | 1–2 Tage | Wartbarkeit, kleineres Bundle | P3 |
| 11 | Toten Code entfernen (M10) | 1 h | Wartbarkeit | P3 |
| 12 | Etikett-OCR-Ergebnis persistieren, Markenscan je URL 24 h cachen | 2–3 h | Weniger Claude-Aufrufe | P3 |
| 13 | Vor SDK 1.0: `temperature` entfernen oder API-Version festlegen (M7). Optional Sonnet 5.5 prüfen (2 $/10 $ statt 3 $/15 $ je 1 Mio. Tokens, ~33 % günstiger). Braucht Anpassungen: kein `temperature`, Thinking/Effort steuern, Qualitätsvergleich | 0,5–1 Tag | Upgrade-Sicherheit, ~⅓ weniger Textkosten | P3 |
| 14 | Nächtlichen Prüfsatz auf wöchentlich oder „bei Änderungen an `src/lib/brand/**`“ umstellen | 0,25 h | ~85 % der Prüfkosten | P3 |
| 15 | OpenAI Batch (−50 %) für nicht eilige Serienaufträge, z. B. Kampagnenpakete über Nacht | 1–2 Tage | Halbe Bildkosten in diesem Segment | P3 |
| 16 | **Offen: F3 von Agent 3** – unbelegten Bierstil (`bierstilBelegt === false`) in der Generierung nur weich verwenden (siehe f-11) | 2–3 h über 4 Dateien und 3 Zuständige | Keine falsche Bierfarbe bei geschätztem Stil | P2 |

---

## (f) Änderungswünsche an andere Bereiche

**f-1 (Agent 1) – `src/lib/billing/generationJobs.ts`: Tagesdeckel vor der Reservierung einbinden.**

Abgleich mit Agent 1 (20:44): Dessen F2 zählt jetzt Stunden- und Tageslimits je Konto (30/100 Anfragen, Schlüssel `user:<id>`). Damit ist die reine Auftragszahl schon begrenzt. f-1 bleibt sinnvoll für das, was F2 nicht abdeckt: den Deckel für Fehlversuche (erstattete Aufträge, die beim Anbieter trotzdem kosten), den Token-Tagesdeckel und Owner-Konten. Bei der Einbindung `maxJobsPerDay` auf F2 abstimmen oder weglassen.

```diff
+import { evaluateCostGuard, isCostGuardDisabled, loadCostGuardUsage, resolveCostGuardLimits, type CostGuardPlan, type CostGuardQueryClient } from "@/lib/ai/costGuard";
+import { getEffectiveBillingRow } from "./store";
@@ export async function reserveGeneration(
   const owner = await isOwnerUserId(userId);
   const key = req.headers.get("idempotency-key") ?? randomUUID();
   if (!/^[\w:-]{1,160}$/.test(key)) {
     return NextResponse.json({ error: "Ungültiger Auftragsschlüssel." }, { status: 400 });
   }
+  if (!isCostGuardDisabled()) {
+    const usage = await loadCostGuardUsage(createAdminClient() as unknown as CostGuardQueryClient, userId);
+    if (usage) {
+      const row = owner ? null : await getEffectiveBillingRow(userId);
+      const plan: CostGuardPlan = owner ? "owner" : (["start", "growth", "pro", "enterprise"].includes(String(row?.plan)) ? row!.plan as CostGuardPlan : "start");
+      const decision = evaluateCostGuard({ usage, requestTokens: owner ? 0 : amount, limits: resolveCostGuardLimits(plan) });
+      if (!decision.allowed) {
+        console.warn(JSON.stringify({ domain: "ai-cost-guard", reason: decision.reason, userId, usage: decision.usage }));
+        return NextResponse.json(
+          { error: decision.message, code: "daily_cost_limit", reason: decision.reason, retryAt: decision.retryAt },
+          { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) } },
+        );
+      }
+    } // usage === null: DB-Lesefehler → zulassen, das Token-Guthaben schützt weiter
+  }
   const { data, error } = await createAdminClient().rpc("generation_reserve", {
```

Hinweise zu f-1:
- Wiederaufnahmen mit gleichem Schlüssel laufen in den Studio-Routen schon vorher über `resumeGenerationIfPresent` und sind nicht betroffen.
- Den `plan`-Typ von `BillingRow` bitte abgleichen. Ich habe ihn nicht geprüft.

**f-2 (Orchestrator, Route von Agent 1) – `src/app/api/internal/reconcile/route.ts`: nur noch optional.**

Stand 20:41: Die Kopfblockade für Jobs mit Provider-Task ist in `kie/reconcileJob.ts` und `generation/reconcileJob.ts` gelöst (F-4). Der folgende Diff fängt zusätzlich den seltenen Fall ab, dass der Reconcile-Aufruf für einen alten Job wiederholt eine Exception wirft (z. B. fehlender `KIE_API_KEY`).

```diff
   for(const row of jobs.data??[]) {
     try {
+      // Nach 24 h liefert kein Anbieter mehr: Reservierung freigeben statt die Schlange zu blockieren.
+      if(Date.parse(row.created_at)<Date.now()-24*60*60*1000) {
+        const images=Array.isArray(row.result?.images)?row.result.images:[];
+        const cost=Number(row.result?.perVariantCost??0);
+        await finishGeneration(row as GenerationJob,Math.min(row.amount,images.length*cost),{...row.result,images,error:images.length?undefined:"Auftrag nach 24 h ohne Ergebnis beendet; Reservierung freigegeben."});
+        continue;
+      }
       if(row.provider_task_id && isModelArkRequestId(row.provider_task_id))await reconcileModelArkJob(row);
```

Optional: `export async function GET(req) { return POST(req); }` für Vercel Cron.

**f-3 (Agent 1) – Altrouten entfernen.** Nach Prüfung der Vercel-Logs (keine Aufrufe in 30 Tagen; externe Automationen wie n8n/Make ausschließen) diese Ordner löschen:

- `src/app/api/openai/image2/generate`
- `src/app/api/generate-studio`
- `src/app/api/generate-hyperrealistic`
- `src/app/api/generate-campaign`
- `src/app/api/generate-isolate`
- `src/app/api/kie/nano-banana/create-task`
- `src/app/api/kie/nano-banana/task-status`
- `src/app/api/kie/seedance/create-task`
- `src/app/api/claude/prompt`
- `src/app/api/kie/media`

Danach kann ich `image-clients/openai-image.ts` und `background-removal.ts` mitlöschen. Bleibt `generate-isolate`, sollten Photoroom- und remove.bg-Fehlertexte nicht roh an den Client gehen:

```diff
- if (!res.ok) throw new Error(`Photoroom failed: ${res.status} ${await res.text()}`);
+ if (!res.ok) { console.warn(JSON.stringify({ domain: "ai-provider", provider: "photoroom", status: res.status })); throw new Error("Freisteller fehlgeschlagen."); }
```

**f-4 (Orchestrator) – `package.json` und nächtlicher Workflow.** `tsx` als fest gepinnte devDependency aufnehmen. Danach ändere ich (oder der Orchestrator) den Workflow:

```diff
-          npx --yes tsx scripts/test-brand-catalog.ts --golden scripts/brand-catalog-golden.json
+          npx tsx scripts/test-brand-catalog.ts --golden scripts/brand-catalog-golden.json
```

Optional zusätzlich `concurrency: { group: brand-catalog, cancel-in-progress: true }` und Zeitplan wöchentlich (`'30 2 * * 1'`).

**f-5 (Gründer/Agent 4) – `nsfw_checker: false` bei Nano Banana mit Fotos realer Personen.** Entscheiden, ob der Filter an sein soll. Die Datei gehört mir, ich passe sie nach Entscheidung an.

**f-6 (Agent 3, zur Info) – `BrandProfileSetupModal.tsx`:** Der Analyse-POST wird bei 5xx und 429 nicht mehr automatisch wiederholt, die Fehlermeldung erscheint sofort. Bei Netzabbrüchen gibt es weiterhin bis zu 2 Retries. Sollen auch Status-Retries kommen, braucht die Route zuerst einen Idempotency-Key und eine Wiederaufnahme. Danach `{ idempotent: true }` übergeben.

**f-7 (Gründer/Orchestrator) – K1.** Prod-Env `OPENAI_IMAGE_QUALITY` prüfen, nur den Namen, keinen Wert ausgeben. Zwei Möglichkeiten in `run-studio-generation.ts` (meine Datei, Umsetzung nach Entscheidung):

- (a) Qualität an die Stufe koppeln:
  ```diff
  -        : input.quality === "ultra" ? "xhigh" : "high";
  +        : input.quality === "ultra" ? "xhigh" : input.quality === "high" ? "high" : "medium";
  ```
  Das ist günstiger, aber sichtbar schwächere Bilder in „medium“.
- (b) `calculatePerVariantTokenCost` für 1K mit high-Qualität auf ≥ 6 Tokens anheben (Datei von Agent 1, Preisänderung, Kundenkommunikation nötig).

**f-8 (Agent 4) – `src/lib/openai/aiWatermark.ts:71,84` (tsc TS2503 „Cannot find namespace 'sharp'“).** Typ über `import type { Sharp } from "sharp"` oder `ReturnType<typeof sharp>` beziehen.

**f-9 (Agent 1) – `src/lib/security/fileSignature.test.ts:78`.** Laut tsc ist `Uint8Array<ArrayBufferLike>` nicht `BlobPart`. Lösung: `new Blob([new Uint8Array(bytes)])` oder `bytes.slice().buffer`.

**f-10 (Agent 2/3) – Toter Code.** `src/components/dashboard-stubs/**` (Agent 2) und `compileBrief` / `src/lib/prompts/prompt-compiler` (Agent 3, keine Aufrufer) prüfen und entfernen.

**f-11 (offen, Wunsch F3 von Agent 3) – Unbelegten Bierstil weich behandeln.** Nicht umgesetzt. Grund: Das Feld `bierstilBelegt` erreicht die Generierung heute gar nicht. Es hängt nur an den Scanner-Einträgen (`src/lib/brand/beer-catalog-intake.ts:44`). „Meine Biere“ speichert es nicht (F2 offen). Das Studio sendet es nicht. Das Request-Schema verwirft unbekannte Felder. Eine Änderung nur in meiner Datei wäre toter Code. Nötig ist eine Kette über vier Dateien, jeweils mit Test:

1. Persistenz am Bier (F2, `beer-store`/Settings, Agent 3/Orchestrator).
2. Studio sendet `bierstilBelegt` mit (`inhalte-erstellen-studio.tsx`, Agent 2).
3. Schema: `bierstilBelegt: z.boolean().optional()` im `hyperrealisticSchema`/`socialPostSchema` (`inhalte-erstellen/lib/schemas.ts`, Orchestrator).
4. Mein Teil in `run-studio-generation.ts`. Fehlt das Feld, bleibt das Verhalten exakt gleich:

   ```diff
   -  const beerAppearance = (input.produktKategorie ?? "bier") === "bier"
   -    ? await readBeerAppearance(input.bierstil) : undefined;
   +  // Geschätzter Stil (Scanner: bierstilBelegt === false): keine harte SRM-Farbe und kein Farb-Swatch.
   +  const styleConfirmed = (input as { bierstilBelegt?: boolean }).bierstilBelegt !== false;
   +  const beerAppearance = (input.produktKategorie ?? "bier") === "bier" && styleConfirmed
   +    ? await readBeerAppearance(input.bierstil) : undefined;
   @@
   -  const liquidReference = useCharacterIdentity && characterRefs.length + (visionReference ? 1 : 0) >= 4
   +  const liquidReference = !styleConfirmed || (useCharacterIdentity && characterRefs.length + (visionReference ? 1 : 0) >= 4)
        ? null : await buildBeerColorReference(input, beerAppearance);
   ```

5. Der Prompt-Text zum Stil muss dann ebenfalls weich formuliert werden (`image-prompt-v3.ts`, Agent 3). Beispiel: „Bierfarbe passend zum Etikett/Produktfoto, Stil unbestätigt“ statt fester SRM-Angabe.

---

## (g) Arbeitsschritte mit Uhrzeiten

| Zeit | Schritt |
|---|---|
| 20:10 | Arbeitsplan gelesen, Zuständigkeiten geprüft, Vitest- und CI-Konfiguration gelesen |
| 20:11 | PGlite-Tests einzeln gemessen (Ursache Timeout: 2,3-s-Test mit zweiter WASM-DB plus CPU-Konkurrenz) |
| 20:12–20:20 | Analyse: Retry-Helfer, Aufrufer, Studio-Pipeline, Routen samt `maxDuration`, ungenutzte Routen. Preisrecherche OpenAI (Preisseite und Leitfaden) |
| 20:20–20:24 | `vitest.config.ts`, `providerRequest.ts`, `generateImage.ts`, KIE-Timeouts, Zeitbudget der Studio-Pipeline |
| 20:24–20:26 | `modelCandidates.ts`, `fetchWithRetry.ts`, `costGuard.ts` mit Tests; gezielter Lauf 60/60 grün |
| 20:26–20:29 | CI-Workflows; Analyse Reconcile; ModelArk-Timeouts; SSRF-Fix im Freisteller; Altclient OpenAI; Analyse Migrationen, Monitoring, Dateigrößen |
| 20:29 | tsc Lauf 1 (2 eigene Testfehler behoben), ESLint sauber |
| 20:30 | Gesamt-Testlauf: 101 Dateien, 685/685 grün; KIE-Preise recherchiert |
| 20:31 | KIE-Polling an Budget gekoppelt, gezielte Tests 26/26 grün |
| 20:32–20:34 | tsc Lauf 2 (eigene Dateien sauber); Anthropic-Preise und Modell-Lebenszyklus (claude-api-Skill); Sonnet 4.5 aus den Fallbacks entfernt, Tests 5/5 grün |
| 20:34–20:39 | Architekturübersicht `docs/architecture/README.md` und dieser Bericht (erste Fassung), Zahlen gegengeprüft |
| 20:39–20:41 | Wunsch F-4 von Agent 1 umgesetzt (`staleJob.ts`, KIE- und ModelArk-Reconcile) mit 14 neuen Tests, 23/23 grün |
| 20:41–20:42 | Wunsch F3 von Agent 3 geprüft: braucht Felder, die die Generierung noch nicht erreichen → als offen dokumentiert (f-11) |
| 20:43 | tsc Lauf 3: 0 Fehler; Bericht ergänzt, Übergabe |
