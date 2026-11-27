-- REKONSTRUIERT NUR FÜR DIE TESTDATENBANK (nicht versioniert im Repo, siehe docs/audit/E2E-REPORT.md „Schema-Lücken“).
-- Die App liest/schreibt den privaten Bucket "generated-images" (src/lib/supabase/storage.ts:6,
-- src/lib/supabase/privateAssets.ts:3) und signiert URLs – er muss also privat sein.
-- Keine Storage-Policies: alle Zugriffe laufen serverseitig über den Service-Role-Key.
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;
