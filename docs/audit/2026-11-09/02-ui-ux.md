# 02 – UI/UX-Audit (Agent 2)

Stand: 2026-11-09, 20:10–20:55. Bereich laut Arbeitsplan: Dashboard-Shell, Navigation, `src/components/ui|studio|dashboard-stubs|admin`, `admin-*`-Ansichten, `(dashboard)`-Seiten, Styles.

Methode: Code-Analyse plus visuelle Prüfung im eingebauten Browser über `/marketing-preview/*` (Dev-Server `dev`, Port 3001, ohne Login) in 1440×900, 1280×800 und 375×812 (mobile). Der Dev-Server ist gestoppt, Port 3001 ist frei.

## (a) Ausgangszustand

- **Navigation** (`src/navigation/sidebar/sidebar-items.ts`): drei Gruppen (Arbeitsbereich, Marke, Konto) mit 9 Einträgen, alle echte Funktionen. Ausnahme: „Videos erstellen“ führt bei gesperrtem Feature-Flag (`NEXT_PUBLIC_VIDEOS_CREATE_ENABLED`, Standard aus) auf eine „Demnächst verfügbar“-Seite.
- **Dashboard-Startseite** (`src/components/dashboard/admin-home-view.tsx`): vier Kennzahlkarten, ein 320 px hohes Token-Diagramm und eine Asset-Tabelle. Für eine neue Brauerei bedeutet das: lauter Nullen, eine leere Diagrammfläche, Suche und Filter auf einer leeren Liste und nirgends ein nächster Schritt. Der Markenstatus „Unvollständig“ war sichtbar, aber ohne Aktion.
- **Produktions-Erstellen-Flow**: `/inhalte-erstellen` rendert `RuixenMoonChat` (`src/components/ui/ruixen-moon-chat.tsx`). Die im Auftrag genannte `inhalte-erstellen-studio.tsx` (1.956 Zeilen) wird in Produktion **nicht** verwendet, nur im Marketing-Preview. Dort erscheint sie ungestylt, weil der `.evg-studio`-Scope fehlt.
- **Sichtbare Zeichenfehler (Mojibake)** in `src/components/ui/dashboard-redesign.tsx`, z. B. „Bitte bestÃ¤tige …“, „ZurÃ¼cksetzen …“, „Ãœbersicht …“ und „SchlieÃŸen“ (aria-label). Außerdem im Text des Markenprofil-Auswahldialogs.
- **Englische Template-Reste**: Kopfzeile „Search“, Suchfeld „Search dashboards, users, and more…“, „No results found.“, Vorlesetexte „Toggle Sidebar“, „Close“, „Command Palette“ und beim Theme-Schalter „Current theme: … Click to cycle themes“.
- **Preise** versprechen in jedem Plan „Videos erstellen mit Seedance 2.5“ und „ca. 5–12 Videos“, obwohl Videos per Flag gesperrt sind.
- Ausgangswerte: Tests im eigenen Bereich grün. Laut Orchestrator lieferte `tsc` zu Beginn 0 Fehler.

## (b) Befunde (priorisiert)

### Kritisch
1. **Preisseite verspricht nicht verfügbare Video-Leistungen.** Betroffen sind `admin-pricing-view.tsx:71` (Features aus `src/lib/billing/planCatalog.ts:51-58`), `:214` und `:332`/`:351` (HEAD). Ein Kunde kauft „Brauerei Start“ mit „ca. 5–12 Videos“ und landet auf „Demnächst verfügbar“. Das ist ein Vertrauens- und Irreführungsrisiko (UWG). → **behoben in der Ansicht.** Die Quelle sollte zusätzlich angepasst werden, siehe (f) 1.
2. **Widersprüchliche Aussagen zur Gültigkeit der Token-Pakete** (`admin-pricing-view.tsx`, aktuell Zeilen 317, 324–325, 347, 367): „Gekaufte Tokens bleiben bis zum Verbrauch“, „Sofort verfügbar … im aktuellen Zeitraum“ und „Separat gekaufte Token-Pakete verfallen 12 Monate nach Kauf“ stehen auf derselben Seite. In `docs/billing-atomic-migration.sql` (`billing_grant_token_pack_atomic`) habe ich keine Ablauf-Logik gefunden. → **nicht geändert**, weil das eine rechtliche bzw. kaufmännische Entscheidung ist, siehe (f) 2.

