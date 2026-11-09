import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { redirectWithEmail2FAIfNeeded } from "@/lib/admin/postSignInAdmin2FA";
import { repairOversizedMetadataForUser } from "@/lib/auth/repairOversizedMetadata";
import {
  TERMS_ACCEPTANCE_COOKIE,
  TERMS_ACCEPTANCE_VERSION,
  termsAcceptanceMetadata,
} from "@/lib/auth/termsAcceptance";
import { getAppBaseUrlOrigin, isInviteOnlyEnabled, isSupabaseConfigured } from "@/lib/supabase/env";
import {
  acquireOAuthCode,
  completeOAuthCode,
  releaseOAuthCode,
} from "@/lib/supabase/oauthInFlight";
import {
  applyBridgedCookies,
  bridgeOAuthSession,
  peekBridgedOAuthSession,
  pkceVerifierHashFromRequest,
} from "@/lib/supabase/oauthSessionBridge";
import { clearIncomingSupabaseAuthCookies } from "@/lib/supabase/clearAuthCookies";
import { createAuthRouteHandlerClient, createOAuthExchangeClient } from "@/lib/supabase/server";
import {
  createNoStoreRedirect,
  createOAuthSessionPollerHtml,
  createRecoveryHashForwardHtml,
  normalizeNextPath,
  secureCookieOptions,
} from "@/lib/security/authResponses";
import { nonceFromRequest } from "@/lib/security/contentSecurityPolicy";
import { getOrCreateRequestId, logAuthEvent } from "@/lib/security/authObservability";
import {
  buildPasswordRecoveryToken,
  getPasswordRecoveryCookieName,
  PASSWORD_RECOVERY_TTL_SECONDS,
  sessionProvesRecoveryForUser,
} from "@/lib/auth/passwordRecoveryGate";
import { parseCookieHeader } from "@supabase/ssr";
import { PASSWORD_RESET_NEXT } from "@/lib/auth/passwordResetPaths";

type RecoverySessionClient = {
  auth: {
    getClaims: (jwt?: string) => Promise<{
      data?: { claims?: { sub?: string; amr?: unknown } | null } | null;
    }>;
  };
};

function authErrorParam(code?: string) {
  if (code === "flow_state_not_found" || code === "pkce_code_verifier_not_found") {
    return "oauth_state";
  }
  return "auth";
}

function hasTermsAcceptanceCookie(request: Request): boolean {
  return parseCookieHeader(request.headers.get("Cookie") ?? "").some(
    (cookie) => cookie.name === TERMS_ACCEPTANCE_COOKIE && Boolean(cookie.value),
  );
}

async function persistTermsAcceptanceIfPresent(
  request: Request,
  response: NextResponse,
  supabase: Awaited<ReturnType<typeof createAuthRouteHandlerClient>>,
  user: User | null | undefined,
) {
  if (!user?.id || !hasTermsAcceptanceCookie(request)) return;
  const meta = user.user_metadata ?? {};
  if (meta.terms_accepted_at && meta.terms_version === TERMS_ACCEPTANCE_VERSION) {
    response.cookies.set(TERMS_ACCEPTANCE_COOKIE, "", {
      ...secureCookieOptions(request),
      httpOnly: true,
      maxAge: 0,
    });
    return;
  }
  await supabase.auth.updateUser({
    data: {
      ...meta,
      ...termsAcceptanceMetadata(),
    },
  });
  response.cookies.set(TERMS_ACCEPTANCE_COOKIE, "", {
    ...secureCookieOptions(request),
    httpOnly: true,
    maxAge: 0,
  });
}

