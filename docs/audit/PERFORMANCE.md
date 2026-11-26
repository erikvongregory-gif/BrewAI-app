# Performance – Messungen vorher/nachher

Branch `improve/dashboard-perf-ux`. „Vorher“ = Baseline aus `docs/audit/AUDIT.md` Abschnitt 1 (Build von `196c914`, Next 16.4.5, Turbopack). „Erwartet“ ist aus diesem Build abgeleitet, nicht gemessen (im Worktree kein `next build` erlaubt). „Nachher“ trägt der Orchestrator nach dem zentralen Build ein.

Messquellen: First Load JS aus `.next/diagnostics/route-bundle-stats.json` (roh), gzip selbst gemessen; Schriften aus `.next/server/next-font-manifest.json`, Dateigrößen aus `.next/static/media`.

## Welle 1

### A-1 Schriften (`src/lib/fonts/registry.ts`)

Root-Layout lud 18 Template-Schriften + 5 Geist-Pixel-Varianten, alle mit Preload. Referenziert werden nur `--font-geist` (Shell, `data-font="geist"`), `--font-inter` (`body` über `--font-main`, Portale, `claude-create.css`) und `--font-serif`/Playfair (nur `font-display` in der Fallback-Ansicht „Supabase nicht konfiguriert“). Jetzt: Geist + Inter mit Preload, Playfair ohne Preload, Rest entfernt.

| Route | Vorher (Preload) | Erwartet (Preload) | Nachher |
|---|---:|---:|---:|
| `/dashboard`, `/admin`, `/`, `/registrieren` | 26 Dateien / 928 KB | 3 Dateien / 159 KB (Inter 2 × = 131 KB, Geist 29 KB) | |
| `/anmelden`, `/admin/anmelden` (+ Studio-Schriften) | 36 Dateien / 1207 KB | 13 Dateien / ~438 KB (Studio-Schriften 279 KB unverändert) | |

Ersparnis: −23 Dateien / ca. −769 KB Schriften pro hartem Laden auf jeder Route.

### A-2 Node-`crypto` im Client (`src/lib/billing/tokenState.ts`)

`tokenState.ts` wird von Client-Code importiert (`checkoutClient.ts` → `dashboard-redesign.tsx`, `admin-pricing-view.tsx`; `planCatalog.ts`) und enthielt einen ungenutzten signierten Cookie-Helfer mit `import crypto from "crypto"`. Helfer entfernt (kein Aufrufer im Repo), Modul enthält nur noch Plan-Konstanten. Statische Prüfung: kein `"use client"`-Modul erreicht mehr `crypto`/`node:crypto`.

| Route | Vorher roh / gzip | Erwartet roh / gzip | Nachher |
|---|---:|---:|---:|
| `/dashboard/[[...section]]` | 1625 KB / 495 KB | ~1181 KB / ~362 KB | **1213 KB / 375 KB** (−412 / −120 KB) |
| `/inhalte-erstellen` | 1099 KB / 337 KB | unverändert | **1127 KB / 348 KB** (+28 / +11 KB, vermutlich Error-Boundaries/Skeleton/Entwurf-State aus Welle 1 – in Welle 2 prüfen) |
| `/anmelden` | – | – | 696 KB / 219 KB |

Nachher gemessen am Build von `6827279` (Welle 1 gemergt), gzip selbst aus den First-Load-Chunks berechnet. Globales CSS weiterhin 610 KB roh (A-3, Welle 3). Schrift-Preload pro Route nicht gemessen (Dev-E2E lädt anders als Produktion); Build enthält jetzt 48 woff2-Dateien insgesamt.
| `/marketing-preview/[screen]` | 1973 KB / 601 KB | ~1529 KB / ~468 KB | |

Chunk `0ap3hiwn9twov.js` (crypto-browserify): 444 KB roh / 133 KB gzip, sollte im neuen Build fehlen.

### A-4 Mediathek (`src/lib/dashboard/media-store.ts`)

Vorher pro Seite (auch „Weitere Motive laden“): alle Zeilen des Nutzers in 1000er-Blöcken laden, in JS sortieren, 48 herausschneiden. Jetzt: `order=item->>createdAt.desc.nullslast,id.asc&offset=…&limit=…` mit `count=exact`, also eine Abfrage, die nur die Seite überträgt.

| Bibliothek | Vorher übertragene Zeilen pro Seite | Erwartet |
|---|---:|---:|
| 200 Motive | 200 (inkl. Prompt-JSON) | 48 |
| 2.000 Motive | 2.000 in 2 Roundtrips | 48 in 1 Roundtrip |

Ohne Index sortiert Postgres weiterhin alle Zeilen des Nutzers (aber in der DB, ohne Transfer). Mit dem optionalen Index aus `docs/audit/migrations-proposed.sql` wird die Seite per Index-Scan gelesen. Nachher-Messung: `explain analyze` vor/nach Index, Antwortzeit `GET /api/dashboard/media?limit=48`.

## Welle 2

„Erwartet“ ist aus dem Welle-1-Build (`.next` am Stand `6827279`) und dem Code abgeleitet, nicht gemessen (kein `next build` im Worktree). „Nachher“ trägt der Orchestrator ein.

### A-5 Doppelte Auth- und Workspace-Abfragen pro Seitenaufruf

React `cache()` (siehe `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`, Abschnitt „Deduplicating requests“) dedupliziert innerhalb **eines** Server-Renders, also für Layout und Page desselben Requests. Es gibt keinen Cache über Requests oder Nutzer hinweg. In Route Handlern wirkt `cache()` nicht (der React-Server-Build ohne Dispatcher ruft die Funktion direkt auf), dort läuft jede Prüfung wie bisher.

