# CHANGELOG – improve/dashboard-perf-ux

Stand: 27.11.2026. Der Branch ist nicht gepusht. Basis ist `origin/main` @ 196c914, der Stand der Baseline aus `AUDIT.md`. Grundlage: `AUDIT.md`, `PLAN.md`, `E2E-REPORT.md`, `PERFORMANCE.md`, `QA-REPORT.md` (QA: keine Blocker).

## Vorher / Nachher

| Messung | Baseline (196c914) | Endstand |
|---|---:|---:|
| E2E (Dev-Modus), bestanden / rot / übersprungen | 194 / 50 / 44 (288) | **254 / 2 / 56** (312). Die 2 roten sind B-2 „Prefetch“, den es im Dev-Modus nicht gibt. |
| E2E (Produktions-Build, `E2E_PROD=1`) | – | **256 / 0 / 56**. B-2 Prefetch grün, Reaktion 85–95 ms. |
| `tsc` Fehler | 0 | 0 |
| ESLint Fehler / Warnungen | 0 / 65 | 0 / 55 |
| Unit-Tests (vitest src) | 742 | 774. Neu sind unter anderem Tests für die Grenze zwischen Client und Server, die Workspace-Zustände, die Checkout-Idempotenz, die Credits (PGlite), die Media-Pagination und die Cookie-Domain. |
| First Load JS `/dashboard` (roh / gzip) | 1625 / 495 KB | **1046 / 327 KB** (−36 % / −34 %) |
| First Load JS `/inhalte-erstellen` | 1099 / 337 KB | 1021 / 319 KB |
| Globales CSS (roh) | 624 KB | 464 KB (−26 %) |
| Vorgeladene Schriften im Dashboard | 26 Dateien / 928 KB | 3 Dateien / 159 KB |
| Tabwechsel im Dashboard | 1 RSC-Request und 4 Daten-APIs (im Dev 8), Neuaufbau, Scrollposition weg | 0 RSC-Requests, 0 API-Aufrufe, Scrollposition bleibt (auch bei Zurück/Vor im Produktions-Build) |
| Team-API bei 35 Tabwechseln | 40× HTTP 429 | 0 |

Gewachsen sind `/` (514 KB), `/anmelden` (703 KB), `/admin` (974 KB) und `/videos-erstellen` (1009 KB), jeweils um 33–39 KB roh. Grund: Die neue Root-Fehlerseite wird auf jeder Route mitgeladen. Siehe Folgeaufgaben.

## Was geändert wurde

**Welle 1: Navigation, Fehlerseiten, P0-Bugs**
- **B-1:** Die Dashboard-Shell bleibt beim Tabwechsel gemountet (`pushState` statt `router.push` auf die force-dynamic-Route). In Welle 2 kam `DashboardTabLink` statt des globalen Klick-Handlers dazu; Strg-, Cmd- und Mittelklick funktionieren weiter. `startTransition` und eigene Suspense-Grenzen pro Tab verhindern den restlichen Remount. Die Scroll-Wiederherstellung hängt jetzt an der URL statt an der Reihenfolge der Listener; damit ist das Race im Produktions-Build behoben.
- **B-2:** Skeletons pro Segment statt `null`, Prefetch wieder aktiv.
- **B-5:** Unbekannte Abschnitte liefern HTTP 404.
- **B-3:** Prompt und Optionen bleiben beim Seitenwechsel erhalten.
- **N-3:** Offline erscheint ein Toast statt einer weißen Seite.
- **C-1:** Eigene Seiten für Fehler, `global-error` und 404. `getWorkspace` liefert typisierte Zustände; gesperrte Mitglieder landen auf `/zugang-pausiert` statt auf der Next-Fehlerseite.
- **N-1:** Über den Einladungslink lassen sich Konten anlegen (`passwordConfirm`, mindestens 8 Zeichen).
- **N-2:** Ein abgebrochener Abo-Checkout lässt sich erneut starten. Der Idempotency-Key besteht aus Lock und Parameter-Hash.
- **N-4:** Deutsche Meldungen statt zod-JSON und englischer Stripe-Texte.
- **N-6:** Die Session wird vor der Validierung geprüft (401 statt 400).
- **C-4:** vitest ignoriert `.claude/**` und `tests/e2e/**`.
- **A-1:** Es werden nur die genutzten Schriften geladen.
- **A-2:** Der `crypto`-Polyfill ist aus dem Client-Bundle entfernt.
- **A-4:** Die Mediathek sortiert und paginiert in der Datenbank.

**Welle 2: Datenabruf, Bundle, Billing**
- **A-5:** `cache()` pro Request für `getUser`, `getWorkspace` und `getAuthUserById`.
- **A-6:** Die Studio-Seiten signieren im Render keine Assets mehr und rufen keinen Stripe-Sync auf; der Abgleich läuft per `after()`.
- **Bundle:** zod und `CreateResultStage` sind aus dem First Load entfernt. Server-Code kann nicht mehr ins Client-Bundle gelangen (`subscriptionState.ts`, Schutztest `src/lib/security/clientServerBoundary.test.ts`).
- **Billing:** siehe Abschnitt „Credits bei abgelaufenem Abo“, dazu `confirm-session`, `stripeCustomer` und 503 statt 403 bei einer DB-Störung.
- **C-3:** Bei 429 zeigt der Client den Text des Servers und lädt nach `Retry-After` einmal neu.

