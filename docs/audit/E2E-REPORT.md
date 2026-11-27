# E2E-Report – BrewAI Studio (Playwright)

## Baseline

| | |
|---|---|
| Datum | 26.11.2026 |
| Branch / Commit | `improve/dashboard-perf-ux` @ `196c9140066fdf2204c9d35ef4a4141e12af9048` (App-Code unverändert) |
| Umgebung | eigener `next dev --turbopack` auf Port 3101 (über Playwright `webServer`), Supabase-**Test**projekt `wwsmogrpxmiwujytzanu`, Stripe Test-Modus, Chromium 153 headless |
| Viewports | Desktop 1440×900 (Projekt `desktop`), Mobil 390×844 Pixel-7-Profil mit Touch (Projekt `mobile`) |
| Aufruf | `npx playwright test` (Setup idempotent: Schema einspielen, Accounts/Daten zurücksetzen, Logins) |
| Ergebnis | **288 Testfälle: 194 bestanden, 50 fehlgeschlagen, 44 übersprungen**, 0 flaky, Dauer 22,1 min (Lauf 26.11.2026 12:57–13:19 Uhr, nach Stromausfall vollständig neu gestartet). Alle 50 Fehlschläge sind App-Befunde (siehe Bugs), keiner ist ein Testfehler. 36 der 44 Übersprungenen sind viewport-unabhängige Tests, die nur im Desktop-Projekt laufen (Sicherheit/API, C-3, Parallel, 3DS, Passwort-Anfrage); die übrigen sind fachlich nicht testbar (Grund in der Tabelle). |

Wichtig für die Einordnung:
- Gemessen wurde im **Dev-Modus**. React StrictMode führt Mount-Effekte im Dev doppelt aus, deshalb erscheinen Daten-Requests pro Mount zweimal. In Produktion ist es je API einmal (abgeleitet, nicht gemessen). Absolute Zeiten sind lokal (ohne Netzlatenz) und eher zu optimistisch.
- Die KI-Anbieter wurden **serverseitig gemockt**. Das lief über einen Preload in den Testserver (`NODE_OPTIONS=--import tests/e2e/fixtures/server-preload.mjs`), nicht über App-Code. `api.openai.com`, `api.anthropic.com`, `api.kie.ai` und `api.resend.com` antworten lokal: Erfolg, 500, Timeout oder zu kleines Bild. Zusätzlich sind alle KI-Keys des Testservers ungültig (fail-closed). Es gab **keinen einzigen echten Generierungslauf** und keine KI-Kosten.
- Ein Guard bricht jeden Test ab, sobald Browser **oder** Server eine Anfrage an `*.brewai.de` oder an die Produktions-Supabase (`lutmsbxcjmocftiovwfs`) stellen. Im ganzen Lauf gab es dabei 0 Treffer. Das Setup weist außerdem nach, dass der Server nur mit dem Testprojekt spricht: Der Login gelingt nur mit Zugangsdaten, die es nur im Testprojekt gibt, und das Client-Bundle enthält den Test-Host.
- Mailversand ist im Testserver abgeschaltet (alle `RESEND_*` leer). Die Supabase-Fallback-Mail des Testprojekts lehnt `@example.com` ab.

## Testfälle

