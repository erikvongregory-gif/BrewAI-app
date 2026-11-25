/**
 * Kostenschutz je Konto (Tagesdeckel) für kostenpflichtige KI-Aufträge.
 *
 * Warum zusätzlich zum Token-Guthaben?
 * - Fehlgeschlagene Aufträge werden erstattet (0 Tokens), kosten beim Anbieter
 *   aber trotzdem Geld (Timeout nach fertigem Bild, abgebrochene Läufe). Eine
 *   Schleife aus Fehlversuchen wäre für den Nutzer gratis und für BrewAI unbegrenzt.
 * - Owner-Konten reservieren 0 Tokens (generationJobs.reserveGeneration) und
 *   haben damit gar keine Obergrenze.
 * - Ein kompromittiertes Konto oder ein Skript leert sonst ein Enterprise-
 *   Guthaben (20.000 Tokens) in Minuten; der Deckel begrenzt den Schaden pro Tag.
 *
 * Reine Bibliothek: `evaluateCostGuard` entscheidet, `loadCostGuardUsage` liest
 * die Tagesnutzung aus `generation_jobs`. Die Einbindung vor `generation_reserve`
 * gehört in `src/lib/billing/generationJobs.ts` (siehe Audit-Bericht 06).
 */

export type CostGuardPlan = "start" | "growth" | "pro" | "enterprise" | "owner";

export type CostGuardLimits = {
  /** Kostenpflichtige Aufträge je Konto und UTC-Tag, inklusive fehlgeschlagener. */
  maxJobsPerDay: number;
  /** Fehlgeschlagene/erstattete Aufträge je UTC-Tag. */
  maxFailedJobsPerDay: number;
  /** Reservierte Tokens je UTC-Tag (Owner reservieren 0 und laufen über die Auftragszahl). */
  maxTokensPerDay: number;
};

export type CostGuardUsage = {
  jobs: number;
  failedJobs: number;
  tokens: number;
};

export type CostGuardJobRow = {
  status: string | null;
  amount: number | null;
  charged?: number | null;
  created_at: string | null;
};

export type CostGuardDecision =
  | { allowed: true; usage: CostGuardUsage; limits: CostGuardLimits }
  | {
      allowed: false;
      reason: "daily_jobs" | "daily_failed_jobs" | "daily_tokens";
      /** Beginn des nächsten UTC-Tages (ISO). */
      retryAt: string;
      /** Sekunden bis retryAt, für den Retry-After-Header. */
      retryAfterSeconds: number;
      message: string;
      usage: CostGuardUsage;
      limits: CostGuardLimits;
    };

/**
 * Standardwerte je Tarif. Bewusst großzügig: Ein normaler Arbeitstag einer
 * Brauerei liegt weit darunter (Tokens/Tag = 40 % des Monatskontingents).
 * Monatliche Tokens laut src/lib/billing/tokenState.ts: 1200/3000/7500/20000.
 */
const PLAN_DEFAULTS: Record<CostGuardPlan, CostGuardLimits> = {
  start: { maxJobsPerDay: 60, maxFailedJobsPerDay: 20, maxTokensPerDay: 480 },
  growth: { maxJobsPerDay: 120, maxFailedJobsPerDay: 25, maxTokensPerDay: 1200 },
  pro: { maxJobsPerDay: 250, maxFailedJobsPerDay: 40, maxTokensPerDay: 3000 },
  enterprise: { maxJobsPerDay: 500, maxFailedJobsPerDay: 60, maxTokensPerDay: 8000 },
  owner: { maxJobsPerDay: 300, maxFailedJobsPerDay: 60, maxTokensPerDay: Number.POSITIVE_INFINITY },
};

type EnvLike = Record<string, string | undefined>;

function positiveIntFromEnv(env: EnvLike, name: string): number | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isCostGuardDisabled(env: EnvLike = process.env): boolean {
  return ["1", "true", "yes"].includes((env.AI_COST_GUARD_DISABLED ?? "").trim().toLowerCase());
}

/**
 * Grenzen für einen Tarif; Env-Variablen überschreiben global (Notbremse ohne Deploy
 * über Vercel-Env):
 * AI_COST_GUARD_MAX_JOBS_PER_DAY, AI_COST_GUARD_MAX_FAILED_PER_DAY, AI_COST_GUARD_MAX_TOKENS_PER_DAY.
 */