### Hoch
3. **Dashboard ohne nächsten Schritt für neue Kunden** (`admin-home-view.tsx`, HEAD 373–378, 508–514): Es gab keine Aktion für „Markenprofil anlegen“, „Tarif wählen“ oder „Erstes Bild erstellen“. Dabei verspricht die Produkt-Tour „was als Nächstes sinnvoll ist“ (`dashboard-product-tour.tsx:49`). → **behoben** mit der Karte „Nächste Schritte“.
4. **Mojibake in sichtbaren Texten** (`dashboard-redesign.tsx`, HEAD 472, 557, 559, 599, 810–811, 842–843). Betroffen sind die Checkout-Fehlermeldung, Markenprofil-Hinweise, die Übersicht-Fehlermeldung, das aria-label „Schließen“ und der Dialogtext. → **behoben** (außerdem Kommentare in `studio-tokens.css`).
5. **„Videos erstellen“ in der Hauptnavigation trotz gesperrtem Flag**: `sidebar-items.ts:76-81` und `create-videos-coming-soon-view.tsx:46`. Der Text dort lautete „Den Bereich siehst du schon in der Navigation …“. Das ist eine Sackgasse in der Hauptnavigation. → **behoben**: Der Eintrag erscheint nur noch bei aktivem Flag. Tour-Schritt und Suche filtern automatisch mit, der Text der Demnächst-Seite ist angepasst.
6. **Teammitglied entfernen ohne Bestätigung** (`admin-team-view.tsx`, HEAD 339): Ein Fehlklick nahm sofort den Zugriff. → **behoben** mit einem AlertDialog („Mitglied entfernen?“ bzw. „Einladung zurückziehen?“). Der Fokus liegt auf „Abbrechen“.
7. **Tote Einstellungen „Benachrichtigungen“** (`admin-settings-view.tsx`, HEAD 324–347): „E-Mail-Benachrichtigungen (… Sicherheit)“ und „Wochenzusammenfassung (jeden Montag …)“ werden nur gespeichert. In `src/` und `supabase/` liest kein Versand diese Werte (geprüft per Grep: nur `settingsPayload.ts`, `metadata.ts` und die Settings-Route). Abschalten wirkt also nicht, und das Versprechen einer Wochen-Mail ist ungedeckt. → **Karte ausgeblendet**, die Werte bleiben im Payload.
8. **Englische UI- und Vorlesetexte**: `search-dialog.tsx`, `sidebar.tsx:281/293/296`, `dialog.tsx:79/118`, `sheet.tsx:80`, `command.tsx:37-38`, `theme-switcher.tsx:27`. → **behoben**.

