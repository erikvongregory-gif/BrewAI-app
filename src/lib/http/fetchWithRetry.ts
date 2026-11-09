export function isTransientFetchError(error: unknown): boolean {
  return error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/** Längste Wartezeit, die ein Retry-After auslösen darf; darüber entscheidet der Nutzer. */
const MAX_RETRY_AFTER_MS = 10_000;

function hasIdempotencyKey(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  try {
    return new Headers(headers).has("idempotency-key");
  } catch {
    return false;
  }
}

/**
 * Darf eine Antwort mit Fehlerstatus erneut angefragt werden?
 * POST/PATCH sind nicht idempotent: Ein 5xx/504 kann bedeuten, dass der Server
 * die Arbeit (KI-Scan, Bildgenerierung) bereits gemacht und bezahlt hat. Ohne
 * Opt-in (`idempotent: true` oder `Idempotency-Key`) wird dort nicht wiederholt.
 */
export function canRetryStatus(init: RequestInit, options: FetchWithRetryOptions): boolean {
  if (options.idempotent === true) return true;
  const method = (init.method ?? "GET").toUpperCase();
  return IDEMPOTENT_METHODS.has(method) || hasIdempotencyKey(init.headers);
}

/** Retry-After (Sekunden oder HTTP-Datum) in ms; null wenn nicht vorhanden/ungültig. */
export function parseRetryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(date - now, 0);
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export type FetchWithRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  /**
   * Erlaubt Status-Retries auch für POST/PATCH. Nur setzen, wenn der Server
   * doppelte Anfragen erkennt (Idempotenzschlüssel, Job-Wiederaufnahme).
   */
  idempotent?: boolean;
  /** Nur für Tests. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Fetch mit Retry bei Netzwerkabbruch und kurzzeitigen Serverfehlern (5xx/429).
 * Status-Retries nur für idempotente Anfragen (siehe canRetryStatus); ein
 * Retry-After des Servers wird beachtet, ab 10 s wird nicht mehr automatisch
 * wiederholt, sondern die Antwort zurückgegeben.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const wait = options.sleep ?? delay;
  const statusRetryAllowed = canRetryStatus(init, options);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (statusRetryAllowed && isRetryableStatus(response.status) && attempt < retries) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        if (retryAfterMs !== null && retryAfterMs > MAX_RETRY_AFTER_MS) return response;
        await wait(retryAfterMs ?? baseDelayMs * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isTransientFetchError(error) || attempt >= retries) throw error;
      await wait(baseDelayMs * (attempt + 1));
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Anfrage fehlgeschlagen.");
}
