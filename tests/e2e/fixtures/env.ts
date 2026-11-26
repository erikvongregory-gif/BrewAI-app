import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(__dirname, "..", "..", "..");
export const TEST_SUPABASE_REF = "wwsmogrpxmiwujytzanu";
export const TEST_SUPABASE_HOST = `${TEST_SUPABASE_REF}.supabase.co`;
/** Produktions-Supabase (Custom-Domain + Projekt-Ref). Jede Anfrage dorthin ist ein harter Fehler. */
export const PROD_SUPABASE_REF = "lutmsbxcjmocftiovwfs";
export const E2E_PORT = Number(process.env.E2E_PORT || 3101);
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const MOCK_DIR = join(ROOT, "tests", "e2e", ".state");

export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "brewai.de" || h.endsWith(".brewai.de") || h.includes(PROD_SUPABASE_REF);
}

function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

let cached: Record<string, string> | null = null;

/** Liest .env.test.local und bricht ab, wenn irgendetwas nicht auf das Testprojekt zeigt. */
export function testEnv(): Record<string, string> {
  if (cached) return cached;
  const file = join(ROOT, ".env.test.local");
  if (!existsSync(file)) throw new Error("E2E: .env.test.local fehlt – Testumgebung nicht eingerichtet. Abbruch.");
  const env = parseEnvFile(file);
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL"]) {
    if (!env[key]) throw new Error(`E2E: ${key} fehlt in .env.test.local. Abbruch.`);
  }
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== TEST_SUPABASE_HOST) {
    throw new Error("E2E: NEXT_PUBLIC_SUPABASE_URL zeigt nicht auf das Supabase-Testprojekt. Abbruch.");
  }
  if (!env.SUPABASE_DB_URL.includes(TEST_SUPABASE_REF) || env.SUPABASE_DB_URL.includes(PROD_SUPABASE_REF)) {
    throw new Error("E2E: SUPABASE_DB_URL zeigt nicht auf das Supabase-Testprojekt. Abbruch.");
  }
  cached = env;
  return env;
}

/** Testdaten der Accounts (gitignored, wird vom Setup erzeugt). */
export const ACCOUNTS_FILE = join(MOCK_DIR, "accounts.json");
export const ADMIN_2FA_TEST_SECRET_FILE = join(MOCK_DIR, "2fa-secret.txt");