### Mittel
9. **Mobile (375 px): Spalte „Erstellt“ der Motivtabelle unsichtbar**. Die Tabelle war 467 px breit und lag in einem `overflow-hidden`-Container (`admin-home-view.tsx`, HEAD 516–555). → **behoben**: Unter 640 px zeigt sie nur Motiv und Erstellt, Titel werden gekürzt. Geprüft: kein Element ragt über 375 px hinaus.
10. **Wahrgenommene Geschwindigkeit auf der Preisseite**: Planarten wurden mit 1,2 s bis 2,4 s Verzögerung eingeblendet (`reveal((index + 3) * 0.4)`), der Bereich „Aktiver Plan“ nach 1,2 s. → **behoben**: gestaffelt 0,10–0,25 s, `prefers-reduced-motion` bleibt beachtet.
11. **Theme-Schalter als Primärbutton** (orange gefüllt) in der Kopfzeile, also auffälliger als jede Hauptaktion. → **behoben**: jetzt `outline` wie der Mediathek-Button, mit deutschem Label „Darstellung: Hell. Wechseln zu Dunkel“.
12. **Redundante Werbekarte im Sidebar-Footer** („BrewAI Studio – Motive erzeugen … Jetzt erstellen“): doppelt zu „Neu erstellen“ oben und frisst Platz. → **entfernt**. `support-card.tsx` ist damit ungenutzt.
13. **Mediathek: zwei Buttons zum selben Ziel** („Zur Einstiegsseite“ und „Motiv generieren“, beide `/inhalte-erstellen`; `studio-media-library.tsx`, HEAD 853–861). „Einstiegsseite“ ist zudem unklar. → **entfernt bzw. umbenannt** in „Bild erstellen“.
14. **Markenprofil-Auswahldialog ließ sich nicht per Escape schließen** (eigenes Modal in `dashboard-redesign.tsx`, ohne Fokusfalle). → **Escape ergänzt.** Fokusfalle und Fokus beim Öffnen fehlen weiter, siehe (e).
15. **Unklare Begriffe und Kennzahlen**: „Assets diesen Monat“, „128 Gesamtabbuchungen“ (gemeint: abgeschlossene Aufträge insgesamt), die Kurz-ID „#a1b2c3d4“ in der Tabelle und englisches „Tonality“. → **behoben**: „Motive diesen Monat“, „128 insgesamt erstellt“, keine ID mehr, „Tonalität“.
16. **Knappe Fehlermeldungen ohne Handlungsanweisung**: „Sortiment nicht ladbar.“, „Charaktere nicht ladbar.“, „Charakter braucht eine Sorte mit Flaschenfoto.“ (`ruixen-moon-chat.tsx:284/295/410`) sowie „Netzwerkfehler beim Laden …“ (`dashboard-redesign.tsx`). → **behoben**: jetzt mit Handlungsanweisung (neu laden, Internetverbindung prüfen, Foto unter Markenprofil › Sortiment).
17. **Marketing-Preview „create“ zeigt nicht die Produktions-Oberfläche** und ist ungestylt (`src/app/marketing-preview/screens.tsx:13/135/148`, Bereich Agent 6). Die Screenshots für Marketing wären falsch. → siehe (f) 3.
18. **Farbschema Produkt ≠ Marketing**: Das Produkt startet mit `theme_preset: "default"` (Primärfarbe fast schwarz, `preferences-config.ts:63-68`), Marketing-Screenshots erzwingen „tangerine“ (orange, `marketing-preview/theme-sync.tsx:16`). Kunden sehen also ein anderes Produkt als beworben. → Entscheidung des Gründers, siehe (e).
19. **Mobile Bottom-Navigation nur mit Icons** (`futuristic-nav.tsx`): Sechs Icons ohne sichtbaren Text, die Mediathek nutzt ein #-artiges Rastersymbol. Für Nutzer ohne Technikkenntnisse schwer lesbar. aria-labels sind vorhanden. → offen.
20. **Mobile: vier Kennzahlkarten untereinander** (rund 800 px), bevor eine Aktion kommt. Durch die neue Karte „Nächste Schritte“ oben ist das für neue Kunden entschärft. → offen.
21. **Teamtabelle mobil**: Rolle und Aktion („Entfernen“) liegen bei 375 px rechts außerhalb und sind nur per horizontalem Wischen erreichbar (`admin-team-view.tsx:268`, `overflow-x-auto`). → offen.