function finishUrl(appOrigin: string, safeNext: string) {
  return `${appOrigin}/auth/finish?next=${encodeURIComponent(safeNext)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBridgedSession(code: string, pkceVerifierHash: string | null, maxMs: number) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const bridged = peekBridgedOAuthSession(code, pkceVerifierHash);
    if (bridged) return bridged;
    await sleep(200);
  }
  return null;
}

function sessionPollerResponse(
  appOrigin: string,
  postAuthNext: string,
  requestId: string,
  cookieSource?: NextResponse,
  nonce?: string,
) {
  return createOAuthSessionPollerHtml(
    {
      successUrl: `${appOrigin}${postAuthNext}`,
      fallbackUrl: finishUrl(appOrigin, postAuthNext),
      requestId,
      nonce,
    },
    cookieSource,
  );
}

async function hasServerRecoveryProof(opts: {
  userId: string;
  verifiedRecoveryOtp: boolean;
  /** Frisch verifizierte Session (Exchange/OTP) — nie eingehende Request-Cookies. */
  sessionClient?: RecoverySessionClient;
  /** Bereits an bridged.userId gebunden. */
  bridgedRecoveryGranted?: boolean;
}): Promise<boolean> {
  if (!opts.userId) return false;
  if (opts.bridgedRecoveryGranted === true) return true;
  if (!opts.sessionClient) return false;

  if (opts.verifiedRecoveryOtp) {
    try {
      const { data } = await opts.sessionClient.auth.getClaims();
      return data?.claims?.sub === opts.userId;
    } catch {
      return false;
    }
  }

  return sessionProvesRecoveryForUser(opts.sessionClient, opts.userId);
}

function resolvePostAuthNext(safeNext: string, grantedRecovery: boolean) {
  if (grantedRecovery) return PASSWORD_RESET_NEXT;
  // next=/passwort-zuruecksetzen ohne Recovery-Nachweis ist kein Reset-Flow
  if (safeNext === PASSWORD_RESET_NEXT) return "/dashboard";
  return safeNext;
}

async function redirectAfterOAuthSuccess(
  request: Request,
  opts: {
    requestId: string;
    appOrigin: string;
    safeNext: string;
    verifiedRecoveryOtp?: boolean;
    sessionClient?: RecoverySessionClient;
    bridgedRecoveryGranted?: boolean;
    redirectResponse: NextResponse;
    startedAt: number;
    user: User | null | undefined;
    logEvent?: string;
    oauthCode?: string;
  },
) {
  const { requestId, appOrigin, redirectResponse, startedAt, user } = opts;

  const grantedRecovery = user?.id
    ? await hasServerRecoveryProof({
        userId: user.id,
        verifiedRecoveryOtp: opts.verifiedRecoveryOtp === true,
        sessionClient: opts.sessionClient,
        bridgedRecoveryGranted: opts.bridgedRecoveryGranted,
      })
    : false;

  if (opts.oauthCode && user?.id) {
    const pkceHash = pkceVerifierHashFromRequest(request);
    if (pkceHash) {
      bridgeOAuthSession(opts.oauthCode, redirectResponse, user.id, pkceHash, grantedRecovery);
    }
  }

  const postAuthNext = resolvePostAuthNext(opts.safeNext, grantedRecovery);

  if (grantedRecovery && user?.id) {
    redirectResponse.cookies.set(getPasswordRecoveryCookieName(), buildPasswordRecoveryToken({ userId: user.id }), {
      httpOnly: true,
      ...secureCookieOptions(request),
      maxAge: PASSWORD_RECOVERY_TTL_SECONDS,
    });
  }

  if (!grantedRecovery && user?.id && hasTermsAcceptanceCookie(request)) {
    const supabase = await createAuthRouteHandlerClient(redirectResponse);
    await persistTermsAcceptanceIfPresent(request, redirectResponse, supabase, user);
  }

  if (!grantedRecovery && user) {
    const twoFactor = await redirectWithEmail2FAIfNeeded(request, {
      user,
      requestId,
      origin: appOrigin,
      cookieSource: redirectResponse,
      startedAt,
      logEvent: opts.logEvent ?? "oauth_2fa_required",
      next: postAuthNext,
    });
    if (twoFactor) return twoFactor;
  }

  logAuthEvent({
    event: opts.logEvent ?? "oauth_exchange_success",
    requestId,
    userId: user?.id,
    email: user?.email ?? undefined,
    status: 303,
    durationMs: Date.now() - startedAt,
    meta: grantedRecovery ? { recovery: true } : undefined,
  });

  return createOAuthSessionPollerHtml(
    {
      successUrl: `${appOrigin}${postAuthNext}`,
      fallbackUrl: finishUrl(appOrigin, postAuthNext),
      requestId,
      nonce: nonceFromRequest(request),
    },
    redirectResponse,
  );
}

async function finishFromBridge(
  request: Request,
  opts: {
    code: string;
    requestId: string;
    appOrigin: string;
    safeNext: string;
    startedAt: number;
    logEvent: string;
  },
) {
  const bridged = peekBridgedOAuthSession(opts.code, pkceVerifierHashFromRequest(request));
  if (!bridged) return null;

  const redirectResponse = createNoStoreRedirect(
    `${opts.appOrigin}${resolvePostAuthNext(opts.safeNext, bridged.recoveryGranted)}`,
    opts.requestId,
  );
  clearIncomingSupabaseAuthCookies(request, redirectResponse, { preserveCodeVerifier: true });
  applyBridgedCookies(redirectResponse, bridged);
  return redirectAfterOAuthSuccess(request, {
    requestId: opts.requestId,
    appOrigin: opts.appOrigin,
    safeNext: opts.safeNext,
    bridgedRecoveryGranted: bridged.recoveryGranted,
    redirectResponse,
    startedAt: opts.startedAt,
    user: { id: bridged.userId } as User,
    logEvent: opts.logEvent,
    oauthCode: opts.code,
  });
}

export async function handleAuthCallbackGet(request: Request) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const { searchParams, origin } = new URL(request.url);
  const appOrigin = getAppBaseUrlOrigin(origin);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const safeNext = normalizeNextPath(searchParams.get("next"));
  // Nur für Hash-Forward-UX — vergibt keinen Recovery-Cookie und überspringt keine 2FA.
  const preferResetHashForward = type === "recovery" || safeNext === PASSWORD_RESET_NEXT;

  if (!isSupabaseConfigured()) {
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=config`, requestId);
  }
  if (isInviteOnlyEnabled() && type === "signup") {
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=invite_required`, requestId);
  }

  if (tokenHash && type) {
    const redirectResponse = createNoStoreRedirect(
      `${appOrigin}${resolvePostAuthNext(safeNext, type === "recovery")}`,
      requestId,
    );
    const supabase = await createAuthRouteHandlerClient(redirectResponse);
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await repairOversizedMetadataForUser(supabase, user.id, user.user_metadata);
      }
      return redirectAfterOAuthSuccess(request, {
        requestId,
        appOrigin,
        safeNext,
        verifiedRecoveryOtp: type === "recovery",
        sessionClient: supabase,
        redirectResponse,
        startedAt,
        user,
        logEvent: "email_otp_verified",
      });
    }
  }

  if (!code) {
    if (preferResetHashForward) {
      return createRecoveryHashForwardHtml({
        targetUrl: `${appOrigin}${PASSWORD_RESET_NEXT}`,
        fallbackUrl: `${appOrigin}/passwort-vergessen?error=session`,
        requestId,
        nonce: nonceFromRequest(request),
      });
    }
    return createNoStoreRedirect(`${appOrigin}/anmelden?error=auth`, requestId);
  }

  const bridgedEarly = await finishFromBridge(request, {
    code,
    requestId,
    appOrigin,
    safeNext,
    startedAt,
    logEvent: "oauth_bridge_early",
  });
  if (bridgedEarly) return bridgedEarly;

  if (acquireOAuthCode(code) === "wait") {
    logAuthEvent({
      event: "oauth_callback_duplicate_wait",
      requestId,
      status: 200,
      durationMs: Date.now() - startedAt,
    });

    await waitForBridgedSession(code, pkceVerifierHashFromRequest(request), 40_000);
    const fromBridge = await finishFromBridge(request, {
      code,
      requestId,
      appOrigin,
      safeNext,
      startedAt,
      logEvent: "oauth_bridge_after_wait",
    });
    if (fromBridge) return fromBridge;

    const waitNext = resolvePostAuthNext(safeNext, false);
    const waitRedirect = createNoStoreRedirect(`${appOrigin}${waitNext}`, requestId);
    return sessionPollerResponse(appOrigin, waitNext, requestId, waitRedirect, nonceFromRequest(request));
  }

  const provisionalNext = resolvePostAuthNext(safeNext, false);
  const redirectResponse = createNoStoreRedirect(`${appOrigin}${provisionalNext}`, requestId);
  clearIncomingSupabaseAuthCookies(request, redirectResponse, { preserveCodeVerifier: true });
  const supabase = createOAuthExchangeClient(request, redirectResponse);

  try {
    // Always exchange the OAuth code. Never short-circuit on an existing session —
    // that kept a previous admin identity when a different Google account signed in.
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      completeOAuthCode(code);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await repairOversizedMetadataForUser(supabase, user.id, user.user_metadata);
      }
      return redirectAfterOAuthSuccess(request, {
        requestId,
        appOrigin,
        safeNext,
        // Nur Claims der frischen Exchange-Session — nicht Request-Cookies / type= URL.
        sessionClient: supabase,
        redirectResponse,
        startedAt,
        user,
        oauthCode: code,
      });
    }

    const bridgedAfterError = await finishFromBridge(request, {
      code,
      requestId,
      appOrigin,
      safeNext,
      startedAt,
      logEvent: "oauth_bridge_after_exchange_error",
    });
    if (bridgedAfterError) return bridgedAfterError;

    completeOAuthCode(code);

    // oauth_state without a bridge must not fall through to a session poller —
    // leftover cookies from an unrelated account would look like OAuth success.
    logAuthEvent({
      event: "callback_exchange_error",
      level: "warn",
      requestId,
      status: 303,
      durationMs: Date.now() - startedAt,
      meta: { message: error.message, code: error.code },
    });
    const errorPath =
      type === "recovery" || safeNext === PASSWORD_RESET_NEXT
        ? "/passwort-vergessen?error=session"
        : `/anmelden?error=${authErrorParam(error.code)}&detail=${encodeURIComponent(error.code ?? "exchange_failed")}`;
    return createNoStoreRedirect(`${appOrigin}${errorPath}`, requestId);
  } catch (error) {
    releaseOAuthCode(code);
    throw error;
  }
}
