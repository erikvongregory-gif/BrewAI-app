import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConfirmPasswordResetPage } from "@/components/ui/password-reset-pages";

export const metadata: Metadata = {
  title: { absolute: "BrewAI · Passwort zurücksetzen" },
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

/** Zwischenseite aus der Reset-Mail: Der Token wird erst beim Klick verbraucht, nicht schon beim Öffnen. */
export default async function PasswortZuruecksetzenBestaetigenPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const raw = params.token_hash;
  const tokenHash = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!tokenHash) redirect("/passwort-vergessen?error=session");
  return <ConfirmPasswordResetPage tokenHash={tokenHash} />;
}
