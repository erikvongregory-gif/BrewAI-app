"use client";

import { useEffect, useState } from "react";
import { AuthTransition } from "@/components/ui/auth-transition";
import { resolveAuthCallbackRedirect } from "@/lib/supabase/authEntryRedirect";
import { persistHashSession } from "@/lib/supabase/persistHashSession";

function hasRecoveryHash(hash: string): boolean {
  if (!hash || hash.length < 2) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.has("access_token") && params.get("type") === "recovery";
}

async function bootstrapRecoveryFromHash(): Promise<boolean> {
  if (!hasRecoveryHash(window.location.hash)) return false;
  return persistHashSession();
}

export function AuthLandingRouter({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [message, setMessage] = useState("Deine Anmeldung wird vorbereitet …");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (hasRecoveryHash(window.location.hash)) {
        setMessage("Passwort-Reset wird vorbereitet …");
        const ok = await bootstrapRecoveryFromHash();
        if (cancelled) return;
        if (ok) {
          window.location.replace("/passwort-zuruecksetzen");
          return;
        }
      }

      const callback = resolveAuthCallbackRedirect(searchParams);
      if (callback) {
        window.location.replace(callback);
        return;
      }

      const qs = new URLSearchParams();
      for (const [key, raw] of Object.entries(searchParams)) {
        if (raw === undefined) continue;
        const vals = Array.isArray(raw) ? raw : [raw];
        for (const v of vals) qs.append(key, v);
      }
      const suffix = qs.toString();
      window.location.replace(suffix ? `/anmelden?${suffix}` : "/anmelden");
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return <AuthTransition message={message} />;
}
