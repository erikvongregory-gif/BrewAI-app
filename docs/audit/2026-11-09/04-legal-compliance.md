# 04 – Legal, DSGVO und Compliance (Agent 4)

Stand: 2026-11-09, 20:10–20:47. Bearbeiter: Agent 4 (KI-Agent). **Ich bin kein Anwalt. Dieser Bericht ist keine Rechtsberatung und keine Freigabe; BrewAI ist dadurch nicht rechtssicher.** Kennzeichnung: **[Pflicht]** = verbindliche Anforderung mit Norm (Wortlaut geprüft, Quelle in g), **[Empfehlung]**, **[Offen]** = offene Rechtsfrage für die anwaltliche Prüfung. Zeilenangaben beziehen sich auf den Stand vor meinen Änderungen, sofern nicht anders vermerkt.

## a) Ausgangszustand (rechtlich relevante Funktionen und Texte im Code)

- **Konto/Anmeldung:** Supabase Auth mit E-Mail/Passwort und Google-OAuth, 2FA per E-Mail-Code (Resend), Einladungs- und Wartelistenmodus. Registrierung mit Checkbox „Ich akzeptiere die AGB und Datenschutz“ (`src/components/ui/auth-card.tsx:436-455`), Links auf `brewai.de/agb` und `brewai.de/datenschutz` (`auth-card.tsx:57-62`). Zeitstempel `terms_accepted_at` und `privacy_accepted_at` (`src/lib/auth/termsAcceptance.ts:14-20`).
- **Impressum:** In der App nirgends verlinkt (Suche nach „impressum“ in `src/` findet nur CSS-Reste und Scanner-Filter). AGB, Datenschutz und Widerrufsbelehrung liegen auf der Marketing-Site (nicht in diesem Repo, nicht geprüft).
- **Betroffenenrechte:** Kontolöschung `POST /api/account/delete` mit Bestätigungstext, 2FA, Rate-Limit, Herkunftsprüfung und wiederaufnehmbarem Löschauftrag (`src/lib/dashboard/deleteAccount.ts`). Ein **Datenexport fehlte**.
- **KI-Funktionen:** Bilder (OpenAI, KIE, ggf. BytePlus ModelArk für Videos), Texte und Markenanalyse (Anthropic), Assistent „Hopfen Hugo“ (Anthropic, Verlauf im `localStorage`). Sichtbares „AI“-Label plus EXIF-Hinweis nur, wenn der Nutzer den Schalter aktiviert (`src/app/(dashboard)/inhalte-erstellen/lib/schemas.ts:209` Standard `false`; `src/lib/inhalte-erstellen/run-studio-generation.ts:600-602, 612`).
- **Markenscanner:** Ruft beliebige vom Nutzer genannte URLs ab, klickt Cookie-Banner und Altersabfragen weg (`src/lib/brand/consent-gate-dismiss.ts:1-21`, `.env.example` Kommentar zu `BRAND_INTAKE_BROWSER`), lädt Bilder herunter und kopiert sie in den eigenen Speicher. Keine Prüfung von `robots.txt`/TDM-Vorbehalt, keine Bestätigung, dass es die eigene Marke ist.
- **Abo/Preise:** Stripe-Checkout, Kundenportal, Tarife in `src/lib/billing/planCatalog.ts`. Preisansicht mit Verbraucher-Widerrufszustimmung (`src/components/dashboard/admin-pricing-view.tsx:250-253`) und statischem Text „Alle Preise gemäß § 19 UStG ohne Umsatzsteuer … Monatlich kündbar“ (`admin-pricing-view.tsx:349`). Keine B2B-Beschränkung im Registrierungsablauf erkennbar (Suche nach „Unternehmer/gewerblich/B2B“ erfolglos).
- **Endgeräte:** Nur funktionale Cookies/Storage gefunden (Liste in `docs/legal/ENTWURF-datenschutz-dokumentation.md` Abschnitt 4); keine Analyse- oder Tracking-Bibliothek in `package.json`/`src/`.
- **Alkoholwerbung:** Bild-Prompts enthalten bereits „Alcohol is held or consumed only by adults“ (`src/lib/inhalte-erstellen/image-prompt-v3.ts:38, 158`). Eine Prüfung generierter Texte/Captions/Prompts auf Werbe-Risiken fehlte.

## b) Befunde (priorisiert)

### Kritisch / hoch

