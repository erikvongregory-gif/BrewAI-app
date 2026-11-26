-- Vorgeschlagene Migrationen aus dem Audit vom 26.11.2026. NICHT automatisch ausführen.
-- Jede Migration ist optional: Der Code läuft mit dem heutigen Schema korrekt, sie macht ihn nur schneller.

-- A-4 Mediathek: Sortierung + Seiten in der DB (src/lib/dashboard/media-store.ts).
-- Der Code sortiert per PostgREST nach `item->>createdAt DESC NULLS LAST, id ASC` und liest nur
-- die angefragte Seite. Ohne Index sortiert Postgres dafür alle Zeilen des Nutzers (nur den
-- Primärschlüssel-Präfix user_id nutzt er); mit diesem Index liest er die Seite direkt in Reihenfolge.
-- Keine neue Spalte nötig, der Ausdruck entspricht exakt dem ORDER BY.
-- CONCURRENTLY sperrt keine Schreibzugriffe, darf aber nicht in einer Transaktion laufen
-- (im Supabase-SQL-Editor als einzelne Anweisung ausführen).
create index concurrently if not exists dashboard_media_user_created_idx
  on public.dashboard_media (user_id, (item ->> 'createdAt') desc nulls last, id);

-- Prüfen (sollte "Index Scan using dashboard_media_user_created_idx" zeigen):
-- explain analyze
--   select item from public.dashboard_media
--   where user_id = '<uuid>'
--   order by item ->> 'createdAt' desc nulls last, id
--   limit 48 offset 0;

-- Rückbau:
-- drop index concurrently if exists public.dashboard_media_user_created_idx;