### Niedrig
22. **Toter Code**: `src/components/dashboard-stubs/**` (30 Dateien, 5.034 Zeilen) wird nirgends importiert. `inhalte-erstellen-redesign.tsx` ist ungenutzt, `inhalte-erstellen-studio.tsx` dient nur noch dem Marketing-Preview, `support-card.tsx` ist jetzt ungenutzt. Im Produkt nicht sichtbar, kostet aber Wartung. → Löschvorschlag in (f) 5.
23. **Großschreibung uneinheitlich**: „Bilder Erstellen“ bzw. „Videos Erstellen“ in Titeln. → **vereinheitlicht** auf „Bilder erstellen“ bzw. „Videos erstellen“.
24. **Tour-Intro „Motive & Videos“** bei gesperrten Videos. → **flag-abhängig**.
25. **Spannen der Bildschätzung sehr breit** („ca. 70–400 Bilder“) und ohne Bezug zur Qualitätsstufe. → offen, Text kommt aus `planCatalog.ts` (Agent 1).
26. **„Brand-Lock „Balanced““** (Englisch) in den Einstellungen. Das Label kommt aus `src/lib/brand/brand-profile-display.ts:44-48` (Agent 3). → (f) 4.
27. Header-Button Mediathek (animierter Ordner) wiederholt den Sidebar-Eintrag. Unkritisch, belassen.
28. Seiten zeigen Entwicklerhinweise („Supabase ist noch nicht konfiguriert … `.env.local`“), allerdings nur bei fehlender Umgebung. Unkritisch.

## (c) Umgesetzte Änderungen

| Datei | Änderung |
|---|---|
| `src/components/dashboard/admin-home-view.tsx` | Neue Karte „Nächste Schritte“ (`BrewAiNextSteps`): zeigt nur offene Schritte in der Reihenfolge Tarif → Markenprofil anlegen/ergänzen → erstes Bild. Genau ein Primärbutton, erscheint erst nach dem Laden und verschwindet, wenn nichts offen ist. Liegt außerhalb von `.dash-rise-stack`, damit die nth-child-Staffelung nicht neu ausgelöst wird. Gemeinsame Regel `hasActivePlan()`. Leeres Diagramm 160 statt 320 px mit erklärendem Satz. Leere Motivliste mit Titel, Satz und Button „Bild erstellen“. Kein Treffer → „Filter zurücksetzen“. Suche und Filter nur bei vorhandenen Motiven. aria-labels für Suche und Selects. Mobile Tabelle mit 2 Spalten. Begriffe „Motive“ statt „Assets“, Kurz-ID entfernt. |
| `src/components/ui/dashboard-redesign.tsx` | Mojibake repariert (8 Zeilen mit sichtbarem Text bzw. aria-label, dazu 2 Kommentarzeilen). „Tonality“ → „Tonalität“, „Website deiner Brauerei“. Escape schließt den Markenprofil-Auswahldialog. Netzwerkfehler mit Handlungsanweisung. |
| `src/navigation/sidebar/sidebar-items.ts` | „Videos erstellen“ nur bei `isVideosCreateEnabled()`. |
| `src/components/studio/create-videos-coming-soon-view.tsx` | Text stimmt wieder („erscheint in der Navigation, sobald freigeschaltet“), Großschreibung vereinheitlicht. |
| `src/app/(dashboard)/inhalte-erstellen/page.tsx`, `src/app/(dashboard)/videos-erstellen/page.tsx` | Titel „Bilder erstellen“ bzw. „Videos erstellen“. |
| `src/components/dashboard/admin-pricing-view.tsx` | Video-Features, Video-Hinweise und Fußzeile nur bei aktivem Flag (`visiblePlanFeatures`). Einblendverzögerungen von bis zu 2,4 s auf maximal 0,25 s gesenkt. |
| `src/components/dashboard/admin-team-view.tsx` | Bestätigungsdialog vor dem Entfernen, aria-label je Zeile („Erik Bauer entfernen“). |
| `src/components/dashboard/admin-settings-view.tsx` | Karte „Benachrichtigungen“ ausgeblendet (ohne Wirkung), ungenutzter Import entfernt. |
| `src/components/studio/media/studio-media-library.tsx` | Doppelten Button „Zur Einstiegsseite“ entfernt, „Motiv generieren“ → „Bild erstellen“, Leertext vereinheitlicht. |
| `src/components/ui/ruixen-moon-chat.tsx` | Drei Fehlermeldungen mit Handlungsanweisung. |
| `src/components/dashboard-shell/brewai-admin-shell.tsx` | SupportCard aus dem Footer entfernt. Gründer-WIP (Logout über `submitSignOut`) unverändert. |
| `src/components/dashboard-shell/header/theme-switcher.tsx` | `variant="outline"`, deutsches aria-label/title. |
| `src/components/dashboard-shell/header/search-dialog.tsx` | „Suchen“, „Bereich suchen …“, „Keine Treffer.“, Gruppe „Weitere“. |
| `src/components/dashboard-shell/dashboard-product-tour.tsx` | Intro „Fotorealistische Motive“ statt „Motive & Videos“ bei gesperrtem Flag. |
| `src/components/ui/sidebar.tsx`, `dialog.tsx`, `sheet.tsx`, `command.tsx` | Deutsche Vorlese- und Standardtexte („Seitenleiste ein- oder ausblenden“, „Schließen“, „Schnellsuche“). |
| `src/styles/studio-tokens.css` | Mojibake nur in Kommentaren repariert, keine Regeländerung. |