1. **Kontolöschung unvollständig** – [Pflicht] Art. 17 Abs. 1 DSGVO (Recht auf Löschung). `deleteAccount.ts:26` löschte nur `generated`, `beer-labels`, `brand-fonts`; Dateien in `generated-thumbs`, `avatars`, `character-refs` (Personen-Referenzfotos), `generation-refs` (Uploads) und `character-meta` blieben liegen. Team-Einladungen (E-Mails Dritter), Mitgliedschaften und Instagram-Tokens hingen von nicht im Repo belegten FK-Kaskaden ab. Listen ohne Fortschritt konnten endlos laufen. **Behoben** (c). Rest: siehe 6, 13, [Offen] Stripe-Kundenobjekt (Abos werden gekündigt, der Kunde bleibt; Abwägung mit Aufbewahrungspflichten).
2. **Kein Datenexport** – [Pflicht] Art. 15 Abs. 3 (Kopie) und Art. 20 Abs. 1 DSGVO (strukturiertes, gängiges, maschinenlesbares Format). **Behoben:** `GET /api/account/export` (c). UI-Schaltfläche fehlt (Änderungswunsch f4).
3. **KI-Kennzeichnung hängt vom Nutzerschalter ab** – [Pflicht] Art. 50 Abs. 2 KI-VO: Anbieter von Systemen, die synthetische Bilder erzeugen, sorgen für eine Kennzeichnung „in einem maschinenlesbaren Format“. Standardmäßig enthalten fertige Bilder weder sichtbares Label noch Metadaten (sharp verwirft beim Zuschneiden Metadaten der Anbieter). **Teilweise behoben:** neue Funktion `applyAiProvenanceMetadata` (EXIF + IPTC-XMP `trainedAlgorithmicMedia`) ohne sichtbares Label; Einbindung in `run-studio-generation.ts` nötig (f1). Videos (Seedance) bleiben ungekennzeichnet. [Offen] Geltungsbeginn: Art. 50 gilt laut Sekundärquellen seit 2. August 2026; der AI-Omnibus soll für vor diesem Datum in Verkehr gebrachte Systeme eine Übergangsfrist bis 2. Dezember 2026 vorsehen – im Amtsblatt prüfen (EUR-Lex-Abruf scheiterte technisch). [Offen] Ist BrewAI „Anbieter“ des KI-Systems (Integration fremder Modelle unter eigenem Namen)? Einschätzung: wahrscheinlich, anwaltlich klären.
4. **Impressum in der App nicht erreichbar** – [Pflicht] § 5 Abs. 1 DDG: Informationen „leicht erkennbar und unmittelbar erreichbar“ und „ständig verfügbar“. Login, Registrierung und Dashboard verlinken kein Impressum (nur AGB/Datenschutz). Änderungswunsch f5.
5. **Drittlandtransfers und AVV unklar** – [Pflicht] Art. 28 Abs. 3 DSGVO (Vertrag mit Auftragsverarbeitern), Art. 44 ff. DSGVO (Drittlandübermittlung). Besonders kritisch: KIE inkl. Temp-Datei-Hosting `kieai.redpandaai.co`/`tempfile.redpandaai.co` (Sitz, Speicherdauer unbekannt; Referenzfotos können Personen zeigen) und BytePlus ModelArk (`ark.ap-southeast.bytepluses.com`). Vertragslage ist im Code nicht prüfbar → [Offen], Maßnahmen in e.
6. **Verbraucher oder nur Unternehmer? Kündigung und Widerruf** – Die Preisansicht nutzt eine Verbraucher-Widerrufszustimmung, der Registrierungsablauf beschränkt nicht auf Unternehmer. Wenn Verbraucher abschließen können: [Pflicht] § 312k BGB Kündigungsschaltfläche „Verträge hier kündigen“ mit Bestätigungsseite „jetzt kündigen“, ständig verfügbar sowie unmittelbar und leicht zugänglich; sonst Kündigung jederzeit ohne Frist (§ 312k Abs. 6). Im App-Code gibt es nur das Stripe-Portal hinter dem Login. [Offen] Ob der Widerrufstext („verliere mein Widerrufsrecht bei Beginn der Ausführung“) zu einem laufenden SaaS-Abo passt (digitale Dienstleistung vs. digitale Inhalte) – anwaltlich prüfen. [Empfehlung] Entscheidung treffen: entweder B2B-only sichtbar machen (Checkbox „Ich handle als Unternehmer“, Hinweise im Checkout) oder Verbraucherpflichten vollständig umsetzen.
7. **Preis- und Leistungsangaben** – [Pflicht] § 5 Abs. 1, Abs. 2 Nr. 1 und 2 UWG (irreführende Angaben über wesentliche Merkmale, u. a. Menge, und über den Preis bzw. seine Berechnung). (a) `admin-pricing-view.tsx:349` sagt pauschal „gemäß § 19 UStG ohne Umsatzsteuer“, auch wenn der Kleinunternehmer-Modus (`BILLING_KLEINUNTERNEHMER`) aus ist und Stripe Tax läuft. (b) Laut Agent 5 nennt `SEEDANCE_VIDEO_TOKEN_HINT` 100 Tokens je Video, berechnet werden 150; die Tarifkarte schätzt Videos mit Faktor 1 (Start „5–12“ statt real 3–8). Einschätzung: mögliches Irreführungsrisiko über die Menge der Leistung; Korrektur empfohlen (Dateien von Agent 1/2). (c) `planCatalog.ts`: Feld `yearly` (z. B. 65) weicht vom angezeigten Monatspreis bei jährlicher Zahlung (79) ab – mit den Stripe-Preisen abgleichen.