**Welle 3: Design aufräumen (bestehendes System, kein Sudbuch, wie entschieden)**
- **Tokens:** Akzent `--color-acc` mit Varianten. Fest eingetragenes Orange in der UI ist von 112 auf 14 Stellen gesunken; übrig sind E-Mail-HTML, Canvas, JS-Paletten und die Token-Definition selbst. 99 Grautöne laufen jetzt über Theme-Tokens. Statt 18 Radius-Varianten gibt es eine Skala mit 7 Stufen.
- **A-3:** 676 ungenutzte CSS-Klassen und 91 Keyframes entfernt.
- **N-7:** axe meldet auf allen 13 Seiten nichts mehr, auf Desktop und Mobil.
- **N-5:** Zeichenzähler und Hinweis auf die Grenze von 800 Zeichen.
- **Statusseiten:** zentriert, mit Logo. Der Überschriften-Bug in `StudioPageHeader` ist behoben.
- **Responsive:** geprüft bei 375, 768, 1280 und 1920 px.
- **Begriffe (Entscheidung Orchestrator):** Das Ergebnis heißt „Motiv“, die Aktion „Bild erstellen“, der Ausführen-Knopf „Generieren“. „Preset“ heißt überall „Vorlage“. Die Upload-Komponente ist komplett auf Deutsch und nutzt den Akzent-Token.
- **Dashboard:** „N Motive“ zeigt jetzt die Gesamtzahl statt der geladenen Seite (die war auf 48 begrenzt). Die Kurve „Token-Aktivität“ ist monoton und geht nicht mehr unter null.

**Nachträglich (Orchestrator)**
- `NEXT_PUBLIC_COOKIE_DOMAIN=none` setzt Host-only-Cookies in Produktions-Builds außerhalb von brewai.de, zum Beispiel für den lokalen Prod-Test oder Previews. Ohne diesen Wert bleibt alles wie bisher.
- E2E: `E2E_PROD=1` lässt die Suite gegen `next build && next start` laufen; Warteliste und Cookie-Domain sind dafür passend gesetzt. Die `bluetooth`-Policy-Warnung des Linux-Chromium wird ignoriert, der Header selbst bleibt streng.

## Gemeldet, nicht geändert
- **C-2 Ungenutzte Generierungsmodi:** Die API-Routen für Ultra Realistic, Studio Produktbild, Kampagne + Text und Freistellen (`src/app/api/generate-*`) haben keinen Aufrufer in der UI. Die zugehörige UI wurde am 15.09.2026 in Commit 2a383de entfernt, Details in `DESIGN-HISTORY.md`. Wie entschieden: nichts verdrahtet, nichts gelöscht.

## Vorgeschlagene DB-Migrationen (nicht ausgeführt)
Beide stehen in `docs/audit/migrations-proposed.sql`.
1. **`credits-inactive-subscription`: braucht deine Freigabe, weil sie eine Geschäftsregel ändert.** Ohne sie kann auch der Inhaber bei abgelaufenem Abo seine gekauften Credits nicht nutzen. Details im nächsten Abschnitt.
2. **Index `dashboard_media_user_created_idx`:** optional, betrifft nur die Performance der Mediathek. Läuft mit `concurrently`, also außerhalb einer Transaktion.

## Credits bei abgelaufenem Abo (Welle 2, Gründer-Entscheidung)
- **Unterscheidet der Code gekaufte und Abo-Credits? Ja.** `token_lots.source` ist entweder `'purchased'` oder `'monthly'`.
  - `'purchased'`: Token-Packs über `billing_grant_token_pack_atomic` → `billing_adjust_tokens_atomic(...,'add')` (`docs/billing-periods-migration.sql:123`).
  - `'monthly'`: Abo-Kontingent und Willkommensbonus (`:55`, `:143`, `:173`).
  - Abo-Posten verfallen (`expires_at`), gekaufte nicht.
- **Das heutige Verhalten widerspricht der Entscheidung.**
  - `billing_debit_lots` (`supabase/migrations/20260918123000_debit_lots_allow_bonus.sql:29-36`) wirft bei einem Stripe-Abo mit Status ungleich active/trialing immer „Kein aktives Abo.“. Damit sind bei abgelaufenem Abo **auch gekaufte Credits gesperrt**.
  - Ein Unit-Test schreibt das sogar fest: `src/lib/billing/atomicBilling.test.ts`, „cancellation preserves remaining bought tokens and blocks consumption“.
  - `access.ts` lässt die Erstellen-Seite trotzdem zu, weil `monthly_tokens - used_tokens` alle Posten zählt. Der Nutzer scheiterte dann erst beim Reservieren mit „Bitte Guthaben prüfen“.
