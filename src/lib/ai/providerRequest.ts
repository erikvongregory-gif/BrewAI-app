import { NextResponse } from "next/server";
import {
  type AiProvider,
  type ClassifiedProviderError,
  classifyThrownProviderError,
} from "@/lib/ai/providerErrors";

/** Fehler mit fertiger Klassifikation — Routen koennen daraus direkt antworten. */
export class ProviderError extends Error {
  readonly classified: ClassifiedProviderError;

  constructor(classified: ClassifiedProviderError) {
    super(classified.rawMessage || classified.userMessage);
    this.name = "ProviderError";
    this.classified = classified;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}

/** Einheitliche API-Antwort fuer Provider-Fehler. */
export function providerErrorResponse(error: ClassifiedProviderError): NextResponse {
  return NextResponse.json(
    {
      error: error.userMessage,
      code: error.code,
      provider: error.provider,
      retryable: error.retryable,
      ...(error.retryAfterMs ? { retryAfterMs: error.retryAfterMs } : {}),
    },
    {
      status: error.httpStatus,
      headers: error.retryAfterMs
        ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) }
        : undefined,
    },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * - `default`: wiederholt alles, was der Klassifikator als vorübergehend meldet
 *   (429, 5xx, Timeout, unbekannt). Für Textaufrufe, die bei Fehlern nichts kosten.
 * - `paid`: für kostenpflichtige, nicht idempotente Aufrufe (Bildgenerierung).
 *   Wiederholt nur, wenn der Anbieter die Anfrage nachweislich NICHT verarbeitet
 *   hat (429 Rate-Limit, ausdrückliche 5xx-Antwort ausser 504). Timeouts, Abbrüche
 *   und unbekannte Netzwerkfehler werden nicht wiederholt: Der Anbieter kann das
 *   Bild bereits erzeugt und berechnet haben, und ein zweiter Lauf von bis zu
 *   2 Minuten sprengt das Zeitbudget der Serverfunktion.
 */
export type ProviderRetryPolicy = "default" | "paid";

export type ProviderRetryOptions = {
  attempts?: number;
  label?: string;
  policy?: ProviderRetryPolicy;
  /** Zeitlimit je Versuch. Die Operation bekommt dafür ein AbortSignal. */
  attemptTimeoutMs?: number;
  /**
   * Gesamtbudget über alle Versuche inklusive Wartezeit. Reicht der Rest nicht
   * mehr für Wartezeit plus einen sinnvollen Versuch, wird nicht erneut versucht.
   */
  budgetMs?: number;
  /** Externer Abbruch (z. B. Funktions-Deadline). */
  signal?: AbortSignal;
  /** Nur für Tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Nur für Tests. */
  now?: () => number;
};

/** Kürzester Versuch, für den sich ein Retry innerhalb des Budgets noch lohnt. */
const MIN_USEFUL_ATTEMPT_MS = 5_000;

export function isRetryAllowed(classified: ClassifiedProviderError, policy: ProviderRetryPolicy): boolean {
  if (!classified.retryable) return false;
  if (policy === "default") return true;
  if (classified.code === "provider_rate_limited") return true;
  return (
    classified.code === "provider_unavailable" &&
    classified.providerStatus !== null &&
    classified.providerStatus >= 500 &&
    classified.providerStatus !== 504
  );
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  return AbortSignal.any(active);
}

/**
 * Fuehrt einen Provider-Call aus und wiederholt ihn bei vorübergehenden
 * Fehlern (429, 5xx, Timeout) mit exponentiellem Backoff plus Jitter.
 * Quota-, Auth- und Eingabefehler werden nicht wiederholt — das kostet nur Zeit.
 * Mit `policy: "paid"`, `attemptTimeoutMs` und `budgetMs` lassen sich teure
 * Aufrufe begrenzen (siehe ProviderRetryPolicy).
 * Am Ende wird immer ein `ProviderError` geworfen.
 */
export async function withProviderRetry<T>(
  provider: AiProvider,
  operation: (signal?: AbortSignal) => Promise<T>,
  options?: ProviderRetryOptions,
): Promise<T> {
  const attempts = Math.max(options?.attempts ?? 3, 1);
  const policy = options?.policy ?? "default";
  const wait = options?.sleep ?? sleep;
  const now = options?.now ?? Date.now;
  const startedAt = now();
  const budgetMs = options?.budgetMs;
  let lastClassified: ClassifiedProviderError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const remainingMs = budgetMs === undefined ? undefined : budgetMs - (now() - startedAt);
    const attemptTimeoutMs =
      options?.attemptTimeoutMs === undefined && remainingMs === undefined
        ? undefined
        : Math.max(
            1,
            Math.min(options?.attemptTimeoutMs ?? Number.POSITIVE_INFINITY, remainingMs ?? Number.POSITIVE_INFINITY),
          );
    const signal = combineSignals([
      options?.signal,
      attemptTimeoutMs === undefined ? undefined : AbortSignal.timeout(attemptTimeoutMs),
    ]);
    try {
      if (options?.signal?.aborted) throw options.signal.reason ?? new Error("aborted");
      return await operation(signal);
    } catch (error) {
      const classified = isProviderError(error)
        ? error.classified
        : classifyThrownProviderError(provider, error);
      lastClassified = classified;

      const backoff = Math.min(
        (classified.retryAfterMs ?? 2_000) * 2 ** (attempt - 1) + Math.random() * 400,
        15_000,
      );
      const isLastAttempt = attempt === attempts;
      const externallyAborted = Boolean(options?.signal?.aborted);
      const budgetLeftMs = budgetMs === undefined ? Number.POSITIVE_INFINITY : budgetMs - (now() - startedAt);
      const budgetExhausted = budgetLeftMs < backoff + MIN_USEFUL_ATTEMPT_MS;
      if (isLastAttempt || externallyAborted || budgetExhausted || !isRetryAllowed(classified, policy)) {
        logProviderFailure(classified, { attempt, attempts, label: options?.label });
        throw new ProviderError(classified);
      }

      await wait(backoff);
    }
  }

  throw new ProviderError(
    lastClassified ?? classifyThrownProviderError(provider, new Error("Unbekannter Provider-Fehler")),
  );
}

export function logProviderFailure(
  classified: ClassifiedProviderError,
  context?: { attempt?: number; attempts?: number; label?: string; userId?: string },
) {
  const record = {
    ts: new Date().toISOString(),
    domain: "ai-provider",
    provider: classified.provider,
    code: classified.code,
    httpStatus: classified.httpStatus,
    retryable: classified.retryable,
    providerFault: classified.providerFault,
    label: context?.label,
    attempt: context?.attempt,
    attempts: context?.attempts,
    userId: context?.userId,
    message: classified.rawMessage.slice(0, 400),
  };
  // Quota- und Auth-Fehler blockieren das Produkt fuer alle Nutzer — als error
  // loggen, damit sie in Vercel-Alerts auffallen.
  const line = JSON.stringify(record);
  if (classified.code === "provider_quota_exhausted" || classified.code === "provider_auth_failed") {
    console.error(line);
    return;
  }
  console.warn(line);
}
