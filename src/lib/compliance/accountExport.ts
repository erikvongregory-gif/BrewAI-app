import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandProfileFromMetadata } from "@/lib/dashboard/brandProfile";

/**
 * Datenexport für Auskunft (Art. 15 DSGVO) und Datenübertragbarkeit (Art. 20 DSGVO).
 * Liefert maschinenlesbares JSON ohne Zugangsgeheimnisse (Tokens, Hashes, Schlüssel).
 */

export const ACCOUNT_EXPORT_FORMAT_VERSION = "2026-11-09";

const SECRET_KEY =
  /(password|passwd|secret|hash|salt|otp|totp|nonce|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token|provider[_-]?token|id[_-]?token|auth[_-]?token|bearer|csrf|signature|recovery[_-]?code|backup[_-]?code|verifier|challenge|cookie|session[_-]?id|password[_-]?epoch)/i;
const TOKEN_KEY = /(?:^|[_-])token$|[a-z]Token$|^token$|^code$/;
const CREDIT_TOKEN_KEY = /^(?:monthly|purchased|bonus|carry|remaining|used|total|granted|spent|token_period|tokens?_)/i;
const MAX_DEPTH = 10;
const MAX_STRING = 4_000;
const BASE64ISH = /^(?:data:[\w/+.-]+;base64,)?[A-Za-z0-9+/=\r\n]+$/;

export function isSecretKey(key: string): boolean {
  if (SECRET_KEY.test(key)) return true;
  return TOKEN_KEY.test(key) && !CREDIT_TOKEN_KEY.test(key);
}

function stripSignedQuery(value: string): string {
  if (!/^https?:\/\//i.test(value) || !/[?&](token|signature|x-amz-signature|sig)=/i.test(value)) return value;
  try {
    const url = new URL(value);
    url.search = "";
    return url.toString();
  } catch {
    return value;
  }
}

/** Entfernt Geheimnisse und große Binärdaten; alles andere bleibt unverändert lesbar. */
export function sanitizeForExport(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[gekürzt: zu tief verschachtelt]";
  if (typeof value === "string") {
    if (value.length > MAX_STRING && BASE64ISH.test(value.slice(0, 2_000))) {
      return `[Binärdaten entfernt: ${value.length} Zeichen – Datei bitte in der App herunterladen]`;
    }
    return stripSignedQuery(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeForExport(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) continue;
      result[key] = sanitizeForExport(entry, depth + 1);
    }
    return result;
  }
  return value;
}

type AdminClient = ReturnType<typeof createAdminClient>;

type SectionResult = { rows: unknown[] } | { unavailable: true };

async function selectRows(admin: AdminClient, table: string, column: string, userId: string, columns = "*"): Promise<SectionResult> {
  try {
    const rows: unknown[] = [];
    for (let offset = 0; offset < 50_000; offset += 1000) {
      const { data, error } = await admin.from(table).select(columns).eq(column, userId).range(offset, offset + 999);
      if (error) return { unavailable: true };
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return { rows };
  } catch {
    return { unavailable: true };
  }
}

export type AccountExport = {
  format: { name: "brewai-account-export"; version: string; createdAt: string };
  hinweise: string[];
  konto: unknown;
  markenprofil: unknown;
  einstellungen: unknown;
  mediathek: unknown[];
  generierungsauftraege: unknown[];
  biere: unknown[];
  charaktere: unknown[];
  team: { mitglieder: unknown[]; einladungen: unknown[]; mitgliedschaften: unknown[] };
  abrechnung: { abonnement: unknown[]; tokenKontingente: unknown[]; hinweis: string };
  verbindungen: unknown[];
  loeschauftrag: unknown[];
  unvollstaendig: string[];
};

/** Sammelt alle lokal gespeicherten Daten des angemeldeten Kontoinhabers (nicht des Team-Inhabers). */
export async function collectAccountExport(user: User, now = new Date()): Promise<AccountExport> {
  const admin = createAdminClient();
  const unvollstaendig: string[] = [];
  const section = async (name: string, table: string, column: string, columns = "*") => {
    const result = await selectRows(admin, table, column, user.id, columns);
    if ("unavailable" in result) {
      unvollstaendig.push(name);
      return [];
    }
    return result.rows.map((row) => sanitizeForExport(row));
  };

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const { dashboard, ...profileMetadata } = metadata;

  const [mediathek, auftraege, biere, charaktere, mitglieder, einladungen, mitgliedschaften, abo, lots, verbindungen, loeschauftrag] =
    await Promise.all([
      section("Mediathek", "dashboard_media", "user_id", "item"),
      section("Generierungsaufträge", "generation_jobs", "user_id"),
      section("Biere", "dashboard_beers", "user_id", "id,position,item"),
      section("Charaktere", "dashboard_characters", "user_id", "id,position,item"),
      section("Teammitglieder", "workspace_members", "owner_id", "user_id,role"),
      section("Team-Einladungen", "workspace_invites", "owner_id", "id,email,name,role,created_at,expires_at"),
      section("Team-Mitgliedschaften", "workspace_members", "user_id", "owner_id,role"),
      section("Abonnement", "billing_subscriptions", "user_id"),
      section("Token-Kontingente", "token_lots", "user_id"),
      section("Verbindungen", "integration_secrets", "user_id", "provider"),
      section("Löschauftrag", "account_deletion_jobs", "user_id"),
    ]);

  return {
    format: { name: "brewai-account-export", version: ACCOUNT_EXPORT_FORMAT_VERSION, createdAt: now.toISOString() },
    hinweise: [
      "Export nach Art. 15 und Art. 20 DSGVO. Zugangsgeheimnisse (Passwörter, Tokens, Schlüssel) sind bewusst nicht enthalten.",
      "Bild- und Schriftdateien selbst sind nicht eingebettet; Pfade bzw. Adressen stehen in der Mediathek. Dateien bitte in der App herunterladen.",
      "Rechnungen und Zahlungsdaten verwaltet der Zahlungsdienstleister Stripe; Rechnungen sind im Kundenportal abrufbar.",
    ],
    konto: sanitizeForExport({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone || null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      anmeldeverfahren: (user.identities ?? []).map((identity) => ({
        provider: identity.provider,
        createdAt: identity.created_at ?? null,
        lastSignInAt: identity.last_sign_in_at ?? null,
      })),
      rolle: (user.app_metadata as Record<string, unknown> | undefined)?.role ?? null,
      profil: profileMetadata,
    }),
    markenprofil: sanitizeForExport(getBrandProfileFromMetadata(metadata)),
    einstellungen: sanitizeForExport(dashboard ?? null),
    mediathek,
    generierungsauftraege: auftraege,
    biere,
    charaktere,
    team: { mitglieder, einladungen, mitgliedschaften },
    abrechnung: {
      abonnement: abo,
      tokenKontingente: lots,
      hinweis: "Rechnungen liegen bei Stripe und werden wegen handels- und steuerrechtlicher Aufbewahrungspflichten nicht mit dem Konto gelöscht (Löschung dort nach Fristablauf).",
    },
    verbindungen,
    loeschauftrag,
    unvollstaendig,
  };
}

export function accountExportFileName(now = new Date()): string {
  return `brewai-datenexport-${now.toISOString().slice(0, 10)}.json`;
}
