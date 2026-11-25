# BrewAI – Master-Audit vom 9. November 2026

**Zeitraum:** 19:59 bis 21:10 (lokale Zeit, per `date` gemessen; rund 71 der 120 möglichen Minuten). Die restliche Zeit wurde nicht künstlich gefüllt: Die verbleibenden großen Punkte brauchen Entscheidungen des Gründers oder Zugriff auf die Live-Konfiguration (Abschnitt 11). **Vorgehen:** Bestandsaufnahme durch den Orchestrator, danach sechs spezialisierte Agenten parallel (Security, UI/UX, Markenscanner, Recht/DSGVO, Branchenforschung, CTO/QA) mit strikt getrennten Dateibereichen, anschließend Zusammenführung, Gesamttests, Build und Browser-Stichprobe durch den Orchestrator.

**Was nicht passiert ist:** Nichts wurde committet, gepusht oder deployt. Es gab keine kostenpflichtigen KI- oder API-Aufrufe, keine Datenbankmigration wurde ausgeführt, kein Secret wurde rotiert, kein echtes Kundenkonto wurde verändert. Es gab keine aktiven Tests gegen Live-Systeme. Das ist **kein vollständiger Penetrationstest und keine Rechtsberatung**.

**Detailberichte** (mit Datei:Zeile-Belegen, Diffs und Quellen): `docs/audit/2026-11-09/00-arbeitsplan.md` bis `06-cto-architecture.md`, dazu `docs/legal/`, `docs/strategy/` und `docs/architecture/README.md`.

---

## Kompaktübersicht

| Bereich | Ursprünglicher Zustand | Änderungen | Testergebnis | Offene Punkte |
|---|---|---|---|---|
| Sicherheit | Solide Guard-Architektur (Herkunft, Login, 2FA, persistente Rate Limits, Teamzuordnung per DB-Tabelle). Next.js 16.3.8 mit zwei kritischen RCE-Advisories, Lücken bei SSRF (IPv6), Server Actions, Uploads, Kostenlimits und Admin-Rechten | 14 Befunde behoben, 2 teilweise, darunter Paket-Update auf next 16.4.5, zod 4.6.7 und undici 7.30.2. Die 2FA-Gerätebindung liegt jetzt in `app_metadata` | `npm audit --omit=dev`: 0 Schwachstellen. Neue Sicherheitstests grün. Keine IDOR gefunden, per Tests belegt | 2FA wirkt nicht in Supabase selbst (H1). Tokens bei unbezahlten Zahlungen (H2). Live-Policies in Supabase nicht geprüft |
| UI/UX | Gutes Grundgerüst, aber Preisseite mit gesperrten Video-Versprechen, kaputte Umlaute, englische Template-Texte, keine „nächsten Schritte“ für neue Kunden, kein Export und keine Kontolöschung in der Oberfläche | Rund 20 Dateien verbessert. „Nächste Schritte“-Karte, Leer- und Fehlerzustände, mobile Tabelle, Bestätigungsdialoge. Datenexport und Kontolöschung in den Einstellungen. 32 tote Template-Dateien entfernt | Komponententests grün. Browser-Prüfung auf 1440, 1280 und 375 px | Widersprüchliche Aussagen zur Gültigkeit von Token-Paketen. Produktions-Chat (`RuixenMoonChat`) nicht mit Login geprüft |
| Markenscanner | KI-Schätzungen gingen als „STRICT, mandatory“ in jede Generierung. Sortennamen ungeprüft. Website-Text ungeschützt im Prompt. Neuscan löschte selbst angelegte Biere | Belegmodell je Merkmal (belegt, geschätzt, fehlt, bestätigt) mit Quelle. Prompt-Injection-Schutz. Sortennamen werden gegen den Quelltext geprüft. Nur belegte oder bestätigte Felder sind harte Vorgaben. Nutzerkorrekturen überleben einen Neuscan. Fachkorrekturen zu Flaschen und Bierfarben | 276 Scanner- und Prompt-Tests grün, dazu Tests für Persistenz und Neuscan | Unbelegter Bierstil wirkt in der Generierung noch hart. Stylesheets werden nicht ausgewertet. Scan-Kosten nicht gemessen |
| Rechtliches | Kontolöschung ließ 5 Speicherordner zurück. Kein Datenexport. Impressum in der App nicht verlinkt. Datenschutz „akzeptieren“. KI-Kennzeichnung nur per Schalter | Löschung vollständig. Export-Endpunkt und Oberfläche. Impressum verlinkt, Einwilligungstext korrigiert. Maschinenlesbare KI-Kennzeichnung für alle Studio-Bilder. Prüfmodul für Alkoholwerbung (31 Regeln) im Textvorschlag | 72 Tests im Rechtsbereich grün, davon 44 im Prüfmodul | B2B oder B2C, AVV und Drittlandtransfer (KIE, BytePlus), Art. 50 KI-VO für Videos, anwaltliche Prüfung |
| Produktentwicklung | Bild- und Video-Generator mit echtem Brauwissen. Nutzen wird nicht gemessen, „Hopfen Hugo“ ist ein Allzweck-Chat | Marktanalyse mit 42 Quellen, bewertete Funktionsideen, Roadmap, Konzept für Produktionsdaten-Import nur zum Lesen. Assistent auf Brauerei-Themen eingegrenzt | Keine Software-Tests nötig, Quellen im Volltext bzw. als Suchauszug gekennzeichnet | Marketingbudgets kleiner Brauereien nicht belegbar, nur über Pilotgespräche zu erheben |
| Architektur | Bezahlte Bildaufrufe wurden nach Timeout wiederholt, kein Zeitbudget, Retry-Stürme bei Anthropic, SSRF im Freisteller, Reconcile konnte blockieren, flakiger Test, Secret im Testlog | Timeouts und Retry-Regeln für bezahlte Aufrufe, Zeitbudget je Variante, Reconcile mit Abschlussregeln, Kostenschutz-Bibliothek, CI ergänzt, Testinfrastruktur stabil | 729/729 Tests, tsc 0, ESLint 0 Fehler, Build grün | Mögliche negative Marge bei 1K-Bildern (K1, hängt an der Produktions-Env). Kein Fehler-Tracking. 10 Altrouten ohne UI erreichbar |

---

