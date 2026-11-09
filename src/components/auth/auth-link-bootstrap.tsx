"use client";

import { useEffect } from "react";
import { persistHashSession } from "@/lib/supabase/persistHashSession";
import { resolveAuthCallbackRedirect } from "@/lib/supabase/authEntryRedirect";

/** E-Mail-Auth-Links auf /anmelden (code, Hash, Recovery-Event) abfangen. */
export function AuthLinkBootstrap({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  useEffect(() => {
    const callback = resolveAuthCallbackRedirect(searchParams);
    if (callback) {
      window.location.replace(callback);
      return;
    }

    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    let cancelled = false;
    void (async () => {
      const ok = await persistHashSession();
      if (cancelled || !ok) return;
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      if (params.get("type") === "recovery") {
        window.location.replace("/passwort-zuruecksetzen");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return null;
}
