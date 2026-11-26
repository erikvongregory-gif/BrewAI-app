import { workspaceResourceUser, workspaceErrorResponse } from "@/lib/dashboard/workspace";
import { hasPassedTwoFactor } from "@/lib/auth/twoFactorSession";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createRouteHandlerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, getAppBaseUrlOrigin } from "@/lib/supabase/env";
import { exchangeCodeForUserAccessToken, resolveInstagramBusinessConnection } from "@/lib/brand/instagram-graph";
import { isInstagramOAuthConfigured } from "@/lib/brand/instagram-config";
import {
  instagramOAuthCookieName,
  parseInstagramOAuthState,
  sanitizeReturnTo,
} from "@/lib/brand/instagram-oauth-state";
import { persistInstagramConnectionForUser } from "@/lib/brand/instagram-persist-connection";

export const runtime = "nodejs";

function buildReturnUrl(appOrigin: string, returnTo: string, query: Record<string, string>): string {
  const url = new URL(returnTo.startsWith("/") ? returnTo : "/dashboard", appOrigin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function GET(req: Request) {
  const appOrigin = getAppBaseUrlOrigin(new URL(req.url).origin);

  if (!isSupabaseConfigured() || !isInstagramOAuthConfigured()) {
    return NextResponse.redirect(buildReturnUrl(appOrigin, "/dashboard/brand", { instagram: "config" }));
  }

  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !(await hasPassedTwoFactor(user))) return NextResponse.json({ error: "Zwei-Faktor-Prüfung erforderlich.", code: "two_factor_required" }, { status: 403 });
  if (user) { try { user = await workspaceResourceUser(user, true); } catch (e) { return workspaceErrorResponse(e); } }
  if (!user) {
    return NextResponse.redirect(`${appOrigin}/anmelden?next=${encodeURIComponent("/dashboard/brand?openBrand=1")}`);
  }

  const { searchParams } = new URL(req.url);
  const oauthError = searchParams.get("error_description") ?? searchParams.get("error");
  const cookieStore = await cookies();
  const cookieState = parseInstagramOAuthState(cookieStore.get(instagramOAuthCookieName())?.value);
  const returnTo = sanitizeReturnTo(cookieState?.returnTo ?? "/dashboard/brand?openBrand=1&brandInput=instagram");

  if (oauthError) {
    const redirect = NextResponse.redirect(buildReturnUrl(appOrigin, returnTo, { instagram: "denied" }));
    redirect.cookies.delete(instagramOAuthCookieName());
    return redirect;
  }

  const code = searchParams.get("code")?.trim();
  const state = searchParams.get("state")?.trim();
  if (!code || !state || !cookieState || cookieState.state !== state || cookieState.userId !== user.id) {
    const redirect = NextResponse.redirect(buildReturnUrl(appOrigin, returnTo, { instagram: "state" }));
    redirect.cookies.delete(instagramOAuthCookieName());
    return redirect;
  }

  try {
    const token = await exchangeCodeForUserAccessToken({ appOrigin, code });
    const connection = await resolveInstagramBusinessConnection(token.accessToken);
    if (token.expiresIn) {
      connection.tokenExpiresAt = new Date(Date.now() + token.expiresIn * 1000).toISOString();
    }

    await persistInstagramConnectionForUser({
      userId: user.id,
      userMetadata: user.user_metadata,
      connection,
    });

    const response = NextResponse.redirect(buildReturnUrl(appOrigin, returnTo, { instagram: "connected" }));
    response.cookies.delete(instagramOAuthCookieName());
    const routeClient = createRouteHandlerClient(req, response);
    await routeClient.auth.refreshSession().catch(() => undefined);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram-Verbindung fehlgeschlagen.";
    const redirect = NextResponse.redirect(
      buildReturnUrl(appOrigin, returnTo, { instagram: "error", instagramError: message.slice(0, 180) }),
    );
    redirect.cookies.delete(instagramOAuthCookieName());
    return redirect;
  }
}
