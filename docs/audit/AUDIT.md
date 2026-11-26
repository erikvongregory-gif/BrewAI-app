# BrewAI Studio – Audit Dashboard-UX, Performance, Navigation, Zuverlässigkeit, Design

Stand: 26.11.2026, Branch `improve/dashboard-perf-ux` (HEAD `196c914`), Next.js 16.4.5 (Turbopack).
Nur Analyse, kein Code geändert. Vorgänger-Audit: `docs/audit/2026-11-09/` (Sicherheit/Kosten). Dort Erledigtes wird hier nicht wiederholt; noch offene Punkte von dort sind am Ende verlinkt.

## 1. Baseline-Messwerte (Ist-Zustand)

| Messung | Ergebnis |
|---|---|
| `npx tsc --noEmit` | **0 Fehler** (Exit 0) |
| `npm run lint` | **0 Fehler, 65 Warnungen** (39× `react-hooks/set-state-in-effect`, 18× `@typescript-eslint/no-unused-vars`, je 1× `exhaustive-deps`, `no-img-element`, `no-location-assign-relative-destination`) |
| `npm test` (vitest) | **1454 bestanden, 18 fehlgeschlagen** (212 Dateien, 3 rot, 16,3 s). Alle 18 Fehler liegen in der veralteten Kopie `.claude/worktrees/agent-a27229f92219fefc4/…`, nicht in `src/` → siehe C-4 |
| `npm run build` | **erfolgreich**, Kompilieren 33,9 s, TypeScript 10,3 s, 96 Seiten. `ƒ Proxy (Middleware)` erkannt (Root-`middleware.ts` greift). Env: `.env.local` vorhanden |

Next 16 druckt keine Größenspalten mehr. Die First-Load-Werte stammen aus `.next/diagnostics/route-bundle-stats.json` (unkomprimiert, offiziell), gzip selbst gemessen:

| Route | First Load JS roh | gzip |
|---|---:|---:|
| `/marketing-preview/[screen]` | 1973 KB | 601 KB |
| **`/dashboard/[[...section]]`** | **1625 KB** | **495 KB** |
| `/inhalte-erstellen` | 1099 KB | 337 KB |
| `/videos-erstellen` | 972 KB | 299 KB |
| `/admin` | 935 KB | 288 KB |
| `/onboarding` | 806 KB | 247 KB |
| `/anmelden` | 670 KB | 209 KB |
| `/` , `/registrieren`, `/_not-found` (Minimum) | 448–481 KB | 133–145 KB |

Weitere Messwerte:
- Globales CSS-Chunk `1invrvo0pgo8d.css`: **624 KB roh / ~100 KB gzip**, auf jeder Route (auch Login).
- Vorgeladene Schriftdateien laut `.next/server/next-font-manifest.json`: **26 Dateien / 928 KB** auf jeder Dashboard-Route, 36 Dateien / 1207 KB auf Login/Passwort/Einladung.
- Größtes JS-Chunk im Dashboard: `0ap3hiwn9twov.js`, 454 KB roh = Node-`crypto`-Polyfill (crypto-browserify, asn1, cipher) → A-2.

## 2. Routen-Karte

Root: `src/app/layout.tsx` (Schriften, Theme-Boot, CSP-Nonce). Proxy: `middleware.ts` im Repo-Root (Next 16: veraltet, siehe Vorgänger-Audit O7). **Im ganzen Projekt gibt es kein `error.tsx`, kein `global-error.tsx` und kein `not-found.tsx`.**

