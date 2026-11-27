import Link from "next/link";
import type { Metadata } from "next";
import { evaluateInvite, getInviteByToken } from "@/lib/invite/server";
import { isInviteOnlyEnabled } from "@/lib/supabase/env";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string }>;
};

function statusMessage(status: string) {
  if (status === "expired") return "Diese Einladung ist abgelaufen.";
  if (status === "used") return "Diese Einladung wurde bereits verwendet.";
  return "Der Einladungslink ist ungueltig.";
}

export const metadata: Metadata = {
  title: {
    absolute: "BrewAI - Einladung",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function InviteTokenPage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const query = (await searchParams) ?? {};
  const inviteOnly = isInviteOnlyEnabled();
  const invite = inviteOnly ? await getInviteByToken(token).catch(() => null) : null;
  const status = inviteOnly ? evaluateInvite(invite) : "valid";
  const termsError = query.error === "terms";

  return (
    <main className="mx-auto my-10 w-full max-w-md px-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Einladung zum Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Registriere dich mit deiner eingeladenen E-Mail-Adresse, um Zugang zum Dashboard zu erhalten.
        </p>

        {termsError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Bitte AGB und Datenschutzerklärung akzeptieren.
          </div>
        ) : null}

        {!inviteOnly || status === "valid" ? (
          <form action="/auth/signup" method="post" className="mt-5 space-y-4">
            <input type="hidden" name="inviteToken" value={token} />
            <input type="hidden" name="next" value="/dashboard" />
            <div>
              <label htmlFor="invite-email" className="text-sm font-medium text-zinc-800">
                E-Mail
              </label>
              <input
                id="invite-email"
                name="email"
                type="email"
                required
                defaultValue={invite?.email ?? ""}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
              />
            </div>
            <div>
              <label htmlFor="invite-brewery" className="text-sm font-medium text-zinc-800">
                Brauerei / Betriebsname (optional)
              </label>
              <input
                id="invite-brewery"
                name="brewery"
                type="text"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
              />
            </div>
            <div>
              <label htmlFor="invite-password" className="text-sm font-medium text-zinc-800">
                Passwort
              </label>
              <input
                id="invite-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                aria-describedby="invite-password-hint"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
              />
              <p id="invite-password-hint" className="mt-1 text-xs text-zinc-600">
                Mindestens 8 Zeichen.
              </p>
            </div>
            <div>
              <label htmlFor="invite-password-confirm" className="text-sm font-medium text-zinc-800">
                Passwort wiederholen
              </label>
              <input
                id="invite-password-confirm"
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2.5"
              />
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-700">
              <input
                id="invite-terms"
                name="accepted_terms"
                type="checkbox"
                value="1"
                required
                className="mt-1"
              />
              <label htmlFor="invite-terms">
                Ich akzeptiere die{" "}
                <a
                  href="https://brewai.de/agb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-acc-deep hover:underline"
                >
                  AGB
                </a>{" "}
                und die{" "}
                <a
                  href="https://brewai.de/datenschutz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-acc-deep hover:underline"
                >
                  Datenschutzerklärung
                </a>
                .
              </label>
            </div>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-acc px-4 py-2.5 text-sm font-semibold text-white hover:bg-acc-deep"
            >
              Einladung annehmen und Konto erstellen
            </button>
          </form>
        ) : (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {statusMessage(status)}
          </div>
        )}

        <p className="mt-4 text-sm text-zinc-600">
          Du hast schon ein Konto?{" "}
          <Link href="/anmelden" className="font-medium text-acc-deep hover:underline">
            Jetzt anmelden
          </Link>
        </p>
      </section>
    </main>
  );
}