## 1. Ursprünglicher Projektzustand

**Technik:** Next.js 16.3.8 (App Router, Turbopack), React 19.2.4, TypeScript strict, Supabase (Auth, Postgres, Storage, RPC), Stripe, KI-Anbieter OpenAI (Bilder), KIE (Nano Banana, Seedance, GPT Image 2) und Anthropic (Texte, Assistent), Vitest, ESLint 9, Deployment auf Vercel, Reconcile-Cron alle 15 Minuten über GitHub Actions.

**Umfang:** 618 TS/TSX-Dateien unter `src/`, 71 Route-Handler, 88 Testdateien mit 535 Tests.

| Prüfung (vor allen Änderungen) | Ergebnis |
|---|---|
| `vitest run` | 533 von 535 bestanden. Rot waren `atomicBilling.test.ts` (Timeout bei PGlite) und `imageApiKey.test.ts`, der einen echten lokalen OpenAI-Key las und ihn bei Fehlschlag im Klartext ausgab |
| `tsc --noEmit` | 0 Fehler |
| `eslint src scripts` | 0 Fehler, 67 Warnungen |
| `npm audit --omit=dev` | 1 kritisch (next), 2 hoch (zod, undici) |
| CI | lint, test, tsc, build und audit bei jedem Push/PR, bereits vorhanden |

**Architektur in Kürze:** Gemeinsame Guards prüfen der Reihe nach:

- Herkunft (Origin/Referer),
- Anmeldung,
- E-Mail-2FA,
- persistente Rate Limits (Supabase-RPC),
- Teamzugehörigkeit (Tabelle `workspace_members`, nur serverseitig beschreibbar),
- bei Bezahlfunktionen das Abo.

Nutzdaten wie Markenprofil und Medienreferenzen liegen größtenteils in der `user_metadata` des Konto-Inhabers. Dateien liegen in Supabase Storage mit Pfadprüfung pro Nutzer. Datenbankmigrationen liegen verstreut: 7 in `supabase/migrations/`, 13 SQL-Dateien in `docs/`.

**Vorarbeiten:** Sicherheitsprüfung vom 8. Oktober 2026 (`SECURITY-REVIEW-2026-10-08.md`).

**Nicht committete Arbeit des Gründers:** Nonce-basierte CSP und Auth-Umbau in 17 geänderten und 5 neuen Dateien. Vor Beginn gesichert als Git-Ref `refs/audit/wip-baseline-20261109` (Commit 266f155). Agent 1 hat sie geprüft und keinen Fehler gefunden. Sie ist bis auf das Entfernen der Werbekarte in `brewai-admin-shell.tsx` unverändert erhalten.

**Kritische Einschätzung des Produkts** (Agent 5, belegt in `05-industry-product.md`):

- BrewAI ist heute ein Bild- und Video-Generator mit echtem Brauwissen: 26 Bierstile, 11 Gläser, 13 Gebinde, Etiketttreue.
- Im Produkt wird nur der Token-Verbrauch gemessen, nicht Veröffentlichung, gesparte Zeit oder Absatz. Jede Verlängerung ist für den Kunden damit eine Bauchentscheidung.
- Der Assistent „Hopfen Hugo“ war ein Allzweck-Chat. Das ist der Teil, der am stärksten nach austauschbarem GPT-Wrapper aussieht.

---

## 2. Gefundene Sicherheitsprobleme

| ID | Schwere | Befund | Status |
|---|---|---|---|
| K1 | kritisch | next 16.3.8: RCE im Image-Optimizer (SVG), RCE in `use cache`, DoS über Server Actions. Dazu zod < 4.6.6 (Speicherauslastung) und undici < 7.30.1 (TLS, Cache-Poisoning, DoS) | **behoben** (next 16.4.5, zod 4.6.7, undici 7.30.2) |
| H1 | hoch | 2FA wirkt nur in der Next.js-Schicht. Mit Passwort und öffentlichem Anon-Key bekommt man direkt eine Supabase-Session, kann `user_metadata` (Markenprofil, Einstellungen) lesen und ändern und `password_epoch` zurücksetzen. Damit würde ein altes Trusted-Device-Cookie nach einem Passwortwechsel wieder gültig | **teilweise behoben:** Epoch maßgeblich in `app_metadata`. Offen bleibt, dass `user_metadata` per Passwort ohne 2FA lesbar und änderbar ist |
| H2 | hoch | Tokens werden unabhängig vom Zahlungsstatus gutgeschrieben (`incomplete`, `unpaid`). `async_payment_failed` wird nicht behandelt. Ausnutzbar bei verzögerten Zahlarten wie SEPA, falls im Stripe-Dashboard aktiv | **offen**, Entscheidung nötig (Vorschlag in `01-security.md` (f) F-3) |
| H-SSRF | hoch | `/api/generate-isolate` lud eine Nutzer-URL per nacktem `fetch` (interne Adressen erreichbar) | **behoben** (über `publicFetch`) |
| F1 | mittel | SSRF-Sperrliste ließ `::/96`, NAT64 `64:ff9b::/96` und `fec0::/10` durch | **behoben** |
| F2 | mittel | Kostenlimits (30/h, 100/Tag) per IP-Wechsel umgehbar | **behoben** (pro Konto) |
| F3 | mittel | Server Actions konnten beliebige Cookies lesen und setzen, auch HttpOnly-Session und 2FA | **behoben** |
| F4 | mittel | Admin konnte Owner-Konten entmachten und die eigene Rolle ändern | **behoben** |
| F5 | mittel | Operator-Zugang ohne Rate Limit; das Token fällt auf den Owner-2FA-Backup-Code zurück | **teilweise behoben** (Rate Limit, no-referrer). Fallback entfernen, sobald ein eigenes Secret gesetzt ist |
| O1 | mittel | Reconcile konnte von 10 hängenden Jobs dauerhaft blockiert werden; Kunden-Tokens blieben reserviert | **behoben** |
| F6–F10 | niedrig | Uploads ohne Magic-Byte-Prüfung, Bonus-Fallback vertraute `user_metadata`, `generation/status` ohne Herkunftsprüfung, Mediathek nahm `javascript:`-URLs an, Test gab echten API-Key aus | **behoben** |
| O2 | niedrig | HMAC-Vergleiche nicht zeitkonstant | **behoben** |
| H9 | hoch (Lieferkette) | Nächtlicher Workflow lud ungepinntes `npx --yes tsx`, während `ANTHROPIC_API_KEY` gesetzt war | **behoben** |
| O3–O7 | niedrig | Content-Type im SVG-Download; In-Memory-Rate-Limits pro Instanz; Owner-Teams generieren unbegrenzt; Backup-Schema mit Nutzerdaten; veraltete Datei-Konvention `middleware.ts` | **offen**, dokumentiert |
| H10 | hoch (Missbrauch) | Nano Banana läuft mit `nsfw_checker: false` bei Fotos realer Personen | **offen**, Produktentscheidung |

