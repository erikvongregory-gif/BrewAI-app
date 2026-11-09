function token(value: string | null): string | null {
  if (!value || value.length < 20 || value.length > 8192 || /\s/.test(value)) return null;
  return value;
}

/** Hash-Tokens erreichen den Server nicht. Hier werden sie einmalig in ein HttpOnly-Cookie geschrieben. */
export async function persistHashSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes("access_token")) return false;
  const params = new URLSearchParams(hash);
  const accessToken = token(params.get("access_token"));
  const refreshToken = token(params.get("refresh_token"));
  if (!accessToken || !refreshToken) return false;

  const response = await fetch("/auth/adopt-session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
  });
  if (!response.ok) return false;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}
