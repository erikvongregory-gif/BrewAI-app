// Wird per NODE_OPTIONS=--import in den Next-Testserver geladen (nur E2E, nie in Produktion).
// 1. Guard: jede serverseitige Anfrage an *.brewai.de oder die Produktions-Supabase wird blockiert und protokolliert.
// 2. KI-Mock: api.openai.com / api.anthropic.com / api.kie.ai / api.resend.com antworten lokal, es entstehen keine Kosten.
//    Modus pro Anfrage: Marker im Request-Body "[[e2e:500]]" | "[[e2e:timeout]]" | "[[e2e:ok]]" | "[[e2e:tiny]]",
//    sonst Standard aus .state/ai-mock.json ({"mode":"ok"|"500"|"timeout"|"tiny"}), sonst "500".
//    "tiny" liefert ein 96x96-Bild (unerwartete Provider-Antwort).
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATE = join(dirname(fileURLToPath(import.meta.url)), "..", ".state");
mkdirSync(STATE, { recursive: true });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
let sharpMod = null;
/** PNG in der angefragten Größe (die App schneidet danach auf das Zielformat zu). */
async function pngOfSize(size) {
  const [w, h] = String(size || "1024x1024").split("x").map((n) => Number(n) || 1024);
  sharpMod ??= createRequire(join(ROOT, "package.json"))("sharp");
  const buf = await sharpMod({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 120, b: 40 } } }).png().toBuffer();
  return buf.toString("base64");
}
const PROD_REF = "lutmsbxcjmocftiovwfs";
const MOCK_HOSTS = new Set(["api.openai.com", "api.anthropic.com", "api.kie.ai", "api.resend.com", "api.photoroom.com", "api.remove.bg"]);
// 96x96 PNG (gültig für sharp-Zuschnitt/Wasserzeichen)
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAACXBIWXMAAAPoAAAD6AG1e1JrAAABB0lEQVR4nO3ZwQ3CMADF0I7jERmsAzIBXKrq5/CkTGD5m4Re9yfn/g3hQuf+qwhAAdSTlTAogGJQ7/3UmFgAxaBMrNWFVoMCKAZlYmlQZ/6vINIBFIMysTSoeY9FOoBiUCbWvDsuigEUgzKx5gHyWA2gGJSJpUHNYyzSARSDMrHm0XFRDKAYlIl1yPFlNYBiUCaWBjXvsUgHUAzKxJp3x0UxgGJQJtY8QB6rARSDMrE0qHmMRTqAYlAm1jw6LooBFIMysQ45vqwGUAzKxNKg5j0W6QCKQZlY8+64KAZQDMrEmgfIYzWAYlAmlgY1j7FIB1AMysSaR8dFMYBiUCbWIceX1QDqiUFf9P7SwrA4uwkAAAAASUVORK5CYII=";

const forbidden = (host) => {
  const h = String(host || "").toLowerCase();
  return h === "brewai.de" || h.endsWith(".brewai.de") || h.includes(PROD_REF);
};
const log = (file, obj) => {
  try {
    appendFileSync(join(STATE, file), JSON.stringify({ t: new Date().toISOString(), pid: process.pid, ...obj }) + "\n");
  } catch {
    /* ignore */
  }
};
const defaultMode = () => {
  try {
    return JSON.parse(readFileSync(join(STATE, "ai-mock.json"), "utf8")).mode || "500";
  } catch {
    return "500";
  }
};

async function bodyText(input, init) {
  try {
    const b = init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (b == null) return "";
    if (typeof b === "string") return b;
    if (b instanceof FormData) {
      let s = "";
      for (const [k, v] of b.entries()) if (typeof v === "string") s += `${k}=${v}\n`;
      return s;
    }
    if (b instanceof URLSearchParams) return b.toString();
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return Buffer.from(b.buffer ?? b).toString("utf8");
    if (typeof b.text === "function") return await b.text();
    return String(b);
  } catch {
    return "";
  }
}

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

function okResponse(host, path) {
  if (host === "api.openai.com" && path.includes("/images")) return json(200, { created: 1, data: [{ b64_json: PNG_B64 }], usage: { total_tokens: 1 } });
  if (host === "api.openai.com") return json(200, { id: "e2e", choices: [{ message: { role: "assistant", content: "E2E-Mock" } }], output_text: "E2E-Mock" });
  if (host === "api.anthropic.com")
    return json(200, { id: "msg_e2e", type: "message", role: "assistant", model: "e2e", content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
  if (host === "api.resend.com") return json(200, { id: "e2e-mail" });
  return json(200, { code: 200, data: { taskId: "e2e-task" } });
}

const realFetch = globalThis.fetch;
globalThis.fetch = async function e2eFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
  if (forbidden(url.hostname)) {
    log("guard-violations.jsonl", { side: "server", url: url.origin + url.pathname });
    throw new Error(`E2E-GUARD: Anfrage an Produktionshost blockiert (${url.hostname})`);
  }
  if (MOCK_HOSTS.has(url.hostname)) {
    const text = await bodyText(input, init);
    const marker = text.match(/\[\[e2e:(ok|500|timeout|tiny)\]\]/);
    const mode = marker ? marker[1] : defaultMode();
    log("ai-calls.jsonl", { host: url.hostname, path: url.pathname, mode });
    if (mode === "timeout") {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 60_000);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(signal.reason ?? new DOMException("aborted", "AbortError"));
        });
      });
      return json(504, { error: { message: "E2E-Mock timeout" } });
    }
    if (mode === "tiny") return json(200, { created: 1, data: [{ b64_json: PNG_B64 }] });
    if (mode === "ok" && url.hostname === "api.openai.com" && url.pathname.includes("/images")) {
      const size = (text.match(/size[=":\s]+(\d+x\d+)/) || [])[1];
      return json(200, { created: 1, data: [{ b64_json: await pngOfSize(size) }], usage: { total_tokens: 1 } });
    }
    if (mode === "ok") return okResponse(url.hostname, url.pathname);
    return json(500, { error: { message: "E2E-Mock: Provider-Fehler 500", type: "server_error" } });
  }
  return realFetch(input, init);
};

// Node http/https (z. B. Stripe-SDK) nur auf verbotene Hosts prüfen.
for (const mod of [http, https]) {
  for (const fn of ["request", "get"]) {
    const orig = mod[fn];
    mod[fn] = function guarded(...args) {
      const a = args[0];
      const host = typeof a === "string" || a instanceof URL ? new URL(String(a)).hostname : a?.hostname || a?.host;
      if (forbidden(host)) {
        log("guard-violations.jsonl", { side: "server-http", host });
        throw new Error(`E2E-GUARD: Anfrage an Produktionshost blockiert (${host})`);
      }
      return orig.apply(this, args);
    };
  }
}
log("preload.jsonl", { loaded: true });