**Ausdrücklich geprüft und ohne Befund:**

- **Mandantentrennung:** Alle Routen scopen auf die Workspace-ID, Viewer bekommen bei Schreibzugriffen 403, Billing ist nur für Inhaber offen. Belegt mit Tests in `src/lib/security/apiGuards.test.ts` und `adminBillingBoundaries.test.ts`.
- **Owner-Erkennung:** läuft über `app_metadata`.
- **Speicherpfade:** Pfade aus Metadaten werden nur für den eigenen Nutzer signiert.
- **Secret-Scan:** über getrackte Dateien ohne Treffer.

**Sofort zu beachten:** Der fehlerhafte Test `imageApiKey.test.ts` hat zu Beginn den echten lokalen OpenAI-Image-Key im Klartext ausgegeben, damit steht er auch im Sitzungsprotokoll dieses Audits. Der Test ist repariert, das lokale Log bereinigt. **Empfehlung: Key rotieren** (`npm run openai:rotate-image-key`). Das wurde ohne Freigabe nicht gemacht.

---

## 3. Tatsächlich behobene Sicherheitsprobleme

| Fix | Dateien | Nachweis |
|---|---|---|
| Paket-Update next 16.4.5, eslint-config-next 16.4.5, zod 4.6.7, undici 7.30.2 | `package.json`, `package-lock.json` | `npm audit --omit=dev`: 0, Build grün |
| SSRF-Sperrliste IPv6/NAT64 | `src/lib/security/public-fetch.ts` | `public-fetch.test.ts` |
| SSRF im Freisteller | `inhalte-erstellen/lib/image-clients/background-removal.ts` | Tests von Agent 6 |
| Kostenlimits pro Konto statt IP+Konto | `src/app/(dashboard)/inhalte-erstellen/lib/api-guards.ts` | `src/lib/security/apiGuards.test.ts` |
| Server Actions nur für Darstellungs-Einstellungen | `src/server/server-actions.ts` | `serverActions.test.ts` |
| Admin darf Owner und sich selbst nicht umstufen | `src/app/api/admin/users/route.ts` | `adminBillingBoundaries.test.ts` |
| Operator-Zugang mit Rate Limit und no-referrer | `src/app/auth/operator-access/route.ts` | `operatorAccess.test.ts` |
| Magic-Byte-Prüfung für Uploads und Schriften | `src/lib/security/fileSignature.ts`, `generation/upload`, `dashboard/brand-font` | `fileSignature.test.ts` |
| Bonus-Fallback bucht nur bedingt, prüft die DB-Spalte | `src/app/api/billing/onboarding-bonus/route.ts` | Tests von Agent 1 |
| Herkunftsprüfung für `generation/status` | `src/app/api/generation/status/route.ts` | Sicherheitstests |
| Mediathek nur http(s)-URLs | `src/app/api/dashboard/media/route.ts` | Sicherheitstests |
| Hermetischer Key-Test, Keys nur aus `process.env` | `src/lib/openai/imageApiKey.test.ts` | Test grün, kein Klartext mehr |
| `password_epoch` maßgeblich in `app_metadata`, Schreiben vor dem Passwortwechsel über den Admin-Client | `src/lib/auth/passwordRecoveryGate.ts`, `src/app/auth/reset-password/update/route.ts` | `src/lib/auth/passwordEpoch.test.ts` (Route selbst nur über tsc/Build geprüft) |
| Zeitkonstante Signaturvergleiche (`timingSafeEqual`) für 2FA-, Recovery- und Wartelisten-Token (O2) | `src/lib/admin/emailTwoFactor.ts`, `src/lib/auth/passwordRecoveryGate.ts`, `src/lib/auth/waitlistBypass.ts` | bestehende 2FA- und Auth-Tests grün |
| Lieferkette: `tsx` als gepinnte devDependency (4.23.15), kein `npx --yes` mehr im nächtlichen Workflow mit `ANTHROPIC_API_KEY` | `package.json`, `.github/workflows/brand-catalog-nightly.yml` | `npm audit --omit=dev` = 0; Workflow selbst nicht ausgeführt |
| Reconcile schließt Jobs > 24 h und „Erfolg ohne Medien“ ab, berechnet nur Geliefertes | `src/lib/kie/reconcileJob.ts`, `src/lib/generation/reconcileJob.ts`, `staleJob.ts` | `reconcileJob.test.ts` (2 Dateien) |
| Keine Wiederholung bezahlter Bildaufrufe nach Timeout, Zeitlimit per AbortSignal | `src/lib/openai/generateImage.ts`, `src/lib/http/fetchWithRetry.ts`, `src/lib/ai/providerRequest.ts` | `generateImage.test.ts`, `fetchWithRetry.test.ts`, `providerRequest.test.ts` |

---

## 4. Verbesserungen am Dashboard

Umgesetzt von Agent 2, ergänzt vom Orchestrator. Begründung je Punkt in `02-ui-ux.md`.

1. **Ehrliche Preisseite:**
   - Video-Versprechen erscheinen nur, wenn Videos freigeschaltet sind. Vorher warb jede Tarifkarte mit „Videos mit Seedance 2.5“, obwohl Videos gesperrt waren.
   - Der Video-Tokenhinweis wird aus der Abrechnungsformel erzeugt (Seedance 2: 100, Seedance 2.5: 150 Tokens), und die Videospanne ist realistisch.
   - Die Aussage „im aktuellen Zeitraum“ zu Token-Paketen ist entfernt.
