import fs from "node:fs";
import path from "node:path";
import {
  diffObsidianVaultManifests,
  readObsidianVaultManifest,
  scanObsidianVault,
} from "../lib/knowledge/obsidian-vault-scanner";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireOption(name: string) {
  const value = option(name);
  if (!value || value.startsWith("--")) throw new Error(`OBSIDIAN_VAULT_SCAN_REQUIRES_${name.slice(2).toUpperCase()}`);
  return value;
}

function isInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const vaultPath = path.resolve(requireOption("--vault"));
const outputPath = path.resolve(requireOption("--out"));
if (isInside(vaultPath, outputPath)) throw new Error("OBSIDIAN_VAULT_SCAN_OUTPUT_MUST_BE_OUTSIDE_VAULT");

const manifest = scanObsidianVault({
  vaultPath,
  includeAiOutput: process.argv.includes("--include-ai-output"),
});
const previousPath = option("--previous");
const incremental = previousPath ? diffObsidianVaultManifests(readObsidianVaultManifest(path.resolve(previousPath)), manifest) : null;
const report = { ...manifest, incremental };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`Vault documents: ${manifest.documents.length}`);
console.log(`Snapshot hash: ${manifest.snapshotHash}`);
if (incremental) {
  console.log(`Incremental changes: +${incremental.added.length} ~${incremental.changed.length} -${incremental.removed.length}`);
}
console.log(`Manifest written outside Vault: ${outputPath}`);
