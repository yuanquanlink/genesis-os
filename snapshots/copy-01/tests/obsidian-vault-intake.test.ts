import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import {
  importObsidianVaultIntake,
  OBSIDIAN_VAULT_IMPORT_CONFIRMATION,
  planObsidianVaultIntake,
} from "@/lib/knowledge/obsidian-vault-intake";
import { scanObsidianVault } from "@/lib/knowledge/obsidian-vault-scanner";

const directories: string[] = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-obsidian-intake-"));
  directories.push(directory);
  return directory;
}

function write(vault: string, relativePath: string, content: string) {
  const target = path.join(vault, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Obsidian Vault intake", () => {
  it("plans and imports only RAG-approved documents with explicit owner confirmation", () => {
    const vault = temporaryDirectory();
    write(vault, "03_Genesis OS/总览.md", "---\nrag: true\nsource: owner\ndate: 2026-08-19\nsummary: 项目总览\napplication: Agent context\n---\n# Genesis OS\n\n工程上下文。\n");
    write(vault, "05_每日复盘/日记.md", "# 今日复盘\n\n不应自动导入。\n");
    const manifest = scanObsidianVault({ vaultPath: vault });
    const databaseDirectory = temporaryDirectory();
    const repository = new ProfileRepository(path.join(databaseDirectory, "test.db"));
    try {
      expect(planObsidianVaultIntake(manifest)).toHaveLength(1);
      expect(() => importObsidianVaultIntake(manifest, repository, undefined)).toThrow("OBSIDIAN_IMPORT_OWNER_CONFIRMATION_REQUIRED");
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_sources").pluck().get())).toBe(0);

      const first = importObsidianVaultIntake(manifest, repository, OBSIDIAN_VAULT_IMPORT_CONFIRMATION);
      expect(first).toHaveLength(1);
      expect(first[0].duplicate).toBe(false);
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_sources").pluck().get())).toBe(1);
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_artifacts").pluck().get())).toBe(1);
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_units").pluck().get())).toBe(1);

      const repeated = importObsidianVaultIntake(manifest, repository, OBSIDIAN_VAULT_IMPORT_CONFIRMATION);
      expect(repeated[0].duplicate).toBe(true);
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_sources").pluck().get())).toBe(1);
    } finally {
      repository.close();
    }
  });

  it("rejects changed content until a new reviewed manifest version is handled", () => {
    const vault = temporaryDirectory();
    const relativePath = "03_Genesis OS/总览.md";
    write(vault, relativePath, "---\nrag: true\nsource: owner\ndate: 2026-08-19\nsummary: 项目总览\napplication: Agent context\n---\n# Genesis OS\n\n第一版。\n");
    const firstManifest = scanObsidianVault({ vaultPath: vault });
    const databaseDirectory = temporaryDirectory();
    const repository = new ProfileRepository(path.join(databaseDirectory, "test.db"));
    try {
      importObsidianVaultIntake(firstManifest, repository, OBSIDIAN_VAULT_IMPORT_CONFIRMATION);
      write(vault, relativePath, "---\nrag: true\nsource: owner\ndate: 2026-08-19\nsummary: 项目总览\napplication: Agent context\n---\n# Genesis OS\n\n第二版。\n");
      const changedManifest = scanObsidianVault({ vaultPath: vault });
      expect(() => importObsidianVaultIntake(changedManifest, repository, OBSIDIAN_VAULT_IMPORT_CONFIRMATION))
        .toThrow("OBSIDIAN_IMPORT_CONTENT_VERSION_REQUIRES_REVIEW");
      expect(Number(repository.db.prepare("SELECT count(*) FROM knowledge_sources").pluck().get())).toBe(1);
    } finally {
      repository.close();
    }
  });
});
