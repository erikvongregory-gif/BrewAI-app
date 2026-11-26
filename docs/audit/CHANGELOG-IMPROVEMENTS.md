# CHANGELOG – improve/dashboard-perf-ux

*Wird bis zum Abschluss nach Welle 3 vervollständigt (Änderungen, Vorher/Nachher-Messwerte, offene Punkte, Migrationsvorschläge).*

## Gemeldet, nicht geändert
- **C-2 Ungenutzte Generierungsmodi:** Die API-Routen für Ultra Realistic, Studio Produktbild, Kampagne + Text und Freistellen (`src/app/api/generate-*`) haben keinen Aufrufer in der UI. Die zugehörige UI wurde am 15.09.2026 in Commit 2a383de entfernt, Details in `DESIGN-HISTORY.md`. Wie entschieden: nichts verdrahtet, nichts gelöscht.

## Credits bei abgelaufenem Abo (Welle 2, Gründer-Entscheidung)
- **Unterscheidet der Code gekaufte und Abo-Credits? Ja.** `token_lots.source` ist `'purchased'` (Token-Packs über `billing_grant_token_pack_atomic` → `billing_adjust_tokens_atomic(...,'add')`, `docs/billing-periods-migration.sql:123`) oder `'monthly'` (Abo-Kontingent, Willkommensbonus, `:55`, `:143`, `:173`). Abo-Posten verfallen (`expires_at`), gekaufte nicht.
- **Heutiges Verhalten widerspricht der Entscheidung:** `billing_debit_lots` (`supabase/migrations/20260918123000_debit_lots_allow_bonus.sql:29-36`) wirft bei Stripe-Abo mit Status ≠ active/trialing immer „Kein aktives Abo.“. Damit sind bei abgelaufenem Abo **auch gekaufte Credits gesperrt**. Ein Unit-Test schreibt das sogar fest (`src/lib/billing/atomicBilling.test.ts` „cancellation preserves remaining bought tokens and blocks consumption“). `access.ts` lässt die Erstellen-Seite trotzdem zu, weil `monthly_tokens - used_tokens` alle Posten zählt; der Nutzer scheiterte dann erst beim Reservieren mit „Bitte Guthaben prüfen“.
- **Vorschlag, nicht ausgeführt:** `docs/audit/migrations-proposed.sql`, Abschnitt `credits-inactive-subscription`. `billing_debit_lots` bucht bei inaktivem Abo nur Posten mit `source='purchased'` ab (gleiche Sperre `for update`, gleich atomar wie heute), sonst „Nicht genug gekaufte Tokens.“; `billing_project_balance` zeigt gesperrte Abo-Credits nicht mehr als verfügbar. Bonus-Konten ohne Stripe-Abo bleiben unverändert. Getestet gegen PGlite: `src/lib/billing/inactiveSubscriptionCredits.test.ts`.
- **Code (läuft mit heutigem und vorgeschlagenem Schema):** `reservationErrorResponse` in `src/lib/billing/generationJobs.ts` meldet „Kein aktives Abo.“ und „Nicht genug gekaufte Tokens.“ als 402 `subscription_inactive` mit deutschem Text statt 409 „Bitte Guthaben prüfen“.
- **Teammitglieder:** Generierungen von Mitgliedern buchen auf das Konto des Inhabers, die Regel gilt also für beide gleich. Mitglieder kommen bei inaktivem Inhaber-Abo aber gar nicht bis zur Abbuchung: `getWorkspace` sperrt sie vorher (`src/lib/dashboard/workspace.ts:127`, und bei `plan=null` gibt es keinen Teamplatz, `:128-131`). Sollen Mitglieder gekaufte Credits nutzen dürfen, muss `workspace.ts` geändert werden (nicht in diesem Arbeitspaket).
- **Zu bestätigen:** Nach einer Reaktivierung werden noch nicht verfallene Abo-Posten wieder nutzbar (so im Vorschlag und im Test). `atomicBilling.test.ts` prüft nur das alte RPC aus `docs/billing-atomic-migration.sql` und bleibt gültig.

## Weitere Änderungen Welle 2 (feature-reliability)
- `confirm-session`: keine rohen Stripe-/DB-Meldungen mehr, deutscher Text, Details ins Server-Log.
- `stripeCustomer.ts`: Idempotency-Key `customer:<userId>:<Hash der Parameter>`, wie beim Checkout in Welle 1.
- 28 Stellen in 25 API-Routen plus 2 in `api-guards.ts`: Fehler aus `workspaceResourceUser` laufen über `workspaceErrorResponse`, also 503 bei Störung, 403 mit konkretem Grund bei Sperre statt immer 403 „Teamzugriff nicht erlaubt.“.

## Folgeaufgaben (nicht in diesem Branch)
1. **Schema versionieren:** Das Kernschema aus `docs/*.sql` nach `supabase/migrations/` überführen, mit fester Reihenfolge (heute steht sie nur in Markdown und in einem Unit-Test; `request-rate-limits-migration.sql` fehlt dort ganz). Dazu gehört der Storage-Bucket `generated-images`, der nirgends versioniert ist. Für die E2E-Testdatenbank ist er in `tests/e2e/fixtures/schema/001_generated_images_bucket.sql` nachgebaut. Zusätzlich die Drift prüfen: Laut Kommentar in `character-store.ts:11` fehlt `dashboard_characters` in Produktion.
2. **Stripe-Händlername:** Stripe Checkout zeigt „evglab“ bzw. „evglab sandbox“, weil das Konto mit EvGlab geteilt ist. Klären, ob BrewAI ein eigenes Konto oder einen eigenen Statement-Descriptor bzw. Händlernamen bekommt, und ob das live genauso aussieht.