### Mittel

8. **Alkoholwerbung ungeprüft** – Generierte Texte, Captions und Prompts werden nicht auf typische Risiken geprüft. Relevante Maßstäbe: Werberat-Verhaltensregeln (Selbstregulierung, Fassung Januar 2026: u. a. Personen ≥ 18 und so wirkend, keine Verbindung mit Fahren, keine Gesundheits-/Leistungs-/Erfolgsversprechen), [Pflicht] Art. 4 Abs. 3 HCVO (keine gesundheitsbezogenen Angaben bei > 1,2 % vol; laut BGH I ZR 252/16 gilt das auch für die Werbung und für „bekömmlich“). **Umgesetzt:** Prüfmodul `src/lib/compliance` (c), Einbindung durch den Orchestrator (f2).
9. **Assistent** – [Pflicht] Art. 50 Abs. 1 KI-VO (Information über Interaktion mit einer KI): Begrüßung und Label „KI-Assistent“ waren vorhanden. **Verbessert:** Begrüßung nennt „kein Mensch“ und Fehlermöglichkeit; System-Prompt grenzt auf Brauerei-/BrewAI-Aufgaben ein (Hinweis Agent 5, Kosten/Missbrauch) und verbietet „rechtssicher“.
10. **„Datenschutz akzeptieren“** – [Empfehlung] Die Datenschutzerklärung ist eine Information (Art. 13 DSGVO), keine Einwilligung. Checkbox-Text und `privacy_accepted_at` suggerieren eine Zustimmung. Vorschlag: „Ich akzeptiere die AGB. Die Datenschutzhinweise habe ich zur Kenntnis genommen.“ (f6). Keine Schema-Änderung nötig.
11. **Chatverlauf auf geteilten Geräten** – [Empfehlung] Art. 25/32 DSGVO: `brewai.assistant.threads` (`src/components/studio/hopfen-hugo-assistant.tsx:11, 144`) und Studio-Entwürfe bleiben nach dem Abmelden im Browser. Beim Abmelden löschen (f7).
12. **Markenscanner** – [Offen] Zulässigkeit des Scannens fremder Websites: § 44b Abs. 2 und 3 UrhG erlaubt Text und Data Mining an rechtmäßig zugänglichen Werken nur ohne maschinenlesbaren Nutzungsvorbehalt; Kopien sind zu löschen, wenn sie nicht mehr erforderlich sind. Das Übernehmen fremder Produktbilder/Logos in Werbung ist davon nicht gedeckt (Einschätzung). [Empfehlung] Bestätigung „eigene Marke bzw. Nutzungsrechte vorhanden“, Abgleich der Domain mit der E-Mail-Domain oder Hinweis bei Abweichung, `robots.txt`/TDM-Vorbehalt respektieren, Altersabfragen nur auf der eigenen Website umgehen.
13. **Backup-Tabelle mit Nutzerdaten** – [Pflicht] Art. 5 Abs. 1 lit. e DSGVO (Speicherbegrenzung): `supabase/migrations/20260915184554_dashboard_beers_store.sql:16` legt `brewai_release_backup_20260915.auth_dashboard_beers_metadata` ohne FK/Löschregel an; wird bei Kontolöschung nicht bereinigt. Nach Prüfung löschen (Migration, nicht ausgeführt).
14. **Löschkonzept fehlt** – [Pflicht] Art. 5 Abs. 1 lit. e DSGVO: Keine Fristen für `generation_jobs` (Prompts), Warteliste (`src/app/api/waitlist/route.ts:37`), Rate-Limit-Einträge, Löschaufträge. [Offen] Aufbewahrungsfristen für Rechnungen (Stripe) festlegen lassen.
15. **Personen auf Referenzfotos und realistische Werbung** – [Offen] Abgebildete reale Personen (Mitarbeitende, Gäste) brauchen eine Rechtsgrundlage beim Kunden; AGB-Klausel und UI-Hinweis empfohlen. [Offen] Ob fotorealistische KI-Werbung mit echten Produkten/Orten als „Deepfake“ gilt; dann trifft den Kunden als Betreiber die Offenlegungspflicht nach Art. 50 Abs. 4 KI-VO (bei erkennbar kreativen/fiktionalen Werken eingeschränkt). [Empfehlung] KI-Label in der Erstellen-Ansicht standardmäßig empfehlen und Caption-Hinweis „mit KI erstellt“ anbieten.