2. **Nächste Schritte für neue Kunden:** eine Karte mit Tarif → Markenprofil → erstes Bild und genau einem Primärbutton. Sie verschwindet, wenn nichts mehr offen ist.
3. **Leer- und Fehlerzustände** mit konkreter Handlung statt Technikjargon. Suche und Filter erscheinen erst, wenn es Motive gibt.
4. **Kaputte Umlaute repariert** („bestÃ¤tige“, „Ãœbersicht“), englische Template-Texte übersetzt („Search“, „No results found.“, „Toggle Sidebar“), „Brand-Lock Strict/Balanced“ heißt jetzt „Markentreue Streng/Ausgewogen“.
5. **Navigation:** „Videos erstellen“ erscheint nur bei aktivem Feature-Flag. Werbekarte und doppelter Mediathek-Button sind entfernt.
6. **Sicherheitsabfragen:** Teammitglieder entfernen nur nach Bestätigung, der Fokus liegt auf „Abbrechen“. Der Markenprofil-Dialog schließt per Escape.
7. **Mobile 375 px:** Kein Element ragt mehr über den Rand, die Spalte „Erstellt“ ist sichtbar. Die Preisseite erscheint nach höchstens 0,25 s statt bis zu 2,4 s.
8. **Wirkungslose Schalter ausgeblendet:** „E-Mail-Benachrichtigungen“ und „Wochenzusammenfassung“ wurden gespeichert, aber nie ausgewertet.
9. **Neu in den Einstellungen (Orchestrator):** „Meine Daten exportieren“ (JSON-Download) und „Konto löschen“ mit Bestätigung per Eingabe von „KONTO LÖSCHEN“. Beide Endpunkte existierten, hatten aber keine Oberfläche.
10. **Anmelden und Registrieren (Orchestrator):** Impressum, Datenschutz und AGB stehen dauerhaft im Fuß. Der Einwilligungstext lautet jetzt „AGB akzeptieren, Datenschutzhinweise zur Kenntnis genommen“.
11. **Toter Code entfernt:** `src/components/dashboard-stubs/**` (30 Dateien), `inhalte-erstellen-redesign.tsx`, `support-card.tsx`. Nirgends importiert, per tsc und Build bestätigt, über Git wiederherstellbar.

Designsystem-Regeln für die weitere Entwicklung (Tokens, Komponenten, Buttons, Leer- und Fehlerzustände, Begriffe, Mobile, Barrierefreiheit) stehen in `02-ui-ux.md`.

---

## 5. Verbesserungen am Markenscanner

**Wie der Scanner heute arbeitet** (Datenfluss in `03-brand-intelligence.md`):

1. Die URL wird über `publicFetch` abgerufen (HTML mit Cheerio, Playwright nur über den gleichen Schutz).
2. Die Website wird analysiert (Claude), das Sortiment erkannt (Regeln und Claude), Schriften und Etiketten werden ausgewertet.
3. Der Nutzer prüft das Ergebnis.
4. Die Aktivierung speichert alles in `user_metadata` bzw. in der Tabelle `dashboard_beers`.
5. Die Generierung bekommt das Profil als Prompt-Block, dazu Referenzbilder.

**Hauptprobleme vorher:**

- Alle fünf Profilfelder gingen als „STRICT, mandatory“ in jede Generierung, auch reine KI-Schätzungen wie Tonalität und Farben. Erfundene Werte überstimmten so das Briefing.
- Der Analyse-Prompt erzwang „genau 5 Hex-Farben“; das Modell musste notfalls erfinden.
- KI-Sortennamen wurden nie gegen den Quelltext geprüft.
- Bei Fantasienamen setzte das System stillschweigend „helles“, mit der Folge falscher Bierfarbe und falschen Glases.
- Website-Text ging unabgegrenzt in den Prompt (Prompt Injection möglich).
- Ein Neuscan löschte selbst angelegte Sorten und überschrieb Nutzerkorrekturen.

**Umgesetzt:**

- **Belegmodell** (`src/lib/brand/brand-evidence-model.ts`, zod): Jedes Merkmal ist `belegt` (mit Quelle: URL, Selektor oder Textauszug), `geschaetzt`, `fehlt` oder `bestaetigt`. Vertrauen wird nur aus Art und Zahl der Belege abgeleitet, Prozentwerte werden nicht erfunden.
- **Kein Erfinden:** Sortennamen bekommen einen Beleg aus dem Seitentext oder werden als „unbestätigt“ markiert. Sie werden nicht stillschweigend übernommen und auch nicht verworfen. Farben: 3 bis 5 nur mit Beleg, CSS-Farben der Website dienen als Anker. Der Bierstil hat einen Beleg, sonst kommt ein Hinweis.
- **Prompt-Injection-Schutz:** Website-Inhalte stehen als klar abgegrenzter Datenblock im Prompt, die Länge ist begrenzt, und die Ausgabe wird per Schema geprüft (keine URLs oder HTML). Ein Test nutzt eine präparierte Angriffsseite.
- **Nutzerprüfung:** Der Prüfschritt zeigt „Woher stammen die Angaben?“, Hinweise je Sorte und eine Auswahl für den Bierstil.
- **Persistenz (Orchestrator):**
  - Der Belegstatus wird gespeichert.
  - Bearbeitet der Nutzer später einen Markentext, wird er zu „bestätigt“; leert er ihn, zu „fehlt“.
  - Ein generisches Profil entfernt alte Belege.
  - Biere aus der Sortimentsverwaltung gelten als vom Nutzer bestätigt. Ein Neuscan derselben Marke behält diese Sorten samt Korrekturen; bei einem Markenwechsel wird das Sortiment wie bisher ersetzt.
- **Übergabe an die Bildgenerierung:** Nur belegte oder bestätigte Felder sind harte Vorgaben, der Rest sind weiche Hinweise. Für alle heutigen Profile ohne Belegstatus ist die Ausgabe byte-gleich zu vorher, es gibt also keine Verhaltensänderung für Bestandskunden.
- **Fachkorrekturen** (Agent 5, übernommen von Agent 3):
  - NRW-Flasche mit widersprüchlicher Geometrie im Bildprompt;
  - Euroflasche 228 mm statt 25–26 cm;
  - „NRW höher als Longneck“ war falsch;
  - IPA zu dunkel, Schwarzbier mit falscher SRM-Spanne;
  - Radler ohne „Zitrusstücke“, keine Zitronenscheibe als Standard beim Weißbier, kein Koriander bei Saison;
  - „Alster“ wird erkannt;
  - Anlass-Vorlage „Vatertag“ maßvoll formuliert.

