import { test, expect } from "./fixtures/test";
import { ORIGIN_HEADERS, mediaRows } from "./fixtures/app";
import { sql } from "./fixtures/db/apply-schema";
import { testEnv } from "./fixtures/env";

// Sicherheit (Basis). Viewport-unabhängig → nur im Desktop-Projekt.
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "API-/Zugriffstests sind viewport-unabhängig (laufen im Desktop-Projekt).");
});

const GET_ROUTES = [
  "/api/dashboard/summary",
  "/api/dashboard/media",
  "/api/dashboard/jobs",
  "/api/dashboard/settings",
  "/api/dashboard/team",
  "/api/dashboard/my-beers",
  "/api/dashboard/my-characters",
  "/api/dashboard/onboarding",
  "/api/billing/state",
  "/api/brand/profile-status",
  "/api/account/export",
];
const POST_ROUTES = [
  "/api/inhalte-erstellen/create-task",
  "/api/inhalte-erstellen/social-post",
  "/api/generation/status",
  "/api/generation/submit",
  "/api/billing/checkout",
  "/api/billing/buy-tokens",
  "/api/billing/portal",
  "/api/dashboard/media",
  "/api/dashboard/team",
  "/api/generate-hyperrealistic",
  "/api/generate-studio",
  "/api/generate-campaign",
  "/api/generate-isolate",
  "/api/openai/image2/generate",
  "/api/kie/nano-banana/create-task",
];

test.describe("Sicherheit", () => {
  for (const path of GET_ROUTES) {
    test(`GET ${path} ohne Session → 401`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
      const r = await ctx.get(path, { maxRedirects: 0 });
      expect([401, 403], `Status ${r.status()}`).toContain(r.status());
      await ctx.dispose();
    });
  }
  for (const path of POST_ROUTES) {
    test(`POST ${path} ohne Session → 401`, async ({ playwright }) => {
      const ctx = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
      const r = await ctx.post(path, { headers: ORIGIN_HEADERS, data: {}, maxRedirects: 0 });
      expect([401, 403], `Status ${r.status()}`).toContain(r.status());
      await ctx.dispose();
    });
  }

  test("User A sieht in der Mediathek-API nur eigene Einträge", async ({ as }) => {
    const { page } = await as("userA");
    const r = await page.request.get("/api/dashboard/media?limit=100&offset=0");
    const json = (await r.json()) as { items: Array<{ id: string; imageUrl: string }> };
    expect(json.items.length).toBe(60);
    expect(json.items.every((i) => i.id.startsWith("a-"))).toBeTruthy();
  });

  test("User A kann Motiv von User B weder umbenennen noch löschen", async ({ as, accounts }) => {
    const { page } = await as("userA");
    const bBefore = await mediaRows(accounts.userB.id!);
    expect(bBefore.length).toBeGreaterThan(0);
    const victim = bBefore[0].id;
    const patch = await page.request.patch("/api/dashboard/media", { headers: ORIGIN_HEADERS, data: { id: victim, title: "gehackt" } });
    expect(patch.status()).toBe(404);
    await page.request.delete(`/api/dashboard/media?id=${encodeURIComponent(victim)}`, { headers: ORIGIN_HEADERS });
    const bAfter = await mediaRows(accounts.userB.id!);
    expect(bAfter.map((m) => m.id)).toContain(victim);
    const title = (await sql<{ t: string }>("select item->>'title' t from public.dashboard_media where user_id=$1 and id=$2", [accounts.userB.id, victim]))[0].t;
    expect(title).not.toBe("gehackt");
  });

  test("Bilddatei von User B ist ohne Signatur nicht abrufbar (Storage + Download-Proxy)", async ({ as, accounts, playwright }) => {
    const env = testEnv();
    const row = (await sql<{ u: string }>("select item->>'imageUrl' u from public.dashboard_media where user_id=$1 limit 1", [accounts.userB.id]))[0];
    const raw = row.u; // .../storage/v1/object/sign/generated-images/<path> ohne Token
    const path = raw.split("/generated-images/")[1];
    const anon = await playwright.request.newContext();
    for (const url of [raw, `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-images/${path}`, `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/generated-images/${path}`]) {
      const r = await anon.get(url);
      expect(r.status(), url.replace(env.NEXT_PUBLIC_SUPABASE_URL, "<supabase>")).toBeGreaterThanOrEqual(400);
    }
    await anon.dispose();
    const { page } = await as("userA");
    const viaProxy = await page.request.get(`/api/kie/download?url=${encodeURIComponent(raw)}&format=png&taskId=x`);
    expect(viaProxy.status(), "Download-Proxy darf fremde Datei nicht liefern").toBeGreaterThanOrEqual(400);
  });

  test("User A darf den Generierungsstatus eines Jobs von User B nicht lesen", async ({ as, accounts }) => {
    const jobId = "00000000-0000-4000-8000-0000000000b1";
    await sql("delete from public.generation_jobs where id=$1", [jobId]);
    await sql("insert into public.generation_jobs(id,user_id,request_key,request_hash,amount,monthly_part,purchased_part,status,result) values ($1,$2,'e2e-b','h',0,0,0,'completed',$3)", [jobId, accounts.userB.id, { images: [{ imageUrl: "geheim-b" }] }]);
    const { page } = await as("userA");
    const r = await page.request.post("/api/generation/status", { headers: ORIGIN_HEADERS, data: { jobId } });
    const text = await r.text();
    expect(text).not.toContain("geheim-b");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    await sql("delete from public.generation_jobs where id=$1", [jobId]);
  });

  test("Supabase REST mit Session von User A liefert keine fremden Zeilen (RLS)", async ({ as, accounts }) => {
    const env = testEnv();
    const { context, page } = await as("userA");
    const cookies = await context.cookies();
    const parts = cookies.filter((c) => c.name.includes("auth-token")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const json = JSON.parse(Buffer.from(parts.replace(/^base64-/, ""), "base64").toString("utf8")) as { access_token: string };
    for (const table of ["dashboard_media", "billing_subscriptions", "generation_jobs", "workspace_members", "token_lots"]) {
      const r = await page.request.get(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&user_id=eq.${accounts.userB.id}`, {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${json.access_token}` },
      });
      const body = await r.text();
      expect(r.status() >= 400 || body === "[]", `${table}: ${r.status()}`).toBeTruthy();
    }
  });

  test("Cross-Origin-POST wird abgewiesen (CSRF-Basis)", async ({ as }) => {
    const { page } = await as("userA");
    const r = await page.request.post("/api/dashboard/media", { headers: { origin: "https://evil.example", "content-type": "application/json" }, data: {} });
    expect(r.status()).toBe(403);
  });
});
