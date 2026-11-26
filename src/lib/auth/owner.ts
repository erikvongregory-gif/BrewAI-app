import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserById } from "@/lib/supabase/adminUsers";

/**
 * Owner = Betreiber-Konto. Hat unbegrenzte Tokens und braucht kein Stripe-Abo.
 * Quelle: Env `OWNER_EMAILS` oder ausschließlich serververwaltete `app_metadata.role`.
 */
const OWNER_ROLE = "owner";

/** Effektiv unbegrenzt, aber eine echte Zahl — so bleibt die bestehende Token-UI funktionsfähig. */
export const OWNER_TOKEN_ALLOWANCE = 1_000_000_000;

function configuredOwnerEmails(): string[] {
  return (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return configuredOwnerEmails().includes(email.trim().toLowerCase());
}

export function isOwnerRole(role: unknown): boolean {
  return typeof role === "string" && role.trim().toLowerCase() === OWNER_ROLE;
}

export function isOwnerUser(user: Pick<User, "email" | "app_metadata" | "email_confirmed_at"> | null | undefined): boolean {
  if (!user) return false;
  return (Boolean(user.email_confirmed_at) && isOwnerEmail(user.email)) || isOwnerRole(user.app_metadata?.role);
}

/** Admin-Center-Zugriff: klassische Admin-Rolle oder Owner. */
export function hasAdminAccess(user: Pick<User, "email" | "app_metadata" | "email_confirmed_at"> | null | undefined): boolean {
  if (!user) return false;
  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role.trim().toLowerCase() : "";
  return role === "admin" || isOwnerUser(user);
}

/**
 * Frische serverseitige Prüfung: Rechteentzug darf nicht in einem Prozesscache hängen bleiben.
 */
export async function isOwnerUserId(userId: string): Promise<boolean> {
  let isOwner = false;
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(userId);
    isOwner = isOwnerUser(data?.user ?? null);
  } catch {
    isOwner = false;
  }

  return isOwner;
}

/**
 * Portal-Betreiber (Owner-E-Mail / app_metadata owner|admin): Team ohne Stripe-Abo.
 * Nicht verwechseln mit der Workspace-Rolle „admin“.
 */
export async function isPortalOperatorUserId(userId: string): Promise<boolean> {
  try {
    // Pro Request dedupliziert (Workspace-Prüfung liest denselben Inhaber), nie über Requests hinweg.
    const { data } = await getAuthUserById(userId);
    return hasAdminAccess(data?.user ?? null);
  } catch {
    return false;
  }
}
