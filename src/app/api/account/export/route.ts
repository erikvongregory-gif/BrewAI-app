import { NextResponse } from "next/server";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { accountExportFileName, collectAccountExport } from "@/lib/compliance/accountExport";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status, headers: NO_STORE });
}

/** Datenexport (Art. 15/20 DSGVO) – nur für den angemeldeten Kontoinhaber selbst. */
export async function GET(req: Request) {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  const ipLimit = await enforceRateLimitPersistent(req, { keyPrefix: "account-export", limit: 10, windowMs: 60_000 });
  if (ipLimit) return ipLimit;

  if (!isSupabaseConfigured()) return jsonError("Supabase ist nicht konfiguriert.", 500);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Nicht angemeldet.", 401, "auth_required");
  if (!(await hasPassedTwoFactor(user))) return jsonError("Zwei-Faktor-Prüfung erforderlich.", 403, "two_factor_required");

  const userLimit = await enforceRateLimitPersistent(
    req,
    { keyPrefix: "account-export:user", limit: 5, windowMs: 60 * 60 * 1000 },
    { identifierParts: [user.id] },
  );
  if (userLimit) return userLimit;

  try {
    const now = new Date();
    const data = await collectAccountExport(user, now);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${accountExportFileName(now)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError("Datenexport konnte nicht erstellt werden. Bitte später erneut versuchen.", 500);
  }
}
