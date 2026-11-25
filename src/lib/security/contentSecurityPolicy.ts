const NONCE_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function createRequestNonce(): string {
  return crypto.randomUUID();
}

export function nonceFromRequest(request: { headers: { get(name: string): string | null } }): string | undefined {
  const value = request.headers.get("x-nonce")?.trim();
  return value && NONCE_PATTERN.test(value) ? value : undefined;
}

export function scriptOpenTag(nonce?: string): string {
  return nonce && NONCE_PATTERN.test(nonce) ? `<script nonce="${nonce}">` : "<script>";
}

export function contentSecurityPolicy(
  nonce: string,
  dev = process.env.NODE_ENV !== "production",
): string {
  // ponytail: style-src stays 'unsafe-inline' because React style attributes have no nonce.
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://auth.brewai.de${dev ? " ws: http://localhost:3001 http://127.0.0.1:3001" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
