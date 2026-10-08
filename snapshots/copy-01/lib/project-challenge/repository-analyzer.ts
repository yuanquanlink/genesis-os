import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

const MAX_FILES = 1_000;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".toml", ".yaml", ".yml", ".md", ".txt", ".ini", ".cfg", ".sql", ".sh", ".ps1"]);
const SKIP_DIRECTORIES = new Set([".git", "node_modules", ".next", ".venv", "venv", "__pycache__", "dist", "build", ".pytest_cache"]);
const FORBIDDEN_NAMES = /(^|\/)(\.env($|\.)|id_rsa|id_ed25519|.*\.(pem|key|p12|pfx)|genesis\.db($|-))/i;

export type SecurityFinding = { file: string; line: number; code: string; message: string; severity: "high" | "medium" };
export type RepositoryFile = { relativePath: string; fileKind: string; sizeBytes: number; contentHash: string };
export type RepositoryAnalysis = {
  primaryLanguage: string;
  fileCount: number;
  totalBytes: number;
  structure: string[];
  manifests: string[];
  readme: { present: boolean; path: string | null; hasRunSteps: boolean; hasOpenApi: boolean; hasReflection: boolean };
  tests: { files: string[]; hasUnit: boolean; hasIntegration: boolean; usesPytest: boolean; usesTestClient: boolean };
  migrations: string[];
  apiRoutes: Array<{ method: string; route: string; file: string }>;
  errorHandling: string[];
  gitSummary: { available: boolean; commitSignals: number; note: string };
  securityFindings: SecurityFinding[];
  analysisScore: number;
  status: "complete" | "partial" | "failed";
  files: RepositoryFile[];
  fastApiModule: string | null;
  signals: {
    pydanticModels: boolean;
    parameterValidation: boolean;
    database: boolean;
    authentication: boolean;
    aiProvider: boolean;
    deployment: boolean;
  };
};

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const slash = (value: string) => value.split(path.sep).join("/");

function safeRelative(value: string) {
  const normalized = slash(value).replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes(".."))
    throw new Error("PROJECT_ARCHIVE_UNSAFE_PATH");
  return normalized;
}

function storageRoot() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.GENESIS_CHALLENGE_STORAGE_PATH || "./data/challenges");
}

function ensureInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  throw new Error("PROJECT_PATH_OUTSIDE_ALLOWED_ROOT");
}

function allowedImportRoots() {
  const configured = process.env.GENESIS_PROJECT_IMPORT_ROOTS || path.join(/* turbopackIgnore: true */ process.cwd(), "data", "project-imports");
  return configured.split(path.delimiter).map((item) => path.resolve(/* turbopackIgnore: true */ item.trim())).filter(Boolean);
}

function validateImportRoot(sourcePath: string) {
  const source = fs.realpathSync(/* turbopackIgnore: true */ path.resolve(sourcePath));
  const allowed = allowedImportRoots().map((root) => fs.existsSync(/* turbopackIgnore: true */ root) ? fs.realpathSync(/* turbopackIgnore: true */ root) : path.resolve(/* turbopackIgnore: true */ root));
  if (!allowed.some((root) => {
    const relative = path.relative(root, source);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  })) throw new Error("PROJECT_PATH_NOT_ALLOWED");
  if (!fs.statSync(/* turbopackIgnore: true */ source).isDirectory()) throw new Error("PROJECT_PATH_NOT_DIRECTORY");
  return source;
}

