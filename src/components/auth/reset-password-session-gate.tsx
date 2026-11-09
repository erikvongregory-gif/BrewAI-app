"use client";

import { useEffect, useState } from "react";
import {
  PasswordResetLoading,
  ResetPasswordPage,
} from "@/components/ui/password-reset-pages";
import { persistHashSession } from "@/lib/supabase/persistHashSession";

type Props = {
  notice?: string;
  error?: string;
};

async function serverHasUser(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return false;
    const json = (await res.json()) as { authenticated?: boolean };
    return Boolean(json.authenticated);
  } catch {
    return false;
  }
}

export function ResetPasswordSessionGate({ notice, error }: Props) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (await serverHasUser()) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        await persistHashSession();

        const search = new URLSearchParams(window.location.search);
        const code = search.get("code");
        if (code) {
          window.location.replace(
            `/auth/callback?code=${encodeURIComponent(code)}&type=recovery&next=${encodeURIComponent("/passwort-zuruecksetzen")}`,
          );
          return;
        }

        for (let attempt = 0; attempt < 15; attempt += 1) {
          if (cancelled) break;
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (await serverHasUser()) {
            if (!cancelled) setReady(true);
            return;
          }
        }

        if (!cancelled) setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    if (typeof window !== "undefined") {
      window.location.replace("/passwort-vergessen?error=session");
    }
    return <PasswordResetLoading message="Link ungültig — weiter …" />;
  }

  if (!ready) {
    return <PasswordResetLoading message="Passwort-Reset wird vorbereitet …" />;
  }

  return <ResetPasswordPage notice={notice} error={error} />;
}