Keine neuen Dateien außer diesem Bericht. Keine Paket-, Daten- oder API-Änderungen.

## (d) Tests und visuelle Prüfung (tatsächliche Ergebnisse)

- `npx vitest run src/components src/lib/dashboard/onboarding.test.ts src/lib/inhalte-erstellen/media-title.test.ts src/lib/inhalte-erstellen/media-job-cards.test.ts src/lib/dashboard/settingsPayload.test.ts` → **6 Dateien, 51/51 bestanden** (20:37). Zuvor ohne settingsPayload: 5 Dateien, 48/48 (20:31).
- `npx tsc --noEmit --incremental false`:
  - Lauf 1 (20:31): 4 Fehler, alle in fremden Dateien (`src/lib/openai/aiWatermark.ts` 3×, Bereich Agent 4; `src/lib/security/fileSignature.test.ts` 1×, Bereich Agent 1).
  - Lauf 2 (20:38): **0 Fehler**.
  - Lauf 3 (20:40, nach Tour-Änderung): **0 Fehler**.
- `npx eslint <alle geänderten Dateien>` → **0 Fehler**. 23 Warnungen, alle vorbestehend in unveränderten Zeilen (`react-hooks/set-state-in-effect`, `no-unused-vars` in `dashboard-redesign.tsx`). Die Warnungen in `admin-home-view.tsx` (ungenutztes `Link`/`brandProfileMode`) sind beseitigt.
- `src/lib/openai/imageApiKey.test.ts` wurde wie vorgegeben **nicht** ausgeführt.
- Browser (`/marketing-preview/…`):
  - `dashboard-empty`, 1440×900: Karte „Nächste Schritte“ mit „Markenprofil anlegen“ (primär) und „Erstes Bild erstellen“ (outline). Leeres Diagramm kompakt, leere Motivliste mit Button, keine Suche bzw. Filter. Sidebar ohne „Videos erstellen“ und ohne Werbekarte, Theme-Button outline.
  - `dashboard-incomplete`, 1280×800: nur „Markenprofil vervollständigen“ mit „Profil ergänzen“.
  - `dashboard`, 375×812: keine Karte (Profil komplett, Motive vorhanden) und **kein Element breiter als 375 px**. Vor der Änderung ragte die Tabelle bis 467 px.
  - `pricing`, 375×812: 0 Vorkommen von „Video“, Plan „Brauerei Start“ zeigt „ca. 70–400 Bilder“ ohne Videozeile.
  - `team`, 375×812: „Erik Bauer entfernen“ öffnet „Mitglied entfernen?“, Fokus auf „Abbrechen“. Per „Abbrechen“ geschlossen, Mitglied bleibt in der Liste. **Nicht bestätigt** (keine echte Aktion).
  - `settings`: rendert, „Wochenzusammenfassung“ nicht mehr vorhanden.
  - `media`: kein „Zur Einstiegsseite“, Button heißt „Bild erstellen“.
  - Konsole: nur 401-Antworten (Preview ohne Session ruft echte APIs auf) und Next-Dev-Meldungen „Router action dispatched before initialization“ aus HMR-Refreshs während meiner Dateiänderungen. Keine Laufzeitfehler aus geändertem Code.
