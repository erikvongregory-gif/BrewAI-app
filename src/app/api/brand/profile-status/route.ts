import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getDashboardMetadata } from "@/lib/dashboard/metadata";
import { sanitizeDashboardSettings } from "@/lib/dashboard/settingsPayload";

export const runtime = "nodejs";

/** Liest Markenprofil-Status direkt aus Supabase (nicht aus stale JWT). */
export async function GET(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, false); } catch (e) { return workspaceErrorResponse(e); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const expectedName = new URL(req.url).searchParams.get("breweryName")?.trim() ?? "";

  try {
    const admin = createAdminClient();
    const { data: adminUser } = await admin.auth.admin.getUserById(user.id);
    const settings = sanitizeDashboardSettings(getDashboardMetadata(adminUser?.user?.user_metadata).settings);

    const matches =
      settings.brandProfileMode === "guided" &&
      (!expectedName || settings.breweryName.trim() === expectedName);

    return NextResponse.json({
      ok: true,
      saved: matches,
      settings: matches ? settings : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Status konnte nicht gelesen werden.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
