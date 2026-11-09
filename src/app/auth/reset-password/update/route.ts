import { getAppBaseUrlOrigin, isSupabaseConfigured } from "@/lib/supabase/env";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateRequestId, logAuthEvent } from "@/lib/security/authObservability";
import { createNoStoreRedirect, secureCookieOptions } from "@/lib/security/authResponses";
import { buildCompositeIdentifier, enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import {
  getPendingCookieName,
  getTrustedDeviceCookieName,
  getVerifiedCookieName,
} from "@/lib/admin/emailTwoFactor";
import {
  getPasswordRecoveryCookieName,
  isValidPasswordRecoveryToken,
  nextPasswordEpoch,
  sessionHasRecoveryAmr,
} from "@/lib/auth/passwordRecoveryGate";
import { parseCookieHeader } from "@supabase/ssr";

function readNamedCookie(request: Request, name: string): string | null {
  for (const cookie of parseCookieHeader(request.headers.get("Cookie") ?? "")) {
    if (cookie.name === name) return cookie.value || null;
  }
  return null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const origin = getAppBaseUrlOrigin(new URL(request.url).origin);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return createNoStoreRedirect(`${origin}/passwort-zuruecksetzen?error=config`, requestId);
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const identifier = buildCompositeIdentifier(request, ["update"]);
  const rateError = await enforceRateLimitPersistent(
    request,
    {
      keyPrefix: "auth-reset-update",
      limit: 8,
      windowMs: 60_000,
    },
    { identifier },
  );
  if (rateError) return rateError;

  if (!password || password.length < 8) {
    return createNoStoreRedirect(`${origin}/passwort-zuruecksetzen?error=weak`, requestId);
  }
  if (password !== passwordConfirm) {
    return createNoStoreRedirect(`${origin}/passwort-zuruecksetzen?error=mismatch`, requestId);
  }

  const redirectResponse = createNoStoreRedirect(`${origin}/anmelden?notice=password_updated`, requestId);
  const supabase = createRouteHandlerClient(request, redirectResponse);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return createNoStoreRedirect(`${origin}/passwort-vergessen?error=session`, requestId);
  }

  const recoveryCookie = readNamedCookie(request, getPasswordRecoveryCookieName());
  const hasRecoveryCookie = isValidPasswordRecoveryToken(recoveryCookie, user.id);
  const hasRecoveryAmr = await sessionHasRecoveryAmr(supabase, user.id);
  if (!hasRecoveryCookie && !hasRecoveryAmr) {
    logAuthEvent({
      event: "reset_password_update_denied",
      level: "warn",
      requestId,
      userId: user.id,
      email: user.email,
      status: 303,
      durationMs: Date.now() - startedAt,
      meta: { reason: "missing_recovery_proof" },
    });
    return createNoStoreRedirect(`${origin}/passwort-vergessen?error=session`, requestId);
  }

  const passwordEpoch = nextPasswordEpoch();
  // Zuerst serverseitig in app_metadata: user_metadata ist für den Nutzer selbst schreibbar und darf
  // Trusted Devices nicht wieder gültig machen. Schlägt das fehl, bleibt das Passwort unverändert.
  const { error: epochError } = await createAdminClient().auth.admin.updateUserById(user.id, {
    app_metadata: { password_epoch: passwordEpoch },
  });
  if (epochError) {
    logAuthEvent({
      event: "reset_password_update_failed",
      level: "warn",
      requestId,
      userId: user.id,
      email: user.email,
      status: 303,
      durationMs: Date.now() - startedAt,
      meta: { reason: "password_epoch_update_failed" },
    });
    return createNoStoreRedirect(`${origin}/passwort-zuruecksetzen?error=auth`, requestId);
  }
  const { error } = await supabase.auth.updateUser({
    password,
    data: {
      ...(user.user_metadata ?? {}),
      password_epoch: passwordEpoch,
      password_changed_at: new Date(passwordEpoch).toISOString(),
    },
  });
  if (error) {
    logAuthEvent({
      event: "reset_password_update_failed",
      level: "warn",
      requestId,
      userId: user.id,
      email: user.email,
      status: 303,
      durationMs: Date.now() - startedAt,
      meta: { reason: error.message },
    });
    return createNoStoreRedirect(`${origin}/passwort-zuruecksetzen?error=auth`, requestId);
  }

  await supabase.auth.signOut();

  const cookieOptions = secureCookieOptions(request);
  for (const name of [
    getPasswordRecoveryCookieName(),
    getTrustedDeviceCookieName(),
    getVerifiedCookieName(),
    getPendingCookieName(),
  ]) {
    redirectResponse.cookies.set(name, "", {
      httpOnly: true,
      ...cookieOptions,
      maxAge: 0,
    });
  }

  logAuthEvent({
    event: "reset_password_update_success",
    requestId,
    userId: user.id,
    email: user.email,
    status: 303,
    durationMs: Date.now() - startedAt,
  });

  return redirectResponse;
}
