import path from "node:path";
import { ProfileRepository } from "../lib/db/repository";
import {
  importObsidianVaultIntake,
  OBSIDIAN_VAULT_IMPORT_CONFIRMATION,
  planObsidianVaultIntake,
} from "../lib/knowledge/obsidian-vault-intake";
import { readObsidianVaultManifest } from "../lib/knowledge/obsidian-vault-scanner";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireOption(name: string) {
  const value = option(name);
  if (!value || value.startsWith("--")) throw new Error(`OBSIDIAN_IMPORT_REQUIRES_${name.slice(2).toUpperCase()}`);
  return value;
}

const manifest = readObsidianVaultManifest(path.resolve(requireOption("--manifest")));
const planned = planObsidianVaultIntake(manifest);
console.log(`RAG-approved documents prepared: ${planned.length}`);
for (const item of planned) console.log(`PREVIEW ${item.relativePath}`);

if (!process.argv.includes("--apply")) {
  console.log("Preview only. No Genesis database records were written.");
  process.exit(0);
}

const confirmation = option("--owner-confirmation");
if (confirmation !== OBSIDIAN_VAULT_IMPORT_CONFIRMATION) throw new Error("OBSIDIAN_IMPORT_OWNER_CONFIRMATION_REQUIRED");
const databasePath = path.resolve(requireOption("--db"));
const repository = new ProfileRepository(databasePath);
try {
  const imported = importObsidianVaultIntake(manifest, repository, confirmation);
  console.log(`Imported documents: ${imported.length}`);
  console.log(`Idempotent duplicates: ${imported.filter((item) => item.duplicate).length}`);
} finally {
  repository.close();
}
