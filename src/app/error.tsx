"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { submitSignOut } from "@/lib/auth/submitSignOut";

/**
 * Bekannte Workspace-Meldungen (src/lib/dashboard/workspace.ts). Nur diese werden übersetzt angezeigt,
 * nie der Rohtext anderer Fehler. Hinweis: In Produktion kommen Server-Fehler ohne Text an
 * (nur digest); dort greift der allgemeine Text, außer die Seite rendert den Zustand selbst.
 */
const KNOWN_ERRORS: Array<{ match: RegExp; title: string; text: string }> = [
  {
    match: /Teamabo nicht aktiv/i,
    title: "Teamzugang pausiert",
    text: "Das Abo deines Teaminhabers ist nicht aktiv. Sobald der Inhaber sein Abo verlängert, kannst du sofort weiterarbeiten.",
  },
  {
    match: /Teamplatz/i,
    title: "Kein freier Teamplatz",
    text: "Im aktuellen Tarif deines Teams ist gerade kein Platz für dich frei. Bitte den Inhaber, den Tarif anzupassen.",
  },
  {
    match: /zur Löschung vorgemerkt|Teamkonto nicht gefunden/i,
    title: "Konto nicht verfügbar",
    text: "Dieses Konto ist zur Löschung vorgemerkt oder nicht mehr verfügbar. Melde dich ab oder schreib uns, wenn das nicht stimmt.",
  },
];

function describe(error: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return {
      title: "Keine Verbindung",
      text: "Prüfe deine Internetverbindung und lade die Seite danach neu.",
    };
  }
  const message = error instanceof Error ? error.message : "";
  const known = KNOWN_ERRORS.find((entry) => entry.match.test(message));
  if (known) return known;
  return {
    title: "Da ist etwas schiefgelaufen",
    text: "Dieser Bereich konnte nicht geladen werden. Lade ihn neu. Wenn der Fehler bleibt, melde dich ab und wieder an.",
  };
}

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const { title, text } = describe(error);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";

  return (
    <div role="alert" className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm my-10">
      <h1 className="font-semibold text-xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Neu laden</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Zur Übersicht</Link>
        </Button>
        <Button variant="ghost" onClick={() => submitSignOut()}>
          Abmelden
        </Button>
      </div>
      {digest ? <p className="text-muted-foreground text-xs">Fehlercode: {digest}</p> : null}
    </div>
  );
}
