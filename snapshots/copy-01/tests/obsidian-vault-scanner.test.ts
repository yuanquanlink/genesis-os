import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffObsidianVaultManifests, scanObsidianVault } from "@/lib/knowledge/obsidian-vault-scanner";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-obsidian-vault-"));
  temporaryDirectories.push(directory);
  return directory;
}

function write(directory: string, relativePath: string, content: string) {
  const target = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Obsidian Vault scanner", () => {
  it("reads Markdown deterministically while excluding Obsidian state and AI output by default", () => {
    const vault = temporaryDirectory();
    write(vault, "欢迎.md", "# The One AI Brain\n\n正式入口。\n");
    write(vault, "03_Genesis OS/设计.md", "---\ntitle: 系统设计\nrag: true\nsource: owner\ndate: 2026-08-19\nsummary: 架构说明\napplication: Genesis OS\n---\n# 忽略的标题\n");
    write(vault, ".obsidian/workspace.md", "# 不应入库\n");
    write(vault, "90-AI-Output/临时.md", "# 默认排除\n");

    const manifest = scanObsidianVault({ vaultPath: vault });

    expect(manifest.documents.map((document) => document.relativePath)).toEqual(["03_Genesis OS/设计.md", "欢迎.md"]);
    expect(manifest.documents[0]).toMatchObject({ title: "系统设计", metadataStatus: "complete", missingMetadata: [] });
    expect(manifest.documents[1]).toMatchObject({ title: "The One AI Brain", metadataStatus: "unmanaged", missingMetadata: [] });
    expect(manifest.excludedDirectories).toEqual([".obsidian", "90-AI-Output"]);
  });

  it("reports content-based incremental changes without mutating the Vault", () => {
    const vault = temporaryDirectory();
    write(vault, "A.md", "# A\n\nfirst\n");
    write(vault, "B.md", "# B\n\nremove me\n");
    const previous = scanObsidianVault({ vaultPath: vault });

    write(vault, "A.md", "# A\n\nsecond\n");
    fs.rmSync(path.join(vault, "B.md"));
    write(vault, "C.md", "# C\n\nnew\n");
    const current = scanObsidianVault({ vaultPath: vault });

    expect(diffObsidianVaultManifests(previous, current)).toEqual({
      added: ["C.md"],
      changed: ["A.md"],
      removed: ["B.md"],
      unchanged: [],
    });
  });

  it("rejects an unavailable Vault path", () => {
    expect(() => scanObsidianVault({ vaultPath: path.join(temporaryDirectory(), "missing") })).toThrow("OBSIDIAN_VAULT_NOT_FOUND");
  });
});
