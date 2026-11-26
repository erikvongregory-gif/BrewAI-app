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
| `/dashboard/[[...section]]` | 1625 KB / 495 KB | ~1181 KB / ~362 KB | |
| `/marketing-preview/[screen]` | 1973 KB / 601 KB | ~1529 KB / ~468 KB | |

Chunk `0ap3hiwn9twov.js` (crypto-browserify): 444 KB roh / 133 KB gzip, sollte im neuen Build fehlen.

### A-4 Mediathek (`src/lib/dashboard/media-store.ts`)

Vorher pro Seite (auch „Weitere Motive laden“): alle Zeilen des Nutzers in 1000er-Blöcken laden, in JS sortieren, 48 herausschneiden. Jetzt: `order=item->>createdAt.desc.nullslast,id.asc&offset=…&limit=…` mit `count=exact`, also eine Abfrage, die nur die Seite überträgt.

| Bibliothek | Vorher übertragene Zeilen pro Seite | Erwartet |
|---|---:|---:|
| 200 Motive | 200 (inkl. Prompt-JSON) | 48 |
| 2.000 Motive | 2.000 in 2 Roundtrips | 48 in 1 Roundtrip |

Ohne Index sortiert Postgres weiterhin alle Zeilen des Nutzers (aber in der DB, ohne Transfer). Mit dem optionalen Index aus `docs/audit/migrations-proposed.sql` wird die Seite per Index-Scan gelesen. Nachher-Messung: `explain analyze` vor/nach Index, Antwortzeit `GET /api/dashboard/media?limit=48`.