### Niedrig

16. **Speicherung im Endgerät** – [Empfehlung] § 25 Abs. 2 Nr. 2 TDDDG erlaubt einwilligungsfreie Speicherung, wenn sie für den ausdrücklich gewünschten Dienst unbedingt erforderlich ist. Die gefundenen Einträge wirken funktional; in der Datenschutzerklärung auflisten. Geteilte Cookie-Domain mit `brewai.de`: Tracking der Marketing-Site separat prüfen.
17. **Zeichensalat in UI-Text** – `src/components/ui/dashboard-redesign.tsx:472` („bestÃ¤tige … Widerrufs-Zustimmung“): falsch kodiert, an Agent 2.
18. **Plattformrichtlinien** – [Empfehlung] Google Ads lässt Alkoholwerbung in Deutschland unter Bedingungen zu (keine Ausrichtung auf Personen unter dem gesetzlichen Mindestalter, keine Minderjährigen oder Schwangeren beim Konsum, kein übermäßiger Konsum, keine Leistungs- oder Erfolgsversprechen); diese Punkte deckt das Prüfmodul ab und verweist auf die Richtlinie. Meta- und TikTok-Richtlinien waren nicht abrufbar; vor Kampagnen- oder Ads-Funktionen prüfen.

## c) Umgesetzte technische Änderungen

| Datei | Änderung | Nutzen |
|---|---|---|
| `src/lib/compliance/sources.ts` (neu) | Quellenregister mit URL, Art der Quelle, Abrufdatum | Nachvollziehbarkeit |
| `src/lib/compliance/alcoholAdRules.ts` (neu) | 31 deterministische Regeln (Gesundheit, „bekömmlich“, Nährwert, Leistung, Sport/Sicherheit, Schwangerschaft, Fahren, Minderjährige, Jugendsprache, Exzess, Abstinenz-Abwertung, Erfolg, Stimmung/Enthemmung, Alkoholgehalt, Alkoholfrei-Sonderfälle, UWG, reale Personen), Umlaut-/ae-tolerant, Wortgrenzen mit Unicode | Ergebnisqualität, Risikominderung |
| `src/lib/compliance/checkAdCompliance.ts` (neu) | `checkAdCompliance`, `checkAdComplianceMany`; Schweregrad je Getränkeart (ohne Angabe vorsichtig „alkoholhaltig“), Verneinungserkennung („kein Alkohol am Steuer“), Fundstelle mit Index und Kontext, Deduplizierung, Disclaimer „keine Rechtsberatung“ | wie oben |
| `src/lib/compliance/index.ts` (neu) | öffentliche API | – |
| `src/lib/compliance/accountExport.ts` (neu) | Datensammlung für Export, Entfernen von Tokens/Hashes/Schlüsseln, Binärdaten und signierten URL-Parametern; Abschnittsfehler werden als `unvollstaendig` ausgewiesen | Art. 15/20 |
| `src/app/api/account/export/route.ts` (neu) | `GET`: Herkunftsprüfung, IP- und Nutzer-Rate-Limit (5/h), Anmeldung, 2FA, nur eigene Daten, `Cache-Control: no-store`, `Content-Disposition: attachment`, `nosniff` | Art. 15/20, Sicherheit |
| `src/components/compliance/compliance-hints.tsx` (neu) | zurückhaltende Hinweisliste („Hinweis“/„mögliches Risiko“, Quellenlinks, Disclaimer), rendert nichts ohne Treffer | Nutzerfreundlichkeit |
| `src/lib/dashboard/deleteAccount.ts` | `USER_STORAGE_FOLDERS` (8 Ordner), rekursives Löschen mit Fortschrittsprüfung statt Endlosschleife, explizites Löschen von `workspace_invites`, `workspace_members` (als Inhaber und Mitglied), `integration_secrets` vor dem Löschen des Auth-Kontos | Art. 17, Stabilität |
| `src/lib/openai/aiWatermark.ts` | `AI_DIGITAL_SOURCE_TYPE`, `buildAiProvenanceXmp`, `applyAiProvenanceMetadata` (nur Metadaten), `applyAiWatermark` schreibt zusätzlich IPTC-XMP | Art. 50 Abs. 2 |
| `src/lib/inhalte-erstellen/casting-direction.ts` | `ADULT_APPEARANCE_GUARD` in der anonymen Besetzung; gewünschtes Alter nur noch „adult age“ | Werberat Ziff. 2, Ergebnisqualität |
| `src/lib/assistant/hopfenHugoPolicy.ts` | KI-Hinweis „kein Mensch“, Eingrenzung auf Brauerei-/BrewAI-Themen, Verbot „rechtssicher“, Alkoholwerbungsregeln, Minderjährigen-Erkennung erweitert | Art. 50 Abs. 1, Kosten, Missbrauch |
| Tests (neu/erweitert) | `src/lib/compliance/checkAdCompliance.test.ts`, `src/app/api/account/export/route.test.ts`, `src/lib/dashboard/deleteAccount.test.ts`, `src/lib/assistant/hopfenHugoPolicy.test.ts`, `src/lib/openai/aiWatermark.test.ts`, `src/lib/inhalte-erstellen/casting-direction.test.ts` | – |
| Doku (neu) | `docs/legal/ENTWURF-datenschutz-dokumentation.md`, `docs/legal/ENTWURF-massnahmenkatalog-und-quellen.md` | – |