function walk(root: string) {
  const files: Array<{ absolute: string; relative: string; size: number }> = [];
  let total = 0;
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(/* turbopackIgnore: true */ directory, { withFileTypes: true })) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      const absolute = path.join(/* turbopackIgnore: true */ directory, entry.name);
      const relative = safeRelative(path.relative(root, absolute));
      const stat = fs.lstatSync(/* turbopackIgnore: true */ absolute);
      if (stat.isSymbolicLink()) throw new Error(`PROJECT_SYMLINK_REJECTED:${relative}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        if (stat.size > MAX_FILE_BYTES) throw new Error(`PROJECT_FILE_TOO_LARGE:${relative}`);
        total += stat.size;
        if (total > MAX_TOTAL_BYTES) throw new Error("PROJECT_TOTAL_SIZE_EXCEEDED");
        files.push({ absolute, relative, size: stat.size });
        if (files.length > MAX_FILES) throw new Error("PROJECT_FILE_COUNT_EXCEEDED");
      }
    }
  };
  visit(root);
  return { files, total };
}

function copyRepository(source: string, destination: string) {
  const { files } = walk(source);
  fs.mkdirSync(destination, { recursive: true });
  for (const file of files) {
    if (FORBIDDEN_NAMES.test(file.relative)) continue;
    const target = path.resolve(/* turbopackIgnore: true */ destination, file.relative);
    ensureInside(destination, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(/* turbopackIgnore: true */ file.absolute, target);
  }
}

export async function ingestZip(submissionId: string, archive: Buffer) {
  if (archive.length > 20 * 1024 * 1024) throw new Error("PROJECT_ARCHIVE_TOO_LARGE");
  const root = path.join(/* turbopackIgnore: true */ storageRoot(), submissionId);
  fs.mkdirSync(root, { recursive: true });
  const zip = await JSZip.loadAsync(archive, { checkCRC32: true });
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_FILES) throw new Error("PROJECT_FILE_COUNT_EXCEEDED");
  let total = 0;
  for (const entry of entries) {
    const relative = safeRelative(entry.name);
    if (SKIP_DIRECTORIES.has(relative.split("/")[0] || "") || FORBIDDEN_NAMES.test(relative)) continue;
    const content = await entry.async("nodebuffer");
    total += content.length;
    if (content.length > MAX_FILE_BYTES) throw new Error(`PROJECT_FILE_TOO_LARGE:${relative}`);
    if (total > MAX_TOTAL_BYTES) throw new Error("PROJECT_TOTAL_SIZE_EXCEEDED");
    const target = path.resolve(/* turbopackIgnore: true */ root, relative);
    ensureInside(root, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { flag: "wx" });
  }
  return root;
}

export function ingestLocalPath(submissionId: string, sourcePath: string) {
  const source = validateImportRoot(sourcePath);
  const root = path.join(/* turbopackIgnore: true */ storageRoot(), submissionId);
  copyRepository(source, root);
  return root;
}

export function removeSubmissionFiles(root: string) {
  const storage = storageRoot();
  const resolved = path.resolve(/* turbopackIgnore: true */ root);
  ensureInside(storage, resolved);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function textContent(file: { absolute: string; relative: string; size: number }) {
  if (!TEXT_EXTENSIONS.has(path.extname(file.relative).toLowerCase()) || file.size > MAX_FILE_BYTES) return "";
  return fs.readFileSync(/* turbopackIgnore: true */ file.absolute, "utf8").replace(/\0/g, "");
}

export function scanUnsafeCode(root: string): SecurityFinding[] {
  const { files } = walk(root);
  const findings: SecurityFinding[] = [];
  const rules: Array<[RegExp, string, string]> = [
    [/\b(import|from)\s+(socket|subprocess|multiprocessing|ctypes|winreg|requests|urllib|httpx|aiohttp|ftplib|smtplib|paramiko)\b/, "forbidden_import", "受限 Runner 禁止进程、底层系统或网络模块"],
    [/\b(os\.system|os\.popen|subprocess\.|eval\s*\(|exec\s*\(|__import__\s*\(|importlib\.)/, "dynamic_execution", "禁止动态执行或启动子进程"],
    [/\b(os\.environ|os\.getenv|dotenv|load_dotenv)\b/, "environment_access", "禁止读取 Runner 环境变量或 .env"],
    [/\b(open\s*\(|Path\s*\([^)]*\)\.(read|write|unlink|rename)|shutil\.(rmtree|move)|os\.(remove|unlink|rmdir|rename|replace))/, "filesystem_access", "受限 Runner 不允许任意文件系统访问或删除"],
    [/(['"])(?:[a-z]:\\|\/(?:etc|home|root|Users|var|tmp)\/|\.\.\/)/i, "path_escape", "禁止系统绝对路径或父目录逃逸"],
  ];
  for (const file of files) {
    if (FORBIDDEN_NAMES.test(file.relative)) findings.push({ file: file.relative, line: 1, code: "secret_file", message: "提交中包含环境文件、密钥或 Genesis 数据库", severity: "high" });
    const content = textContent(file);
    if (!content) continue;
    content.split(/\r?\n/).forEach((line, index) => {
      for (const [pattern, code, message] of rules)
        if (pattern.test(line)) findings.push({ file: file.relative, line: index + 1, code, message, severity: "high" });
      if (/sk-[a-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i.test(line))
        findings.push({ file: file.relative, line: index + 1, code: "hardcoded_secret", message: "检测到疑似硬编码密钥", severity: "high" });
      if (/debug\s*=\s*true|allow_origins\s*=\s*\[?\s*['"]\*['"]|verify\s*=\s*false/i.test(line))
        findings.push({ file: file.relative, line: index + 1, code: "dangerous_config", message: "检测到明显危险的生产配置", severity: "medium" });
    });
  }
  return findings;
}

export function analyzeRepository(root: string): RepositoryAnalysis {
  const { files, total } = walk(root);
  const records: RepositoryFile[] = [];
  const structure: string[] = [];
  const manifests: string[] = [];
  const tests: string[] = [];
  const migrations: string[] = [];
  const errorHandling: string[] = [];
  const apiRoutes: RepositoryAnalysis["apiRoutes"] = [];
  const languageCounts = new Map<string, number>();
  let allText = "";
  let readmePath: string | null = null;
  let readmeText = "";
  let fastApiModule: string | null = null;
  for (const file of files) {
    const buffer = fs.readFileSync(/* turbopackIgnore: true */ file.absolute);
    const extension = path.extname(file.relative).toLowerCase();
    const kind = extension === ".py" ? "python" : [".ts", ".tsx"].includes(extension) ? "typescript" : [".js", ".jsx"].includes(extension) ? "javascript" : extension.slice(1) || "file";
    records.push({ relativePath: file.relative, fileKind: kind, sizeBytes: file.size, contentHash: digest(buffer) });
    structure.push(file.relative);
    languageCounts.set(kind, (languageCounts.get(kind) || 0) + 1);
    if (/^(requirements[^/]*\.txt|pyproject\.toml|package\.json|poetry\.lock|Pipfile)$/i.test(path.basename(file.relative))) manifests.push(file.relative);
    if (/(^|\/)(tests?|__tests__)(\/|$)|(^|\/)test_[^/]+\.py$|\.(test|spec)\.[jt]sx?$/i.test(file.relative)) tests.push(file.relative);
    if (/migrations?|alembic|\.sql$/i.test(file.relative)) migrations.push(file.relative);
    if (/^readme(\.[a-z0-9]+)?$/i.test(path.basename(file.relative))) { readmePath ||= file.relative; readmeText ||= buffer.toString("utf8"); }
    const content = textContent(file);
    if (!content) continue;
    allText += `\n${content}`;
    if (extension === ".py") {
      const routePattern = /@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
      for (const match of content.matchAll(routePattern)) apiRoutes.push({ method: String(match[1]).toUpperCase(), route: String(match[2]), file: file.relative });
      if (!fastApiModule && /\bFastAPI\s*\(/.test(content) && /\bapp\s*=\s*FastAPI\s*\(/.test(content)) fastApiModule = file.relative.replace(/\.py$/, "").replace(/\//g, ".");
    }
    if (/HTTPException|exception_handler|try\s*:|except\s+/.test(content)) errorHandling.push(file.relative);
  }
  const securityFindings = scanUnsafeCode(root);
  const primaryLanguage = [...languageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
  const testText = tests.map((relative) => fs.readFileSync(/* turbopackIgnore: true */ path.join(root, relative), "utf8")).join("\n");
  const signals = {
    pydanticModels: /\b(BaseModel|pydantic)\b/.test(allText),
    parameterValidation: /\b(Field\s*\(|field_validator|model_validator|Query\s*\(|Path\s*\()/i.test(allText),
    database: /\b(sqlite3|sqlalchemy|asyncpg|psycopg|SQLModel|create_engine)\b/i.test(allText),
    authentication: /\b(OAuth2|JWT|APIKey|Authorization|Depends\s*\([^)]*(auth|user)|HTTPBearer)\b/i.test(allText),
    aiProvider: /\b(openai|deepseek|anthropic|gemini|moonshot|chat\.completions|responses\.create)\b/i.test(allText),
    deployment: structure.some((item) => /(^|\/)(Dockerfile|compose\.ya?ml|Procfile|vercel\.json)$/i.test(item)) || /部署|deploy|uvicorn/i.test(readmeText),
  };
  const readme = {
    present: Boolean(readmePath),
    path: readmePath,
    hasRunSteps: /安装|运行|启动|install|run|uvicorn|pytest/i.test(readmeText),
    hasOpenApi: /openapi|\/docs|swagger/i.test(readmeText),
    hasReflection: /复盘|retrospective|lessons learned|trade-?off/i.test(readmeText),
  };
  const testInfo = { files: tests, hasUnit: tests.length > 0, hasIntegration: /TestClient|client\.(get|post|put|patch|delete)|integration/i.test(testText), usesPytest: /pytest/i.test(testText + allText), usesTestClient: /TestClient/i.test(testText) };
  const signalCount = [readme.present, readme.hasRunSteps, testInfo.hasUnit, testInfo.hasIntegration, signals.pydanticModels, signals.parameterValidation, signals.database, signals.authentication, signals.aiProvider, signals.deployment, apiRoutes.length >= 4, errorHandling.length > 0].filter(Boolean).length;
  const analysisScore = signalCount / 12;
  const repositoryHash = digest(records.sort((a,b)=>a.relativePath.localeCompare(b.relativePath)).map((item) => `${item.relativePath}:${item.contentHash}`).join("\n"));
  void repositoryHash;
  return {
    primaryLanguage, fileCount: records.length, totalBytes: total, structure: structure.sort(), manifests, readme, tests: testInfo, migrations, apiRoutes, errorHandling: [...new Set(errorHandling)],
    gitSummary: { available: false, commitSignals: 0, note: "未复制 .git 私有元数据；有授权适配器后再分析提交历史。" },
    securityFindings, analysisScore, status: records.length ? (securityFindings.some((item) => item.severity === "high") ? "partial" : "complete") : "failed", files: records, fastApiModule, signals,
  };
}

export function repositoryContentHash(analysis: RepositoryAnalysis) {
  return digest(analysis.files.map((item) => `${item.relativePath}:${item.contentHash}`).sort().join("\n"));
}

export function createRunnerCopy(sourceRoot: string) {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-runner-"));
  copyRepository(sourceRoot, destination);
  return destination;
}