| Segment | layout | page | loading | error | Bemerkung |
|---|---|---|---|---|---|
| `/` | – | ja | – | – | |
| `(dashboard)` | **ja** (Auth, 2FA, Onboarding-Gate, Shell) | – | ja, **gibt `null` zurück** | **nein** | Shell `BrewAiAdminShell` |
| `(dashboard)/dashboard/[[...section]]` | – | ja (`force-dynamic`) | erbt `null` | nein | Tabs: media, team, brand, settings, pricing, assistant – alles in einer Client-Komponente |
| `(dashboard)/inhalte-erstellen` | – | ja (`force-dynamic`) | erbt `null` | nein | Abo-Gate + Moon-Chat |
| `(dashboard)/videos-erstellen` | – | ja | erbt `null` | nein | Flag-gesteuert |
| `(dashboard)/admin`, `/admin/receipt-preview` | – | ja | erbt `null` | nein | Plattform-Admin |
| `/admin/anmelden`, `/anmelden`, `/registrieren`, `/passwort-*`, `/onboarding`, `/auth/finish`, `/dashboard/2fa-email`, `/invite/[token]`, `/invite/team/[token]` | – | ja | – | – | |
| `/marketing-preview/[screen]` | ja | ja | – | – | Screenshots, nicht im Scope |