- **Nicht visuell geprüft**: Produktions-Erstellen-Flow `RuixenMoonChat` (braucht Login; nur Code-Analyse), Dunkelmodus der neuen Karte, Onboarding-Seite `/onboarding`, Assistent im Detail, Markenprofil-Ansichten (Bereich Agent 3). Hinweis: Das Browser-Pane lief zeitweise im Hintergrund, deshalb wurden CSS- und CountUp-Animationen gedrosselt. Screenshots habe ich nach `document.getAnimations().finish()` aufgenommen. Zahlen „mitten im Hochzählen“ auf Screenshots sind ein Messartefakt.

## (e) Offene Punkte

1. Gültigkeit der Token-Pakete klären (Befund 2), danach die Texte vereinheitlichen.
2. Mobile Bottom-Navigation: kurze Textlabels unter den Icons (z. B. Start, BrewAI, Erstellen, Mediathek, Marke, Konto) und ein eindeutiges Mediathek-Icon.
3. Teamtabelle mobil als Kartenliste (Name, Rolle-Select, Entfernen untereinander).
4. Kennzahlkarten mobil kompakter (2×2 mit kleinerer Schrift) – Layout vorher am Gerät prüfen.
5. Markenprofil-Auswahldialog in `dashboard-redesign.tsx` auf das vorhandene `AlertDialog`/`Dialog` umstellen (Fokusfalle, Fokus beim Öffnen, Rückgabe des Fokus).
6. Farbschema: Entweder das Produkt startet mit „tangerine“ (Markenfarbe) oder das Marketing zeigt „default“. Aktuell weichen Werbung und Produkt ab.
7. `RuixenMoonChat` mit Login visuell prüfen: Fehler- und Leerzustände, 375 px, Tastaturbedienung der Popover.
8. Onboarding (`src/app/onboarding`, `onboarding-tour-flow.tsx`, 1.148 Zeilen) aus Zeitgründen nicht im Detail geprüft.
9. Serverseitige Fehlermeldungen der Generierung (kommen über `data.error`/`blocking_issues` in `start-studio-generation.ts`) auf deutsches Handlungsformat prüfen. Betrifft Route-Handler (Agent 1).

## (f) Änderungswünsche an andere Bereiche (mit Diff-Vorschlag)

**1. Agent 1 – `src/lib/billing/planCatalog.ts:51-58`**: Video-Features an der Quelle vom Flag abhängig machen. Danach kann `visiblePlanFeatures` in `admin-pricing-view.tsx` entfallen. Die Marketing-Website (separates Repo) auf dasselbe Versprechen prüfen.
```diff
+import { isVideosCreateEnabled } from "@/lib/featureFlags";
 function buildPlanFeatures(planId: SubscriptionPlanKey, teamLine: string, supportLine: string): string[] {
   const tokens = SUBSCRIPTION_PLAN_TOKENS[planId];
+  const videos = isVideosCreateEnabled();
   return [
     `${tokens.toLocaleString("de-DE")} Tokens / Monat`,
-    `${formatPlanImageEstimate(tokens)} · ${formatPlanVideoEstimate(tokens)}`,
-    "Videos erstellen mit Seedance 2.5",
+    videos ? `${formatPlanImageEstimate(tokens)} · ${formatPlanVideoEstimate(tokens)}` : formatPlanImageEstimate(tokens),
+    ...(videos ? ["Videos erstellen mit Seedance 2.5"] : []),
     teamLine,
```

