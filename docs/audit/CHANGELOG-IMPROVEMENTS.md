# CHANGELOG – improve/dashboard-perf-ux

*Wird bis zum Abschluss nach Welle 3 vervollständigt (Änderungen, Vorher/Nachher-Messwerte, offene Punkte, Migrationsvorschläge).*

## Gemeldet, nicht geändert
- **C-2 Ungenutzte Generierungsmodi:** Die API-Routen für Ultra Realistic, Studio Produktbild, Kampagne + Text und Freistellen (`src/app/api/generate-*`) haben keinen Aufrufer in der UI. Die zugehörige UI wurde am 15.09.2026 in Commit 2a383de entfernt, Details in `DESIGN-HISTORY.md`. Wie entschieden: nichts verdrahtet, nichts gelöscht.

## Folgeaufgaben (nicht in diesem Branch)
1. **Schema versionieren:** Das Kernschema aus `docs/*.sql` nach `supabase/migrations/` überführen, mit fester Reihenfolge (heute steht sie nur in Markdown und in einem Unit-Test; `request-rate-limits-migration.sql` fehlt dort ganz). Dazu gehört der Storage-Bucket `generated-images`, der nirgends versioniert ist. Für die E2E-Testdatenbank ist er in `tests/e2e/fixtures/schema/001_generated_images_bucket.sql` nachgebaut. Zusätzlich die Drift prüfen: Laut Kommentar in `character-store.ts:11` fehlt `dashboard_characters` in Produktion.
2. **Stripe-Händlername:** Stripe Checkout zeigt „evglab“ bzw. „evglab sandbox“, weil das Konto mit EvGlab geteilt ist. Klären, ob BrewAI ein eigenes Konto oder einen eigenen Statement-Descriptor bzw. Händlernamen bekommt, und ob das live genauso aussieht.
