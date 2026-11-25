import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPortalOperatorUserId } from "@/lib/auth/owner";
import { planSeatLimit } from "@/lib/billing/planCatalog";
import type { SubscriptionPlanKey } from "@/lib/billing/tokenState";
import type { DashboardTeamRole } from "./metadata";
import { canWriteWithRole } from "./teamRoles";

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("could not find the table")
  );
}

async function isAccountMarkedForDeletion(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const deletion = await admin.from("account_deletion_jobs").select("user_id").eq("user_id", userId).maybeSingle();
  if (deletion.data) return true;
  if (deletion.error) {
    if (process.env.NODE_ENV !== "production" && isMissingRelationError(deletion.error)) return false;
    throw new Error("Löschstatus konnte nicht geprüft werden.");
  }
  return false;
}

export async function getWorkspace(userId: string): Promise<{ ownerId: string; role: DashboardTeamRole }> {
  const admin = createAdminClient();
  if (await isAccountMarkedForDeletion(admin, userId)) {
    throw new Error("Konto ist zur Löschung vorgemerkt oder nicht verfügbar.");
  }
  const { data, error } = await admin.from("workspace_members").select("owner_id,role").eq("user_id", userId).maybeSingle();
  if (error) {
    if (process.env.NODE_ENV !== "production" && isMissingRelationError(error)) return { ownerId: userId, role: "owner" };
    throw new Error("Teamzuordnung konnte nicht geprüft werden.");
  }
  if (!data) return { ownerId: userId, role: "owner" };
  if (await isAccountMarkedForDeletion(admin, data.owner_id)) throw new Error("Teamkonto ist zur Löschung vorgemerkt.");

  // Portal-Betreiber: Teammitglieder brauchen kein Stripe-Abo am Inhaber-Konto.
  if (await isPortalOperatorUserId(data.owner_id)) {
    return { ownerId: data.owner_id, role: data.role as DashboardTeamRole };
  }

  const billing = await admin.from("billing_subscriptions").select("plan,subscription_status").eq("user_id", data.owner_id).single();
  if (billing.error || !["active", "trialing"].includes(billing.data.subscription_status)) throw new Error("Teamabo nicht aktiv.");
  const members = await admin.from("workspace_members").select("user_id").eq("owner_id", data.owner_id).order("created_at").order("user_id");
  if (members.error) throw new Error("Teamplätze konnten nicht geprüft werden.");
  const limit = planSeatLimit(billing.data.plan as SubscriptionPlanKey | null);
  const position = (members.data ?? []).findIndex(m => m.user_id === userId);
  if (position < 0 || position >= limit - 1) throw new Error("Teamplatz im aktuellen Tarif nicht verfügbar.");
  return { ownerId: data.owner_id, role: data.role as DashboardTeamRole };
}

/**
 * Resource context only. Never use this returned identity for login, 2FA or platform-admin checks.
 * `hydrate: false` skips re-signing private asset URLs in user_metadata (one storage call per asset)
 * for callers that only need the id or non-asset metadata.
 */
export async function workspaceResourceUser(user: User, write = false, { hydrate = true } = {}): Promise<User> {
  const workspace = await getWorkspace(user.id);
  if (write && !canWriteWithRole(workspace.role)) {
    throw new Error("Deine Teamrolle erlaubt nur Lesezugriff.");
  }
  const sign = (meta: User["user_metadata"], ownerId: string) => (hydrate ? hydratePrivateAssets(meta, ownerId) : meta);
  if (workspace.ownerId === user.id) return { ...user, user_metadata: await sign(user.user_metadata,user.id) };
  const { data, error } = await createAdminClient().auth.admin.getUserById(workspace.ownerId);
  if (error || !data.user) throw new Error("Teamkonto nicht gefunden.");
  // Preserve actor app_metadata so a team member never inherits platform administrator privileges.
  return { ...data.user, app_metadata: user.app_metadata, user_metadata: await sign(data.user.user_metadata,workspace.ownerId) };
}