- **Vorschlag, nicht ausgeführt:** `docs/audit/migrations-proposed.sql`, Abschnitt `credits-inactive-subscription`.
  - `billing_debit_lots` bucht bei inaktivem Abo nur Posten mit `source='purchased'` ab, mit derselben Sperre `for update`, also genauso atomar wie heute. Reicht das nicht, kommt „Nicht genug gekaufte Tokens.“.
  - `billing_project_balance` zeigt gesperrte Abo-Credits nicht mehr als verfügbar an.
  - Bonus-Konten ohne Stripe-Abo bleiben unverändert.
  - Getestet gegen PGlite in `src/lib/billing/inactiveSubscriptionCredits.test.ts`.
- **Code, der mit dem heutigen und dem vorgeschlagenen Schema läuft:** `reservationErrorResponse` in `src/lib/billing/generationJobs.ts` meldet „Kein aktives Abo.“ und „Nicht genug gekaufte Tokens.“ als 402 `subscription_inactive` mit deutschem Text statt 409 „Bitte Guthaben prüfen“.
- **Teammitglieder:** Generierungen von Mitgliedern buchen auf das Konto des Inhabers, die Regel gilt also für beide gleich. Bei inaktivem Inhaber-Abo kommen Mitglieder aber gar nicht bis zur Abbuchung: `getWorkspace` sperrt sie vorher (`src/lib/dashboard/workspace.ts`), und bei `plan=null` gibt es keinen Teamplatz. **Gründer-Entscheidung (26.11.2026): Nur der Inhaber darf bei abgelaufenem Abo gekaufte Credits nutzen, Mitglieder bleiben gesperrt.** Das entspricht dem heutigen Verhalten, eine Änderung ist nicht nötig.
- **Noch zu bestätigen:** Nach einer Reaktivierung werden noch nicht verfallene Abo-Posten wieder nutzbar; so steht es im Vorschlag und im Test.

## Folgeaufgaben (nicht in diesem Branch)
1. **Schema versionieren:** Das Kernschema aus `docs/*.sql` nach `supabase/migrations/` überführen, mit fester Reihenfolge. Heute steht die Reihenfolge nur in Markdown und in einem Unit-Test, und `request-rate-limits-migration.sql` fehlt dort ganz.
   - Dazu gehört der Storage-Bucket `generated-images`, der nirgends versioniert ist. Für die E2E-Testdatenbank ist er in `tests/e2e/fixtures/schema/001_generated_images_bucket.sql` nachgebaut.
   - Außerdem prüfen, ob die Datenbank vom Code abweicht: Laut Kommentar in `character-store.ts:11` fehlt `dashboard_characters` in Produktion.
2. **Stripe-Händlername:** Stripe Checkout zeigt „evglab“ bzw. „evglab sandbox“, weil das Konto mit EvGlab geteilt ist. Zu klären: Bekommt BrewAI ein eigenes Konto oder einen eigenen Statement-Descriptor bzw. Händlernamen, und sieht das live genauso aus?
3. **Root-Fehlerseite verschlanken:** `src/app/error.tsx` bzw. `StatusScreen` wird auf jeder Route mitgeladen. Das kostet 33–39 KB roh auf `/`, `/anmelden`, `/admin` und `/videos-erstellen`.
4. **Teamtabelle mobil:** Bei 375 px scrollt sie leicht. Sie ist per Tastatur bedienbar; eine Kartenansicht wäre der nächste Schritt. Bewusst zurückgestellt, weil Teams meist nur 2–5 Personen haben.
5. **Kleinere Punkte aus QA und von den Agenten:**
   - `/zugang-pausiert` prüft kein 2FA. Die Seite zeigt nur den Sperrgrund, keine Daten.
   - Nach einem verpassten Stripe-Webhook landet der erste Aufruf einmal auf der Preisseite (`studioBillingGate.ts`). Die Reparatur greift erst einen Klick später.
   - Die Mediathek sortiert `createdAt` als Text. Das ist nur bei einheitlichem ISO-Format korrekt.
   - Kaputter Verweis `--t-18` in `studio-create.css:1301`.
   - Ungenutzte Komponenten (`claude-style-ai-input.tsx`, `gradient-card.tsx`, `ruixen-moon-chat-demo.tsx`, `dashboard-stubs/**`) sind gemeldet, nicht gelöscht.
   - „Vor“ nach einem „Zurück“ stellt die Scrollposition nicht wieder her.
   - Getestet wurde nur in Chromium.
6. **E2E-Umgebung:**
   - Playwright braucht unter LMDE `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64`.
   - `pg` liegt nur in `node_modules/.e2e-tools`.
   - Die Screenshot-Werkzeuge liegen in `ui-screenshots/_tool/` und sind gitignored.

## Nicht getestet
- Echte KI-Generierung, sie war gemockt.
- Abo-Aktivierung per Webhook, lokal nicht erreichbar.
- Mailversand für 2FA, Passwort-Reset und Einladung.
- Endgültiges Löschen eines Kontos.
- Safari und Firefox.
- `/invite/<token>` nur funktional, nicht visuell.
