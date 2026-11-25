/**
 * Legt Plan-Preise in Stripe an (Monatsabo = Listenpreis, Jahresabo = Aktionspreis).
 * Enterprise: legt Produkt an, falls noch keines in .env.local steht.
 *
 * Nutzung (Test):
 *   node scripts/sync-stripe-plan-prices.mjs
 *
 * Nutzung (Live):
 *   STRIPE_SECRET_KEY=sk_live_... node scripts/sync-stripe-plan-prices.mjs
 */
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";

const ROOT = path.resolve(import.meta.dirname, "..");

const PLAN_AMOUNTS = {
  start: { monthlyList: 29_00, yearlyPromoAnnual: 24 * 12 * 100 },
  growth: { monthlyList: 79_00, yearlyPromoAnnual: 65 * 12 * 100 },
  pro: { monthlyList: 199_00, yearlyPromoAnnual: 165 * 12 * 100 },
  enterprise: { monthlyList: 499_00, yearlyPromoAnnual: 415 * 12 * 100 },
};

const ENV_KEYS = {
  start: { monthly: "STRIPE_PRICE_START_MONTHLY", yearly: "STRIPE_PRICE_START_YEARLY" },
  growth: { monthly: "STRIPE_PRICE_GROWTH_MONTHLY", yearly: "STRIPE_PRICE_GROWTH_YEARLY" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
  enterprise: { monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY", yearly: "STRIPE_PRICE_ENTERPRISE_YEARLY" },
};

const PRODUCT_NAMES = {
  start: "Brauerei Start",
  growth: "Brauerei Wachstum",
  pro: "Brauerei Pro",
  enterprise: "Brauerei Enterprise",
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
}

function saveEnvUpdates(filePath, updates) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  }
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`);
}

async function resolveProductId(stripe, existingPriceId) {
  if (!existingPriceId) return null;
  const price = await stripe.prices.retrieve(existingPriceId);
  return typeof price.product === "string" ? price.product : price.product?.id ?? null;
}

async function main() {
  const envLocal = loadEnvFile(path.join(ROOT, ".env.local"));
  const secret = process.env.STRIPE_SECRET_KEY ?? envLocal.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("STRIPE_SECRET_KEY fehlt.");
    process.exit(1);
  }

  const stripe = new Stripe(secret);
  const mode = secret.startsWith("sk_live_") ? "live" : "test";
  console.log(`Stripe-Modus: ${mode}`);

  const created = {};
  const envUpdates = {};
  const only = process.env.SYNC_ONLY_PLAN; // z. B. enterprise

  for (const [plan, amounts] of Object.entries(PLAN_AMOUNTS)) {
    if (only && plan !== only) continue;
    const keys = ENV_KEYS[plan];
    let productId = await resolveProductId(stripe, envLocal[keys.monthly] ?? envLocal[keys.yearly]);
    if (!productId) {
      if (plan !== "enterprise") {
        console.error(`Kein Produkt für Plan "${plan}" gefunden. Bitte bestehende Price-ID in .env.local setzen.`);
        process.exit(1);
      }
      const product = await stripe.products.create({
        name: PRODUCT_NAMES.enterprise,
        metadata: { plan: "enterprise" },
      });
      productId = product.id;
      console.log(`Enterprise-Produkt angelegt: ${productId}`);
    }

    const monthly = await stripe.prices.create({
      product: productId,
      currency: "eur",
      unit_amount: amounts.monthlyList,
      recurring: { interval: "month" },
      metadata: { plan, interval: "monthly", pricing_tier: "list" },
    });

    const yearly = await stripe.prices.create({
      product: productId,
      currency: "eur",
      unit_amount: amounts.yearlyPromoAnnual,
      recurring: { interval: "year" },
      metadata: { plan, interval: "yearly", pricing_tier: "promo" },
    });

    created[plan] = { monthly: monthly.id, yearly: yearly.id };
    envUpdates[keys.monthly] = monthly.id;
    envUpdates[keys.yearly] = yearly.id;

    console.log(
      `${plan}: Monat ${amounts.monthlyList / 100} € → ${monthly.id} | Jahr ${amounts.yearlyPromoAnnual / 100} € → ${yearly.id}`,
    );
  }

  if (mode === "test") {
    saveEnvUpdates(path.join(ROOT, ".env.local"), envUpdates);
    console.log("\n.env.local aktualisiert.");
  } else {
    console.log("\nLive-Preise erstellt. Bitte IDs in Vercel/Produktion setzen:");
    console.log(JSON.stringify(envUpdates, null, 2));
  }

  console.log("\nJSON:", JSON.stringify(created, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
