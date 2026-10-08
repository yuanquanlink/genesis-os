import fs from "node:fs";
import path from "node:path";
import { setupRunner } from "@/scripts/setup-runner";

const root = process.cwd();
const nodeMarker = path.join(root, "node_modules", "tsx", "package.json");
if (!fs.existsSync(nodeMarker))
  throw new Error("GENESIS_BOOTSTRAP_NODE_DEPENDENCIES_MISSING: run npm ci first. Bootstrap never installs Node packages implicitly.");

const migrations = fs.readdirSync(path.join(root, "lib", "db", "migrations"))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
for (let index = 0; index < migrations.length; index += 1) {
  const expected = String(index + 1).padStart(4, "0");
  if (!migrations[index].startsWith(`${expected}_`))
    throw new Error(`GENESIS_BOOTSTRAP_MIGRATION_GAP: expected migration ${expected}, found ${migrations[index]}.`);
}

setupRunner(root);
console.log(`Bootstrap validation complete: ${migrations.length} ordered migration(s) found.`);
console.log("Next: set an isolated GENESIS_DB_PATH when testing, run npm run db:migrate, then npm test.");
