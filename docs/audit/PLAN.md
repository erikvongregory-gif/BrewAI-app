# Umsetzungsplan – improve/dashboard-perf-ux

Grundlage: `docs/audit/AUDIT.md` (5 × P0, 11 × P1, 12 × P2). Jeder Agent fasst nur die hier genannten Dateien an. Wenn mehrere Agenten dieselbe Datei brauchen, arbeiten sie in Wellen nacheinander.

## Entscheidungen des Gründers (26.11.2026)
- **D-1 Design-System:** Das Sudbuch wird in diesem Branch **nicht** durchgesetzt. Welle 3 räumt das bestehende System auf (Geist/Inter Tight, #C7691E, helles Theme): zentrale Tokens, hartcodierte Farben auf Tokens, Radien vereinheitlichen, Responsive- und Layout-Shift-Bugs beheben. Kein Redesign. Hintergrund steht in `DESIGN-HISTORY.md`.
- **C-2 Generierungsmodi:** Die Routen für Ultra Realistic, Studio, Kampagne + Text und Freistellen werden nur in `CHANGELOG-IMPROVEMENTS.md` als „ungenutzt“ gemeldet. Nichts wird verdrahtet, nichts gelöscht. Die zugehörige UI wurde am 15.09.2026 in Commit 2a383de entfernt.
- **E2E:** Vor Welle 1 läuft ein Ausgangslauf von `tests/e2e` gegen ein eigenes Supabase-Testprojekt, nach jeder Welle ein weiterer Lauf. Ein Test, der vorher grün war und danach rot ist, blockiert die Welle.

## Welle 1 – parallel, keine gemeinsamen Dateien
| Agent | Befunde | Dateien |
|---|---|---|
| navigation-specialist | B-1 Tabwechsel ohne Remount (Client-State statt `router.push` auf force-dynamic), B-2 Skeleton im Sudbuch-/Bestandsstil statt `null` und Prefetch wieder an, C-1 `error.tsx`, `global-error.tsx` und `not-found.tsx` (nur die Boundaries), B-3 Prompt bleibt beim Moduswechsel erhalten | `src/app/(dashboard)/layout.tsx`, `loading.tsx`, neue `error.tsx`/`not-found.tsx`, `dashboard/[[...section]]/page.tsx`, `src/components/ui/dashboard-redesign.tsx`, `ruixen-moon-chat.tsx` (nur State), `sidebar/nav-main.tsx`, `futuristic-nav.tsx`, `brewai-admin-shell.tsx`, `assets-folder-button.tsx`, `admin-home-view.tsx` (nur Links) |
| performance-engineer | A-1 nur genutzte Schrift vorladen, A-2 `crypto` aus dem Client-Bundle (−454 KB), A-4 Mediathek mit DB-Pagination plus Index-Vorschlag in `migrations-proposed.sql` | `src/lib/fonts/registry.ts`, `src/app/layout.tsx` (nur Schriften), `src/lib/billing/checkoutClient.ts`/`tokenState.ts`, `src/lib/dashboard/media-store.ts` |
| feature-reliability | C-4 `.claude/**` in vitest ausschließen, C-1 `getWorkspace` liefert definierte Fehlerzustände (abgelaufenes Abo des Inhabers, DB-Fehler), statt zu werfen | `vitest.config.ts`, `src/lib/dashboard/workspace.ts`, `src/app/api/dashboard/team/route.ts` |

### Ergänzung nach E2E-Baseline (Commit 1928f2d: 288 Tests, 194 grün, 50 rot, 44 übersprungen)
| Agent | Neu in Welle 1 | Dateien |
|---|---|---|
| navigation-specialist | N-3 (offline: Navigation führt zu weißer Seite), B-4 (CLS 0,19–0,37 mobil beim schnellen Wechsel), B-5 (unbekannter Abschnitt liefert 200 statt 404) | dieselben Dateien wie oben |
| feature-reliability | **N-1 P0** (Einladungslink `/invite/<token>`: Feld `passwordConfirm` fehlt, mindestens 8 Zeichen), **N-2 P0** (Checkout-Idempotenz: Zeitstempel im Parameterset führt nach 24-h-Lock zu 500), N-4 (Rohmeldungen von zod und Stripe durch deutsche Texte ersetzen), N-6 (Auth vor Validierung, 401 statt 400) | `src/app/invite/[token]/page.tsx`, `src/app/api/billing/checkout/route.ts`, `src/app/api/dashboard/team/route.ts`, `src/app/api/dashboard/settings/route.ts`, `src/app/api/dashboard/media/route.ts`, `src/app/api/openai/image2/generate/route.ts` |

Neu für Welle 3 (ui-design-qa): N-5 (Prompt wird ohne Hinweis auf 800 Zeichen gekürzt), N-7 (axe: Labels, Kontrast, mobile Teamtabelle).
Für CHANGELOG bzw. Gründer: Der Bucket `generated-images` ist nicht versioniert. Das Schema liegt in `docs/*.sql` statt in `supabase/migrations`. Stripe Checkout zeigt „evglab sandbox“.

## Welle 2 – nach Welle 1, gleiche Dateien wie oben
- **performance-engineer:** A-5 und A-6, also `cache()` für `getUser` und `getWorkspace`, keine Signierung aller Asset-URLs bei jedem Besuch und kein synchroner Stripe-Sync im Render. Betroffen: `workspace.ts`, `inhalte-erstellen/page.tsx`, `videos-erstellen/page.tsx` und die Datenteile der Dashboard-Page.
- **feature-reliability:** C-3, das Rate-Limit der Team-API. Erst nach B-1 neu messen; wahrscheinlich ist es dann erledigt.

## Welle 3 – erst nach der Entscheidung zu D-1
- **ui-design-qa:** D-2 (Tokens statt 54 × hartcodierter Farbe, zweites Orange entfernen, `rounded-*` gemäß Entscheidung), A-3 (CSS-Reste, zusammen mit performance-engineer), Leerzustände, Fokus, Responsive bei 375/768/1280/1920 und die übrigen P2-Design-Befunde aus AUDIT.md.

## Danach
qa-verifier, höchstens 3 Runden. Danach `CHANGELOG-IMPROVEMENTS.md`. Kein Push und kein Deploy.

## Regeln
Keine neuen Dependencies geplant, keine Migrationen (nur Vorschläge), keine Policy- oder Env-Änderungen, Stripe nur im Test-Modus, nichts löschen.
