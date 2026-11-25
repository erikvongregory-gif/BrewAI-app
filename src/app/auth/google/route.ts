import { getAppBaseUrlOrigin, isInviteOnlyEnabled, isSupabaseConfigured } from "@/lib/supabase/env";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { createHtmlRedirect, createNoStoreRedirect, normalizeNextPath, secureCookieOptions } from "@/lib/security/authResponses";
import { nonceFromRequest, scriptOpenTag } from "@/lib/security/contentSecurityPolicy";
import { getOrCreateRequestId } from "@/lib/security/authObservability";
import { purgeStaleAuthSession } from "@/lib/supabase/clearAuthCookies";
import {
  isTruthyTermsAcceptance,
  TERMS_ACCEPTANCE_COOKIE,
  TERMS_ACCEPTANCE_VERSION,
} from "@/lib/auth/termsAcceptance";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function createGooglePrepareHtml(nextPath: string, requestId: string, termsAccepted: boolean, nonce?: string) {
  const termsQuery = termsAccepted ? "&terms_accepted=1" : "";
  const startUrl = `/auth/google?start=1&next=${encodeURIComponent(nextPath)}${termsQuery}`;
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><title>Google-Anmeldung</title></head><body><p style="font-family:system-ui,sans-serif;color:#6b6560">Anmeldung wird vorbereitet …</p>${scriptOpenTag(nonce)}
(function(){var start=${JSON.stringify(startUrl)};fetch("/auth/clear-session?json=1",{credentials:"same-origin",cache:"no-store"}).catch(function(){}).finally(function(){location.replace(start)})})();</script></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      "x-request-id": requestId,
    },
  });
}

export async function GET(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const { origin, searchParams } = new URL(request.url);
  const appOrigin = getAppBaseUrlOrigin(origin);
  const safeNext = normalizeNextPath(searchParams.get("next"));
  const termsAccepted = isTruthyTermsAcceptance(searchParams.get("terms_accepted"));
  // Always include next so a Site-URL fallback (?code= on /) cannot be
  // misclassified as password recovery by authEntryRedirect defaults.
  const redirectTo = `${appOrigin}/auth/callback?next=${encodeURIComponent(safeNext)}`;

  if (!isSupabaseConfigured()) {
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=config`, requestId);
  }
  if (isInviteOnlyEnabled()) {
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=invite_only`, requestId);
  }

  if (searchParams.get("start") !== "1") {
    return createGooglePrepareHtml(safeNext, requestId, termsAccepted, nonceFromRequest(request));
  }

  const cookieJar = createNoStoreRedirect(`${appOrigin}/anmelden`, requestId);
  if (termsAccepted) {
    cookieJar.cookies.set(TERMS_ACCEPTANCE_COOKIE, TERMS_ACCEPTANCE_VERSION, {
      ...secureCookieOptions(request),
      httpOnly: true,
      maxAge: 60 * 20,
    });
  }

  const supabase = createRouteHandlerClient(request, cookieJar);
  await purgeStaleAuthSession(request, cookieJar, supabase, { allSupabase: true });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });

  if (error || !data.url) {
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=google`, requestId);
  }

  return createHtmlRedirect(data.url, requestId, cookieJar, nonceFromRequest(request));
}
