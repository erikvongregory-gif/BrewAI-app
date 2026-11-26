import { sql } from "./apply-schema";
// Hilfsabfrage für Diagnose: npx tsx tests/e2e/fixtures/db/q.ts "<sql>"
sql(process.argv[2]).then((r) => console.log(JSON.stringify(r, null, 1))).catch((e) => { console.error(e.message); process.exit(1); });
