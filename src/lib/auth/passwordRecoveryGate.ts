import crypto from "crypto";

/**
 * Kurzes Fenster nach Recovery-Link: erlaubt Passwortänderung ohne App-2FA.
 * Eine normale Erstfaktor-Sitzung reicht allein nicht.
 */
const PASSWORD_RECOVERY_COOKIE = "evglab_password_recovery";
export const PASSWORD_RECOVERY_TTL_SECONDS = 15 * 60;

const PURPOSE_PASSWORD_RECOVERY = "password_recovery" as const;

type RecoveryPayload = {
  purpose: typeof PURPOSE_PASSWORD_RECOVERY;
  userId: string;
  expiresAt: number;
};

function getSecret() {
  const configured = process.env.ADMIN_2FA_SECRET || process.env.NEXTAUTH_SECRET;
  if (!configured || configured.trim().length < 32) {
    throw new Error("ADMIN_2FA_SECRET (oder NEXTAUTH_SECRET) fehlt oder ist zu kurz (min. 32 Zeichen).");
  }
  return configured;
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("base64url");
}

function encodeSigned<T extends object>(payload: T) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${raw}.${sign(raw)}`;
}

/** Zeitkonstanter Vergleich der Signatur (kein Abbruch beim ersten abweichenden Zeichen). */
function signatureMatches(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function decodeSigned<T extends object>(token?: string | null): T | null {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature) return null;
  if (!signatureMatches(sign(raw), signature)) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function getPasswordRecoveryCookieName() {
  return PASSWORD_RECOVERY_COOKIE;
}

export function buildPasswordRecoveryToken(input: { userId: string; ttlSeconds?: number }) {
  const ttl = Math.max(input.ttlSeconds ?? PASSWORD_RECOVERY_TTL_SECONDS, 60);
  const payload: RecoveryPayload = {
    purpose: PURPOSE_PASSWORD_RECOVERY,
    userId: input.userId,
    expiresAt: Date.now() + ttl * 1000,
  };
  return encodeSigned(payload);
}

export function isValidPasswordRecoveryToken(token: string | null | undefined, userId: string) {
  const payload = decodeSigned<RecoveryPayload>(token);
  if (!payload || payload.purpose !== PURPOSE_PASSWORD_RECOVERY) return false;
  if (payload.userId !== userId) return false;
  if (Date.now() > payload.expiresAt) return false;
  return true;
}

function parseEpoch(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

/**
 * password_epoch — erhöht sich bei Passwortwechsel und entwertet Trusted Devices.
 * Maßgeblich ist `app_metadata` (nur serverseitig schreibbar). `user_metadata` kann jeder angemeldete
 * Nutzer mit dem öffentlichen Anon-Key selbst ändern und dient nur noch als Altwert für Konten, deren
 * Passwort seit der Umstellung nicht geändert wurde.
 */
export function readPasswordEpoch(
  user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined,
): number {
  return parseEpoch(user?.app_metadata?.password_epoch) ?? parseEpoch(user?.user_metadata?.password_epoch) ?? 0;
}

export function nextPasswordEpoch(): number {
  return Date.now();
}

function amrIncludesRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry) => {
    if (typeof entry === "string") return entry === "recovery";
    if (entry && typeof entry === "object" && "method" in entry) {
      return (entry as { method?: string }).method === "recovery";
    }
    return false;
  });
}

type ClaimsClient = {
  auth: {
    getClaims: (jwt?: string) => Promise<{
      data?: { claims?: { sub?: string; amr?: unknown } | null } | null;
    }>;
  };
};

/**
 * Recovery nur aus derselben Session: claims.sub muss userId sein und AMR
 * „recovery“ enthalten. Verhindert Cross-Account-Übernahme alter Cookies.
 */
export async function sessionProvesRecoveryForUser(
  supabase: ClaimsClient,
  userId: string,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims || claims.sub !== userId) return false;
    return amrIncludesRecovery(claims.amr);
  } catch {
    return false;
  }
}

/** Alias — immer mit Ziel-Nutzer-ID aufrufen. */
export async function sessionHasRecoveryAmr(
  supabase: ClaimsClient,
  userId: string,
): Promise<boolean> {
  return sessionProvesRecoveryForUser(supabase, userId);
}