export function resolveCostGuardLimits(plan: CostGuardPlan | null | undefined, env: EnvLike = process.env): CostGuardLimits {
  const base = PLAN_DEFAULTS[plan ?? "start"] ?? PLAN_DEFAULTS.start;
  return {
    maxJobsPerDay: positiveIntFromEnv(env, "AI_COST_GUARD_MAX_JOBS_PER_DAY") ?? base.maxJobsPerDay,
    maxFailedJobsPerDay: positiveIntFromEnv(env, "AI_COST_GUARD_MAX_FAILED_PER_DAY") ?? base.maxFailedJobsPerDay,
    maxTokensPerDay: positiveIntFromEnv(env, "AI_COST_GUARD_MAX_TOKENS_PER_DAY") ?? base.maxTokensPerDay,
  };
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function nextUtcDay(now: Date): Date {
  return new Date(startOfUtcDay(now).getTime() + 24 * 60 * 60 * 1000);
}

/** Tagesnutzung aus generation_jobs-Zeilen (nur Zeilen des aktuellen UTC-Tages zählen). */
export function summarizeJobsForDay(rows: CostGuardJobRow[], now: Date): CostGuardUsage {
  const dayStart = startOfUtcDay(now).getTime();
  const usage: CostGuardUsage = { jobs: 0, failedJobs: 0, tokens: 0 };
  for (const row of rows) {
    const createdAt = row.created_at ? Date.parse(row.created_at) : Number.NaN;
    if (!Number.isFinite(createdAt) || createdAt < dayStart) continue;
    usage.jobs += 1;
    if (row.status === "failed") usage.failedJobs += 1;
    // Abgeschlossene Aufträge zählen mit dem tatsächlich gebuchten Betrag,
    // laufende mit der Reservierung, fehlgeschlagene mit 0.
    const tokens =
      row.status === "completed" && typeof row.charged === "number"
        ? row.charged
        : row.status === "failed"
          ? 0
          : (row.amount ?? 0);
    usage.tokens += Math.max(tokens, 0);
  }
  return usage;
}

function formatGerman(value: number): string {
  return value.toLocaleString("de-DE");
}

/**
 * Entscheidet, ob ein neuer Auftrag mit `requestTokens` reserviert werden darf.
 * Bei Ablehnung: deutsche Meldung, Grund und Zeitpunkt für den nächsten Versuch.
 */
export function evaluateCostGuard(args: {
  usage: CostGuardUsage;
  requestTokens: number;
  limits: CostGuardLimits;
  now?: Date;
}): CostGuardDecision {
  const now = args.now ?? new Date();
  const { usage, limits } = args;
  const requestTokens = Math.max(args.requestTokens, 0);
  const retryAtDate = nextUtcDay(now);
  const retryAfterSeconds = Math.max(Math.ceil((retryAtDate.getTime() - now.getTime()) / 1000), 1);
  const deny = (reason: "daily_jobs" | "daily_failed_jobs" | "daily_tokens", message: string): CostGuardDecision => ({
    allowed: false,
    reason,
    retryAt: retryAtDate.toISOString(),
    retryAfterSeconds,
    message,
    usage,
    limits,
  });

  if (usage.failedJobs >= limits.maxFailedJobsPerDay) {
    return deny(
      "daily_failed_jobs",
      `Heute sind bereits ${formatGerman(usage.failedJobs)} Generierungen fehlgeschlagen. Zum Schutz vor Endlosschleifen pausieren neue Aufträge bis morgen. Bitte prüfe Motiv und Referenzbilder oder melde dich beim Support.`,
    );
  }
  if (usage.jobs >= limits.maxJobsPerDay) {
    return deny(
      "daily_jobs",
      `Tageslimit erreicht: ${formatGerman(limits.maxJobsPerDay)} Aufträge pro Tag. Ab morgen geht es weiter; für mehr Volumen melde dich beim Support.`,
    );
  }
  if (usage.tokens + requestTokens > limits.maxTokensPerDay) {
    return deny(
      "daily_tokens",
      `Tageslimit erreicht: Heute wurden bereits ${formatGerman(usage.tokens)} von ${formatGerman(limits.maxTokensPerDay)} Tokens eingesetzt. Ab morgen geht es weiter; dein Guthaben bleibt erhalten.`,
    );
  }
  return { allowed: true, usage, limits };
}

/** Minimale Schnittstelle des Supabase-Admin-Clients, damit die Bibliothek testbar bleibt. */
export type CostGuardQueryClient = {
  from(table: "generation_jobs"): {
    select(columns: string): {
      eq(column: "user_id", value: string): {
        gte(column: "created_at", value: string): PromiseLike<{ data: CostGuardJobRow[] | null; error: { message?: string } | null }>;
      };
    };
  };
};

/**
 * Liest die heutige Nutzung eines Kontos. Bei Lesefehlern wird `null` geliefert:
 * Der Aufrufer entscheidet (empfohlen: zulassen und loggen, damit ein DB-Schluckauf
 * keine bezahlten Kunden aussperrt — das Token-Guthaben schützt weiterhin).
 */
export async function loadCostGuardUsage(
  client: CostGuardQueryClient,
  userId: string,
  now: Date = new Date(),
): Promise<CostGuardUsage | null> {
  const { data, error } = await client
    .from("generation_jobs")
    .select("status,amount,charged,created_at")
    .eq("user_id", userId)
    .gte("created_at", startOfUtcDay(now).toISOString());
  if (error || !data) return null;
  return summarizeJobsForDay(data, now);
}