**Prompt oder Technik?** Ausführlich in `03-brand-intelligence.md` (h):

- **Per Prompt lösbar:** Belege erzwingen, Unsicheres weich formulieren, Injection abwehren.
- **Technisch lösbar:** Logos und Etiketten nicht von der KI malen lassen, sondern als echte Referenz bzw. per Compositing einsetzen; generierte Bilder automatisch gegen das Profil prüfen; externe Stylesheets auswerten; PDF-Guidelines einlesen.
- **Modellseitig:** Produkttreue mit Referenzbild wird bei den großen Modellen von selbst besser. Das schrumpft den Vorsprung, der rein aus Prompt-Wissen kommt.

---

## 6. Rechtliche und datenschutzbezogene Risiken

Agent 4 ist kein Anwalt. Unterschieden wird zwischen **verbindlicher Anforderung** (mit Norm), **Empfehlung** und **offener Rechtsfrage**. Quellenverzeichnis mit Abrufdatum in `04-legal-compliance.md` und `docs/legal/ENTWURF-massnahmenkatalog-und-quellen.md`.

**Umgesetzt:**

- **Art. 17 DSGVO (verbindlich):** Die Kontolöschung hat 5 Speicherordner nicht gelöscht (`generated-thumbs`, `avatars`, `character-refs` mit Personenfotos, `generation-refs`, `character-meta`), und die Ordnerliste konnte endlos laufen. Behoben, mit Test. Die Löschung kündigt außerdem laufende Stripe-Abos; Rechnungen bleiben bei Stripe.
- **Art. 15/20 DSGVO (verbindlich):** Datenexport `GET /api/account/export` mit Herkunftsprüfung, Login, 2FA und Rate Limit, maschinenlesbares JSON ohne Secrets. Getestet, Oberfläche in den Einstellungen.
- **§ 5 DDG (verbindlich):** Das Impressum ist jetzt aus Anmelden und Registrieren verlinkt (vorher nirgends in der App). Die Ziel-URLs auf brewai.de antworten mit HTTP 200.
- **Art. 13 DSGVO (Empfehlung):** Die Registrierung verlangt kein „Datenschutz akzeptieren“ mehr. Die Datenschutzhinweise sind Information, keine Einwilligung.
- **Art. 50 Abs. 2 KI-VO:** Alle Studio-Bilder tragen jetzt eine maschinenlesbare KI-Kennzeichnung (EXIF und IPTC-XMP `trainedAlgorithmicMedia`), auch ohne den Schalter für das sichtbare Label. Vorher gab es die Kennzeichnung nur mit diesem Schalter, und der stand standardmäßig auf aus. **Offen:** Videos sind nicht gekennzeichnet. Laut Sekundärquellen gilt Art. 50 seit 02.08.2026; eine mögliche Übergangsfrist ist im Amtsblatt nicht geprüft.
- **Alkoholwerbung:** Neues Prüfmodul `src/lib/compliance/` mit 31 deterministischen Regeln. Quellen: Werberat-Verhaltensregeln (Fassung 2026), HCVO Art. 4 Abs. 3, BGH I ZR 252/16 („bekömmlich“), § 5 UWG, Google-Ads-Richtlinie. Es prüft unter anderem:
  - Gesundheits- und Wirkungsversprechen,
  - Aufforderung zu übermäßigem Konsum,
  - Ansprache Minderjähriger,
  - Alkohol in Verbindung mit Fahren oder Sport,
  - sozialen oder sexuellen Erfolg durch Alkohol,
  - Alkoholgehalt als Kaufgrund.

  Ergebnis ist immer ein **Hinweis, nie eine Freigabe**. Eingebunden in `/api/inhalte-erstellen/suggest-copy`: Der Prompt meidet riskante Aussagen schon beim Schreiben, und die Antwort enthält zusätzlich `compliance`. 14 harmlose Brauerei-Texte lösen keinen mittleren oder hohen Treffer aus.
- **Personen in Bierwerbung:** `ADULT_APPEARANCE_GUARD` in der Casting-Regie sorgt dafür, dass abgebildete Personen erkennbar erwachsen wirken (Werberat 2.2).
- **Assistent:** „Hopfen Hugo“ sagt jetzt, dass er eine KI ist, bleibt bei BrewAI- und Brauerei-Themen und behauptet nie „rechtssicher“.

**Offen, priorisiert:**

1. **B2B oder B2C festlegen.** Die Preisansicht nutzt eine Widerrufszustimmung für Verbraucher, die Registrierung ist aber nicht auf Unternehmer beschränkt. Können Verbraucher abschließen, gelten unter anderem der Kündigungsbutton (§ 312k BGB) und die Widerrufsbelehrung.
2. **AVV und Drittlandgrundlage** für KIE (inkl. Temp-Hosting `redpandaai.co`) und BytePlus (ap-southeast) sind ungeklärt (Art. 28, 44 ff. DSGVO).
3. **Token-Pakete:** Die Preisseite sagt einmal „bleiben bis zum Verbrauch“ und einmal „verfallen 12 Monate nach Kauf“. In der Datenbank haben gekaufte Lots kein Ablaufdatum. Eine Regel festlegen, Text und Datenbank angleichen (§ 5 UWG).
4. **Umsatzsteuer:** Der Text „gemäß § 19 UStG“ ist fest im Code. Er gehört an den Kleinunternehmer-Status gekoppelt.
5. **Markenscanner:** Text-und-Data-Mining-Vorbehalt (§ 44b UrhG) beachten, Bestätigung „eigene Marke“ einholen, robots.txt respektieren.
6. **Datensparsamkeit:**
   - Löschkonzept und Speicherfristen fehlen.
   - Das Backup-Schema `brewai_release_backup_20260915` enthält Nutzerdaten ohne Löschregel.
   - Der Chatverlauf bleibt nach dem Abmelden im Browser gespeichert.
7. **Nutzungsrechte an KI-Ergebnissen** in die AGB aufnehmen; Rolle nach KI-VO und die Deepfake-Frage (Art. 50 Abs. 4) bei Personenfotos klären.

