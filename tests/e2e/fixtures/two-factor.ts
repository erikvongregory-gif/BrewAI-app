import { createHmac, randomBytes, createHash } from "node:crypto";
import { twoFactorSecret } from "./accounts";

// Spiegelt das Token-Format aus src/lib/admin/emailTwoFactor.ts (HMAC-SHA256, base64url), damit die Suite
// den E-Mail-Code-Schritt überspringen bzw. gezielt testen kann – nur mit dem Test-Secret des Testservers.
export const TRUSTED_DEVICE_COOKIE = "evglab_2fa_device";
export const PENDING_COOKIE = "evglab_admin_2fa_pending";

function encodeSigned(payload: object): string {
  const raw = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", twoFactorSecret()).update(raw).digest("base64url");
  return `${raw}.${sig}`;
}

export function trustedDeviceToken(userId: string, passwordEpoch = 0): string {
  const now = Date.now();
  return encodeSigned({ purpose: "2fa_trusted_device", userId, issuedAt: now, expiresAt: now + 7 * 864e5, passwordEpoch });
}

/** Pending-Token mit bekanntem Code (wie nach Versand der 2FA-Mail). */
export function pendingToken(userId: string, email: string, code: string): string {
  const expiresAt = Date.now() + 600_000;
  const nonce = randomBytes(12).toString("hex");
  const codeHash = createHash("sha256").update(`${userId}:${code}:${nonce}:${expiresAt}:${twoFactorSecret()}`).digest("hex");
  return encodeSigned({ purpose: "2fa_pending", userId, email, expiresAt, nonce, codeHash });
}