`src/lib/auth/termsAcceptance.ts` bewusst unverändert (Schlüssel werden ggf. ausgewertet; Textänderung erfolgt in der UI, f6).

## d) Tests (Befehl und tatsächliches Ergebnis)

- `npx vitest run src/lib/compliance src/app/api/account src/lib/inhalte-erstellen/casting-direction.test.ts src/lib/openai/aiWatermark.test.ts src/lib/auth/termsAcceptance.test.ts src/lib/dashboard/deleteAccount.test.ts src/lib/assistant` → **7 Dateien, 72 Tests bestanden** (20:34, erneut 20:42). Darin 44 Tests des Prüfmoduls, davon 14 Negativfälle mit harmlosen Brauerei-Texten/Prompts ohne Treffer mittlerer oder hoher Stufe (u. a. „Starkbierzeit … 7,2 % vol“, „Kinderleicht bestellen“, „Berliner Kindl“, „Braumeister bei der Arbeit“, „candle-lit“, „one of a kind“; bei „Happy Hour ab 16 Uhr“ bewusst nur ein geringer Mengen-Hinweis, kein Jugendschutz-Treffer) plus leerer bzw. fehlerhafter Input.
- `npx tsc --noEmit --incremental false` → 1. Lauf 3 Fehler in `aiWatermark.ts` (Typ `sharp.Sharp`), behoben; 2. Lauf: **0 Fehler in meinen Dateien**, verbleibend 1 Fehler in `src/lib/security/fileSignature.test.ts:78` (Bereich Agent 1, vermutlich parallele Änderung). 3. Lauf (20:43, nach Quellen-Ergänzung): 0 Fehler in meinen Dateien; zeitweise 2 Fehler in `src/lib/dashboard/metadata.ts` (wird parallel von einem anderen Agenten bearbeitet, bei erneutem Aufruf nicht mehr gemeldet).
- `npx eslint` auf alle geänderten/neuen Dateien → **0 Meldungen**.
- Nicht ausgeführt: `src/lib/openai/imageApiKey.test.ts` (Vorgabe), Build, Dev-Server.

## e) Maßnahmenkatalog für die anwaltliche Prüfung

