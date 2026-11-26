import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import { getWorkspace, orWorkspaceBlockedRedirect } from "@/lib/dashboard/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardMetadata, type DashboardMetadata } from "@/lib/dashboard/metadata";
import { readDashboardBeers } from "@/lib/dashboard/beer-store";

/**
 * Frische Auth-Metadata ohne Signed-URL-Hydration.
 * Für Layout-Gates (Onboarding, Profiltexte) — nicht für Mediathek/Beers.
 */
export async function getFreshUserMetadataRaw(
  userId: string,
  fallbackMetadata: unknown,
): Promise<unknown> {
  const workspace = await getWorkspace(userId);
  const ownerId = workspace.ownerId;
  try {
    const admin = createAdminClient();
    const { data: adminUser } = await admin.auth.admin.getUserById(ownerId);
    if (adminUser?.user?.user_metadata) return adminUser.user.user_metadata;
  } catch {
    /* Fallback auf Session-Metadata */
  }
  return fallbackMetadata;
}

/** Liest user_metadata frisch aus Supabase Auth — nicht aus dem oft veralteten JWT. */
export async function getFreshUserMetadata(userId: string, fallbackMetadata: unknown): Promise<unknown> {
  const workspace = await getWorkspace(userId);
  userId = workspace.ownerId;
  try {
    const admin = createAdminClient();
    const { data: adminUser } = await admin.auth.admin.getUserById(userId);
    if (adminUser?.user?.user_metadata) return hydratePrivateAssets(adminUser.user.user_metadata,userId);
  } catch {
    /* Fallback auf Session-Metadata */
  }
  return hydratePrivateAssets(fallbackMetadata,userId);
}

/**
 * Leichter Shell-Gate: Onboarding + Settings-Felder, ohne Asset-Signing und ohne Beers-DB.
 */
export async function getShellGateDashboardMetadata(
  userId: string,
  fallbackMetadata: unknown,
): Promise<DashboardMetadata> {
  return getDashboardMetadata(await orWorkspaceBlockedRedirect(getFreshUserMetadataRaw(userId, fallbackMetadata)));
}

/** Liest dashboard-Metadata frisch aus Supabase Auth — nicht aus dem oft veralteten JWT. */
export async function getFreshUserDashboardMetadata(
  userId: string,
  fallbackMetadata: unknown,
): Promise<DashboardMetadata> {
  const workspace = await getWorkspace(userId);
  const metadata = getDashboardMetadata(await getFreshUserMetadata(userId, fallbackMetadata));
  try {
    return { ...metadata, myBeers: await readDashboardBeers(workspace.ownerId) };
  } catch {
    return metadata;
  }
}
