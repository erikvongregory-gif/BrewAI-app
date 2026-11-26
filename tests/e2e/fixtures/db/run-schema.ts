import { applySchema, inventory } from "./apply-schema";

// Manuell: npx tsx tests/e2e/fixtures/db/run-schema.ts
applySchema()
  .then(async () => console.log(JSON.stringify(await inventory(), null, 1)))
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
