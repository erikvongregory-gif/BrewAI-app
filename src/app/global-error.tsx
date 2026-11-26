"use client";

import { useEffect } from "react";

// Ersetzt das Root-Layout, daher ohne globale Styles: Inline-Stile im hellen Bestandsdesign (Akzent #C7691E).
const button = {
  font: "inherit",
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  textDecoration: "none",
} as const;

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#ffffff",
          color: "#18181b",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>BrewAI – Fehler</title>
        <div
          role="alert"
          style={{ maxWidth: 440, margin: 24, padding: 24, border: "1px solid #e4e4e7", borderRadius: 12 }}
        >
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Da ist etwas schiefgelaufen</h1>
          <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 16px" }}>
            BrewAI konnte nicht geladen werden. Lade die Seite neu. Wenn der Fehler bleibt, melde dich ab und wieder an.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => retry()} style={{ ...button, background: "#C7691E", color: "#fff", border: 0 }}>
              Neu laden
            </button>
            {/* Harte Navigation: Das Root-Layout ist kaputt, Client-Routing hilft hier nicht. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/dashboard" style={{ ...button, border: "1px solid #e4e4e7", color: "inherit" }}>
              Zur Übersicht
            </a>
            <form method="post" action="/auth/signout" style={{ margin: 0 }}>
              <button type="submit" style={{ ...button, background: "transparent", border: 0, color: "inherit" }}>
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
}