| Datei | Testfall | Desktop 1440 | Mobil 390 | Grund / Messwert |
|---|---|---|---|---|
| auth.setup.e2e.ts | Testserver spricht nur mit dem Supabase-Testprojekt | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: userA | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: userB | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: zeroCredits | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: noSub | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: admin | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: teamMember | bestanden (Setup) | – |  |
| auth.setup.e2e.ts | Login + Session speichern: teamOwnerExpired | bestanden (Setup) | – |  |
| auth.e2e.ts | Login mit gültigen Daten führt ins Dashboard | bestanden | bestanden |  |
| auth.e2e.ts | Falsches Passwort zeigt deutsche Fehlermeldung, kein Login | bestanden | bestanden |  |
| auth.e2e.ts | Login ohne bekanntes Gerät verlangt 2FA (Mailversand im Test aus → verständliche Meldung) | bestanden | bestanden |  |
| auth.e2e.ts | 2FA-Code-Eingabe mit gültigem Code führt ins Dashboard | bestanden | bestanden |  |
| auth.e2e.ts | Logout beendet die Session | bestanden | bestanden |  |
| auth.e2e.ts | Abgelaufene/ungültige Session → Redirect zum Login, API 401 | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/media | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/team | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/brand | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/settings | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/pricing | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /dashboard/assistant | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /inhalte-erstellen | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /videos-erstellen | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /admin | bestanden | bestanden |  |
| auth.e2e.ts | Geschützte Route ohne Login → Login: /onboarding | bestanden | bestanden |  |
| auth.e2e.ts | Registrierung ohne Einladung ist gesperrt (AUTH_INVITE_ONLY) | bestanden | bestanden |  |
| auth.e2e.ts | Registrierung mit Einladung legt Konto an (Link /invite/<token> aus Admin-Einladung) | fehlgeschlagen | fehlgeschlagen | D: Error: Konto wurde angelegt expect(received).toBeTruthy() Received: false 103 \\| await page.waitForURL((u) => !u.pathname.startsWith("/invite") && !u.pathname.startsWith("/auth/sig |
| auth.e2e.ts | Registrierung mit Einladung legt Konto an (/anmelden?mode=register&invite=<token>) | bestanden | bestanden |  |
| auth.e2e.ts | Passwort vergessen: Anfrage zeigt deutsche Rückmeldung | bestanden | übersprungen | M: Nur ein Lauf je Suite: Supabase-Standardmailer des Testprojekts ist stark limitiert (Mail an example.com). |
| auth.e2e.ts | Passwort zurücksetzen über Recovery-Link, danach Login mit neuem Passwort | bestanden | bestanden |  |
| billing.e2e.ts | Token-Anzeige entspricht der Datenbank | bestanden | bestanden |  |
| billing.e2e.ts | 0 Credits: Anzeige zeigt 0 und Hinweis zum Aufladen | bestanden | bestanden |  |
| billing.e2e.ts | Kauf Token-Pack mit Testkarte 4242 → Gutschrift nach Rückkehr | bestanden | bestanden |  |
| billing.e2e.ts | Abgelehnte Karte 4000 0000 0000 0002 → Fehlermeldung bei Stripe, keine Gutschrift | bestanden | bestanden |  |
| billing.e2e.ts | 3DS-Karte 4000 0025 0000 3155 → Authentifizierung erforderlich | bestanden | übersprungen | M: Einmal je Lauf. |
| billing.e2e.ts | Abo-Kauf (Checkout) startet Stripe-Checkout im Test-Modus | bestanden | bestanden |  |
| billing.e2e.ts | Checkout abbrechen und erneut starten (gleicher Plan) führt wieder zu Stripe | fehlgeschlagen | fehlgeschlagen | D: Error: Versuch 2: {"error":"Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than 'checkout:d926fa90-349d-420 · M: Error: Versuch 2: {"error":"Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than 'checkout:9a9a7d4e-de5c-45f |
| billing.e2e.ts | Abo-Gutschrift nach Abschluss | übersprungen | übersprungen | D: Übersprungen (kein Webhook lokal): Abo-Aktivierung läuft über checkout.session.completed/customer.subscription.* am Stripe-Webhook. |
| billing.e2e.ts | C-1: Teammitglied, dessen Inhaber-Abo abgelaufen ist, sieht eine erklärende Seite statt Next-Fehlerseite | fehlgeschlagen | fehlgeschlagen | D: Error: expect(received).not.toMatch(expected) Expected pattern: not /Application error\\|This page could not be found\\|Internal Server Error\\|server-side exception\\|This page couldn |
| billing.e2e.ts | Teaminhaber mit abgelaufenem Abo: Dashboard lädt, Status sichtbar | bestanden | bestanden | D: Erstellen-Seite → /inhalte-erstellen; Erstellen-Seite → /inhalte-erstellen |
| crosscut.e2e.ts | Querschnitt /anmelden | bestanden | bestanden |  |
| crosscut.e2e.ts | Querschnitt /registrieren | bestanden | bestanden |  |
| crosscut.e2e.ts | Querschnitt /passwort-vergessen | bestanden | bestanden |  |
| crosscut.e2e.ts | Querschnitt /dashboard | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /dashboard/assistant | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /inhalte-erstellen | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /videos-erstellen | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /dashboard/media | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /dashboard/brand | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /dashboard/team | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 4 - Array [] + Array [ + "button-name(1)", + "color-contrast(3)", + ] 51 · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 5 - Array [] + Array [ + "button-name(1)", + "color-contrast(2)", + "scr |
| crosscut.e2e.ts | Querschnitt /dashboard/pricing | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(2)", + ] 51 \\| expect.soft(summ · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(1)", + ] 51 \\| expect.soft(summ |
| crosscut.e2e.ts | Querschnitt /dashboard/settings | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 4 - Array [] + Array [ + "color-contrast(4)", + "label(1)", + ] 51 \\| ex · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 4 - Array [] + Array [ + "color-contrast(3)", + "label(1)", + ] 51 \\| ex |
| crosscut.e2e.ts | Querschnitt /admin | fehlgeschlagen | fehlgeschlagen | D: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(27)", + ] 51 \\| expect.soft(sum · M: Error: axe serious/critical expect(received).toEqual(expected) // deep equality - Expected - 1 + Received + 3 - Array [] + Array [ + "color-contrast(18)", + ] 51 \\| expect.soft(sum |
| errors.e2e.ts | Offline: Navigation/Laden zeigt verständliche Meldung statt weißer Seite | fehlgeschlagen | fehlgeschlagen | D: Error: Seite darf nicht leer werden expect(received).toBeGreaterThan(expected) Expected: > 50 Received: 0 16 \\| const text = (await page.locator("body").innerText()).trim(); 17 \\| |
| errors.e2e.ts | API offline beim Laden der Mediathek → „Keine Verbindung“-Meldung | bestanden | bestanden |  |
| errors.e2e.ts | Langsames Netz (2 s Verzögerung auf Daten-APIs): Ladezustand sichtbar, kein leerer Bereich | bestanden | bestanden | D: Ladeindikatoren: 16, Text im main: 177; Ladeindikatoren: 16, Text im main: 177 |
| errors.e2e.ts | 404-Route zeigt eigene Seite (nicht Next-Standard) mit Weg zurück | fehlgeschlagen | fehlgeschlagen | D: Error: expect(locator).not.toContainText(expected) failed Locator: locator('body') Expected pattern: not /This page could not be found/ Received string: "404This page could not be |
| errors.e2e.ts | Server-Fehler im Dashboard (getWorkspace wirft) zeigt eigene Fehlerseite statt Next-Standard (C-1) | fehlgeschlagen | fehlgeschlagen | D: Error: expect(received).not.toMatch(expected) Expected pattern: not /Application error: a (server\\|client)-side exception has occurred\\|Internal Server Error\\|This page couldn.t lo |
| errors.e2e.ts | API-Fehler 500 der Übersicht → verständliche Meldung im Dashboard | bestanden | bestanden |  |
| generation.e2e.ts | Happy Path (gemockt) – Fotostil Reportage: Ergebnis, Mediathek-Eintrag, Tokens abgebucht | bestanden | bestanden |  |
| generation.e2e.ts | Happy Path (gemockt) – Fotostil Premium-Fotografie: Ergebnis, Mediathek-Eintrag, Tokens abgebucht | bestanden | bestanden |  |
| generation.e2e.ts | Happy Path (gemockt) – Fotostil Kampagnenmotiv: Ergebnis, Mediathek-Eintrag, Tokens abgebucht | bestanden | bestanden |  |
| generation.e2e.ts | Leere Eingabe: Generieren ist deaktiviert | bestanden | bestanden |  |
| generation.e2e.ts | Zu langer Prompt (5000 Zeichen): Nutzer wird über Grenze informiert, Anfrage bleibt gültig | fehlgeschlagen | fehlgeschlagen | D: Error: Hinweis auf Zeichengrenze bei stiller Kürzung auf 800 Zeichen expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0 68 \\| expect(res.status(), "keine 400 bei |
| generation.e2e.ts | Doppelklick auf Generieren erzeugt genau 1 Job | bestanden | bestanden | D: POSTs: 1, neue Jobs: 1; POSTs: 1, neue Jobs: 1 |
| generation.e2e.ts | Abbruch einer laufenden Generierung | übersprungen | übersprungen | D: Keine Abbrechen-Funktion in der UI (ruixen-moon-chat.tsx kennt nur Polling-Abbruch beim Verlassen, keinen Nutzer-Abbruch). |
| generation.e2e.ts | Ungültiger Dateityp / zu große Datei im Erstellen-Dialog | übersprungen | übersprungen | D: Erstellen-Dialog hat keinen Datei-Upload (Sorte/Charakter kommen aus dem Markenprofil). Upload-Validierung wird in settings.e2e.ts (Profilbild) geprüft. |
| generation.e2e.ts | Provider-Fehler (500) → deutsche Fehlermeldung, keine Tokens abgezogen | bestanden | bestanden | D: Meldung: OpenAI ist vorübergehend nicht erreichbar. Wir versuchen es automatisch erneut.; Job failed, charged 0; Meldung: OpenAI ist vorübergehend nicht erreichbar. Wir versuchen es automatisch erneut.; Job failed, charged 0 |
| generation.e2e.ts | Provider-Fehler (timeout) → deutsche Fehlermeldung, keine Tokens abgezogen | bestanden | bestanden | D: Meldung: OpenAI hat zu lange gebraucht. Bitte versuch es noch einmal.; Job failed, charged 0; Meldung: OpenAI hat zu lange gebraucht. Bitte versuch es noch einmal.; Job failed, charged 0 |
| generation.e2e.ts | Unerwartete Provider-Antwort (zu kleines Bild) → verständliche Meldung statt technischer Rohfehler | bestanden | bestanden | D: Job-Fehler: extract_area: bad extract area; Job-Fehler: extract_area: bad extract area |
| generation.e2e.ts | 0 Credits: Generierung wird mit verständlicher Meldung abgelehnt, kein Job | bestanden | bestanden |  |
| generation.e2e.ts | Ohne Abo: Erstellen-Seite leitet zur Preisseite | bestanden | bestanden |  |
| generation.e2e.ts | Parallele Generierungen (3 gleichzeitig) → 3 Mediathek-Einträge, keine Duplikate | bestanden | übersprungen | M: API-Test, viewport-unabhängig: einmal je Lauf. |
| generation.e2e.ts | Videos erstellen (Flag): Seite zeigt Hinweis statt Fehler | bestanden | bestanden |  |
| media.e2e.ts | Reihenfolge: neueste zuerst | bestanden | bestanden |  |
| media.e2e.ts | Pagination: 48 zuerst, „Weitere Motive laden“ lädt den Rest ohne Duplikate | bestanden | bestanden |  |
| media.e2e.ts | Leerer Zustand | bestanden | bestanden |  |
| media.e2e.ts | Download eines Motivs liefert ein Bild | bestanden | bestanden |  |
| media.e2e.ts | Löschen eines Motivs entfernt es aus Liste und DB | bestanden | bestanden |  |
| media.e2e.ts | C-5: Nach Löschen und „Weitere Motive laden“ fehlt kein Motiv | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/assistant | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/assistant | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /inhalte-erstellen | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /inhalte-erstellen | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/media | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/media | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/brand | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/brand | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/team | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/team | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/pricing | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/pricing | bestanden | bestanden |  |
| navigation.e2e.ts | Direktaufruf /dashboard/settings | bestanden | bestanden |  |
| navigation.e2e.ts | Per Klick erreichbar + Reload: /dashboard/settings | bestanden | bestanden |  |
| navigation.e2e.ts | Browser Zurück/Vor über mehrere Bereiche | bestanden | bestanden |  |
| navigation.e2e.ts | Deep-Link Legacy ?tab=media leitet auf /dashboard/media um und behält weitere Parameter | bestanden | bestanden |  |
| navigation.e2e.ts | B-5: Unbekannter Abschnitt /dashboard/gibtsnicht zeigt 404 statt still die Übersicht | fehlgeschlagen | fehlgeschlagen | D: Error: erwartet 404 für unbekannten Abschnitt expect(received).toBe(expected) // Object.is equality Expected: 404 Received: 200 82 \\| const { page } = await as("userA"); 83 \\| cons |
| navigation.e2e.ts | B-1: Tabwechsel im Dashboard ohne Server-Roundtrip und ohne Neuladen der Daten (Remount-Nachweis) | fehlgeschlagen | fehlgeschlagen | D: Error: Server-Roundtrip (RSC) beim Wechsel nach /dashboard/media expect(received).toBe(expected) // Object.is equality Expected: 0 Received: 1 105 \\| console.log(`[B-1 ${testInfo.p |
| navigation.e2e.ts | B-1: Mediathek-Scrollposition bleibt nach Tabwechsel und Zurück erhalten | fehlgeschlagen | fehlgeschlagen | D: Error: Scrollposition nach Zurück expect(received).toBeGreaterThan(expected) Expected: > 956.5 Received: 0 125 \\| await settle(page); 126 \\| const after = await page.evaluate(() => · M: Error: Scrollposition nach Zurück expect(received).toBeGreaterThan(expected) Expected: > 2763 Received: 395 125 \\| await settle(page); 126 \\| const after = await page.evaluate(() = |
| navigation.e2e.ts | B-2: Sichtbare Reaktion < 300 ms nach Klick, Prefetch der Navigationsziele | fehlgeschlagen | fehlgeschlagen | D: Error: Navigationsziele werden vorab geladen (Prefetch) expect(received).toBeGreaterThan(expected) Expected: > 0 Received: 0 165 \\| await testInfo.attach("b2-timing.json", { body: |
| navigation.e2e.ts | B-3: Prompt und Auswahl bleiben nach Wechsel in die Mediathek und zurück erhalten | fehlgeschlagen | fehlgeschlagen | D: Error: Fotostil erhalten expect(locator).toBeChecked() failed Locator: getByRole('radio', { name: 'Premium-Fotografie' }) Expected: checked Received: unchecked Timeout: 15000ms Cal |
| navigation.e2e.ts | Schneller Tabwechsel 10x hin und her: stabil, kein Fehler, kein leerer Inhalt, keine Layout-Sprünge | bestanden | fehlgeschlagen | M: Error: Cumulative Layout Shift während 10 Wechseln expect(received).toBeLessThan(expected) Expected: < 0.1 Received: 0.18534387663283647 219 \\| expect.soft(r429.length, "429 durch |
| navigation.e2e.ts | C-3: 35 Tabwechsel in < 60 s lösen kein Rate-Limit der Team-API aus | fehlgeschlagen | übersprungen | D: Error: 429 auf /api/dashboard/team expect(received).toBe(expected) // Object.is equality Expected: 0 Received: 40 242 \\| await testInfo.attach("c3.json", { body: JSON.stringify(dat · M: Einmal je Lauf (Desktop): das Rate-Limit ist pro Nutzer, nicht pro Viewport. |
| security.e2e.ts | GET /api/dashboard/summary ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/media ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/jobs ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/settings ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/team ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/my-beers ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/my-characters ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/dashboard/onboarding ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/billing/state ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/brand/profile-status ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | GET /api/account/export ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/inhalte-erstellen/create-task ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/inhalte-erstellen/social-post ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generation/status ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generation/submit ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/billing/checkout ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/billing/buy-tokens ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/billing/portal ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/dashboard/media ohne Session → 401 | fehlgeschlagen | übersprungen | D: Error: Status 400 expect(received).toContain(expected) // indexOf Expected value: 400 Received array: [401, 403] 53 \\| const ctx = await playwright.request.newContext({ baseURL: te · M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/dashboard/team ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generate-hyperrealistic ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generate-studio ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generate-campaign ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/generate-isolate ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/openai/image2/generate ohne Session → 401 | fehlgeschlagen | übersprungen | D: Error: Status 400 expect(received).toContain(expected) // indexOf Expected value: 400 Received array: [401, 403] 53 \\| const ctx = await playwright.request.newContext({ baseURL: te · M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | POST /api/kie/nano-banana/create-task ohne Session → 401 | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | User A sieht in der Mediathek-API nur eigene Einträge | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | User A kann Motiv von User B weder umbenennen noch löschen | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | Bilddatei von User B ist ohne Signatur nicht abrufbar (Storage + Download-Proxy) | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | User A darf den Generierungsstatus eines Jobs von User B nicht lesen | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | Supabase REST mit Session von User A liefert keine fremden Zeilen (RLS) | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| security.e2e.ts | Cross-Origin-POST wird abgewiesen (CSRF-Basis) | bestanden | übersprungen | M: API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt). |
| settings.e2e.ts | Profilname speichern bleibt nach Reload erhalten | bestanden | bestanden |  |
| settings.e2e.ts | Validierung: überlanger Name / ungültige Telefonnummer werden abgefangen | bestanden | bestanden | D: Rückmeldung: Ungültige Einstellungen (profileName: Too big: expected string to have <=120 characters).; Rückmeldung: Ungültige Einstellungen (profileName: Too big: expected string to have <=120 characters). |
| settings.e2e.ts | Profilbild: ungültiger Dateityp wird abgelehnt (deutsche Meldung) | bestanden | bestanden |  |
| settings.e2e.ts | Profilbild: zu große Datei (> 5 MB) wird abgelehnt | bestanden | bestanden |  |
| settings.e2e.ts | Profilbild: gültiges PNG wird hochgeladen | bestanden | bestanden |  |
| settings.e2e.ts | Datenexport liefert JSON | bestanden | bestanden |  |
| settings.e2e.ts | Konto löschen: Dialog öffnet sich und lässt sich abbrechen | bestanden | bestanden |  |
| settings.e2e.ts | Konto wirklich löschen | übersprungen | übersprungen | D: Destruktiv (löscht Konto + Storage); nur mit Wegwerf-Konto in eigenem Lauf sinnvoll. Abbruch-Pfad oben getestet. |
| settings.e2e.ts | Team: ungültige E-Mail wird abgelehnt | fehlgeschlagen | fehlgeschlagen | D: Error: verständliche Validierungsmeldung expect(received).toBeTruthy() Received: false 89 \\| const text = await shown.innerText(); 90 \\| test.info().annotations.push({ type: "measu |
| settings.e2e.ts | Team: Einladung mit gültiger E-Mail (Mailversand im Test aus) gibt verständliche Rückmeldung | bestanden | bestanden | D: POST team 400: {"error":"Einladung konnte nicht versendet werden."}; POST team 400: {"error":"Einladung konnte nicht versendet werden."} |
| settings.e2e.ts | Markenprofil-Seite lädt, URL-Analyse bei Providerfehler mit deutscher Meldung | bestanden | bestanden |  |

## Bugs

Schweregrad: **P0** blockiert Kernfunktion/Umsatz · **P1** deutlich spürbar, Workaround möglich · **P2** kosmetisch/robustheit.
Screenshots/Traces liegen unter `tests/e2e/.artifacts/results/<Testname>-<projekt>/` (`test-failed-1.png`, `trace.zip`, ansehen mit `npx playwright show-trace …`), Seiten-Screenshots unter `tests/e2e/.artifacts/screens/{desktop,mobile}/`. Der Ordner ist gitignored, er entsteht bei jedem Lauf neu.

### Bestätigte Befunde aus AUDIT.md

| ID | Schwere | Ergebnis | Beleg (Messung) |
|---|---|---|---|
| **B-1** | P0 | **bestätigt** (Desktop + Mobil) | Jeder Tabwechsel `/dashboard` ↔ `/dashboard/media` ↔ `/dashboard/settings` erzeugt **1 RSC-Server-Request** und lädt `media`, `summary`, `team` und `settings` neu: je 2× im Dev, also **8 Daten-Requests pro Wechsel**, in Produktion abgeleitet 4. Diese vier Requests stehen nur im Mount-Effekt (`deps []`) von `DashboardRedesignShell` (`dashboard-redesign.tsx:342-457`). Dass sie bei jedem Wechsel kommen, beweist den Remount. Dauer bis Ruhe: Desktop 1,0–1,5 s, Mobil 0,45–1,45 s. Die Scrollposition der Mediathek geht nach Wechsel und Zurück verloren: vorher > 100 px, nachher 0. Test: `navigation.e2e.ts` „B-1: …“, Anhang `b1-requests.json`. |
| **B-2** | P0 | **teilweise bestätigt** | Prefetch: **0** Prefetch-Requests nach Laden und Hover (`prefetch={false}`). Erste sichtbare Reaktion (URL-Wechsel) lokal: Desktop 259 ms, **Mobil 461 ms** (über 300 ms), Inhalt nach 1,0–1,1 s. Schon lokal ohne Netzlatenz scheitert Mobil an der 300-ms-Grenze. Mit echter Latenz (Auth + Workspace + Billing) verschiebt sie sich entsprechend, das ist nicht gemessen. Test „B-2 …“, Anhang `b2-timing.json`. |
| **B-3** | P1 | **bestätigt** | Prompt „Drei Freunde stoßen im Biergarten an“ und Fotostil „Premium“ sind nach Erstellen → Mediathek → Erstellen weg: Feld leer, Stil wieder „Reportage“. Test „B-3 …“. |
| **B-4** | P2 | **bestätigt (mobil)** | Beim 10-fachen schnellen Wechsel kumulierter Layout-Shift (CLS) **0,19–0,37 mobil** (Endlauf 0,19), Desktop 0–0,05. Mobil dabei 48–64 Daten-Requests für 10 Wechsel. Test „Schneller Tabwechsel 10x …“, Anhang `rapid-switch.json`. Leerer Inhaltsbereich (weißer Flash) in 50-ms-Proben: 0. |
| **B-5** | P2 | **bestätigt** | `/dashboard/gibtsnicht` liefert HTTP 200 mit der Übersicht statt 404. |
| **C-1** | P0 | **bestätigt** | Teammitglied eines Inhabers mit abgelaufenem Abo (`subscription_status=canceled`): `/dashboard` und `/dashboard/media` zeigen die Next-Standardseite „This page couldn’t load. A server error occurred. Reload to try again. ERROR 4101904048“. Es gibt keine Erklärung und keinen Ausweg außer „Reload“. Server-Log: `Error: Teamabo nicht aktiv.` (`workspace.ts:50`). `/diese-seite-gibt-es-nicht` zeigt die englische Next-Standardseite „404 This page could not be found.“. Tests `billing.e2e.ts` „C-1 …“, `errors.e2e.ts` „Server-Fehler …“ und „404-Route …“. |
| **C-3** | P1 | **bestätigt** | 35 Tabwechsel Dashboard ↔ Mediathek in 25–38 s (Endlauf 31,7 s): **68 Aufrufe von `/api/dashboard/team`, davon 40× HTTP 429**. Danach Team-Tab mit „Teamdaten konnten nicht geladen werden“. In Produktion halbiert (StrictMode) wären es 35 Aufrufe, also immer noch über dem Limit von 30/min. Test „C-3 …“. |
| **C-5** | P2 | **nicht reproduziert** | Löschen von Motiv 0 und danach „Weitere Motive laden“ (60 Einträge) liefert 59 Kacheln, Motiv 48 ist vorhanden. Im getesteten Ablauf fehlt kein Motiv. Andere Abläufe (mehrere Löschungen, Löschen aus Seite 2) wurden nicht getestet. |
| C-2 | – | vermerkt | Die vier Alt-Modi (Ultra Realistic, Studio, Kampagne + Text, Freistellen; `api/generate-*`) haben keine UI und wurden nicht getestet. Die Routen antworten ohne Session korrekt mit 401. |
| D-x | – | teilweise | axe-Befunde siehe N-7. Das Design-System (D-1/D-2) war nicht Gegenstand der E2E-Prüfung. |

### Neue Bugs (nicht in AUDIT.md)

#### N-1 (P0) – Einladungslink `/invite/<token>` kann kein Konto anlegen
- **Schritte:** Einladung anlegen (`POST /api/admin/invites` erzeugt `${origin}/invite/<token>`, `src/app/api/admin/invites/route.ts:62`), Link öffnen, E-Mail und Passwort eingeben, AGB anhaken, „Einladung annehmen und Konto erstellen“.
- **Erwartet:** Konto wird angelegt, Weiter zu 2FA/Onboarding.
- **Tatsächlich:** Weiterleitung auf `/anmelden?mode=register&error=missing` mit „Bitte E-Mail und Passwort ausfüllen.“. Es wird kein Konto angelegt. Das Formular in `src/app/invite/[token]/page.tsx:51-113` sendet kein Feld `passwordConfirm`, `src/app/auth/signup/route.ts:35,71` verlangt es aber. Dazu erlaubt das Formular `minLength={6}`, die Route verlangt 8 Zeichen (`:75`). Weil `AUTH_INVITE_ONLY=true` gilt, ist dieser Link der dokumentierte Weg für Neukunden. Der Umweg über `/anmelden?mode=register&invite=<token>` funktioniert, der Test dafür ist bestanden.
- **Beleg:** Test `auth.e2e.ts` „Registrierung mit Einladung … (Link /invite/<token> aus Admin-Einladung)“, beide Viewports.
- **Agent:** feature-reliability (Formular `invite/[token]/page.tsx`).

#### N-2 (P0) – Abo-Checkout scheitert bei jedem zweiten Versuch innerhalb von 24 h (Stripe-Idempotenz)
- **Schritte:** Konto ohne Abo → Abonnement → „Monatlich“ → „Plan wählen“ (Brauerei Start) → Stripe öffnet sich → zurück oder Tab schließen → erneut „Plan wählen“.
- **Erwartet:** Der zweite Versuch öffnet wieder Stripe Checkout.
- **Tatsächlich:** `POST /api/billing/checkout` antwortet mit HTTP 500. Unter der Preistabelle steht die englische Stripe-Meldung „Keys for idempotent requests can only be used with the same parameters they were first used with. Try using a key other than 'checkout:<uuid>' …“. Ursache: Der Checkout-Lock (`docs/checkout-lock-migration.sql`, 24 h) liefert dieselbe ID als Idempotency-Key (`checkout/route.ts:92,135`). Die Parameter ändern sich aber bei jedem Aufruf, weil `metadata.consumer_early_performance_consent_at: new Date().toISOString()` (`:124`) jedes Mal neu gesetzt wird. Wer den Checkout abbricht, kann 24 h lang kein Abo abschließen. Die Rohmeldung landet über `:137-139` beim Nutzer.
- **Beleg:** Test `billing.e2e.ts` „Checkout abbrechen und erneut starten …“ und im ersten Volllauf „Abo-Kauf (Checkout) …“ (Lock aus vorherigem Lauf). Trace unter `tests/e2e/.artifacts/results/billing.e2e.ts-Credits-Bil-*-erneut-starten*`.
- **Agent:** feature-reliability (Billing). Ob `buy-tokens` dasselbe Muster hat, wurde nicht geprüft; dort gibt es keinen Lock.

#### N-3 (P1) – Offline-Klick auf einen Navigationspunkt → komplett weiße Seite
- **Schritte:** Dashboard/Mediathek offen, Netz weg (`context.setOffline(true)`), Klick auf „Einstellungen“.
- **Erwartet:** Hinweis „Keine Verbindung“, die App bleibt sichtbar.
- **Tatsächlich:** Der fehlgeschlagene RSC-Abruf führt zu einer harten Navigation, der Browser landet auf `chrome-error://chromewebdata/`. Die Seite ist leer, 0 Zeichen sichtbar, die App ist weg, auf Desktop und Mobil. Der Fall hängt mit C-1 (kein Error-Boundary) und B-1 (jeder Tab braucht den Server) zusammen.
- **Beleg:** `errors.e2e.ts` „Offline: …“, Screenshot `…/errors.e2e.ts-Fehlerzustän-5eb17--Meldung-statt-weißer-Seite-desktop/test-failed-1.png`.
- **Agent:** navigation-specialist (zusammen mit B-1/C-1).

#### N-4 (P1) – Technische Rohmeldungen statt verständlicher deutscher Texte
| Stelle | Sichtbar für Nutzer | Code |
|---|---|---|
| Team einladen mit ungültiger E-Mail | Zod-JSON `[ { "origin": "string", "code": "invalid_format", … "message": "Invalid email address" } ]` | `src/app/api/dashboard/team/route.ts:61,96` (`.parse` + `error.message`) |
| Generierung mit unerwarteter Provider-Antwort (zu kleines Bild, Mock „tiny“) | Job-Ergebnis enthält immer „extract_area: bad extract area“ (sharp-Fehler). Im 1. Volllauf und in einem Einzellauf stand der Text sichtbar auf der Erstellen-Bühne. Im Endlauf zeigte die Bühne ihn nicht, der Test ist dort bestanden. Die Anzeige ist also intermittierend, über `/api/dashboard/jobs` erreicht der Text den Client aber immer. | `src/lib/inhalte-erstellen/run-studio-generation.ts:181-191` (Nicht-Provider-Fehler → `error.message`), Anzeige `ruixen-moon-chat.tsx:345` |
| Abo-Checkout-Fehler | englische Stripe-Meldung (N-2) | `src/app/api/billing/checkout/route.ts:137-139` |
| Einstellungen mit zu langem Namen | „Ungültige Einstellungen (profileName: Too big: expected string to have <=120 characters).“ | `src/app/api/dashboard/settings/route.ts:306` |
- Positiv: Provider-500 zeigt „OpenAI ist vorübergehend nicht erreichbar. Wir versuchen es automatisch erneut.“, Timeout zeigt „OpenAI hat zu lange gebraucht. Bitte versuch es noch einmal.“. In beiden Fällen werden keine Tokens abgezogen (Job `failed`, `charged 0`).
- **Agent:** feature-reliability.

#### N-5 (P2) – Zu langer Prompt wird stillschweigend auf 800 Zeichen gekürzt
- **Schritte:** 5005 Zeichen ins Prompt-Feld, „Generieren“.
- **Erwartet:** Zeichenzähler oder Hinweis auf die Grenze.
- **Tatsächlich:** Das Feld nimmt 5005 Zeichen an, gesendet werden 800 (`zusatzWunsch`), ohne jeden Hinweis (`ruixen-moon-chat.tsx:467` `.slice(0, 800)`, kein `maxLength` am Textfeld). Die Anfrage selbst ist gültig.
- **Agent:** ui-design-qa (Hinweis/Zähler), Logik nicht anfassen.

#### N-6 (P2) – Zwei API-Routen prüfen den Body vor der Anmeldung (400 statt 401)
- `POST /api/dashboard/media` (`route.ts:103-112`: Parsen vor `requireUserId`) und `POST /api/openai/image2/generate` (`route.ts:112-128` vor `:144`) antworten ohne Session mit **400** und Schema-Details statt 401. Daten werden dabei nicht offengelegt. Alle anderen 24 geprüften Routen antworten korrekt mit 401.
- **Agent:** feature-reliability.

#### N-7 (P2) – Barrierefreiheit (axe, WCAG 2 A/AA, serious/critical)
| Seite | Regel | Element |
|---|---|---|
| alle Dashboard-Seiten | `color-contrast` (serious) | Avatar-Fallback-Initialen in der Sidebar und Token-Ring `#tour-avatar` (Header) |
| `/dashboard/settings` | `label` (critical) | Datei-Input Profilbild ohne Label (`admin-settings-view.tsx:327`) |
| `/dashboard/team` | `button-name` (critical) | Rollen-Auswahl in der Mitgliedertabelle (`.pr-2`, Select-Trigger ohne Namen) |
| `/dashboard/team` mobil | `scrollable-region-focusable` | `div[data-slot=table-container]` per Tastatur nicht scrollbar |
| `/admin` | `color-contrast` | 18–26 Elemente in der Nutzertabelle |
- Login, Registrierung und Passwort-vergessen: keine Befunde. Console-Errors/-Warnings, Hydration-Fehler und 4xx/5xx-Requests beim normalen Laden aller 13 Seiten: **0**.
- **Agent:** ui-design-qa.

#### Beobachtungen (kein eigener Bug-Status)
- **Stripe Checkout zeigt „evglab sandbox“** als Händlername und das EvGlab-Branding (geteiltes Stripe-Konto). Im Live-Modus nicht geprüft. Kunden von BrewAI sehen dort vermutlich den fremden Namen. Gründer-Entscheidung.
- Klicks, die vor Abschluss der Hydration kommen, gehen verloren. Betroffen sind die Zustimmungs-Checkbox auf der Preisseite und Felder im Team-Formular. Beobachtet nur im Dev-Server, die Tests wiederholen deshalb den Klick. In Produktion nicht geprüft.
- Auf der Startseite steht „Motive diesen Monat 0 / 0 insgesamt erstellt“, obwohl 60 Motive in der Mediathek liegen. Die Zahl stammt aus den Generierungsjobs, die Motive wurden direkt geseedet. Kein Bug im echten Ablauf, aber die Kennzahl zählt nicht die Mediathek.
- Ein abgelaufenes Abo des Teaminhabers mit Restguthaben erlaubt laut `access.ts` weiter das Generieren (Lots laufen weiter). Das wurde nur protokolliert, die Geschäftsregel ist vom Gründer zu bestätigen.

## Schema-Lücken (Testdatenbank)

Eingespielt wurde ins leere Testprojekt über `tests/e2e/fixtures/db/apply-schema.ts`, idempotent über `e2e_meta.applied_files`. Die Reihenfolge stammt aus `goLiveBilling.test.ts` und `docs/go-live-fixes-rollout.md`: 13 Dateien aus `docs/` (billing-schema, stripe-webhook-events-schema, billing-atomic, billing-access-hardening, generation-jobs, billing-periods, generation-result-billing, go-live-security, workspaces, account-deletion, checkout-lock, webhook-recovery, request-rate-limits), danach die 7 Dateien aus `supabase/migrations/`. Alles lief fehlerfrei durch. Abgleich mit dem Code (`.from()`, `.rpc()`, `storage.from()`): alle 14 Tabellen und 15 RPCs vorhanden.

1. **Storage-Bucket `generated-images` ist nirgends versioniert.** Er wird in `storage.ts:6`, `privateAssets.ts:3` und weiteren Stellen genutzt und muss privat sein. Für die Testdatenbank rekonstruiert in `tests/e2e/fixtures/schema/001_generated_images_bucket.sql`, ohne Storage-Policies, weil der Zugriff nur per Service-Role läuft.
2. **Das Kernschema liegt in `docs/*.sql`, nicht in `supabase/migrations/`.** Die Reihenfolge steht nur in Markdown und in einem Unit-Test. `request-rate-limits-migration.sql` fehlt in beiden Reihenfolgelisten, `requestGuards.ts` braucht die Datei aber (`enforce_rate_limit_atomic`). Eine frische Umgebung lässt sich so nicht reproduzierbar aufsetzen.
3. Hinweis auf Drift: `src/lib/dashboard/character-store.ts:11` sagt „BrewAI-Prod hat dashboard_characters noch nicht“, obwohl die Migration `20260916172500_dashboard_characters_store.sql` existiert. Ob Produktion dem Repo entspricht, ist unbekannt (Produktion wurde nicht angefasst).

## Nicht testbar ohne Mock-Flag, Webhook oder Freigabe

- **Echte KI-Generierung:** Keine gemacht. Der Happy Path der drei Fotostile wurde mit dem serverseitigen Mock getestet (Job `completed`, Mediathek-Eintrag, Tokens abgebucht). Ob die echte Bildqualität und Prompt-Treue stimmen, ist damit nicht geprüft. Das bräuchte einen echten Lauf, nur mit OK des Nutzers.
- **Abo-Aktivierung nach Zahlung:** übersprungen, weil lokal kein Webhook ankommt. Der Token-Pack-Kauf (4242) wird dagegen über `/api/billing/confirm-session` gutgeschrieben und ist getestet. Abgelehnte Karte und 3DS sind bis zur Stripe-Seite getestet.
- **Mailzustellung** (2FA-Code, Passwort-Reset, Team-Einladung): Mailversand ist im Testserver aus. Getestet wurden die Fehlermeldungen, der Code-Schritt mit selbst erzeugtem Pending-Token und der Reset über einen per Service-Role erzeugten Recovery-Link. Die Annahme einer Team-Einladung ist ungetestet, weil die Einladung ohne Mailversand zurückgerollt wird.
- **Konto endgültig löschen:** destruktiv. Getestet wurde nur, dass sich der Dialog öffnen und abbrechen lässt.
- **Abbruch einer Generierung:** In der UI gibt es keine Abbrechen-Funktion.
- **Upload im Erstellen-Dialog:** Den gibt es nicht. Die Upload-Validierung ist am Profilbild getestet: `.txt` und 6 MB werden mit Meldung abgelehnt, PNG funktioniert.
- **Markenprofil per URL-Analyse:** Nur das Laden der Seite ist geprüft. Die Analyse braucht Anthropic und den Browser-Scraper, das ist nicht gemockt getestet.
- **Performance unter Produktionsbedingungen:** Nur der Dev-Server wurde gemessen. Für echte Zeiten bräuchte es einen `next build` mit eigenem `distDir`; dafür müsste `next.config.ts` angepasst werden.

## Aufbau der Suite

- `playwright.config.ts`: startet einen eigenen Dev-Server auf Port 3101 (`reuseExistingServer: false`). Die Prozess-Env überschreibt `.env.local` für Supabase (Test), Site-URLs (lokal), KI-Keys (ungültig), Mail (aus), Secrets (Testwerte) und Stripe (nur `sk_test_`). Testdateien heißen `*.e2e.ts`, damit vitest sie nicht einsammelt. Es läuft 1 Worker, weil Mock-Zustand und Rate-Limits global sind.
- `tests/e2e/fixtures/`: `env.ts` (prüft das Testprojekt, Abbruch sonst), `global-setup.ts` (Schema und Seed), `db/apply-schema.ts` (pg-Client on demand in `node_modules/.e2e-tools`, keine neue Dependency in package.json), `seed.ts` (Accounts A/B, Team-Inhaber mit abgelaufenem Abo plus Mitglied, 0 Credits, ohne Abo, Admin, Reset-User; Mediathek mit echten Bildern im Test-Storage), `accounts.ts` und `two-factor.ts` (Zugangsdaten und 2FA-Cookies nur in `tests/e2e/.state/`, gitignored), `server-preload.mjs` (Guard und KI-Mock), `test.ts` (Guard, Console-/Netzwerk-Sammler, axe), `app.ts` (Navigation, DB-Helfer), `report-table.ts` (erzeugt die Tabelle oben aus `results.json`).
- Voraussetzung: Es darf kein zweiter `next dev` im selben Repo laufen, weil Next 16 `.next/dev` sperrt.
- Wiederholung nach jeder Welle: `npx playwright test`, danach `npx tsx tests/e2e/fixtures/report-table.ts` für die Tabelle.
