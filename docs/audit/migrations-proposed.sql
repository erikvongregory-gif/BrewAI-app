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

-- BEGIN credits-inactive-subscription
-- Gründer-Entscheidung 26.11.2026: Bei inaktivem Abo (Stripe-Abo vorhanden, Status nicht active/trialing)
-- sind die im Abo enthaltenen Credits (token_lots.source <> 'purchased') gesperrt, gekaufte Token-Packs
-- (source = 'purchased') bleiben nutzbar. ÄNDERT VERHALTEN (nicht nur Tempo), deshalb erst nach Freigabe.
-- Heute (supabase/migrations/20260918123000_debit_lots_allow_bonus.sql) wirft billing_debit_lots bei
-- inaktivem Abo immer 'Kein aktives Abo.', also sind heute auch gekaufte Credits gesperrt.
-- Bonus-Konten ohne Stripe-Abo (stripe_subscription_id is null) bleiben unverändert.
-- Der App-Code (src/lib/billing/generationJobs.ts, reservationErrorResponse) kennt beide Fehlertexte.
-- Getestet gegen PGlite in src/lib/billing/inactiveSubscriptionCredits.test.ts.
-- Reihenfolge: nach supabase/migrations/20260918123000_debit_lots_allow_bonus.sql.
begin;

create or replace function public.billing_debit_lots(p_user_id uuid, p_amount integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b billing_subscriptions; lot token_lots; left_to_debit integer := p_amount; take integer;
  allocations jsonb := '[]'; m integer := 0; p integer := 0; purchased_only boolean := false;
begin
  perform billing_refresh_monthly(p_user_id);
  select * into b from billing_subscriptions where user_id = p_user_id for update;
  if not found then raise exception 'Billing profile missing'; end if;
  if p_amount < 0 then raise exception 'Invalid amount'; end if;

  if b.stripe_subscription_id is not null then
    if b.subscription_status not in ('active', 'trialing') then
      purchased_only := true;
    elsif b.token_next_at is not null and b.current_period_end <= now() then
      raise exception 'Aboperiode nicht bestätigt.';
    end if;
  end if;

  for lot in
    select * from token_lots
    where user_id = p_user_id and remaining > 0 and (expires_at is null or expires_at > now())
      and (not purchased_only or source = 'purchased')
    order by expires_at nulls last, id
    for update
  loop
    take := least(left_to_debit, lot.remaining);
    if take > 0 then
      update token_lots set remaining = remaining - take where id = lot.id;
      allocations := allocations || jsonb_build_array(jsonb_build_object('id', lot.id, 'amount', take, 'source', lot.source));
      if lot.source = 'purchased' then p := p + take; else m := m + take; end if;
      left_to_debit := left_to_debit - take;
    end if;
    exit when left_to_debit = 0;
  end loop;

  if left_to_debit > 0 then
    if purchased_only then raise exception 'Nicht genug gekaufte Tokens.'; end if;
    raise exception 'Nicht genug Tokens.';
  end if;

  update billing_subscriptions set monthly_spent = monthly_spent + m, purchased_spent = purchased_spent + p
    where user_id = p_user_id;
  return allocations;
end $$;

-- Anzeige: Gesperrte Abo-Credits zählen bei inaktivem Abo nicht als verfügbar (monthly_tokens - used_tokens).
-- Greift bei jeder Änderung der Zeile, also auch bei Kündigung/Reaktivierung und bei jedem
-- billing_refresh_monthly (getBillingRow ruft es vor jedem Lesen).
create or replace function public.billing_project_balance() returns trigger
language plpgsql set search_path = public as $$
declare available integer; extras integer; locked boolean;
begin
  locked := new.stripe_subscription_id is not null and new.subscription_status not in ('active', 'trialing');
  select coalesce(sum(remaining) filter (where source = 'purchased' or not locked), 0),
         coalesce(sum(remaining) filter (where source = 'purchased'), 0)
    into available, extras
    from token_lots where user_id = new.user_id and (expires_at is null or expires_at > now());
  new.purchased_balance := extras;
  new.used_tokens := new.monthly_spent + new.purchased_spent;
  new.monthly_tokens := available + new.used_tokens;
  return new;
end $$;

revoke all on function public.billing_debit_lots(uuid, integer) from public, anon, authenticated;
grant execute on function public.billing_debit_lots(uuid, integer) to service_role;
update billing_subscriptions set monthly_spent = monthly_spent; -- Anzeige einmal neu berechnen
commit;

-- Rückbau: supabase/migrations/20260918123000_debit_lots_allow_bonus.sql erneut ausführen und
-- billing_project_balance aus docs/billing-periods-migration.sql (Zeilen 34-43) wiederherstellen.
-- END credits-inactive-subscription
