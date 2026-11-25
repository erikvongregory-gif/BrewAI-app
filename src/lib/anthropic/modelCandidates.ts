import Anthropic from "@anthropic-ai/sdk";
import { isProviderError, withProviderRetry } from "@/lib/ai/providerRequest";

/**
 * Anthropic retires dated snapshots — keep fallbacks on active models (see model deprecations docs).
 * Order: env override first, then Sonnet 4.6, then Haiku 4.5.
 * Sonnet 4.5 (claude-sonnet-4-5-20250929) ist abgekündigt und wird am 2026-11-30 abgeschaltet;
 * danach hätte jeder Fallback-Lauf erst einen sicheren 404 erzeugt.
 */
const ANTHROPIC_MODEL_FALLBACKS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export function getAnthropicModelCandidates(): string[] {
  const env = process.env.ANTHROPIC_MODEL?.trim();
  return Array.from(new Set([...(env ? [env] : []), ...ANTHROPIC_MODEL_FALLBACKS]));
}

function isModelNotFoundError(error: unknown): boolean {
  let status: number | undefined;
  let message: string;

  if (isProviderError(error)) {
    status = error.classified.providerStatus ?? undefined;
    message = error.classified.rawMessage;
  } else {
    if (error && typeof error === "object") {
      status = (error as { status?: number }).status;
      const nestedType = (error as { error?: { type?: string } }).error?.type;
      if (nestedType === "not_found_error") return true;
    }
    message = error instanceof Error ? error.message : String(error);
  }

  if (status === 404) return true;
  const m = message.toLowerCase();
  return (
    m.includes("not_found") ||
    m.includes("not found") ||
    m.includes("not_found_error") ||
    (m.includes("404") && m.includes("model"))
  );
}

/**
 * Zeitlimit je Versuch aus der erlaubten Antwortlänge: 30 s Grundlast plus
 * 30 ms je Output-Token (≈ 33 Token/s als langsamer Fall), begrenzt auf 45–150 s.
 * Das SDK-Default (10 min) liegt weit über jeder Funktionslaufzeit.
 */
export function anthropicAttemptTimeoutMs(maxTokens: number | undefined): number {
  const tokens = typeof maxTokens === "number" && Number.isFinite(maxTokens) ? Math.max(maxTokens, 0) : 1024;
  return Math.min(Math.max(30_000 + tokens * 30, 45_000), 150_000);
}

/** Gesamtbudget über alle Versuche eines Modells; bleibt unter maxDuration = 300 s. */
const DEFAULT_ANTHROPIC_BUDGET_MS = 240_000;

/**
 * Tries `messages.create` with each candidate until one succeeds. Unknown models
 * (404) fall through to the next candidate; transient failures (429, 5xx,
 * timeouts) are retried with backoff before the candidate is given up on.
 *
 * Retries laufen ausschliesslich hier (`maxRetries: 0` am SDK): Vorher
 * wiederholte das SDK selbst 2× und `withProviderRetry` 3× — bis zu 9 Anfragen
 * je Modell bei Überlast, ohne gemeinsames Zeitbudget.
 */
export async function createAnthropicMessageWithModelFallback(
  client: Anthropic,
  paramsWithoutModel: Omit<Anthropic.Messages.MessageCreateParams, "model">,
  options?: { timeoutMs?: number; budgetMs?: number; signal?: AbortSignal },
): Promise<Anthropic.Messages.Message> {
  let lastError: unknown;
  const attemptTimeoutMs = options?.timeoutMs ?? anthropicAttemptTimeoutMs(paramsWithoutModel.max_tokens);
  for (const model of getAnthropicModelCandidates()) {
    try {
      return await withProviderRetry(
        "anthropic",
        (signal) =>
          client.messages.create(
            {
              ...paramsWithoutModel,
              model,
              stream: false,
            },
            { maxRetries: 0, timeout: attemptTimeoutMs, ...(signal ? { signal } : {}) },
          ),
        {
          label: `messages:${model}`,
          attemptTimeoutMs,
          budgetMs: options?.budgetMs ?? DEFAULT_ANTHROPIC_BUDGET_MS,
          signal: options?.signal,
        },
      );
    } catch (error) {
      lastError = error;
      if (isModelNotFoundError(error)) continue;
      throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error("Kein Claude-Modell verfuegbar.");
}
