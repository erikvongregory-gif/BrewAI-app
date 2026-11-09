import { NextResponse } from "next/server";
import { enforceRateLimitPersistent, enforceSameOrigin } from "@/lib/security/requestGuards";
import { getOrCreateRequestId } from "@/lib/security/authObservability";
import { withRequestIdJson } from "@/lib/security/authResponses";
import { createAuthRouteHandlerClient } from "@/lib/supabase/server";

function token(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 20 || value.length > 8192 || /\s/.test(value)) return null;
  return value;
}

export async function POST(request: Request) {
  const requestId = getOrCreateRequestId(request);
  const originError = enforceSameOrigin(request);
  if (originError) return originError;
  const rateError = await enforceRateLimitPersistent(request, {
    keyPrefix: "auth-adopt-session",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (rateError) return rateError;

  const body = (await request.json().catch(() => null)) as {
    access_token?: unknown;
    refresh_token?: unknown;
  } | null;
  const accessToken = token(body?.access_token);
  const refreshToken = token(body?.refresh_token);
  if (!accessToken || !refreshToken) {
    return withRequestIdJson({ error: "Session ungültig." }, requestId, { status: 400 });
  }

  const response = withRequestIdJson({ ok: true }, requestId);
  const supabase = await createAuthRouteHandlerClient(response);
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    return withRequestIdJson({ error: "Session ungültig." }, requestId, { status: 401 });
  }
  return response;
}