API-Routen (49) grob gruppiert:
- **Dashboard-Daten** `api/dashboard/*`: summary, media, jobs, settings, team, team/accept, my-beers, my-characters, onboarding, avatar, brand-font
- **Generierung**: `api/inhalte-erstellen/{create-task, social-post, social-post/relayout, suggest-copy}`, `api/generation/{submit,status,upload}`, `api/generate-{hyperrealistic,studio,campaign,isolate}`, `api/kie/*`, `api/openai/image2/generate`, `api/claude/*`
- **Billing/Stripe**: `api/billing/{state,sync,checkout,buy-tokens,confirm-session,portal,onboarding-bonus}`, `api/stripe/webhook` (Signatur + Event-Claim, geprüft im Vorgänger-Audit)
- **Marke**: `api/brand/*` (analyze-url, instagram/*, reference-image, profile-status, activate-profile)
- **Konto/Admin/Auth**: `api/account/*`, `api/admin/*`, `api/auth/*`, `auth/*` (Route Handler), `api/internal/reconcile`, `api/waitlist`
- Server Actions: nur `src/server/server-actions.ts` (Cookie-Präferenzen).

Supabase je Dashboard-Aufruf (harter Load `/dashboard`): Proxy `getUser` → Layout `getUser` + `getWorkspace` (bis 5 Queries) + `getUserById` → Page `getUser` + `getWorkspace` → Client: 4 API-Routen je `getUser` + `getWorkspace`, dazu `/api/billing/state`. Details A-5.

## 3. Befunde

Kategorien: **A** Performance · **B** Navigation/Switching · **C** Funktion/Zuverlässigkeit · **D** Design/UI. Aufwand S/M/L.

### P0

| ID | Kat. | Datei:Zeile | Befund | Auswirkung für Nutzer | Aufwand | Agent · Dateien |
|---|---|---|---|---|---|---|
| B-1 | B | `src/components/ui/dashboard-redesign.tsx:245-251`, `:342-457`; `src/app/(dashboard)/dashboard/[[...section]]/page.tsx:11,74-90`; Next: `node_modules/next/dist/client/components/layout-router.js:395-523` (Kind-Key = Segment-Key inkl. Param, `create-router-cache-key.js`) | Jeder Tab-Wechsel ruft `router.push` auf eine `force-dynamic`-Route mit anderem Catch-all-Parameter. Folge: (1) Server-Roundtrip mit `getUser` + `getWorkspace`, (2) neuer Segment-Key → `DashboardRedesignShell` wird **neu gemountet** und lädt media, summary, team und settings komplett neu, (3) die Tab-Animation läuft zweimal (lokal per `setTab`, dann nach dem Remount). Kein `cacheComponents`, also auch kein Activity-Erhalt | Tabwechsel fühlt sich träge an, Inhalte springen zurück in den Ladezustand, Mediathek-Scroll und Formularzustände gehen verloren, 5 Requests pro Klick | M | **navigation-specialist**: `dashboard-redesign.tsx`, `dashboard/[[...section]]/page.tsx`, ggf. Daten-Provider in `(dashboard)/layout.tsx`. Datencache mit **performance-engineer** abstimmen |
| B-2 | B | `src/app/(dashboard)/loading.tsx:2-4`; `prefetch={false}` in `src/components/dashboard-shell/sidebar/nav-main.tsx:128,283,416,477`, `src/components/ui/futuristic-nav.tsx:111`, `src/components/dashboard-shell/brewai-admin-shell.tsx:93`, `src/components/dashboard-shell/header/assets-folder-button.tsx:27`, `src/components/dashboard/admin-home-view.tsx:228,592` | Alle Dashboard-Routen sind dynamisch, `loading.tsx` rendert nichts, und jeder Navigationslink hat Prefetch abgeschaltet. Laut `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:84-87,186-190` wird dann gar nichts vorab geladen, und es gibt keinen sofortigen Ladezustand. Die aktive Markierung (`NavActivePill`) wandert erst, wenn `usePathname` nach der Serverantwort wechselt | Klick auf „Neu erstellen“ oder einen Nav-Punkt: nichts passiert für die Dauer von Auth + Workspace + Billing (+ ggf. Stripe-Sync, A-6). Nutzer klicken doppelt | S–M | **navigation-specialist**: `(dashboard)/loading.tsx` (+ je Route eigene Skeletons), `nav-main.tsx`, `futuristic-nav.tsx`, `brewai-admin-shell.tsx`, `assets-folder-button.tsx`; `useLinkStatus` (`docs/01-app/03-api-reference/04-functions/use-link-status.md`) für Pending-Zustand. `admin-home-view.tsx:228,592` mit ui-design-qa abstimmen |
| C-1 | C | kein `error.tsx`/`global-error.tsx` im Projekt; Würfe in `src/lib/dashboard/workspace.ts:26,39,42,50,52,55`, ungefangen aufgerufen in `src/app/(dashboard)/layout.tsx:47` (über `src/lib/dashboard/freshMetadata.ts:15`), `dashboard/[[...section]]/page.tsx:90`, `inhalte-erstellen/page.tsx:49`, `videos-erstellen/page.tsx:51` | `getWorkspace` wirft bei: Teamabo des Inhabers nicht aktiv, Teamplatz über Tarifgrenze, Konto zur Löschung vorgemerkt **und bei jedem DB-Fehler der Löschstatus-Abfrage** (`:26`). Layout und Pages fangen das nicht, ein Error-Boundary gibt es nirgends | Teammitglied, dessen Inhaber-Abo ausläuft, oder jeder Nutzer bei einem kurzen Supabase-Fehler bekommt statt Dashboard die Standard-Fehlerseite von Next, ohne Erklärung und ohne Ausweg | S | **navigation-specialist**: `error.tsx` für `(dashboard)` und Unterrouten, `src/app/global-error.tsx`, `not-found.tsx`. **feature-reliability**: verständliche Behandlung der Workspace-Fehler (eigene Seite „Teamzugang pausiert“) in `workspace.ts` / Gate-Aufrufern |
| A-1 | A | `src/lib/fonts/registry.ts:1-20,93-95` (18 Google-Fonts + Geist Pixel), `src/app/layout.tsx:71` (`className={fontVars}`), `src/styles/admin-theme.css:155-206`; Beleg `.next/server/next-font-manifest.json` | Alle Template-Schriften werden registriert und standardmäßig vorgeladen: **26 Dateien / 928 KB pro Dashboard-Seite**, 1207 KB auf Login. Eine Schriftauswahl in der UI gibt es nicht (`fontOptions` wird nirgends importiert), genutzt wird nur `data-font="geist"` (`src/lib/preferences/preferences-config.ts:72`) | Langsamer erster Seitenaufbau, besonders mobil; Bandbreite verschwendet bei jedem harten Laden | S | **performance-engineer**: `registry.ts`, `font-meta.ts`, `admin-theme.css:155-206`. `src/app/layout.tsx` gehört dem navigation-specialist (Konflikt, s. u.). Schriftwahl vorher mit D-1 klären |

### P1

| ID | Kat. | Datei:Zeile | Befund | Auswirkung für Nutzer | Aufwand | Agent · Dateien |
|---|---|---|---|---|---|---|
| A-2 | A | `src/lib/billing/checkoutClient.ts:2` → `src/lib/billing/tokenState.ts:1` (`import crypto from "crypto"`); Client-Import in `dashboard-redesign.tsx:27-29` | Ein Wert-Import (`isSubscriptionPlanKey`) aus `tokenState.ts` zieht Node-`crypto` in den Client. Turbopack bündelt dafür crypto-browserify: Chunk `0ap3hiwn9twov.js` **454 KB roh**, nur in `/dashboard` (und marketing-preview). Hauptgrund, warum `/dashboard` 1625 KB statt ~1100 KB hat | Mehr JS-Parse-Zeit bei jedem harten Laden des Dashboards | S | **performance-engineer**: Plan-Konstanten in crypto-freies Modul auslagern (`tokenState.ts`, `checkoutClient.ts`, `planCatalog.ts`) |
| A-3 | A | `src/app/globals.css:1-15` (importiert alle Studio-CSS), `src/styles/admin-theme.css:2-4` (3 Theme-Presets), Template-Reste z. B. `.insurance-card`, `--font-austera`, `--font-playfair` (`globals.css:153,165,199`) | 16.700 Zeilen CSS landen als ein globales Chunk (624 KB roh, ~100 KB gzip) auf jeder Route, auch Login und Passwort-Reset | Render-blockierendes CSS verlängert First Paint | M | **ui-design-qa** (Styles gehören ihm) mit **performance-engineer**: `globals.css`, `admin-theme.css`, `src/styles/*.css`, ungenutzte Presets |
| A-4 | A | `src/lib/dashboard/media-store.ts:5-19,39-53`; Schema `docs/go-live-security-migration.sql:3-8` | „Seitenweise“ Mediathek liest **alle** Zeilen inkl. JSON-Prompt des Nutzers, sortiert in JS nach `item.createdAt` und schneidet dann 48 heraus. Jedes „Mehr laden“ liest wieder alles. Tabelle hat keine `created_at`-Spalte und keinen passenden Index | Mediathek und Dashboard-Start werden mit wachsender Bibliothek linear langsamer | M | **performance-engineer**: `media-store.ts`, SQL-Vorschlag (Spalte/Index auf `created_at`) in `docs/audit/migrations-proposed.sql`. Cursor-Pagination zusammen mit C-5 |
| A-5 | A | `src/lib/supabase/middleware.ts:116`, `src/app/(dashboard)/layout.tsx:34-47`, `src/lib/dashboard/freshMetadata.ts:15-19`, `dashboard/[[...section]]/page.tsx:74-90`, `src/lib/dashboard/workspace.ts:31-56` | Pro Seitenaufruf mehrfach dieselbe Arbeit: `getUser` in Proxy, Layout und Page (je ein Auth-Netzwerkaufruf), `getWorkspace` in Layout und Page (bis 5 sequenzielle Queries: Löschstatus, Mitgliedschaft, Löschstatus Inhaber, Billing, Mitgliederliste), dazu `getUserById`. Kein `React.cache()`, keine Parallelisierung | Jede Navigation und jeder harte Load wartet auf eine Kette von 6–10 Roundtrips | M | **performance-engineer**: `workspace.ts`, `freshMetadata.ts` (`cache()`, `Promise.all`). Aufrufe in `layout.tsx`/`page.tsx` mit navigation-specialist abstimmen |
| A-6 | A | `src/app/(dashboard)/inhalte-erstellen/page.tsx:49,58-80`, `src/app/(dashboard)/videos-erstellen/page.tsx:51,65-87`, `workspace.ts:69`; ebenso `src/app/api/dashboard/my-beers/route.ts:151`, `my-characters/route.ts:66`, `onboarding/route.ts:69` | `workspaceResourceUser(user)` ohne `hydrate:false` signiert bei jedem Besuch alle privaten Asset-URLs in `user_metadata` (ein Storage-Aufruf je Asset, `src/lib/supabase/privateAssets.ts:18`), obwohl die Page nur den Onboarding-Status liest. Danach `ensureBillingRow` + `getBillingRow` und, ohne aktives Guthaben, ein **synchroner Stripe-Sync** vor dem Redirect | „Bilder erstellen“ öffnet spürbar langsam; Nutzer ohne Guthaben warten auf Stripe, bevor sie zur Preisseite kommen | S | **performance-engineer**: `hydrate:false` in Pages und GET-Routen, Billing-Gate leichter machen. Pages: navigation-specialist informieren |
| C-2 | C | Routen `src/app/api/generate-{hyperrealistic,studio,campaign,isolate}/route.ts` haben keinen Aufrufer in `src/` (Grep); die Live-Erstellseite `src/components/ui/ruixen-moon-chat.tsx:172,359` sendet nur an `/api/inhalte-erstellen/create-task` mit `photoStyle` reportage/premium/campaign; `inhalte-erstellen-studio.tsx` (social-post) läuft nur im Marketing-Preview (Vorgänger-Audit 02, Nr. 22) | Die vier Kernmodi aus dem Briefing (Ultra Realistic, Studio Produktbild, Kampagne + Text, Freistellen) sind im Produkt **nicht als Modi erreichbar**. Die vier Endpunkte sind trotzdem live und abrechenbar | Kunde findet „Freistellen“ und „Kampagne + Text“ nicht. Ungenutzte, abrechenbare API-Fläche muss trotzdem gewartet und abgesichert werden | M (Entscheidung) | **feature-reliability**: Gründer-Entscheidung einholen. Entweder Modi in die UI (dann mit ui-design-qa/navigation) oder die vier Routen stilllegen |
| C-3 | C | `src/app/api/dashboard/team/route.ts:20` (Rate-Limit 30/min pro Nutzer) + B-1 (`dashboard-redesign.tsx:412-431` lädt Team bei jedem Mount, auch auf „Übersicht“) | Durch den Remount bei jedem Tabwechsel wird `/api/dashboard/team` mitgeladen; jeder Aufruf schreibt außerdem in den persistenten Rate-Limiter (DB) | Nach ~30 Tabwechseln pro Minute: „Teamdaten konnten nicht geladen werden“, Team-Tab leer | S (mit B-1) | **feature-reliability**: `team/route.ts`; Hauptfix über B-1 (navigation-specialist): Team nur im Team-Tab laden |
| C-4 | C | `vitest.config.ts:20-31` (kein Ausschluss für `.claude/**`) | Vitest sammelt Tests aus der veralteten Worktree-Kopie `.claude/worktrees/agent-a27229f92219fefc4/` ein: 18 Fehler, `npm test` endet rot, obwohl `src/` grün ist | Kein direkter Nutzereffekt, aber jede QA-Runde („jeder neue Fehler ist Blocker“) scheitert falsch, echte Regressionen gehen im Rauschen unter | S | **feature-reliability**: `vitest.config.ts` (`"**/.claude/**"` in `exclude`). Worktree aufräumen ist Sache des Gründers |
| B-3 | B | `src/components/ui/ruixen-moon-chat.tsx:153-176` (nur lokaler `useState`) | Prompt, gewählte Sorte, Charakter, Preset, Format und Qualität leben nur im Komponenten-State. Wechsel nach Mediathek/Dashboard und zurück mountet neu | Halb geschriebener Prompt und Auswahl sind nach einem kurzen Blick in die Mediathek weg | M | **navigation-specialist**: Zustand in Search-Params bzw. schlanken Store (z. B. sessionStorage-Entwurf) in `ruixen-moon-chat.tsx`. Generierungslogik nicht anfassen (feature-reliability) |
| D-1 | D | Code widerspricht dem verbindlichen „Sudbuch“: `src/styles/studio-tokens.css:1-3` (Inter Tight, Newsreader), `:46` (`--ac: #C7691E` statt #C98A4B), Radien `--r-sm 6px … --r-lg 10px`; `src/styles/admin-theme.css:58` (`--radius: 0.625rem`); `src/lib/preferences/preferences-config.ts:58` (Standard „light“), `:72` (Schrift „geist“); `src/lib/fonts/studio-fonts.ts:1` (nur IBM Plex **Mono**, kein Plex Sans); `src/app/layout.tsx:56`, `src/app/(dashboard)/layout.tsx:24` (`themeColor #ffffff`); `#C98A4B` und „IBM Plex Sans“ kommen in `src/` nirgends vor | Das in `.claude/agents/ui-design-qa.md` verbindliche Design-System existiert im Code nicht. Ist-Zustand: helles Theme, Geist/Inter Tight, Orange #C7691E, Radien 6–10 px | Ohne Klärung baut ui-design-qa das ganze Produkt um oder gegen die Vorgabe. Mobile Statusleiste bleibt im Dunkelmodus weiß | L | **ui-design-qa** nach **Gründer-Entscheidung**: Tokens in `studio-tokens.css`, `admin-theme.css`, `preferences-config.ts`, Fonts; `themeColor` in den Layout-Dateien über navigation-specialist |
| D-2 | D | 54× hartcodiertes `#C7691E`/`#c7691e`, 7× abweichendes `#c65a20` (z. B. `dashboard/[[...section]]/page.tsx:67`, `inhalte-erstellen/page.tsx:33`), Beispiele `ruixen-moon-chat.tsx:564-565`, `nav-main.tsx:327-330` (#EF4444, #3B82F6, #EAB308, #22C55E); 473× `rounded-*` in 95 TSX-Dateien, 288× `border-radius` in CSS; Shell nutzt shadcn-Tokens (`nav-main.tsx:206` `rounded-md bg-sidebar-accent`), Studio-Flächen `.evg-studio`-Tokens | Zwei Token-Systeme parallel plus Hex-Werte in Komponenten. Zwei verschiedene Orangetöne | Uneinheitliche Akzentfarbe und Ecken zwischen Shell, Erstellen-Seite und Mediathek | L | **ui-design-qa**: Tokens zentralisieren, Hex/`rounded-*` ersetzen. Betrifft viele Dateien, siehe Konfliktliste |

### P2

| ID | Kat. | Datei:Zeile | Befund | Auswirkung für Nutzer | Aufwand | Agent · Dateien |
|---|---|---|---|---|---|---|
| A-7 | A | `src/components/dashboard/admin-home-view.tsx:629-631` | Tabelle „Letzte Motive“ lädt für 32-px-Vorschauen das Original (`item.imageUrl`, bis 4K-PNG); `studio-media-library.tsx:404` nutzt korrekt `thumbUrl` | Bis zu 10 Originalbilder beim Öffnen der Übersicht | S | **performance-engineer**: `admin-home-view.tsx` (eine Zeile, mit ui-design-qa abstimmen) |
| A-8 | A | `src/components/ui/ruixen-moon-chat.tsx:415-433` | Vor jeder Generierung wird `/api/dashboard/my-beers` neu geladen (Auth + Workspace + Asset-Signing) | Klick auf „Erstellen“ startet spürbar verzögert | S | **performance-engineer** mit **feature-reliability** (Payload-Aufbau): frische Sorte serverseitig in `create-task` auflösen |
| A-9 | A | `src/components/dashboard-shell/billing-credits-provider.tsx:47-53`, `src/lib/billing/clientBootstrap.ts:148`, `dashboard-redesign.tsx:384-410` | Billing-Stand wird pro Dashboard-Load doppelt geholt (`/api/billing/state` mit `force` und `/api/dashboard/summary`) | Ein überflüssiger Roundtrip pro Load | S | **performance-engineer**: `clientBootstrap.ts`, `creditsCache.ts` |
| A-10 | A | `src/app/api/dashboard/team/route.ts:34-35` | N+1: `auth.admin.getUserById` je Teammitglied | Team-Tab wird mit jeder Person langsamer | S | **performance-engineer**: `team/route.ts` |
| B-4 | B | `src/components/dashboard-shell/brewai-admin-shell.tsx:162-165,172-187` | Padding/Full-Bleed werden erst im `useEffect` nach dem Paint zurückgesetzt; zusätzlich 320-ms-Einblendung mit Blur bei jedem Bereichswechsel | Sichtbarer Layout-Sprung und gefühlt langsamere Wechsel | S | **navigation-specialist**: `brewai-admin-shell.tsx` |
| B-5 | B | `dashboard/[[...section]]/page.tsx:122-123` | Unbekannte Abschnitte (`/dashboard/foo`) zeigen still die Übersicht statt 404 | Kaputte Links fallen nicht auf | S | **navigation-specialist** |
| B-6 | B | `src/components/dashboard-shell/brewai-admin-shell.tsx:310-315` | Suspense-Fallback der Shell hat `min-h-[100dvh]` und steht im Inhaltsbereich unter der Kopfzeile | Kurzzeitig überhoher Platzhalter, Seite springt | S | **navigation-specialist** (Skeleton im Zuge von B-2) |
| C-5 | C | `dashboard-redesign.tsx:653-680`, `media-store.ts:43-46` | „Mehr laden“ arbeitet mit Offset auf einer sich ändernden Liste: Nach Löschen eines Motivs wird beim Nachladen ein Eintrag übersprungen (neue Einträge werden nur per Dedupe kaschiert) | Einzelne Motive fehlen beim Durchscrollen, bis neu geladen wird | S (mit A-4) | **feature-reliability** + **performance-engineer**: Cursor nach `createdAt,id` |
| C-6 | C | `dashboard-redesign.tsx:309-312,611-622` | `refreshSummary` aktualisiert nur `summary`, nicht den Credits-Cache; `displaySummary` überschreibt Tokens mit dem älteren Provider-Stand | Nach Teamänderung kann die Token-Anzeige kurz veraltet sein | S | **feature-reliability** |
| C-7 | C | 39× `react-hooks/set-state-in-effect`, z. B. `dashboard-redesign.tsx:337`, `brewai-admin-shell.tsx:163,190-198` | setState synchron im Effect → zusätzliche Render-Durchläufe beim Wechsel | Mehr Flackern/Arbeit beim Navigieren | M | **navigation-specialist** (Shell/Dashboard), Rest ui-design-qa |
| D-3 | D | `src/components/ui/ruixen-moon-chat.tsx:501,522,546` | Erstellen-Seite nutzt `bg-white dark:bg-black`, `text-neutral-600`, `rounded-2xl` statt Tokens | Erstellen-Seite weicht farblich von Shell und Mediathek ab | S | **ui-design-qa** |
| D-4 | D | `brewai-admin-shell.tsx:178-186`, `ruixen-moon-chat.tsx:517-521` (`MagneticText`), `:542-543` (Glow/Ring), `nav-main.tsx:300-323` (Icon-Rotationen) | Dekorative Animationen entgegen der eigenen Regel „Keine dekorativen Animationen“ (`docs/audit/2026-11-09/02-ui-ux.md`, Designsystem-Regeln) | Unruhige Oberfläche, gefühlt langsamer | S | **ui-design-qa** (Shell-Teil mit navigation-specialist) |
| D-5 | D | `dashboard-redesign.tsx:3,7,37,130-224,233` | Tote Hilfskomponenten (`Placeholder`, `Sparkline`, `SidebarIcon`) und ungenutzte Props/Imports (Lint-Warnungen) | Kein Nutzereffekt, erschwert Pflege | S | **ui-design-qa** |

## 4. Noch offen aus dem Audit vom 09.11.2026 (nicht doppelt bewertet)

- O7 `middleware.ts` → `proxy.ts` (veraltete Konvention, funktioniert laut Build weiter): `docs/audit/2026-11-09/01-security.md:158`.
- UI/UX offen (02-ui-ux.md, Abschnitt e): Markenprofil-Auswahldialog ohne Fokusfalle (`dashboard-redesign.tsx:812-914`), mobile Bottom-Navigation nur mit Icons, Teamtabelle mobil, Kennzahlkarten mobil, Farbschema Produkt ≠ Marketing (hängt an D-1), `RuixenMoonChat` mit Login visuell prüfen.
- Toter Code `src/components/dashboard-stubs/**`, `inhalte-erstellen-redesign.tsx` (02-ui-ux.md Nr. 22).

## 5. Datei-Zuständigkeit und Konfliktkandidaten

Dateien, die mehrere Agenten anfassen müssten. Reihenfolge festlegen oder ein Agent übernimmt und der andere liefert Vorgaben:

| Datei | Agenten (Befunde) |
|---|---|
| `src/components/ui/dashboard-redesign.tsx` | navigation (B-1, C-7), performance (A-2-Import, A-9), feature-reliability (C-3, C-5, C-6), ui-design-qa (D-5) |
| `src/app/(dashboard)/dashboard/[[...section]]/page.tsx` | navigation (B-1, B-5), performance (A-5), feature-reliability (C-1), ui-design-qa (D-2) |
| `src/app/(dashboard)/inhalte-erstellen/page.tsx`, `videos-erstellen/page.tsx` | performance (A-6), feature-reliability (C-1), navigation (B-2 Loading), ui-design-qa (D-2) |
| `src/app/(dashboard)/layout.tsx` | navigation (C-1 Boundary, Shell), performance (A-5), ui-design-qa (D-1 `themeColor`) |
| `src/app/layout.tsx` | performance (A-1 Fonts), ui-design-qa (D-1 Schrift/`themeColor`), navigation (Eigentümer der Layouts) |
| `src/components/dashboard-shell/brewai-admin-shell.tsx` | navigation (B-2, B-4, B-6, C-7), ui-design-qa (D-4) |
| `src/components/dashboard-shell/sidebar/nav-main.tsx` | navigation (B-2 Prefetch/Pending), ui-design-qa (D-2, D-4) |
| `src/components/ui/ruixen-moon-chat.tsx` | navigation (B-3), performance (A-8), feature-reliability (C-2), ui-design-qa (D-2, D-3, D-4) |
| `src/components/dashboard/admin-home-view.tsx` | performance (A-7), navigation (B-2 Links), ui-design-qa |
| `src/lib/dashboard/workspace.ts` | performance (A-5, A-6), feature-reliability (C-1) |
| `src/lib/dashboard/media-store.ts` | performance (A-4), feature-reliability (C-5) |
| `src/app/api/dashboard/team/route.ts` | performance (A-10), feature-reliability (C-3) |
| `src/app/globals.css`, `src/styles/admin-theme.css` | ui-design-qa (D-1, D-2, A-3), performance (A-1 Font-CSS, A-3) |

Empfohlene Reihenfolge: (1) Gründer entscheidet D-1 (Sudbuch vs. Ist-Tokens) und C-2 (Modi). (2) C-4 und A-2 (je S, keine Konflikte). (3) navigation-specialist B-1/B-2/C-1 zuerst in den Layout-/Dashboard-Dateien, danach performance-engineer A-5/A-6 in denselben Pages. (4) ui-design-qa zuletzt über die gemeinsamen Komponenten.

## 6. Nicht geprüft

- Kein Browser-Test mit echtem Login: Ladezeiten pro Navigation sind aus dem Code abgeleitet, nicht gemessen. B-1 (Remount) folgt aus dem Router-Code von Next 16.4.5 und sollte vom qa-verifier im Browser bestätigt werden (React-Devtools bzw. Netzwerk-Tab beim Tabwechsel).
- Keine DB-Indizes außer `dashboard_media` gesichtet; RLS/Stripe-Logik siehe Vorgänger-Audit.
- Marketing-Seite und `/marketing-preview` nicht im Scope.