Entwürfe für Verarbeitungsverzeichnis, Subprozessor-Liste, TOM und Endgerätezugriffe liegen in `docs/legal/ENTWURF-datenschutz-dokumentation.md`. **BrewAI ist mit diesem Audit nicht rechtssicher;** die Punkte oben gehören zur anwaltlichen Prüfung.

---

## 7. Neue sinnvolle Produktideen

Bewertet nach Kundenproblem, Zahlungsbereitschaft, Aufwand, Datenlage, Risiken und Differenzierung (vollständige Tabelle F1–F15 in `05-industry-product.md`). **Kernaussage:** Der Markt für reines Brauerei-Marketing ist klein.

- 2025 gab es 1.415 Brauereien in Deutschland, davon 821 mit höchstens 1.000 hl (Destatis).
- Bei 100 % Marktdurchdringung brächte reines Marketing-SaaS rund 1,8 Mio. € Jahresumsatz. Das ist eine eigene Rechnung mit den heutigen Tarifen.
- Mehr Umsatz pro Kunde muss deshalb aus Vertrieb und Betrieb kommen, mehr Kunden aus AfG/Mineralbrunnen und Österreich.

| Idee | Warum sinnvoll | Priorität |
|---|---|---|
| Kampagnenkalender aus Sortiment und Saison (Bock, Maibock, Oktoberfest, Weihnachtsbier, lokale Feste) | Macht den Tarif zur Routine statt zum Einzelkauf; Daten sind schon vorhanden | jetzt bis 3 Monate |
| Gastro-Partner-Kit (Tischaufsteller, Getränkekarten-Seite, Post mit Wirtslogo) | Brauereien unterstützen Gastro-Kunden mit Werbemitteln, keine brauereispezifische Lösung gefunden | 3 Monate |
| Produkttreue-Prüfung (Glas, Schaum, Gebinde, Etikett) gegen das Sortiment, Fehlbilder nicht berechnen | Kern des Vorsprungs gegenüber generischen Tools | jetzt bis 3 Monate |
| Alkoholwerbe-Check vor dem Export | Senkt das Abmahn- und Rügerisiko, Modul existiert bereits | **jetzt** (umgesetzt für Textvorschläge) |
| Absatz-Frühwarnung je Kunde aus GEDAT- oder ERP-Export (Concierge-Test) | Zahlungsbereitschaft am höchsten, wenn Treffer Umsatz retten; GEDAT liefert GFGH-Absatz schon monatlich | 3 Monate (Test) |
| Gärprotokoll-Wächter (CSV oder Brewfather-API, Regeln je Sorte) | Für Brauereien ohne Leitsystem; nur Lesezugriff | 3 Monate (Test) |
| Wirkungs-Rückkanal (Instagram-Kennzahlen je Motiv) | Wer misst, verlängert | 6–12 Monate |
| Nicht jetzt: Chargenrückverfolgung/QM, Prognosemodelle, Biersteuer-Abgabe | ERP-Domäne, Haftung, fehlende Sensordaten | vorerst nicht |

Zur Leitfrage „Problem erkennen, bevor der Mitarbeiter es merkt“ empfiehlt Agent 5 eine Reihenfolge in vier Stufen:

1. Feste Regeln, die der Braumeister selbst setzt.
2. Statistik mit brauereieigenen Baselines. Branchen-Richtwerte taugen nicht als Schwelle: Sudhausausbeuten schwanken in einer Abfrage zwischen 46,7 und 67,1 %.
3. KI-Ursachenanalyse, aber nur als markierte Hypothese.
4. Prognosen erst mit Sensordaten aus Piloten.

Keine Werbeaussage „KI erkennt Probleme früher“, bevor Präzision und Vorlauf in Pilotbrauereien gemessen sind. Für die verbreiteten DACH-Systeme (CSB, Drink-IT-Branchenfelder, GFGH-Software) ist keine öffentliche API belegt. Der erste Schritt ist deshalb ein **CSV-Import nur zum Lesen** (Konzept: `docs/strategy/2026-11-09-produktionsdaten-import-konzept.md`).

---

## 8. Wirtschaftlich priorisierte Roadmap

**Jetzt (0–4 Wochen)**

1. Entscheidungen aus Abschnitt 11 treffen: Bildqualität vs. Preis (K1), Zahlungsstatus (H2), B2B/B2C, Regel für Token-Pakete.
2. **Messen statt vermuten:** Ereignisse „heruntergeladen“, „kopiert“ und „als veröffentlicht markiert“ je Workspace erfassen, dazu eine Kachel „diesen Monat erstellt/verwendet“. Ohne diese Zahl ist kein Produkterfolg prüfbar.
3. 10–15 Problem-Interviews, die der Gründer persönlich führt. Themen: Marketingbudget, Personal, Datenlage, teuerste Abweichung des letzten Jahres. Danach 3–5 Pilotbrauereien auswählen.
4. Compliance-Hinweise auch in der produktiven Erstellen-Ansicht (`RuixenMoonChat`) und im Social-Post anzeigen.

**Nächste 3 Monate**

5. Kampagnenkalender und Gastro-Partner-Kit (MVP 1: Erfolg, wenn 3 von 5 Piloten zwei Monate in Folge je mindestens 8 Motive verwenden und 2 zum Listenpreis abschließen).
6. Concierge-Tests Absatz-Frühwarnung und Gärprotokoll-Wächter. Hypothese, Erfolgs- und Abbruchkriterien stehen in `05-industry-product.md` (e).
7. Marktprüfung AfG/Mineralbrunnen und Österreich.

**6–12 Monate (nur wenn die Tests bestehen)**

8. CSV-Import als Produkt, Statistik Stufe 2 mit Backtest, Connectoren Brewfather und Business Central je Kunde, MCP-Schnittstelle nur zum Lesen.

---

## 9. Technische Verbesserungen

- **Bezahlte KI-Aufrufe:**
  - Bildaufrufe werden nach Timeout oder unklarem Fehler nicht mehr wiederholt; vorher konnte ein Bild doppelt bezahlt werden.
  - Es gibt jetzt ein Zeitlimit per AbortSignal statt bis zu 300 s Hängen.
  - „200 ohne Bild“ zählt nicht mehr als wiederholbarer Fehler.