| Prio | Maßnahme | Grundlage | Verantwortlich |
|---|---|---|---|
| 1 | Zielgruppe festlegen: B2B-only (sichtbar in Registrierung, Checkout, AGB) **oder** Verbraucherpflichten vollständig (Kündigungsschaltfläche nach § 312k BGB, Widerrufsbelehrung/-zustimmung für Dauer-SaaS prüfen, Preisangaben) | § 312k BGB; § 356 BGB [Offen] | Gründer + Anwalt |
| 2 | AVV/DPA und Drittlandgrundlage je Anbieter (Supabase, Vercel, Stripe, OpenAI, Anthropic, KIE inkl. Temp-Hosting, BytePlus, Resend, Google, Meta) prüfen; KIE/BytePlus bis zur Klärung für Personenfotos sperren | Art. 28, 44 ff. DSGVO | Gründer + Anwalt |
| 3 | Rolle nach KI-VO klären (Anbieter/Betreiber), Geltungsbeginn und Übergangsfrist Art. 50 im Amtsblatt prüfen; maschinenlesbare Kennzeichnung für alle Bilder (und Videos) aktivieren | Art. 50 Abs. 2, 4 KI-VO | Orchestrator + Anwalt |
| 4 | Impressum in App-Footer, Login und Registrierung verlinken | § 5 DDG | Agent 2 |
| 5 | Datenschutzerklärung an tatsächliche Verarbeitungen anpassen (Anbieter, KI-Verarbeitung, Speicherungen im Endgerät, Export, Löschung, Speicherdauer) | Art. 13 DSGVO | Anwalt |
| 6 | Löschkonzept mit Fristen (Jobs/Prompts, Warteliste, Logs, Backup-Tabelle, Stripe-Kunde nach Ablauf der Aufbewahrung) | Art. 5 Abs. 1 lit. e, Art. 17 DSGVO | Gründer |
| 7 | Verzeichnis der Verarbeitungstätigkeiten, TOM und Subprozessorliste aus `docs/legal/` finalisieren | Art. 30, 32 DSGVO | Gründer |
| 8 | AGB: Nutzungsrechte an KI-Ergebnissen (Lizenzbedingungen der Modellanbieter prüfen), Verantwortung des Kunden für Freigabe von Werbung, Rechte an Referenzfotos und abgebildeten Personen, Alkoholwerbung | AGB-Recht; Anbieterbedingungen [Offen] | Anwalt |
| 9 | Markenscanner: Bestätigung „eigene Marke“, TDM-Vorbehalt/robots.txt, Löschung von Scan-Kopien | § 44b UrhG [Offen] | Agent 3 + Anwalt |
| 10 | Preisangaben korrigieren (USt-Hinweis dynamisch, Seedance-Token-Hinweis und Videoschätzung, `yearly`-Feld vs. Stripe) | § 5 UWG | Agent 1/2 |
| 11 | Plattformrichtlinien Meta/TikTok/Google Ads für Alkohol prüfen, bevor Kampagnen-/Ads-Funktionen gebaut werden | Plattform-AGB | Gründer |
| 12 | Prüfmodul fachlich gegen aktuelle Werberat-Fassung (PDF 2026) und HCVO-Liste abgleichen lassen; Werberat-Regeln sind Selbstregulierung, keine Gesetze | Werberat, HCVO | Anwalt/Branchenexperte |

## f) Änderungswünsche an andere Bereiche und Integrationspunkte

**f1 – KI-Kennzeichnung immer (Agent 6/Orchestrator), `src/lib/inhalte-erstellen/run-studio-generation.ts`:**
```diff
-import { applyAiWatermark } from "@/lib/openai/aiWatermark";
+import { applyAiProvenanceMetadata, applyAiWatermark } from "@/lib/openai/aiWatermark";
@@ (Zeile ~600)
-      const finalBuffer = prepared.input.aiWatermark
-        ? await applyAiWatermark(composited, OUTPUT_FORMAT)
-        : composited;
+      const finalBuffer = prepared.input.aiWatermark
+        ? await applyAiWatermark(composited, OUTPUT_FORMAT)
+        : await applyAiProvenanceMetadata(composited, OUTPUT_FORMAT);
@@ (Zeile ~612)
-    const finalBuffer = prepared.input.aiWatermark ? await applyAiWatermark(cropped, OUTPUT_FORMAT) : cropped;
+    const finalBuffer = prepared.input.aiWatermark
+      ? await applyAiWatermark(cropped, OUTPUT_FORMAT)
+      : await applyAiProvenanceMetadata(cropped, OUTPUT_FORMAT);
```
Prüfen, ob Thumbnails/weitere Upload-Pfade (z. B. Hintergrundfreistellung, Videos) ebenfalls gekennzeichnet werden. Hinweis: sharp-Reencoding erzeugt minimal andere Dateigrößen; Pixel bleiben bei PNG identisch (Test vorhanden).