**2. Agent 4 (Legal) und Gründer – Token-Pakete** (`admin-pricing-view.tsx:317, 324–325, 347, 367`): eine einzige Regel festlegen und in der DB-Logik prüfen. Beispiel für „12 Monate gültig“:
```diff
-Einmalige Packs für mehr Generierungen. Gekaufte Tokens bleiben bis zum Verbrauch.
+Einmalige Packs für mehr Generierungen. Gekaufte Tokens sind 12 Monate ab Kauf gültig.
-note: "Einmaliger Kauf · bleibt bis Verbrauch"
+note: "Einmaliger Kauf · 12 Monate gültig"
-Sofort verfügbar für … im aktuellen Zeitraum.
+Sofort verfügbar, unabhängig vom Abrechnungszeitraum.
```
Nach der Entscheidung setzt der Orchestrator den Text in meiner Datei um.

**3. Agent 6 – `src/app/marketing-preview/screens.tsx:13, 135, 148`**: Der Screen „create“ zeigt die Legacy-Komponente ungestylt. Vorschlag (ungetestet; die Komponente ruft `/api/dashboard/my-beers` auf und bekommt im Preview 401, also Leerzustand):
```diff
-import { InhalteErstellenStudio } from "@/components/ui/inhalte-erstellen-studio";
+import { InhalteErstellenMoonChatPage } from "@/components/ui/inhalte-erstellen-moon-chat-page";
@@ case "create":
-          <InhalteErstellenStudio initialBreweryName={BREWERY} … />
+          <div className="relative min-h-[calc(100dvh-3rem)]"><InhalteErstellenMoonChatPage /></div>
```
Minimalvariante: die bestehende Komponente in `<div className="evg-studio">…</div>` einwickeln. Außerdem: `MarketingThemeSync` setzt „tangerine“ nur einmal im Effect. Nach HMR oder einem Präferenz-Sync stand `data-theme-preset="default"`, beobachtet nach einem HMR-Update, nach Reload wieder korrekt.

**4. Agent 3 – `src/lib/brand/brand-profile-display.ts:44-48`, `src/components/dashboard/BrandProfileView.tsx:459`**: deutsche Labels.
```diff
-  if (level === "strict") return "Strict";
-  if (level === "balanced") return "Balanced";
+  if (level === "strict") return "Streng";
+  if (level === "balanced") return "Ausgewogen";
```
```diff
-<legend …>Brand-Lock</legend>
+<legend …>Markentreue</legend>
```
Danach in `admin-settings-view.tsx:216` „Brand-Lock“ → „Markentreue“ (meine Datei; erst zusammen ändern, damit die Begriffe nicht auseinanderlaufen).

**5. Orchestrator – toter Code löschen** (nach erneutem `git grep`): `src/components/dashboard-stubs/**`, `src/components/ui/inhalte-erstellen-redesign.tsx`, `src/components/dashboard-shell/sidebar/support-card.tsx`. Nach Umsetzung von (3) auch `src/components/ui/inhalte-erstellen-studio.tsx`.

## Designsystem-Regeln (verbindlich für neue UI)

