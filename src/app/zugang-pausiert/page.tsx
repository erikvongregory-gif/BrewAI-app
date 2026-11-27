import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceAccess, type WorkspaceBlockReason } from "@/lib/dashboard/workspace";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/ui/status-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "BrewAI - Zugang pausiert" },
  robots: { index: false, follow: false },
};

const MESSAGES: Record<WorkspaceBlockReason, { title: string; text: string; retry?: boolean }> = {
  team_subscription_inactive: {
    title: "Das Abo deines Teams ist abgelaufen",
    text: "Solange das Abo des Teaminhabers nicht aktiv ist, ist dein Teamzugang pausiert. Wende dich an den Inhaber deines Teams, damit das Abo verlängert wird.",
  },
  team_seat_unavailable: {
    title: "Kein freier Teamplatz",
    text: "Der aktuelle Tarif deines Teams hat keinen Platz mehr für dich. Wende dich an den Inhaber deines Teams.",
  },
  team_account_deleted: {
    title: "Das Teamkonto wird gelöscht",
    text: "Der Inhaber deines Teams hat sein Konto zur Löschung vorgemerkt. Dein Teamzugang ist deshalb nicht mehr verfügbar.",
  },
  account_deleted: {
    title: "Dein Konto wird gelöscht",
    text: "Dein Konto ist zur Löschung vorgemerkt und kann nicht mehr genutzt werden. Bei Fragen schreib uns an kontakt@brewai.de.",
  },
  read_only: {
    title: "Nur Lesezugriff",
    text: "Deine Teamrolle erlaubt nur Lesezugriff.",
    retry: true,
  },
  lookup_failed: {
    title: "Zugang konnte nicht geprüft werden",
    text: "Gerade gibt es eine kurze Störung. Bitte versuch es in einem Moment noch einmal.",
    retry: true,
  },
};

export default async function WorkspaceBlockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/anmelden");

  const access = await getWorkspaceAccess(user.id);
  if (access.ok) redirect("/dashboard");
  const message = MESSAGES[access.reason];

  // Ohne „Erneut versuchen“ ist Abmelden die einzige Aktion und damit primär.
  const signOut = (
    <form action="/auth/signout" method="post" className="contents">
      <Button type="submit" variant={message.retry ? "outline" : "default"} className="w-full sm:flex-1">
        Abmelden
      </Button>
    </form>
  );

  return (
    <StatusScreen
      eyebrow="Zugang pausiert"
      title={message.title}
      actions={
        <>
          {message.retry ? (
            <Button asChild className="w-full sm:flex-1">
              <Link href="/dashboard">Erneut versuchen</Link>
            </Button>
          ) : null}
          {signOut}
        </>
      }
    >
      {message.text}
    </StatusScreen>
  );
}
