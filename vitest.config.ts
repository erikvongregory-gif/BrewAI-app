import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Die PGlite-Tests (atomicBilling, goLiveBilling) starten eine WASM-Postgres
    // und spielen Schema + Migration ein. Allein dauert der Test mit zweiter
    // Datenbank ~2,3 s; im Gesamtlauf teilen sich alle Worker die CPU, dann
    // reißt der Standard von 5 s/10 s (Test/Hook). Großzügige Grenzen machen den
    // Lauf deterministisch; echte Hänger fallen weiterhin auf.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Lokale Kopien, Vorlagen und Exporte nie als Tests einsammeln.
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/.next/**",
      "_template_dashboard/**",
      "_import-evglab-dashboard/**",
      "_t-onb2-prototype/**",
      "_t3-preview/**",
      "_t4-preview/**",
      "graphify-out/**",
      "BrewAI-Cursor-Handoff/**",
    ],
  },
});
