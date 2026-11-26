import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hydratePrivateAssets } from "@/lib/supabase/privateAssets";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPortalOperatorUserId } from "@/lib/auth/owner";
import { planSeatLimit } from "@/lib/billing/planCatalog";
import type { SubscriptionPlanKey } from "@/lib/billing/tokenState";
import type { DashboardTeamRole } from "./metadata";
import { canWriteWithRole } from "./teamRoles";

export type WorkspaceBlockReason =
  | "account_deleted"
  | "team_account_deleted"
  | "team_subscription_inactive"
  | "team_seat_unavailable"
  | "read_only"
  | "lookup_failed";

/** Fail-closed: jeder Wurf verweigert den Zugriff. `reason` erlaubt Aufrufern eine verständliche Ansicht. */
export class WorkspaceAccessError extends Error {
  constructor(
    readonly reason: WorkspaceBlockReason,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

/** Seite, die gesperrten Nutzern erklärt, warum sie keinen Zugriff haben (außerhalb des Dashboard-Layouts). */
export const WORKSPACE_BLOCKED_PATH = "/zugang-pausiert";

export type WorkspaceAccess =
  | { ok: true; ownerId: string; role: DashboardTeamRole }
  | { ok: false; reason: WorkspaceBlockReason };

/** Wirft nie: unerwartete Fehler zählen als `lookup_failed` (kein Zugriff). */
export async function getWorkspaceAccess(userId: string): Promise<WorkspaceAccess> {
  try {
    return { ok: true, ...(await getWorkspace(userId)) };
  } catch (error) {
    if (error instanceof WorkspaceAccessError) return { ok: false, reason: error.reason };
    console.error("[workspace] Zugriffsprüfung fehlgeschlagen", error);
    return { ok: false, reason: "lookup_failed" };
  }
}

/** Für Server-Komponenten: gesperrter Workspace → Erklärseite statt Next-Fehlerseite. */
export async function orWorkspaceBlockedRedirect<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof WorkspaceAccessError) redirect(WORKSPACE_BLOCKED_PATH);
    throw error;
  }
}

const API_MESSAGES: Record<WorkspaceBlockReason, string> = {
  account_deleted: "Dein Konto ist zur Löschung vorgemerkt.",
  team_account_deleted: "Das Teamkonto ist zur Löschung vorgemerkt.",
  team_subscription_inactive: "Das Abo deines Teams ist abgelaufen. Wende dich an den Inhaber deines Teams.",
  team_seat_unavailable: "Im Tarif deines Teams ist kein Platz mehr für dich frei. Wende dich an den Inhaber deines Teams.",
  read_only: "Deine Teamrolle erlaubt nur Lesezugriff.",
  lookup_failed: "Dein Zugang konnte gerade nicht geprüft werden. Bitte versuch es gleich noch einmal.",
};

/** Für API-Routen: Sperre → 403, Störung → 503, jeweils mit deutscher Meldung und `code`. */
export function workspaceErrorResponse(error: unknown): NextResponse {
  const reason = error instanceof WorkspaceAccessError ? error.reason : "lookup_failed";
  if (!(error instanceof WorkspaceAccessError)) console.error("[workspace] Zugriffsprüfung fehlgeschlagen", error);
  return NextResponse.json({ error: API_MESSAGES[reason], code: reason }, { status: reason === "lookup_failed" ? 503 : 403 });
}

/** Abrechnung darf nur der Inhaber. Liefert die Ablehnung oder `null`, wirft nie. */
export async function billingOwnerDenied(userId: string): Promise<NextResponse | null> {
  try {
    if ((await getWorkspace(userId)).role === "owner") return null;
    return NextResponse.json({ error: "Abrechnung kann nur der Teaminhaber verwalten." }, { status: 403 });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

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
    throw new WorkspaceAccessError("lookup_failed", "Löschstatus konnte nicht geprüft werden.");
  }
  return false;
}

export async function getWorkspace(userId: string): Promise<{ ownerId: string; role: DashboardTeamRole }> {
  const admin = createAdminClient();
  if (await isAccountMarkedForDeletion(admin, userId)) {
    throw new WorkspaceAccessError("account_deleted", "Konto ist zur Löschung vorgemerkt oder nicht verfügbar.");
  }
  const { data, error } = await admin.from("workspace_members").select("owner_id,role").eq("user_id", userId).maybeSingle();
  if (error) {
    if (process.env.NODE_ENV !== "production" && isMissingRelationError(error)) return { ownerId: userId, role: "owner" };
    throw new WorkspaceAccessError("lookup_failed", "Teamzuordnung konnte nicht geprüft werden.");
  }
  if (!data) return { ownerId: userId, role: "owner" };
  if (await isAccountMarkedForDeletion(admin, data.owner_id)) throw new WorkspaceAccessError("team_account_deleted", "Teamkonto ist zur Löschung vorgemerkt.");

  // Portal-Betreiber: Teammitglieder brauchen kein Stripe-Abo am Inhaber-Konto.
  if (await isPortalOperatorUserId(data.owner_id)) {
    return { ownerId: data.owner_id, role: data.role as DashboardTeamRole };
  }

  const billing = await admin.from("billing_subscriptions").select("plan,subscription_status").eq("user_id", data.owner_id).single();
  // PGRST116 = keine Billing-Zeile: Inhaber hat nie ein Abo gehabt. Andere Fehler sind DB-Störungen.
  if (billing.error && billing.error.code !== "PGRST116") throw new WorkspaceAccessError("lookup_failed", "Teamabo konnte nicht geprüft werden.");
  if (!billing.data || !["active", "trialing"].includes(billing.data.subscription_status)) throw new WorkspaceAccessError("team_subscription_inactive", "Teamabo nicht aktiv.");
  const members = await admin.from("workspace_members").select("user_id").eq("owner_id", data.owner_id).order("created_at").order("user_id");
  if (members.error) throw new WorkspaceAccessError("lookup_failed", "Teamplätze konnten nicht geprüft werden.");
  const limit = planSeatLimit(billing.data.plan as SubscriptionPlanKey | null);
  const position = (members.data ?? []).findIndex(m => m.user_id === userId);
  if (position < 0 || position >= limit - 1) throw new WorkspaceAccessError("team_seat_unavailable", "Teamplatz im aktuellen Tarif nicht verfügbar.");
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
    throw new WorkspaceAccessError("read_only", "Deine Teamrolle erlaubt nur Lesezugriff.");
  }
  const sign = (meta: User["user_metadata"], ownerId: string) => (hydrate ? hydratePrivateAssets(meta, ownerId) : meta);
  if (workspace.ownerId === user.id) return { ...user, user_metadata: await sign(user.user_metadata,user.id) };
  const { data, error } = await createAdminClient().auth.admin.getUserById(workspace.ownerId);
  if (error || !data.user) throw new WorkspaceAccessError("lookup_failed", "Teamkonto nicht gefunden.");
  // Preserve actor app_metadata so a team member never inherits platform administrator privileges.
  return { ...data.user, app_metadata: user.app_metadata, user_metadata: await sign(data.user.user_metadata,workspace.ownerId) };
}
