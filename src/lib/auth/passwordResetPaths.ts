export const PASSWORD_RESET_NEXT = "/passwort-zuruecksetzen";
export const PASSWORD_RESET_CONFIRM = "/passwort-zuruecksetzen/bestaetigen";

export function buildRecoveryConfirmUrl(origin: string, hashedToken: string): string {
  return `${origin}${PASSWORD_RESET_CONFIRM}?token_hash=${encodeURIComponent(hashedToken)}`;
}

export function isPasswordResetPublicPath(pathname: string, searchParams: URLSearchParams): boolean {
  if (pathname === "/passwort-vergessen" || pathname === PASSWORD_RESET_NEXT || pathname === PASSWORD_RESET_CONFIRM) return true;
  if (pathname.startsWith("/auth/reset-password/")) return true;

  if (pathname === "/auth/callback") {
    if (searchParams.get("type") === "recovery") return true;
    if (searchParams.get("next") === PASSWORD_RESET_NEXT) return true;
  }

  if (pathname === "/auth/finish" && searchParams.get("next") === PASSWORD_RESET_NEXT) {
    return true;
  }

  return false;
}
