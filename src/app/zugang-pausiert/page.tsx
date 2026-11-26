import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getWorkspaceAccess, type WorkspaceBlockReason } from "@/lib/dashboard/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "BrewAI - Zugang pausiert" },
  robots: { index: false, follow: false },
};

const MESSAGES: Record<WorkspaceBlockReason, { title: string; text: string; retry?: boolean }> = {
  team_subscription_inactive: {
    title: "Das Abo deines Teams ist abgelaufen",
    text: "Solange das Abo des Teaminhabers nicht aktiv ist, ist dein Teamzugang pausiert. Wende dich an den Inhaber deines Teams, damit er das Abo verlängert.",
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

  return (
    <main className="mx-auto my-10 w-full max-w-md px-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">{message.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{message.text}</p>
        <div className="mt-5 flex flex-col gap-2">
          {message.retry ? (
            <Link
              href="/dashboard"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#c65a20] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#b14f1c]"
            >
              Erneut versuchen
            </Link>
          ) : null}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Abmelden
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
