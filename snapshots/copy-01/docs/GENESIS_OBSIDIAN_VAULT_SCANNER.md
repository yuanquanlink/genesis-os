# Genesis OS Obsidian Vault Scanner

## Purpose

`knowledge:scan-vault` is a read-only bridge from an explicitly named Obsidian Vault to a versioned manifest. It creates no Vault files, changes no Markdown content, and writes no Genesis formal Knowledge, Memory, Evidence, Ability, or Context records.

## Command

```powershell
npm.cmd run knowledge:scan-vault -- --vault "D:\AI_Knowledge\The One AI Brain" --out "artifacts\obsidian-vault-manifest.json"
```

The output path must be outside the Vault. A later run can compare against a prior manifest:

```powershell
npm.cmd run knowledge:scan-vault -- --vault "D:\AI_Knowledge\The One AI Brain" --previous "artifacts\obsidian-vault-manifest.json" --out "artifacts\obsidian-vault-manifest-next.json"
```

## Safety boundary

- The Vault path is explicit; no home-directory or drive-wide discovery occurs.
- Only Markdown files no larger than 2 MB are read.
- Symbolic links are skipped.
- `.obsidian` and `90-AI-Output` are excluded by default. `--include-ai-output` is an explicit opt-in.
- The command refuses an output path inside the Vault.

## Manifest fields

Each document records a relative path, title, SHA-256 content hash, size, modification time and simple YAML frontmatter. A document enters metadata validation when its frontmatter contains `rag: true`, `agentReadable: true`, or any RAG metadata field. It then receives `complete` or `incomplete` status plus missing fields. Other notes remain `unmanaged` and are not misreported as invalid. The manifest also has a snapshot hash and an optional added/changed/removed/unchanged diff.

## Integration boundary

The scanner is an intake adapter, not an automatic importer. A future integration must map reviewed manifest entries into the existing Knowledge Source, Artifact and Unit lifecycle, preserve source hashes, and require explicit owner approval before any formal projection. It must not promote raw Vault content into Memory, Evidence, Ability, Mastery, or Context automatically.

## Reviewed intake command

The companion command prepares only documents with `metadataStatus="complete"`:

```powershell
npm.cmd run knowledge:import-vault -- --manifest "artifacts\obsidian-vault-manifest-final.json"
```

This is preview-only. A database write requires an explicit database path, `--apply`, and the exact owner confirmation token. It rechecks every file hash before writing a user-owned Knowledge Source, a parsed Artifact and a Note Unit. The same manifest is idempotent; changed content at an existing Obsidian locator is rejected for separate owner review rather than silently versioned.
