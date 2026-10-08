import { randomUUID } from "node:crypto";
import type { ProfileRepository } from "@/lib/db/repository";
import { UsageService } from "@/lib/services/usage-service";

const USER_ID = "genesis-owner";
const FORMAT = "genesis-os-backup";
const VERSION = 1;
const excludedTables = new Set(["schema_migrations", "ai_cache", "knowledge_items_fts"]);
type Row = Record<string, unknown>;
type Backup = { format: typeof FORMAT; version: typeof VERSION; exportedAt: string; tables: Record<string, Row[]> };

function now() { return new Date().toISOString(); }
function asRows(value: unknown): Row[] { return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }

export class DataPortabilityService {
  constructor(private readonly repository: ProfileRepository) {}

  private tables() {
    return (this.repository.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
      .map((item) => item.name)
      .filter((name) => !excludedTables.has(name) && !name.startsWith("knowledge_items_fts_"));
  }

  exportJson(): Backup {
    const tables = Object.fromEntries(this.tables().map((name) => [name, this.repository.db.prepare(`SELECT * FROM \"${name}\"`).all() as Row[]]));
    return { format: FORMAT, version: VERSION, exportedAt: now(), tables };
  }

  exportMarkdown() {
    const db = this.repository.db;
    const facts = db.prepare("SELECT content,fact_type,confidence FROM profile_facts WHERE user_id=? AND status='active' ORDER BY updated_at DESC").all(USER_ID) as Row[];
    const abilities = db.prepare("SELECT name,current_level,confidence FROM growth_nodes WHERE user_id=? AND node_type='ability' AND status='active' ORDER BY current_level DESC,name").all(USER_ID) as Row[];
    const goals = db.prepare("SELECT title,status,target_ability FROM learning_goals WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC").all(USER_ID) as Row[];
    const strategies = db.prepare("SELECT period_key,confidence,created_at FROM growth_strategies WHERE user_id=? ORDER BY created_at DESC LIMIT 4").all(USER_ID) as Row[];
    const usage = new UsageService(this.repository).snapshot();
    const line = (value: unknown) => String(value).replace(/[\r\n]+/g, " ");
    return [
      "# Genesis OS Personal Growth Report",
      "",
      `Generated: ${now()}`,
      "",
      "## Digital Life",
      ...(facts.length ? facts.map((item) => `- ${line(item.content)} (${line(item.fact_type)}, confidence ${Math.round(Number(item.confidence) * 100)}%)`) : ["- No approved formal facts yet."]),
      "",
      "## Growth Graph",
      ...(abilities.length ? abilities.map((item) => `- ${line(item.name)}: ${Number(item.current_level)}/5, confidence ${Math.round(Number(item.confidence) * 100)}%`) : ["- No approved ability nodes yet."]),
      "",
      "## Evidence",
      `- Total user evidence: ${usage.metrics.evidenceTotal}`,
      `- Added in the last 7 days: ${usage.metrics.evidenceAddedLast7Days}`,
      "",
      "## Learning History",
      ...(goals.length ? goals.map((item) => `- ${line(item.title)} (${line(item.target_ability)}): ${line(item.status)}`) : ["- No learning goals yet."]),
      `- Mission completion rate over the last 7 days: ${usage.metrics.learningCompletionRate === null ? "not enough data" : `${Math.round(usage.metrics.learningCompletionRate * 100)}%`}`,
      "",
      "## Strategies",
      ...(strategies.length ? strategies.map((item) => `- ${line(item.period_key)} strategy, confidence ${Math.round(Number(item.confidence) * 100)}%, created ${line(item.created_at)}`) : ["- No approved strategy yet."]),
      "",
      "## Usage",
      `- AI calls: ${usage.ai.totalCalls}; failures: ${usage.ai.failedCalls}; average latency: ${usage.ai.averageLatencyMs}ms`,
      "",
      "This report contains user data. Store it securely. It does not contain API keys.",
      "",
    ].join("\n");
  }

  preview(raw: unknown) {
    const backup = this.parse(raw);
    const tables = this.tables();
    const recognized = Object.entries(backup.tables).filter(([name]) => tables.includes(name));
    return { format: backup.format, version: backup.version, exportedAt: backup.exportedAt, recognizedTables: recognized.length, records: recognized.reduce((sum, [, rows]) => sum + rows.length, 0), ignoredTables: Object.keys(backup.tables).filter((name) => !tables.includes(name)) };
  }

  import(raw: unknown) {
    const backup = this.parse(raw);
    const tableNames = this.tables();
    const before = new Map<string, number>();
    const count = (name: string) => Number((this.repository.db.prepare(`SELECT count(*) AS count FROM \"${name}\"`).get() as { count: number }).count);
    for (const name of tableNames) before.set(name, count(name));
    this.repository.db.pragma("foreign_keys = OFF");
    try {
      this.repository.db.transaction(() => {
        for (const name of tableNames) {
          const columns = (this.repository.db.prepare(`PRAGMA table_info(\"${name}\")`).all() as Array<{ name: string }>).map((item) => item.name);
          for (const source of asRows(backup.tables[name])) {
            const keys = columns.filter((column) => source[column] === null || ["string", "number"].includes(typeof source[column]));
            if (!keys.length) continue;
            const placeholders = keys.map(() => "?").join(",");
            const values = keys.map((key) => source[key]);
            this.repository.db.prepare(`INSERT OR IGNORE INTO \"${name}\" (${keys.map((key) => `\"${key}\"`).join(",")}) VALUES (${placeholders})`).run(...values);
          }
        }
        const violations = this.repository.db.pragma("foreign_key_check") as unknown[];
        if (violations.length) throw new Error("IMPORT_FOREIGN_KEY_VIOLATION");
        this.repository.db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
          .run(randomUUID(), USER_ID, "data_portability.import_merged", "backup", FORMAT, null, JSON.stringify({ exportedAt: backup.exportedAt, version: backup.version }), now());
      })();
    } finally {
      this.repository.db.pragma("foreign_keys = ON");
    }
    const inserted = tableNames.reduce((sum, name) => sum + Math.max(0, count(name) - (before.get(name) || 0)), 0);
    return { inserted, scannedTables: tableNames.length, message: "Backup merged. Existing records were never overwritten; pending approvals remain pending." };
  }

  private parse(raw: unknown): Backup {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("BACKUP_INVALID");
    const value = raw as Record<string, unknown>;
    if (value.format !== FORMAT || value.version !== VERSION || typeof value.exportedAt !== "string" || !value.tables || typeof value.tables !== "object" || Array.isArray(value.tables)) throw new Error("BACKUP_INVALID");
    const tables = Object.fromEntries(Object.entries(value.tables as Record<string, unknown>).map(([name, rows]) => [name, asRows(rows)]));
    return { format: FORMAT, version: VERSION, exportedAt: value.exportedAt, tables };
  }
}
