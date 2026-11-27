import { type NextResponse } from "next/server";
import { buildRecoveryConfirmUrl, PASSWORD_RESET_NEXT } from "@/lib/auth/passwordResetPaths";
import { sendPasswordResetEmail } from "@/lib/email/passwordReset";
import {
  extractResendSandboxAllowedEmail,
  getResendConfig,
  mapResendFailureToCode,
} from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppBaseUrlOrigin, isSupabaseConfigured } from "@/lib/supabase/env";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { getOrCreateRequestId, logAuthEvent } from "@/lib/security/authObservability";
import { createNoStoreRedirect } from "@/lib/security/authResponses";
import { buildCompositeIdentifier, enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";

/**
 * Link auf die eigene Bestätigungsseite statt auf Supabases Verify-URL: Mail-Scanner, die Links vorab öffnen,
 * verbrauchen den Einmal-Token sonst, bevor der Nutzer klickt (Ergebnis: otp_expired, Login-Seite ohne Hinweis).
 * Erst der Klick auf der Seite löst /auth/callback?token_hash=… (verifyOtp) aus.
 */
async function generateRecoveryLink(email: string, redirectTo: string, origin: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  const hashedToken = data?.properties?.hashed_token;
  if (error || !hashedToken) {
    throw new Error(error?.message ?? "recovery_link_failed");
  }
  return buildRecoveryConfirmUrl(origin, hashedToken);
}

async function sendViaSupabase(
  request: Request,
  redirectResponse: NextResponse,
  email: string,
  redirectTo: string,
) {
  const supabase = createRouteHandlerClient(request, redirectResponse);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

function isSupabaseRateLimitError(message: string) {
  return /only request this after/i.test(message);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = getOrCreateRequestId(request);
  const origin = getAppBaseUrlOrigin(new URL(request.url).origin);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;

  if (!isSupabaseConfigured()) {
    return createNoStoreRedirect(`${origin}/passwort-vergessen?error=config`, requestId);
  }

  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const identifier = buildCompositeIdentifier(request, [email]);
  const rateError = await enforceRateLimitPersistent(
    request,
    {
      keyPrefix: "auth-reset-request",
      limit: 5,
      windowMs: 60_000,
    },
    { identifier },
  );
  if (rateError) return rateError;

  if (!email) {
    return createNoStoreRedirect(`${origin}/passwort-vergessen?error=missing`, requestId);
  }

  const redirectResponse = createNoStoreRedirect(`${origin}/passwort-vergessen?notice=sent`, requestId);
  const redirectTo = `${origin}${PASSWORD_RESET_NEXT}`;
  const resendReady = Boolean(getResendConfig() && process.env.SUPABASE_SERVICE_ROLE_KEY);
  let recoveryLinkCreated = false;
  let lastResendError: string | null = null;

  if (resendReady) {
    let actionLink: string | null = null;
    try {
      actionLink = await generateRecoveryLink(email, redirectTo, origin);
      recoveryLinkCreated = true;
      await sendPasswordResetEmail({ to: email, actionLink });
      logAuthEvent({
        event: "reset_password_request_sent",
        requestId,
        email,
        status: 303,
        durationMs: Date.now() - startedAt,
        meta: { channel: "resend" },
      });
      return redirectResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      lastResendError = message;
      if (process.env.NODE_ENV === "development" && actionLink) {
        console.info(`[dev] Passwort-Reset-Link für ${email}: ${actionLink}`);
      }
      logAuthEvent({
        event: "reset_password_request_resend_failed",
        level: "warn",
        requestId,
        email,
        status: 303,
        durationMs: Date.now() - startedAt,
        meta: { reason: message, recoveryLinkCreated },
      });
    }
  }

  if (!recoveryLinkCreated) {
    try {
      await sendViaSupabase(request, redirectResponse, email, redirectTo);
      logAuthEvent({
        event: "reset_password_request_sent",
        requestId,
        email,
        status: 303,
        durationMs: Date.now() - startedAt,
        meta: { channel: resendReady ? "supabase_fallback" : "supabase" },
      });
      return redirectResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      logAuthEvent({
        event: "reset_password_request_failed",
        level: "warn",
        requestId,
        email,
        status: 303,
        durationMs: Date.now() - startedAt,
        meta: { reason: message },
      });

      const errorCode = isSupabaseRateLimitError(message)
        ? "reset_rate_limited"
        : !resendReady && !process.env.SUPABASE_SERVICE_ROLE_KEY
          ? "email_config"
          : lastResendError
            ? mapResendFailureToCode(lastResendError)
            : "email_failed";

      return createNoStoreRedirect(`${origin}/passwort-vergessen?error=${errorCode}`, requestId);
    }
  }

  const errorCode = lastResendError ? mapResendFailureToCode(lastResendError) : "email_failed";
  const params = new URLSearchParams({ error: errorCode });
  const allowedEmail = lastResendError ? extractResendSandboxAllowedEmail(lastResendError) : null;
  if (allowedEmail) params.set("detail", allowedEmail);
  return createNoStoreRedirect(`${origin}/passwort-vergessen?${params.toString()}`, requestId);
}
