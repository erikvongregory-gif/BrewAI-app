import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Abo-Credits vs. gekaufte Credits bei inaktivem Abo, gegen das echte SQL (PGlite, ohne Zugangsdaten).
const user = "00000000-0000-0000-0000-000000000001";
const bonusUser = "00000000-0000-0000-0000-000000000002";
const DOCS = ["billing-schema", "stripe-webhook-events-schema", "billing-atomic-migration", "billing-access-hardening-migration", "generation-jobs-migration", "billing-periods-migration", "generation-result-billing-migration"];

function proposedSection() {
  const sql = readFileSync("docs/audit/migrations-proposed.sql", "utf8");
  const start = sql.indexOf("-- BEGIN credits-inactive-subscription");
  const end = sql.indexOf("-- END credits-inactive-subscription");
  if (start < 0 || end < 0) throw new Error("Abschnitt credits-inactive-subscription fehlt");
  return sql.slice(start, end);
}

function setup(withProposal: boolean) {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);");
    for (const file of DOCS) await db.exec(readFileSync(`docs/${file}.sql`, "utf8"));
    await db.exec(readFileSync("supabase/migrations/20260918123000_debit_lots_allow_bonus.sql", "utf8"));
    if (withProposal) await db.exec(proposedSection());
  }, 30000);
  afterAll(() => db.close());
  beforeEach(async () => {
    await db.exec("truncate auth.users, billing_token_pack_grants cascade");
    await db.query("insert into auth.users values($1),($2)", [user, bonusUser]);
    await db.query("select billing_activate_plan_atomic($1,'start',1200,'active','cus','sub',now()+interval '1 year')", [user]);
    await db.query("select billing_set_token_schedule($1,'sub',now())", [user]);
    await db.query("select billing_grant_token_pack_atomic('cs_1',$1,'pack',100,'webhook')", [user]);
    await db.query("select billing_cancel_subscription_atomic('sub',now())");
  });
  const available = async (id = user) =>
    (await db.query<{ n: number }>("select monthly_tokens-used_tokens n from billing_subscriptions where user_id=$1", [id])).rows[0].n;
  const reserve = async (amount: number, id = user) =>
    (await db.query<{ j: { job: { id: string; allocations: { source: string }[] } } }>(
      "select generation_reserve($1,$2,$3,'hash',$4) j", [randomUUID(), id, randomUUID(), amount],
    )).rows[0].j.job;
  return { db, available, reserve };
}

describe("heutiges Schema: inaktives Abo sperrt alle Credits", () => {
  const { reserve } = setup(false);
  it("lehnt auch gekaufte Credits ab", async () => {
    await expect(reserve(10)).rejects.toThrow("Kein aktives Abo");
  });
});

describe("Vorschlag credits-inactive-subscription", () => {
  const { db, available, reserve } = setup(true);
  it("zeigt nur gekaufte Credits als verfügbar und bucht nur diese ab", async () => {
    expect(await available()).toBe(100);
    const job = await reserve(60);
    expect(job.allocations.map((a) => a.source)).toEqual(["purchased"]);
    expect(await available()).toBe(40);
  });
  it("sperrt Abo-Credits, wenn gekaufte nicht reichen", async () => {
    await expect(reserve(101)).rejects.toThrow("Nicht genug gekaufte Tokens");
    expect(await available()).toBe(100);
  });
  it("erstattet fehlgeschlagene Aufträge auf den gekauften Posten", async () => {
    const job = await reserve(30);
    await db.query("select generation_finish($1,$2,0,'{\"error\":\"x\"}')", [job.id, user]);
    expect(await available()).toBe(100);
  });
  it("gibt Abo-Credits nach Reaktivierung wieder frei", async () => {
    await db.query("select billing_activate_plan_atomic($1,'start',1200,'active','cus','sub',now()+interval '1 year')", [user]);
    expect(await available()).toBe(1300);
  });
  it("lässt Bonus-Konten ohne Stripe-Abo unverändert", async () => {
    await db.query("insert into billing_subscriptions(user_id) values($1)", [bonusUser]);
    await db.query("select billing_onboarding_bonus_atomic($1,50)", [bonusUser]);
    await reserve(10, bonusUser);
    expect(await available(bonusUser)).toBe(40);
  });
});
