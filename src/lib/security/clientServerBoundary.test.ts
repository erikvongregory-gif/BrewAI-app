import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

/**
 * Ersatz für `import "server-only"` (Paket nicht installiert): Kein "use client"-Modul darf statisch Server-Code
 * erreichen. Sonst landen supabase-js, Admin-Client oder Next-Server-Interna im Browser-Bundle (Welle 2: +218 KB
 * auf /dashboard über `@/lib/billing/access`). Dynamische Importe und "use server"-Module sind ausgenommen.
 */
const SERVER_ONLY = [
  /^@\/lib\/supabase\/(server|admin|adminUsers)$/,
  /^next\/(server|headers|cache)$/,
  /^@\/lib\/dashboard\/(workspace|freshMetadata|studioBillingGate)$/,
  /^@\/lib\/auth\/owner$/,
  /^@\/lib\/billing\/(access|store|stripeSync|stripeServer)$/,
  /^stripe$/,
  /^@supabase\/supabase-js$/,
  /^(node:)?crypto$/,
];

const root = path.resolve(__dirname, "../../..");
const src = path.join(root, "src");

function listSources(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSources(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(src, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Statische Wert-Importe; reine Typ-Importe werden vom Compiler entfernt. */
function valueImports(code: string): string[] {
  const specs: string[] = [];
  for (const m of code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^"';]*?)\s*from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
    if (m[1]) continue;
    const braces = (m[2] ?? "").match(/^\{([\s\S]*)\}$/);
    if (braces && braces[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    specs.push(m[3] ?? m[4]);
  }
  return specs;
}

const directive = (code: string, name: string) => new RegExp(`^\\s*(//[^\\n]*\\n|/\\*[\\s\\S]*?\\*/\\s*)*["']${name}["']`).test(code);

it("keeps server-only modules out of client components", () => {
  const parent = new Map<string, string | null>();
  const queue: string[] = [];
  for (const file of listSources(src)) {
    if (directive(fs.readFileSync(file, "utf8"), "use client")) {
      parent.set(file, null);
      queue.push(file);
    }
  }
  const leaks: string[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    const code = fs.readFileSync(file, "utf8");
    if (directive(code, "use server")) continue;
    for (const spec of valueImports(code)) {
      if (SERVER_ONLY.some((re) => re.test(spec))) {
        const chain = [];
        for (let f: string | null | undefined = file; f; f = parent.get(f)) chain.unshift(path.relative(root, f));
        leaks.push(`${chain.join(" -> ")} -> ${spec}`);
      }
      const next = resolveLocal(file, spec);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  expect(leaks).toEqual([]);
});
