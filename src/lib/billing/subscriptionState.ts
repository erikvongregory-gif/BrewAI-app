/**
 * Client-taugliche Abo-Prüfung ohne Server-Importe. `./access` zieht `next/server`, Owner-Prüfung und den
 * Supabase-Admin-Client nach sich; aus Client-Komponenten daher nur von hier importieren.
 */

/** UI/Summary: nur bezahlter Plan (summary.plan ist dafür schon gefiltert). */
export function hasActiveSubscriptionFromState(plan: string | null | undefined, status: string | undefined): boolean {
  if (!plan) return false;
  return status === "active" || status === "trialing";
}
