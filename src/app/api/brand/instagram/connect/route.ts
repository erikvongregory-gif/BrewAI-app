import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, getAppBaseUrlOrigin } from "@/lib/supabase/env";
import { enforceSameOrigin } from "@/lib/security/requestGuards";
import { buildInstagramOAuthUrl } from "@/lib/brand/instagram-graph";
import { isInstagramOAuthConfigured } from "@/lib/brand/instagram-config";
import {
  createInstagramOAuthState,
  instagramOAuthCookieName,
  sanitizeReturnTo,
  serializeInstagramOAuthState,
} from "@/lib/brand/instagram-oauth-state";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const originError = enforceSameOrigin(req);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase ist nicht konfiguriert." }, { status: 500 });
  }
  if (!isInstagramOAuthConfigured()) {
    return NextResponse.json(
      { error: "Instagram-Verbindung ist noch nicht konfiguriert (META_APP_ID / META_APP_SECRET)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch (e) { return workspaceErrorResponse(e); } }
  if (!user) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo") ?? "/dashboard/brand?openBrand=1&brandInput=instagram");
  const appOrigin = getAppBaseUrlOrigin(new URL(req.url).origin);
  const oauthState = createInstagramOAuthState(user.id, returnTo);
  const redirect = NextResponse.redirect(buildInstagramOAuthUrl({ appOrigin, state: oauthState.state }));

  redirect.cookies.set(instagramOAuthCookieName(), serializeInstagramOAuthState(oauthState), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return redirect;
}