**Tokens**
- Nur semantische Tokens: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary` und `text-destructive`.
- Keine Hex-Farben in Komponenten.
- Studio-Tokens (`--acc`, `--fg`, `stu-*`) gelten nur innerhalb von `.evg-studio`.

**Komponenten**
- Dashboard-Ansichten nutzen `src/components/ui` (Button, Card, Badge, Table, Select, AlertDialog).
- Studio-Flächen nutzen `src/components/studio/ui`. Nicht mischen, keine neuen Varianten.
- Bei Dopplungen (z. B. `ui/dialog` und `studio/ui/dialog`) gilt: dort verwenden, wo die Fläche hingehört.

**Hierarchie**
- Pro Ansicht genau eine Primäraktion (`default`), Nebenaktionen `outline`, Tertiäres `ghost`.
- Icon-Buttons in der Kopfzeile immer `outline`.
- Die Akzentfarbe gehört Hauptaktionen, nicht Einstellungen.

**Destruktive Aktionen** (Entfernen, Löschen, Zurücksetzen)
- Immer per `AlertDialog`, Bestätigungsbutton `destructive`, Fokus startet auf „Abbrechen“.

**Leerzustand**
- „Noch keine …“, ein Satz, was hier erscheinen wird, und eine Aktion.
- Diese Aktion ist `outline`, wenn die Primäraktion schon anderswo steht.
- Suche und Filter erst zeigen, wenn es Inhalte gibt.

**Fehlertexte**
- Muster: „Was ist passiert. Was tun.“ plus Button „Erneut laden“, wo möglich.
- Kein Technikjargon: keine Statuscodes, IDs oder „Request“.

**Laden und Bewegung**
- Skeletons in Zielhöhe.
- Einblend-Staffelung insgesamt höchstens rund 300 ms.
- `MotionConfig reducedMotion="user"` bzw. `motion-reduce:` beachten.
- Keine dekorativen Animationen.

**Texte**
- Deutsch, Du-Form, Aktionen in Satzschreibung („Bild erstellen“).
- Begriffe: **Motiv** (erzeugtes Bild), **Bild erstellen** (Aktion), **Mediathek**, **Markenprofil**, **Sorte/Sortiment**, **Tokens** (nur im Abrechnungskontext).
- Vermeiden: „Asset“, „Generierung“ (in der UI), „Brand-Lock“, englische Texte, auch in `sr-only` und aria-labels.

**Feature-Flags**
- Gesperrte Funktionen erscheinen weder in Navigation noch Tour noch Preisen (`isVideosCreateEnabled()`).

**Mobile (375 px)**
- Keine primäre Information nur per horizontalem Scroll.
- Tabellen unter 640 px auf 2–3 Spalten (`hidden sm:table-cell`).
- Trefferflächen mindestens 24×24 px, besser 32 px und mehr.

**Barrierefreiheit**
- Jedes Eingabefeld, jeder Switch und jedes Select hat ein Label (`Label htmlFor` oder deutsches `aria-label`).
- Dialoge schließen per Escape.
- `alt=""` nur, wenn der Titel direkt daneben steht.

## (g) Tatsächliche Arbeitsschritte

| Uhrzeit | Schritt |
|---|---|
| 20:10 | Arbeitsplan gelesen, Navigation, Shell und Dashboard-Router erfasst |
| 20:11 | Dev-Server `dev` (Port 3001) gestartet, Ist-Aufnahme `dashboard-empty` |
| 20:13 | Preview „create“ ungestylt → Ursache: Legacy-Komponente ohne `.evg-studio`, Produktion nutzt `RuixenMoonChat` |
| 20:14 | Mojibake gefunden und per geprüftem Skript repariert, Escape für den Auswahldialog |
| 20:15–20:18 | Dashboard: Nächste Schritte, Leerzustände, Begriffe, Netzwerkfehlertexte |
| 20:18–20:20 | Navigation/Flag, Demnächst-Text, Titel, Theme-Schalter, SupportCard, Fehlertexte im Erstellen-Chat |
| 20:20–20:23 | Sichtprüfung Desktop und Mobile, Animations-Staffelung korrigiert, mobile Tabelle, englische Template-Texte |
| 20:24–20:27 | Preise: Video-Versprechen, Einblendverzögerungen, Widerspruch zu Token-Paketen dokumentiert |
| 20:27–20:30 | Team: Bestätigungsdialog, ESLint |
| 20:31 | Vitest 48/48, tsc Lauf 1 (4 fremde Fehler) |
| 20:32–20:36 | Mediathek (doppelter Button), Einstellungen (tote Benachrichtigungen) |
| 20:37 | Vitest 51/51, tsc Lauf 2: 0 Fehler, Browser-Endkontrolle |
| 20:38 | Viewport zurückgesetzt, Dev-Server gestoppt, Port 3001 frei |
| 20:39–20:40 | Tour-Intro flag-abhängig, ESLint, tsc Lauf 3: 0 Fehler |
| 20:41–20:55 | Bericht |