**f2 – Prüfmodul in Text-Routen (Orchestrator):**
- `src/app/api/inhalte-erstellen/suggest-copy/route.ts`, nach `const copy = parseCopyJson(text);` (Zeile ~97):
```diff
+import { checkAdCompliance } from "@/lib/compliance";
@@
-    return NextResponse.json(copy);
+    const compliance = checkAdCompliance({
+      text: [copy.headline, copy.subline, copy.ctaText].filter(Boolean).join("\n"),
+      kind: "werbetext",
+      beverage: { alcoholFree: /alkoholfrei/i.test(String(parsed.data.bierstil ?? "")) },
+    });
+    return NextResponse.json({ ...copy, compliance: { highestSeverity: compliance.highestSeverity, summary: compliance.summary, findings: compliance.findings, disclaimer: compliance.disclaimer } });
```
(Feldname der Biersorte im Request-Schema prüfen; die Antwort wird nur additiv erweitert, bestehende Clients bleiben kompatibel.)
- `social-post` delegiert an `handleStudioGenerationRequest(req, "social")`: dort den finalen Bild-Prompt mit `kind: "bildprompt"` und den Nutzer-Freitext (`zusatzWunsch`) mit `kind: "werbetext"` prüfen und das Ergebnis im Job-Status mitliefern; generiert wird trotzdem (nur Hinweis, keine Sperre).
- Erstellen-Ansicht (Agent 2, `src/components/ui/inhalte-erstellen-studio.tsx`): Das Modul hat keine Server-Abhängigkeiten und kann im Browser laufen. Freitext, Headline, Subline, CTA mit `useMemo(() => checkAdCompliance({ text, kind, beverage }), [text, …])` prüfen und `<ComplianceHints report={report} />` unter den Feldern rendern.

**f3 – Datenbank (Orchestrator, nur Migration anlegen):** FK-Kaskaden für `generation_jobs`, `dashboard_media`, `token_lots`, `billing_subscriptions`, `workspace_*`, `integration_secrets` in der Live-DB verifizieren; Backup-Schema `brewai_release_backup_20260915` nach Prüfung löschen.

**f4 – Export-Schaltfläche (Agent 2, Einstellungen/Konto):** Link `<a href="/api/account/export" download>Meine Daten exportieren (JSON)</a>` neben „Konto löschen“; bei Status 403 mit `code: "two_factor_required"` zur 2FA leiten.

**f5 – Impressum (Agent 2/Agent 1):** `auth-card.tsx`: `marketingLegalUrl` um `"impressum"` erweitern und unter dem Formular „Impressum · Datenschutz · AGB“ verlinken; dasselbe im Dashboard-Footer bzw. Nutzer-Menü (`nav-user.tsx`).

**f6 – Checkbox-Text (Agent 2), `auth-card.tsx:436-455`:**
```diff
-Ich akzeptiere die <a …>AGB</a> und <a …>Datenschutz</a>.
+Ich akzeptiere die <a …>AGB</a>. Die <a …>Datenschutzhinweise</a> habe ich zur Kenntnis genommen.
```

**f7 – Abmelden (Agent 1), `src/lib/auth/submitSignOut.ts` bzw. `signOutClient.ts`:** vor dem Redirect `["brewai.assistant.threads","brewai.assistant.active"]` sowie die Studio-Entwurfsschlüssel aus `src/lib/inhalte-erstellen/studio-draft.ts` per `localStorage.removeItem` in `try/catch` löschen.

**f8 – Preise (Agent 1/2):** `admin-pricing-view.tsx:349` USt-Satz abhängig von `isKleinunternehmerModeEnabled()` formulieren; `SEEDANCE_VIDEO_TOKEN_HINT` und Videoschätzung an den tatsächlich berechneten Faktor 1,5 angleichen; Text „Monatlich kündbar“ für Jahresabos prüfen.

**f9 – Zeichensalat (Agent 2):** `dashboard-redesign.tsx:472` UTF-8 korrigieren.

## g) Quellenverzeichnis (abgerufen am 2026-11-09)