- **Zeitbudget je Variante** in der Studio-Pipeline: Varianten, die vor dem Funktionsende nicht fertig würden, starten nicht und kosten nichts.
- **Anthropic:** Die doppelte Retry-Schicht ist entfernt (vorher bis zu 9 Anfragen je Modell), der SDK-Timeout ist realistisch. `claude-sonnet-4-5` ist aus den Fallbacks entfernt, weil das Modell zum 30.11. abgeschaltet wird.
- **Reconcile:** schließt hängende Jobs ab und berechnet nur Geliefertes. Ein Kopfblockade-Test ist ergänzt.
- **Kostenschutz-Bibliothek** `src/lib/ai/costGuard.ts` (Tagesdeckel, Deckel für Fehlversuche, Owner-Grenze) mit Tests. Die Einbindung in `reserveGeneration` steht noch aus (Abschnitt 12).
- **Tests stabil:** Der flakige PGlite-Test hatte als Ursache CPU-Konkurrenz und ist per `testTimeout`/`hookTimeout` gelöst. Der Key-Test ist hermetisch.
- **CI ergänzt** (`.github/workflows/ci.yml`, `reconcile.yml`).
- **Architekturübersicht:** `docs/architecture/README.md`.
- **Toter Code entfernt:** 32 Dateien.
- **Paketstand:** next 16.4.5, zod 4.6.7, undici 7.30.2.

**Kosten** (Tabellen je Generierungsart in `06-cto-architecture.md` (e)): Laut Code-Kommentar liegen die Token-Preise beim 4- bis 5-Fachen der Anbieterkosten. Eine Ausnahme ist **K1**:

- Bilder in „medium“ oder ohne Qualitätswahl werden als 1K abgerechnet (3 Tokens), aber mit OpenAI-Qualität „high“ erzeugt, solange `OPENAI_IMAGE_QUALITY` nicht gesetzt ist.
- Belegter Preis für gpt-image-2 „high“ 1024×1536: 0,165 $ allein für den Output.
- Erlös für 3 Tokens: Pro 0,12 €, Enterprise 0,09 €. Das ist eine negative Marge genau bei den Vielnutzern.
- Ob die Variable in Produktion gesetzt ist, ließ sich nicht prüfen; der Vercel-Zugriff auf dieses Team war nicht autorisiert.

---

## 10. Durchgeführte Tests und deren Ergebnisse

| Prüfung | Vorher (20:00) | Nachher (Endlauf) |
|---|---|---|
| `vitest run` (gesamt) | 88 Dateien, 535 Tests, 533 bestanden, 2 rot | **106 Dateien, 729 Tests, alle bestanden** (8,6 s); kein Secret mehr in der Ausgabe |
| `tsc --noEmit` | 0 Fehler | **0 Fehler** |
| `eslint src scripts` | 0 Fehler, 67 Warnungen | **0 Fehler, 63 Warnungen** (alle in bestehendem Code) |
| `npm run build` (Next 16.4.5) | nicht gemessen | **erfolgreich**, kompiliert in 6,0 s, 96/96 statische Seiten |
| `npm audit --omit=dev` | 1 kritisch, 2 hoch | **0 Schwachstellen** |

Endläufe: 21:00:59–21:02:25 (inkl. tsc und Audit) und nach den letzten Härtungen 21:07:22–21:08:33 (Tests, ESLint, Build, jeweils mit identischem Ergebnis; tsc separat 0 Fehler).

**Weitere Prüfungen:**

- **Gezielte Läufe der Agenten**, alle grün: Security 197/197, Markenscanner 276/276, Compliance 72/72, UI 51/51, CTO 685/685 im Gesamtlauf um 20:30 sowie 26/26, 5/5 und 23/23 danach.
- **Browser** (Dev-Server, Seiten unter `/marketing-preview` mit Beispieldaten, ohne Login):
  - Agent 2 hat Dashboard, Leerzustände, Preise, Team, Einstellungen und Mediathek auf 1440, 1280 und 375 px geprüft.
  - Der Orchestrator hat danach geprüft: den Bereich „Konto“ mit Export und Löschung, den Lösch-Dialog (Button bleibt bis zur korrekten Eingabe gesperrt, nur geöffnet und abgebrochen) sowie die Registrierungsseite mit Rechtslinks im Fuß und dem korrigierten Einwilligungstext. Dabei fiel ein Umbruchfehler im Einwilligungstext auf, der behoben ist.
- **Nicht getestet:**
  - echte Anbieteraufrufe (bewusst nicht ausgeführt);
  - angemeldete Abläufe im Browser, darunter die produktive Erstellen-Ansicht, Export und Löschung gegen echte Daten;
  - Live-Konfiguration von Supabase (Auth-Einstellungen, RLS, Storage-Policies), Stripe-Zahlarten und Vercel-Variablen;
  - die geänderten GitHub-Workflows (nicht ausgeführt).

---

## 11. Verbleibende Fehler und Risiken

**Entscheidungen des Gründers (vor dem nächsten Deploy):**

1. **K1 Marge:** `OPENAI_IMAGE_QUALITY` in Vercel prüfen. Entweder die Qualität an die gewählte Stufe koppeln oder 1K-„high“ teurer abrechnen.
2. **H2 Zahlungsstatus:** Prüfen, welche Zahlarten in Stripe aktiv sind. Bei SEPA o. ä. die Gutschrift nur bei `active`/`trialing` und `async_payment_failed` behandeln. Migration und Webhook-Vorschlag mit PGlite-Test stehen in `01-security.md` (f) F-3.
3. **OpenAI-Image-Key rotieren** (stand im Sitzungsprotokoll).
4. **Rechtliche Festlegungen:** B2B oder B2C, Regel für Token-Pakete, Umsatzsteuer-Text, AVV mit KIE und BytePlus.
5. **`nsfw_checker: false`** bei Nano Banana mit Personenfotos (Missbrauchsrisiko).

**Technische Risiken:**

