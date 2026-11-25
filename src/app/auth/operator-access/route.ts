import { NextResponse } from "next/server";
import {
  isWaitlistBypassConfigured,
  isWaitlistBypassTokenValid,
  setWaitlistBypassCookie,
} from "@/lib/auth/waitlistBypass";
import { enforceRateLimitPersistent } from "@/lib/security/requestGuards";
import { getAppBaseUrlOrigin } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const origin = getAppBaseUrlOrigin(new URL(request.url).origin);
  // Der Token kann (Fallback) dem Owner-2FA-Backup-Code entsprechen: Online-Rateversuche begrenzen.
  const rateError = await enforceRateLimitPersistent(request, {
    keyPrefix: "auth-operator-access",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (rateError) return rateError;
  const token = new URL(request.url).searchParams.get("token");

  if (!isWaitlistBypassConfigured() || !isWaitlistBypassTokenValid(token)) {
    const denied = NextResponse.redirect(`${origin}/anmelden?waitlist=1`, 307);
    denied.headers.set("Cache-Control", "no-store, max-age=0");
    return denied;
  }

  const response = NextResponse.redirect(`${origin}/anmelden`, 307);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  // Token nicht als Referer an Folgeseiten weitergeben.
  response.headers.set("Referrer-Policy", "no-referrer");
  return setWaitlistBypassCookie(response);
}