| Funktion | Datei | Pro Request gecacht |
|---|---|---|
| `getWorkspace(userId)` | `src/lib/dashboard/workspace.ts` | ja, einschließlich geworfener `WorkspaceAccessError` (gleicher Request, gleiche Antwort) |
| `getAuthUserById(userId)` | neu: `src/lib/supabase/adminUsers.ts` | ja; genutzt von `workspaceResourceUser`, `freshMetadata.ts` und `isPortalOperatorUserId` |
| `getServerUser()` | `src/lib/supabase/server.ts` | ja; genutzt von den Pages `/dashboard`, `/inhalte-erstellen` und `/videos-erstellen` |

Roundtrips im Render (ohne Proxy) bei einem harten Load von `/inhalte-erstellen`:

| Nutzer | Vorher | Erwartet |
|---|---|---|
| Inhaber ohne Team | getUser 2 · Workspace 2 × 2 Queries · getUserById 1 · Asset-Signierung N · Billing 2 = **9 + N** | getUser 2 · Workspace 2 · getUserById 1 · Billing 2 = **7** |
| Teammitglied (Inhaber mit Abo) | getUser 2 · Workspace 2 × (5 Queries + Portal-Check) · getUserById 2 · Signierung N · Billing 2 = **18 + N** | getUser 2 · Workspace 5 + 1 · getUserById 0 (geteilt mit dem Portal-Check) · Billing 2 = **10** |

`getUser` bleibt bei 2, solange `src/app/(dashboard)/layout.tsx` (Datei des navigation-specialist) noch `createClient().auth.getUser()` aufruft statt `getServerUser()`. Nach der Umstellung dort ist es 1. N ist die Anzahl privater Asset-URLs in `user_metadata` (Etiketten, Charaktere, Referenzen); jede kostet einen Storage-Aufruf.

### A-6 Studio-Seiten ohne Asset-Signierung und ohne Stripe im Render

- `/inhalte-erstellen` und `/videos-erstellen` rufen `workspaceResourceUser(..., { hydrate: false })` auf. Gelesen werden dort nur der Onboarding-Status und der Brauereiname.
- Der Stripe-Abgleich für Nutzer ohne Guthaben läuft jetzt in `src/lib/dashboard/studioBillingGate.ts` per `after()`, also **nach** der Redirect-Antwort. Ob der Nutzer Zugang bekommt oder zur Preisseite geht, entscheidet allein die DB-Zeile. Bisher wartete die Weiterleitung auf `stripe.customers.list` und `subscriptions.list` (2 Stripe-Aufrufe).
- `/dashboard` hat Stripe im Render nie aufgerufen und nutzte schon `hydrate: false`.

### Bundle `/inhalte-erstellen` und `/dashboard`

Ursache der +28 KB nach Welle 1: Im Welle-1-Build liegt der Root-`error.tsx` (mit `Button`) im Chunk `1jragn8ta9un3.js` (16 KB roh / 6 KB gzip), den alle 19 Routen laden. Dazu kommen 2 KB `(dashboard)/error.tsx` und die Änderungen an der Shell. Diese Dateien gehören dem navigation-specialist und wurden hier nicht geändert. Stattdessen wurde an anderer Stelle gekürzt:

| Änderung | Chunk im Welle-1-Build | roh / gzip | Routen |
|---|---|---:|---|
| zod entfernt: `studio-config.ts` importierte die Schemas nur für das ungenutzte `parseStudioPayload`. `brandProfile.ts` holt die Belegkonstanten jetzt aus dem zod-freien `brand-evidence-status.ts` | `3egp5dhrczj4q.js` | 105 / 30 KB | `/inhalte-erstellen`, `/dashboard`, `/onboarding` (statisch nachgeprüft: kein Client-Importpfad führt mehr zu `zod`) |
| `CreateResultStage` per `next/dynamic`, nach dem Mount vorgeladen (erscheint erst ab dem ersten Auftrag) | `1pitcmszglc6l.js` | 32 / 9 KB | `/inhalte-erstellen` |

| Route | Welle 1 roh / gzip | Erwartet roh / gzip | Nachher |
|---|---:|---:|---:|
| `/inhalte-erstellen` | 1127 / 348 KB | ~990 / ~309 KB | |
| `/dashboard/[[...section]]` | 1213 / 375 KB | ~1108 / ~345 KB | |
| `/onboarding` | 832 KB / nicht gemessen | ~727 KB / nicht gemessen | |

Nicht verschoben, weil sofort sichtbar oder in einer fremden Datei: `motion`/`framer-motion` (Shell, Navigation, Icons) und `MagneticText`. Kandidat für den navigation-specialist: `dashboard-product-tour.tsx` in `brewai-admin-shell.tsx` nur laden, wenn `uiTourSeen` false ist (liegt im 154-KB-Chunk `04scmlg9jd3dc.js`). `embla` und Charts kommen in keinem Client-Pfad dieser Routen vor.

### Aufräumen

- `geist` aus `package.json`/`package-lock.json` entfernt (die Schriften kommen aus `next/font/google`, das Paket wird nirgends importiert).
- `TOKEN_STATE_SECRET` in `.env.example` und `docs/go-live-checklist.md` als „nicht mehr benötigt“ markiert.
- Keine neuen Indizes nötig: `workspace_members` (PK `user_id`, Index `owner_id`), `account_deletion_jobs` (PK `user_id`) und `billing_subscriptions` (PK `user_id`) decken die Abfragen in `getWorkspace` bereits ab.
