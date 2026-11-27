import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { enforceSameOrigin } from "@/lib/security/requestGuards";
import { isInstagramOAuthConfigured } from "@/lib/brand/instagram-config";
import {
  toPublicInstagramConnection,
} from "@/lib/brand/instagram-connection-store";
import { loadInstagramConnectionForUser } from "@/lib/brand/instagram-persist-connection";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

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

  const connection = await loadInstagramConnectionForUser({
    userId: user.id,
    userMetadata: user.user_metadata,
  });

  return NextResponse.json({
    ok: true,
    configured: isInstagramOAuthConfigured(),
    ...toPublicInstagramConnection(connection),
  });
}
