"use client";

import { AuthTransition } from "@/components/ui/auth-transition";
import { useEffect, useState } from "react";
import {
  needsFullOnboardingFlow,
  sanitizeStudioOnboardingState,
} from "@/lib/dashboard/onboarding";

async function serverAuthReady(): Promise<{ ok: boolean; admin2faRequired?: boolean }> {
  try {
    const res = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { authenticated?: boolean; admin2faRequired?: boolean };
    return { ok: Boolean(json.authenticated), admin2faRequired: json.admin2faRequired };
  } catch {
    return { ok: false };
  }
}

async function resolveEntry(preferred: string): Promise<string> {
  if (preferred !== "/dashboard") return preferred;
  try {
    const res = await fetch("/api/dashboard/onboarding", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return preferred;
    const json = (await res.json()) as { state?: unknown };
    if (needsFullOnboardingFlow(sanitizeStudioOnboardingState(json.state))) {
      return "/onboarding";
    }
  } catch {
    /* Fallback: preferred — Middleware fängt Dashboard ggf. ab */
  }
  return preferred;
}

function delayMs(attempt: number) {
  return attempt < 12 ? 120 : attempt < 28 ? 250 : 400;
}

export function AuthFinishClient({ initialNext = "/dashboard" }: { initialNext?: string }) {
  const [message, setMessage] = useState("Anmeldung wird abgeschlossen …");

  useEffect(() => {
    const preferred = initialNext;
    let cancelled = false;

    void (async () => {
      for (let attempt = 0; attempt < 55; attempt += 1) {
        if (cancelled) return;

        const server = await serverAuthReady();
        if (server.ok) {
          const next = server.admin2faRequired
            ? "/dashboard/2fa-email"
            : await resolveEntry(preferred);
          if (cancelled) return;
          window.location.replace(next);
          return;
        }

        if (attempt === 2 || attempt === 8) {
          await fetch("/api/auth/repair-session", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
          }).catch(() => undefined);
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs(attempt)));
      }

      if (!cancelled) {
        setMessage("Session nicht gefunden. Weiter zur Anmeldung …");
        window.setTimeout(() => {
          window.location.replace("/anmelden?error=session_pending");
        }, 800);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialNext]);

  return <AuthTransition message={message} />;
}
