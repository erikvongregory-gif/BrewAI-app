import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, testEnv } from "../env";

/**
 * Spielt das versionierte Schema ins Supabase-TESTprojekt ein (nur über SUPABASE_DB_URL aus .env.test.local).
 * Idempotent: jede Datei wird genau einmal angewendet und in e2e_meta.applied_files vermerkt.
 * Reihenfolge wie src/lib/billing/goLiveBilling.test.ts + docs/go-live-fixes-rollout.md, danach supabase/migrations.
 */
const DOCS_ORDER = [
  "billing-schema",
  "stripe-webhook-events-schema",
  "billing-atomic-migration",
  "billing-access-hardening-migration",
  "generation-jobs-migration",
  "billing-periods-migration",
  "generation-result-billing-migration",
  "go-live-security-migration",
  "workspaces-migration",
  "account-deletion-migration",
  "checkout-lock-migration",
  "webhook-recovery-migration",
  "request-rate-limits-migration",
];

/** Lücken, die in keiner versionierten SQL-Datei stehen (siehe E2E-REPORT „Schema-Lücken“). */
const RECONSTRUCTED = join(__dirname, "..", "schema");

/* eslint-disable @typescript-eslint/no-explicit-any */
// shortcut: pg liegt außerhalb von package.json (Nutzer-Vorgabe: keine weiteren Dependencies), on demand nach node_modules/.e2e-tools
type PgClient = { connect(): Promise<void>; end(): Promise<void>; query(text: string, params?: unknown[]): Promise<{ rows: any[] }> };
type PgModule = { Client: new (opts: object) => PgClient };

function loadPg(): PgModule {
  const toolDir = join(ROOT, "node_modules", ".e2e-tools");
  const req = createRequire(join(toolDir, "index.js"));
  try {
    return req("pg");
  } catch {
    execSync(`npm i --prefix "${toolDir}" --no-save --no-package-lock pg@8`, { stdio: "inherit" });
    return req("pg");
  }
}

export function schemaFiles(): Array<{ name: string; path: string }> {
  const files = DOCS_ORDER.map((f) => ({ name: `docs/${f}.sql`, path: join(ROOT, "docs", `${f}.sql`) }));
  const migDir = join(ROOT, "supabase", "migrations");
  for (const f of readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    files.push({ name: `supabase/migrations/${f}`, path: join(migDir, f) });
  }
  if (existsSync(RECONSTRUCTED)) {
    for (const f of readdirSync(RECONSTRUCTED).filter((x) => x.endsWith(".sql")).sort()) {
      files.push({ name: `tests/e2e/fixtures/schema/${f}`, path: join(RECONSTRUCTED, f) });
    }
  }
  return files;
}

export async function applySchema(log = console.log): Promise<string[]> {
  const env = testEnv();
  const pg = loadPg();
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const applied: string[] = [];
  try {
    const host = (await client.query("select current_database() db")).rows[0];
    if (host.db !== "postgres") throw new Error("Unerwartete Datenbank");
    await client.query("create schema if not exists e2e_meta; create table if not exists e2e_meta.applied_files(name text primary key, applied_at timestamptz default now());");
    await client.query("revoke all on schema e2e_meta from public, anon, authenticated");
    const done = new Set((await client.query("select name from e2e_meta.applied_files")).rows.map((r: { name: string }) => r.name));
    for (const file of schemaFiles()) {
      if (done.has(file.name)) continue;
      const sql = readFileSync(file.path, "utf8");
      try {
        await client.query(sql);
      } catch (error) {
        throw new Error(`Schema-Datei ${file.name} schlug fehl: ${(error as Error).message}`);
      }
      await client.query("insert into e2e_meta.applied_files(name) values ($1)", [file.name]);
      applied.push(file.name);
      log(`[e2e schema] angewendet: ${file.name}`);
    }
    // PostgREST-Schemacache nach DDL neu laden.
    await client.query("notify pgrst, 'reload schema'");
  } finally {
    await client.end();
  }
  return applied;
}

/** Für den Report: welche von der App genutzten Objekte existieren nach dem Einspielen? */
export async function inventory(): Promise<Record<string, boolean>> {
  const env = testEnv();
  const pg = loadPg();
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const tables = (await client.query("select table_name from information_schema.tables where table_schema='public'")).rows.map((r: { table_name: string }) => r.table_name);
    const fns = (await client.query("select routine_name from information_schema.routines where routine_schema='public'")).rows.map((r: { routine_name: string }) => r.routine_name);
    const buckets = (await client.query("select id from storage.buckets")).rows.map((r: { id: string }) => r.id);
    const out: Record<string, boolean> = {};
    for (const t of ["account_deletion_jobs", "beer_style_appearance", "billing_subscriptions", "dashboard_beers", "dashboard_characters", "dashboard_media", "generation_jobs", "integration_secrets", "invites", "stripe_webhook_events", "waitlist_signups", "workspace_invites", "workspace_members", "request_rate_limits"]) out[`table:${t}`] = tables.includes(t);
    for (const f of ["billing_activate_plan_atomic", "billing_adjust_tokens_atomic", "billing_cancel_subscription_atomic", "billing_claim_checkout", "billing_grant_token_pack_atomic", "billing_onboarding_bonus_atomic", "billing_refresh_monthly", "billing_renew_period_atomic", "billing_set_token_schedule", "generation_finish", "generation_reserve", "stripe_claim_event", "workspace_accept", "workspace_invite", "enforce_rate_limit_atomic"]) out[`rpc:${f}`] = fns.includes(f);
    out["bucket:generated-images"] = buckets.includes("generated-images");
    return out;
  } finally {
    await client.end();
  }
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const env = testEnv();
  const pg = loadPg();
  const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}
