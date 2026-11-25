import crypto from "crypto";
import type { NextResponse } from "next/server";

export const WAITLIST_BYPASS_COOKIE = "brewai_waitlist_bypass";
const BYPASS_TTL_SECONDS = 60 * 60 * 24 * 30;

type BypassPayload = {
  expiresAt: number;
};

function getBypassSecret(): string | null {
  const configured =
    process.env.LOGIN_WAITLIST_BYPASS_SECRET?.trim() ||
    process.env.OWNER_2FA_BACKUP_CODE?.trim();
  if (!configured || configured.length < 8) return null;
  return configured;
}

function sign(raw: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(raw).digest("base64url");
}

function encodeSignedPayload(payload: BypassPayload, secret: string) {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${raw}.${sign(raw, secret)}`;
}

function decodeSignedPayload(token: string | undefined | null, secret: string): BypassPayload | null {
  if (!token) return null;
  const [raw, signature] = token.split(".");
  if (!raw || !signature || !tokensEqual(sign(raw, secret), signature)) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as BypassPayload;
  } catch {
    return null;
  }
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function isWaitlistBypassConfigured(): boolean {
  return Boolean(getBypassSecret());
}

export function isWaitlistBypassTokenValid(token: string | null | undefined): boolean {
  const secret = getBypassSecret();
  if (!secret || !token?.trim()) return false;
  return tokensEqual(token.trim(), secret);
}

export function isWaitlistBypassCookieValid(cookieValue: string | undefined | null): boolean {
  const secret = getBypassSecret();
  if (!secret) return false;
  const payload = decodeSignedPayload(cookieValue, secret);
  return Boolean(payload && payload.expiresAt > Date.now());
}

export function buildWaitlistBypassCookieValue(): string | null {
  const secret = getBypassSecret();
  if (!secret) return null;
  return encodeSignedPayload({ expiresAt: Date.now() + BYPASS_TTL_SECONDS * 1000 }, secret);
}

export function setWaitlistBypassCookie(response: NextResponse) {
  const value = buildWaitlistBypassCookieValue();
  if (!value) return response;
  response.cookies.set(WAITLIST_BYPASS_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BYPASS_TTL_SECONDS,
  });
  return response;
}
