import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applySchema } from "./db/apply-schema";
import { MOCK_DIR, testEnv } from "./env";
import { seedAll } from "./seed";

export default async function globalSetup() {
  testEnv(); // bricht ab, wenn .env.test.local nicht auf das Testprojekt zeigt
  mkdirSync(MOCK_DIR, { recursive: true });
  for (const f of ["guard-violations.jsonl", "ai-calls.jsonl"]) rmSync(join(MOCK_DIR, f), { force: true });
  writeFileSync(join(MOCK_DIR, "ai-mock.json"), JSON.stringify({ mode: "500" }));
  await applySchema();
  await seedAll();
}