- **H1 Rest:** Mit dem Passwort allein lässt sich die `user_metadata` (Markenprofil, Einstellungen) direkt über die Supabase-Auth-API lesen und ändern, ohne 2FA. Abhilfe: Supabase-MFA (AAL2) oder sensible Nutzdaten in Tabellen mit RLS verlagern.
- **Kein Fehler-Tracking und kein Alerting** (kein Sentry, keine `instrumentation.ts`). Ein Ausfall beim Bildanbieter fällt erst über Kundenbeschwerden auf.
- **10 Altrouten ohne UI-Nutzer** sind in Produktion erreichbar, darunter `/api/openai/image2/generate`, `/api/generate-*`, `/api/kie/*` und `/api/claude/prompt`. Nach Prüfung der Vercel-Logs löschen.
- **Unbelegter Bierstil** wirkt in der Generierung noch als harte Bierfarbe. Die Kette über 4 Dateien ist in `06-cto-architecture.md` (f-11) beschrieben.
- **Migrationen verstreut:** 13 SQL-Dateien liegen in `docs/` statt in `supabase/migrations/`.
- **`middleware.ts`** ist in Next 16 veraltet und heißt dort `proxy.ts`. Das ist bewusst nicht umbenannt, weil die Datei Teil der laufenden CSP-Arbeit des Gründers ist.
- **Dev-Abhängigkeiten:** 13 Meldungen ohne Produktionsbezug (2 niedrig, 11 mittel, u. a. typescript-eslint).
- **Chatverlauf und Entwürfe** bleiben nach dem Abmelden im localStorage. Die Bereinigung gehört in `submitSignOut.ts`; diese Datei ist laufende Arbeit des Gründers, deshalb nicht angefasst.

---

## 12. Empfohlene nächste Entwicklungsschritte

1. Die Entscheidungen 1–5 aus Abschnitt 11 treffen, danach den hier vorbereiteten Stand reviewen, committen und deployen. Die Änderungen liegen nur lokal und sind nicht committet.
2. **Nutzungs-Tracking** (heruntergeladen, kopiert, veröffentlicht) und eine Wirkungs-Kachel im Dashboard.
3. **Kostenschutz einbinden:** `costGuard` in `reserveGeneration`, Tagesdeckel und Deckel für Fehlversuche, auch für Owner-Teams.
4. **Fehler-Tracking** (Sentry oder Vercel-Alerts) und Auswertung der `ai-cost`-Logzeilen bzw. Speicherung von `usage` in `generation_jobs`.
5. **Compliance-Hinweise in der produktiven Erstellen-Ansicht** und im Social-Post, außerdem Claim-Check vor dem Export.
6. **Markenscanner weiter:**
   - unbelegten Bierstil weich behandeln (f-11);
   - die ersten 1–2 externen Stylesheets für Farbbelege auswerten;
   - Token-Verbrauch je Scan messen;
   - Versionierung der Profile und Erkennung von Markenänderungen;
   - Logos und Etiketten per Compositing statt KI-Malerei.
7. **Supabase-MFA** bzw. sensible Nutzdaten aus `user_metadata` in Tabellen mit RLS verlagern.
8. **Altrouten löschen**, Migrationen konsolidieren, Reconcile auf Vercel Cron umziehen.
9. **Pilotprogramm** mit 3–5 Brauereien für Kampagnenkalender und Gastro-Kit, parallel die Concierge-Tests Absatz-Frühwarnung und Gärprotokoll-Wächter.

---

## Anhang A – Arbeitsprotokoll (tatsächliche Uhrzeiten)

| Zeit | Schritt |
|---|---|
| 19:59 | Start, Git-Stand, Projektstruktur, Basis-Tests (40,7 s Testlauf) |
| 20:04 | Gründer-WIP gesichert (`refs/audit/wip-baseline-20261109`), Arbeitsplan mit Dateizuständigkeiten |
| 20:10 | Sechs Agenten parallel gestartet |
| 20:10–20:33 | Agent 5 Branchenforschung (fertig 20:33); Fachkorrekturen an Agent 3 weitergeleitet |
| bis 20:38 | Agent 1 Security und Agent 3 Markenscanner fertig |
| bis 20:44 | Agent 2 UI/UX, Agent 4 Recht/DSGVO und Agent 6 CTO/QA fertig |
| 20:39–20:51 | Orchestrator: Belegstatus-Persistenz, Schutz der Nutzerbiere bei Neuscan, Tests |
| 20:45–20:48 | Paket-Sicherheitsupdate (next, zod, undici), `npm audit --omit=dev` = 0 |
| 20:49–20:53 | KI-Kennzeichnung in der Studio-Pipeline, Alkoholwerbe-Check im Textvorschlag, Preisseite, Impressum und Einwilligungstext |
| 20:52–20:55 | Gesamttests, Typecheck, Lint, Produktions-Build (grün) |
| 20:55–21:00 | Export- und Lösch-Oberfläche, toter Code entfernt, 2FA-Härtung `password_epoch` |
| 21:00–21:05 | Browser-Stichprobe, Umbruchfehler behoben, deutsche Bezeichnungen für die Markentreue |
| 21:01–21:02 | Endlauf: 729/729 Tests, tsc 0, ESLint 0 Fehler, Build grün, `npm audit --omit=dev` = 0 |
| 21:02–21:05 | Dieser Bericht |
| 21:05–21:09 | Zeitkonstante Signaturvergleiche, `tsx` gepinnt, zweiter Endlauf (grün) |

## Anhang B – Änderungsumfang und Wiederherstellung

- Gegenüber dem gesicherten Gründer-Stand sind 92 Dateien geändert und 32 gelöscht (toter Code), insgesamt +3.411/−6.710 Zeilen in getrackten Dateien (inkl. `package-lock.json`). Dazu kommen 42 neue Dateien (Code, Tests, Berichte). `git diff refs/audit/wip-baseline-20261109 --stat` zeigt die genaue Liste.
- Von den 22 Dateien der Gründer-Arbeit wurde nur eine angefasst: In `brewai-admin-shell.tsx` ist die Werbekarte entfernt; die CSP- und Sign-out-Änderungen darin sind unverändert. Die 5 neuen Dateien der Gründer-Arbeit sind byte-gleich zur Sicherung (geprüft).
- Die nicht committete Arbeit des Gründers ist zusätzlich als Git-Ref `refs/audit/wip-baseline-20261109` gesichert. Vergleich: `git diff refs/audit/wip-baseline-20261109`.
- Gelöschte Dateien (toter Code) lassen sich mit `git restore <pfad>` zurückholen.
