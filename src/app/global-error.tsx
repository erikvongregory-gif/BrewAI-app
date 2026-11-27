"use client";

import { useEffect } from "react";
import { EvglabMark } from "@/components/studio/evglab-mark";

// Ersetzt das Root-Layout, daher ohne globale Styles. Die Inline-Werte spiegeln StatusScreen
// (src/components/ui/status-screen.tsx): helles Theme, Karte rounded-xl, Buttons rounded-lg, Primär = --primary.
const C = {
  bg: "#ffffff",
  fg: "#0a0a0a",
  muted: "#525252",
  border: "#e5e5e5",
  primary: "#171717",
  primaryFg: "#fafafa",
};
const button = {
  font: "inherit",
  fontSize: 14,
  fontWeight: 500,
  lineHeight: "20px",
  borderRadius: 10,
  padding: "8px 14px",
  cursor: "pointer",
  textDecoration: "none",
  textAlign: "center",
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
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          padding: "40px 16px",
          boxSizing: "border-box",
          background: C.bg,
          color: C.fg,
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <title>BrewAI – Fehler</title>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <EvglabMark size={22} />
          <span style={{ fontWeight: 600, fontSize: 18 }}>BrewAI</span>
        </div>
        <div
          role="alert"
          style={{
            width: "100%",
            maxWidth: 448,
            boxSizing: "border-box",
            padding: 24,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Da ist etwas schiefgelaufen</h1>
          <p style={{ fontSize: 14, color: C.muted, margin: "0 0 16px" }}>
            BrewAI konnte nicht geladen werden. Lade die Seite neu. Wenn der Fehler bleibt, melde dich ab und wieder an.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => retry()} style={{ ...button, background: C.primary, color: C.primaryFg, border: 0 }}>
              Neu laden
            </button>
            {/* Harte Navigation: Das Root-Layout ist kaputt, Client-Routing hilft hier nicht. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/dashboard" style={{ ...button, border: `1px solid ${C.border}`, color: "inherit" }}>
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
