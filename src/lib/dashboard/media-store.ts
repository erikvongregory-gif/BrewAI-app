import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DashboardMediaItem } from "@/lib/dashboard/metadata";

/**
 * Neueste zuerst, sortiert in der DB (Audit A-4). Das Schema hat keine created_at-Spalte, daher
 * über den JSON-Pfad; ISO-Zeitstempel sortieren als Text chronologisch. Gleichstand: id aufsteigend
 * wie bisher. Index-Vorschlag: docs/audit/migrations-proposed.sql.
 */
function mediaQuery(userId: string, withCount = false) {
  return createAdminClient()
    .from("dashboard_media")
    .select("item", withCount ? { count: "exact" } : undefined)
    .eq("user_id", userId)
    .order("item->>createdAt", { ascending: false, nullsFirst: false })
    .order("id");
}

function toItems(data: { item: unknown }[] | null) {
  return (data ?? []).map((row) => row.item as DashboardMediaItem);
}

const loadError = (message: string) => new Error(`Mediathek konnte nicht geladen werden: ${message}`);

async function listAllDashboardMedia(userId: string): Promise<DashboardMediaItem[]> {
  const items: DashboardMediaItem[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await mediaQuery(userId).range(offset, offset + 999);
    if (error) throw loadError(error.message);
    items.push(...toItems(data));
    if (!data || data.length < 1000) break;
  }
  return items;
}

export type MediaPage = {
  items: DashboardMediaItem[];
  total: number;
  hasMore: boolean;
};

/** Liest die Mediathek; mit `limit` nur diese Seite aus der DB (und nur sie signieren). */
export async function readDashboardMedia(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<DashboardMediaItem[]> {
  if (opts?.limit == null) return hydratePrivateAssets(await listAllDashboardMedia(userId), userId);
  const limit = Math.max(0, opts.limit);
  if (limit === 0) return [];
  const offset = Math.max(0, opts.offset ?? 0);
  const { data, error } = await mediaQuery(userId).range(offset, offset + limit - 1);
  // PGRST103: Offset hinter dem Ende → leere Seite, wie früher slice().
  if (error && error.code !== "PGRST103") throw loadError(error.message);
  return hydratePrivateAssets(error ? [] : toItems(data), userId);
}

export async function readDashboardMediaPage(
  userId: string,
  opts?: { limit?: number; offset?: number },
): Promise<MediaPage> {
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 48));
  const offset = Math.max(0, opts?.offset ?? 0);
  const { data, error, count } = await mediaQuery(userId, true).range(offset, offset + limit - 1);
  let total = count ?? 0;
  if (error) {
    if (error.code !== "PGRST103") throw loadError(error.message);
    // Offset hinter dem Ende: PostgREST liefert dann keine Zeilen und keinen Count.
    const head = await createAdminClient()
      .from("dashboard_media")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (head.error) throw loadError(head.error.message);
    total = head.count ?? 0;
  }
  const items = await hydratePrivateAssets(error ? [] : toItems(data), userId);
  return { items, total, hasMore: offset + limit < total };
}

/** Roh-Item ohne URL-Signing (z. B. Titel-Update). */
export async function getDashboardMediaItem(
  userId: string,
  id: string,
): Promise<DashboardMediaItem | null> {
  const { data, error } = await createAdminClient()
    .from("dashboard_media")
    .select("item")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.item ? (data.item as DashboardMediaItem) : null;
}

/** Upsert individual records; never overwrite another request's entire library. */
export async function writeDashboardMedia(userId: string, items: DashboardMediaItem[]) {
  if (items.length) {
    const { error } = await createAdminClient()
      .from("dashboard_media")
      .upsert(
        items.map((item) => ({ user_id: userId, id: item.id, item })),
        { onConflict: "user_id,id" },
      );
    if (error) throw new Error(`Mediathek konnte nicht gespeichert werden: ${error.message}`);
  }
}

export async function deleteDashboardMedia(userId: string, id: string) {
  const { error } = await createAdminClient()
    .from("dashboard_media")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
