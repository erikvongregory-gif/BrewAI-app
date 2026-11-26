import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { loadAccounts, saveAccounts, type AccountKey, type Accounts } from "./accounts";
import { sql } from "./db/apply-schema";
import { testEnv } from "./env";

export function adminClient(): SupabaseClient {
  const env = testEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ONBOARDED = { v: 1, welcome: true, checklistDismissed: true, celebrated: true, hints: {}, flowVersion: 2, completedAt: "2026-11-01T00:00:00.000Z", tourVersion: 1, uiTourVersion: 2 };

function metadataFor(key: AccountKey) {
  if (key === "signupUser") return undefined;
  return {
    full_name: `E2E ${key}`,
    dashboard: {
      onboarding: ONBOARDED,
      settings: { profileName: `E2E ${key}`, breweryName: `E2E Brauerei ${key}` },
    },
  };
}

async function findUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertUser(admin: SupabaseClient, key: AccountKey, accounts: Accounts) {
  const acc = accounts[key];
  const existing = await findUserByEmail(admin, acc.email);
  const app_metadata = key === "admin" ? { role: "admin" } : { role: null };
  const user_metadata = metadataFor(key);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password: acc.password, email_confirm: true, app_metadata, user_metadata: user_metadata ?? {} });
    if (error) throw error;
    acc.id = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email: acc.email, password: acc.password, email_confirm: true, app_metadata, user_metadata: user_metadata ?? {} });
    if (error) throw error;
    acc.id = data.user.id;
  }
}

const BUCKET = "generated-images";

/** Legt N Mediathek-Einträge mit echtem Bild im Test-Storage an (ersetzt bestehende). */
export async function seedMedia(userId: string, count: number, opts: { prefix?: string; hue?: number } = {}) {
  const env = testEnv();
  const admin = adminClient();
  await sql("delete from public.dashboard_media where user_id=$1", [userId]);
  const png = await sharp({ create: { width: 128, height: 128, channels: 3, background: { r: (opts.hue ?? 120) % 255, g: 90, b: 40 } } }).png().toBuffer();
  const base = Date.parse("2026-11-20T12:00:00.000Z");
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const path = `generated/${userId}/e2e-${i}-${randomUUID()}.png`;
    // Nur die ersten 3 Bilder wirklich hochladen (Download-/Zugriffstests), Rest zeigt auf dieselbe Datei.
    if (i < 3) {
      const { error } = await admin.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
      if (error) throw new Error(`Storage-Upload: ${error.message}`);
    }
    const imagePath = path;
    const id = `${opts.prefix ?? "e2e"}-${String(i).padStart(3, "0")}`;
    ids.push(id);
    const item = {
      id,
      imageUrl: `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${imagePath}`,
      title: `E2E Motiv ${i}`,
      prompt: `E2E Prompt ${i}`,
      createdAt: new Date(base - i * 60_000).toISOString(),
      aspectRatio: "1:1",
      resolution: "1K",
      outputFormat: "png",
      photoStyle: "reportage",
    };
    await sql("insert into public.dashboard_media(user_id,id,item) values ($1,$2,$3) on conflict (user_id,id) do update set item=excluded.item", [userId, id, item]);
  }
  // Einträge ohne eigene Datei auf das erste Bild zeigen lassen (realistische, signierbare URL).
  if (count > 3) {
    const first = (await sql<{ item: { imageUrl: string } }>("select item from public.dashboard_media where user_id=$1 and id=$2", [userId, ids[0]]))[0];
    await sql("update public.dashboard_media set item = jsonb_set(item,'{imageUrl}',to_jsonb($3::text)) where user_id=$1 and id <> all($2::text[])", [userId, ids.slice(0, 3), first.item.imageUrl]);
  }
  return ids;
}

async function activate(userId: string, plan: string, allowance: number, key: string) {
  await sql("select billing_activate_plan_atomic($1,$2,$3,'active',null,$4,now()+interval '25 days')", [userId, plan, allowance, `sub_e2e_${key}_${Date.now()}`]);
  await sql("select billing_set_token_schedule($1,(select stripe_subscription_id from billing_subscriptions where user_id=$1),now())", [userId]);
}

/** Idempotent: setzt alle Test-Accounts auf einen definierten Ausgangszustand. */
export async function seedAll(log = console.log): Promise<Accounts> {
  const accounts = loadAccounts();
  const admin = adminClient();
  for (const key of Object.keys(accounts) as AccountKey[]) {
    if (key === "signupUser") continue; // wird im Registrierungstest erst angelegt
    await upsertUser(admin, key, accounts);
  }
  // signupUser vom letzten Lauf entfernen, damit Registrierung wiederholbar ist.
  const stale = await findUserByEmail(admin, accounts.signupUser.email);
  if (stale) await admin.auth.admin.deleteUser(stale.id);
  saveAccounts(accounts);

  const ids = (Object.keys(accounts) as AccountKey[]).map((k) => accounts[k].id).filter(Boolean) as string[];
  for (const table of ["generation_jobs", "token_lots", "billing_subscriptions", "dashboard_media", "dashboard_beers", "account_deletion_jobs", "workspace_invites", "billing_checkout_locks"]) {
    const col = table === "workspace_invites" ? "owner_id" : "user_id";
    await sql(`delete from public.${table} where ${col} = any($1::uuid[])`, [ids]);
  }
  await sql("delete from public.workspace_members where user_id = any($1::uuid[]) or owner_id = any($1::uuid[])", [ids]);
  await sql("delete from public.request_rate_limits");

  await activate(accounts.userA.id!, "pro", 1000, "a");
  await activate(accounts.userB.id!, "start", 300, "b");
  // Token-Packs verlangen eine Stripe-Customer-ID. Unbekannte IDs ersetzt die App selbst durch einen neuen Test-Customer
  // (resolveStripeCustomerId); die so entstandene ID wird in accounts.json gemerkt und wiederverwendet.
  await sql("update billing_subscriptions set stripe_customer_id=$2 where user_id=$1", [accounts.userB.id, accounts.userB.stripeCustomerId ?? `cus_e2e_missing_${accounts.userB.id!.slice(0, 8)}`]);
  await activate(accounts.admin.id!, "pro", 1000, "admin");
  await activate(accounts.resetUser.id!, "start", 300, "reset");
  // Teaminhaber mit abgelaufenem Abo + Mitglied (C-1)
  await activate(accounts.teamOwnerExpired.id!, "growth", 600, "owner");
  await sql("update billing_subscriptions set subscription_status='canceled', current_period_end=now()-interval '2 days' where user_id=$1", [accounts.teamOwnerExpired.id]);
  await sql("insert into public.workspace_members(user_id,owner_id,role) values ($1,$2,'editor')", [accounts.teamMember.id, accounts.teamOwnerExpired.id]);
  // Bezahltes Abo, aber 0 Credits übrig
  await activate(accounts.zeroCredits.id!, "start", 100, "zero");
  await sql("select billing_adjust_tokens_atomic($1,100,'consume')", [accounts.zeroCredits.id]);
  // noSub: kein Billing-Eintrag (Neukunde ohne Abo)

  await seedMedia(accounts.userA.id!, 60, { prefix: "a", hue: 200 });
  await seedMedia(accounts.userB.id!, 2, { prefix: "b", hue: 30 });
  log("[e2e seed] Accounts und Daten zurückgesetzt");
  return accounts;
}
