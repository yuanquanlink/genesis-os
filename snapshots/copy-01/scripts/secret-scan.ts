import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const listed = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  shell: false,
});
if (listed.status !== 0) throw new Error("SECRET_SCAN_GIT_INVENTORY_FAILED");

const textExtensions = new Set(["", ".css", ".cjs", ".example", ".js", ".json", ".md", ".mjs", ".sql", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[A-Za-z0-9_-]{30,}\b/,
  /\bgh[opsu]_[A-Za-z0-9]{24,}\b/,
];
const sensitiveName = /(^|\/)(?:\.env(?:\..+)?|[^/]+\.(?:pem|p12|pfx|key))$/i;
const allowedName = /(^|\/)\.env\.example$/i;
const assignment = /\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|PRIVATE_KEY|CLIENT_SECRET|CRON_SECRET)[ \t]*=[ \t]*["']?([^\s"']+)/gi;
const placeholder = /^(?:<.*>|\$\{|example|placeholder|replace|test|fake|dummy|redacted|your[-_]|你的)/i;
const findings: Array<{ file: string; kind: string }> = [];

for (const relative of listed.stdout.split(/\r?\n/).filter(Boolean)) {
  const normalized = relative.replace(/\\/g, "/");
  if (sensitiveName.test(normalized) && !allowedName.test(normalized)) {
    findings.push({ file: normalized, kind: "sensitive filename" });
    continue;
  }
  const target = path.join(root, relative);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile() || fs.statSync(target).size > 2 * 1024 * 1024) continue;
  if (!textExtensions.has(path.extname(target).toLowerCase())) continue;
  const content = fs.readFileSync(target, "utf8");
  if (secretPatterns.some((pattern) => pattern.test(content))) findings.push({ file: normalized, kind: "credential pattern" });
  for (const match of content.matchAll(assignment)) {
    const value = match[1];
    if (value && !placeholder.test(value)) findings.push({ file: normalized, kind: "non-empty secret assignment" });
  }
}

const unique = [...new Map(findings.map((finding) => [`${finding.file}:${finding.kind}`, finding])).values()];
console.log(`Secret scan inspected ${listed.stdout.split(/\r?\n/).filter(Boolean).length} tracked/unignored file(s).`);
if (unique.length) {
  for (const finding of unique) console.error(`SECRET_SCAN_VIOLATION ${finding.file}: ${finding.kind}`);
  process.exitCode = 1;
} else console.log("PASS no private-key, provider-key, token, password, or forbidden secret-file pattern detected.");