- Deutscher Werberat, Verhaltensregeln für alkoholhaltige Getränke (Fassung Januar 2026): https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/
- Deutscher Werberat, Leitfaden „Kinder und Jugendliche“: https://werberat.de/leitfaden-zum-werbekodex-des-deutschen-werberats/alkoholhaltige-getraenke/kinder-und-jugendliche/
- Deutscher Werberat, PDF Version 2026 (Datei abgerufen, Text maschinell nicht lesbar): https://werberat.de/wp-content/uploads/2026/01/Alkoholleitfaden_DWR_Version_2026_V2.7_Online-Version.pdf
- BGH, Pressemitteilung Nr. 93/18 zu I ZR 252/16 („bekömmlich“, Urteil vom 17.05.2018, Art. 4 Abs. 3 Buchst. a HCVO, gilt auch für Werbung): https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2018/2018093.html (Volltext des Urteils nicht abgerufen)
- Verordnung (EG) Nr. 1924/2006 (HCVO): https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:32006R1924 (Art. 4 Abs. 3 über die BGH-Pressemitteilung bestätigt; EUR-Lex-Abruf lieferte keinen Text)
- Google Ads, Richtlinie zu Alkohol (Plattformregel): https://support.google.com/adspolicy/answer/6012382?hl=de
- KI-Verordnung (EU) 2024/1689, Art. 50 (Inhalt über den AI Act Service Desk der EU-Kommission geprüft): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50 ; EUR-Lex: https://eur-lex.europa.eu/eli/reg/2024/1689/oj/deu (Abruf lieferte keinen Text)
- Sekundärquellen zum Geltungsbeginn/AI-Omnibus (nicht amtlich, nur als Hinweis): https://www.iubenda.com/en/blog/ai-omnibus-parliament-adoption-june-2026 ; https://cms.law/en/gbr/publication/digital-omnibus-on-ai-adjusted-timelines-and-transitional-provisions-explained
- IPTC Digital Source Type „trainedAlgorithmicMedia“: https://cv.iptc.org/newscodes/digitalsourcetype/
- § 25 TDDDG: https://www.gesetze-im-internet.de/ttdsg/__25.html
- § 5 DDG: https://www.gesetze-im-internet.de/ddg/__5.html
- § 312k BGB: https://www.gesetze-im-internet.de/bgb/__312k.html
- § 5 UWG: https://www.gesetze-im-internet.de/uwg_2004/__5.html
- § 44b UrhG: https://www.gesetze-im-internet.de/urhg/__44b.html
- DSGVO (Art. 5, 13, 15, 17, 20, 25, 28, 30, 32, 44 ff.): https://eur-lex.europa.eu/eli/reg/2016/679/oj/deu (am Audit-Tag nicht erneut abgerufen; Artikelangaben aus Kenntnis der Verordnung, vor Verwendung prüfen)

Nicht abgerufen bzw. nicht lesbar (bewusst offen gelassen): JuSchG/JMStV-Normtexte, Plattformrichtlinien Meta (Seite lieferte keinen Text) und TikTok, Lizenzbedingungen OpenAI/KIE/BytePlus/Anthropic, Stellungnahmen von DSK/EDPB/BfDI.

## h) Tatsächliche Arbeitsschritte

- 20:10 Arbeitsplan gelesen; Bestandsaufnahme Konto-Löschung, Storage-Pfade, Tabellen, Migrationen.
- 20:12–20:16 Rechtstexte, Cookies/Storage, Tracking, Preise, B2B/B2C, Assistent, Scanner gesichtet.
- 20:14–20:18 Recherche: Werberat (Fassung 2026), TDDDG § 25, BGH „bekömmlich“, AI-Omnibus (Sekundärquellen).
- 20:16–20:26 Prüfmodul `src/lib/compliance` geschrieben, Tests: 41/44, nach Korrekturen 44/44.
- 20:26–20:27 `deleteAccount.ts` erweitert und getestet (4/4).
- 20:28–20:30 Datenexport (Bibliothek, Route, Tests 7/7); Next.js-Doku zu Route Handlers gelesen.
- 20:30–20:32 `casting-direction.ts` und `aiWatermark.ts` (IPTC-XMP) erweitert, Tests 11/11.
- 20:33–20:35 Hinweis-Komponente; Nachricht des Orchestrators bearbeitet (Assistent eingegrenzt, Preisangaben eingeordnet); Gesamtlauf 72/72.
- 20:35–20:38 Typecheck (Fehler in `aiWatermark.ts` behoben), ESLint, Recherche § 5 DDG, § 312k BGB, § 5 UWG, § 44b UrhG, Art. 50 KI-VO, IPTC.
- 20:38–20:42 Dokumentation `docs/legal/` und dieser Bericht.
- 20:42–20:47 Nachrecherche (BGH-Pressemitteilung direkt, Google-Ads-Richtlinie), Quelle im Prüfmodul ergänzt, Tests erneut 44/44, Abschlussprüfung.
