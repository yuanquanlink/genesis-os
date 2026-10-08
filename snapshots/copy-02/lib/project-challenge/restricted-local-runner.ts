import "server-only";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createRunnerCopy, scanUnsafeCode, type SecurityFinding } from "@/lib/project-challenge/repository-analyzer";

const execFileAsync = promisify(execFile);

export type RunnerAction =
  | { kind: "python_compile" }
  | { kind: "python_tests"; framework: "pytest" | "unittest" }
  | { kind: "fastapi_probe"; module: string }
  | { kind: "python_entry"; entryFile: string };

export type RunnerLimits = {
  timeoutMs: number;
  maxOutputBytes: number;
  memoryLimitBytes: number;
};

export type RunnerResult = {
  action: RunnerAction["kind"];
  status: "pass" | "fail" | "blocked" | "timeout";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  peakMemoryBytes: number | null;
  violations: SecurityFinding[];
  limits: RunnerLimits;
  isolationLevel: "local_dev_restricted";
  commandLabel: string;
};

const defaultLimits: RunnerLimits = {
  timeoutMs: 8_000,
  maxOutputBytes: 256 * 1024,
  memoryLimitBytes: 256 * 1024 * 1024,
};

function resolvePython() {
  if (process.env.GENESIS_RUNNER_PYTHON) return path.resolve(process.env.GENESIS_RUNNER_PYTHON);
  const local = process.platform === "win32"
    ? path.join(/* turbopackIgnore: true */ process.cwd(), ".runner", "python", "Scripts", "python.exe")
    : path.join(/* turbopackIgnore: true */ process.cwd(), ".runner", "python", "bin", "python");
  if (fs.existsSync(local)) return local;
  if (process.platform === "win32") {
    const launcher = path.join(process.env.LocalAppData || "", "Programs", "Python", "Launcher", "py.exe");
    if (fs.existsSync(launcher)) return launcher;
  }
  return process.platform === "win32" ? "py" : "python3";
}

function validateModule(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) throw new Error("RUNNER_INVALID_MODULE");
  return value;
}

function validateEntry(value: string) {
  const normalized = value.replace(/\\/g, "/");
  if (!/^[a-zA-Z0-9_./-]+\.py$/.test(normalized) || normalized.startsWith("/") || normalized.split("/").includes(".."))
    throw new Error("RUNNER_INVALID_ENTRY");
  return normalized;
}

function writeFastApiProbe(root: string, moduleName: string) {
  const script = `import importlib, json, os, sys\nsys.path.insert(0, os.getcwd())\nmodule = importlib.import_module(${JSON.stringify(moduleName)})\napp = getattr(module, "app")\nfrom fastapi.testclient import TestClient\nclient = TestClient(app)\nopenapi = client.get("/openapi.json")\nif openapi.status_code != 200:\n    raise SystemExit("openapi_status=" + str(openapi.status_code))\nroutes = [r for r in app.routes if getattr(r, "path", "") not in {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}]\nprint("GENESIS_FASTAPI_PROBE=" + json.dumps({"openapi_status": openapi.status_code, "route_count": len(routes), "routes": [getattr(r, "path", "") for r in routes]}, ensure_ascii=False))\n`;
  const target = path.join(root, "_genesis_fastapi_probe.py");
  fs.writeFileSync(target, script, { flag: "wx" });
  return target;
}

function writePytestLauncher(root: string) {
  const script = `import os, sys\nsys.path.insert(0, os.getcwd())\nimport pytest\nraise SystemExit(pytest.main(["-q", "--disable-warnings", "--maxfail=1"]))\n`;
  const target = path.join(root, "_genesis_pytest_runner.py");
  fs.writeFileSync(target, script, { flag: "wx" });
  return target;
}

function commandFor(root: string, action: RunnerAction) {
  const python = resolvePython();
  const prefix = path.basename(python).toLowerCase() === "py" ? ["-3"] : [];
  if (action.kind === "python_compile") return { command: python, args: [...prefix, "-I", "-B", "-m", "compileall", "-q", "."], label: "python -I -B -m compileall -q ." };
  if (action.kind === "python_tests") {
    if (action.framework === "pytest") {
      writePytestLauncher(root);
      return { command: python, args: [...prefix, "-I", "-B", "_genesis_pytest_runner.py"], label: "python -I -B <generated-pytest-runner>" };
    }
    return { command: python, args: [...prefix, "-I", "-B", "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"], label: "python -I -B -m unittest discover" };
  }
  if (action.kind === "fastapi_probe") {
    writeFastApiProbe(root, validateModule(action.module));
    return { command: python, args: [...prefix, "-I", "-B", "_genesis_fastapi_probe.py"], label: "python -I -B <generated-fastapi-probe>" };
  }
  return { command: python, args: [...prefix, "-I", "-B", validateEntry(action.entryFile)], label: "python -I -B <validated-entry>" };
}

async function terminateTree(pid: number) {
  try {
    if (process.platform === "win32") await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
    else process.kill(-pid, "SIGKILL");
  } catch { /* process may already have exited */ }
}

async function memoryBytes(pid: number) {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64`], { windowsHide: true, timeout: 1_500 });
      const value = Number(String(stdout).trim());
      return Number.isFinite(value) ? value : null;
    }
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) * 1024 : null;
  } catch { return null; }
}

function cleanEnvironment(root: string, python: string): NodeJS.ProcessEnv {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const executableDirectory = path.dirname(path.resolve(python));
  return {
    PATH: process.platform === "win32" ? `${executableDirectory};${path.join(windowsRoot, "System32")}` : executableDirectory,
    SystemRoot: windowsRoot,
    WINDIR: windowsRoot,
    TEMP: root,
    TMP: root,
    HOME: root,
    USERPROFILE: root,
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUTF8: "1",
    GENESIS_RUNNER: "1",
    NODE_ENV: "test",
    HTTP_PROXY: "http://127.0.0.1:9",
    HTTPS_PROXY: "http://127.0.0.1:9",
    ALL_PROXY: "http://127.0.0.1:9",
    NO_PROXY: "",
  };
}

export class RestrictedLocalRunner {
  async run(sourceRoot: string, action: RunnerAction, requestedLimits?: Partial<RunnerLimits>): Promise<RunnerResult> {
    const limits: RunnerLimits = {
      timeoutMs: Math.max(250, Math.min(30_000, requestedLimits?.timeoutMs ?? defaultLimits.timeoutMs)),
      maxOutputBytes: Math.max(4_096, Math.min(1024 * 1024, requestedLimits?.maxOutputBytes ?? defaultLimits.maxOutputBytes)),
      memoryLimitBytes: Math.max(32 * 1024 * 1024, Math.min(512 * 1024 * 1024, requestedLimits?.memoryLimitBytes ?? defaultLimits.memoryLimitBytes)),
    };
    const violations = scanUnsafeCode(sourceRoot);
    if (violations.some((item) => item.severity === "high")) return {
      action: action.kind, status: "blocked", stdout: "", stderr: "执行前安全检查拒绝了项目。", exitCode: null, durationMs: 0, peakMemoryBytes: null, violations, limits, isolationLevel: "local_dev_restricted", commandLabel: action.kind,
    };
    const runRoot = createRunnerCopy(sourceRoot);
    const started = Date.now();
    let timedOut = false;
    let limitExceeded = false;
    let peakMemoryBytes: number | null = null;
    try {
      const command = commandFor(runRoot, action);
      const child = spawn(command.command, command.args, {
        cwd: runRoot,
        env: cleanEnvironment(runRoot, command.command),
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin.end();
      let stdout = "";
      let stderr = "";
      const collect = (current: string, chunk: Buffer) => (current + chunk.toString("utf8")).slice(0, limits.maxOutputBytes + 1);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = collect(stdout, chunk);
        if (Buffer.byteLength(stdout) > limits.maxOutputBytes && child.pid) { limitExceeded = true; void terminateTree(child.pid); }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = collect(stderr, chunk);
        if (Buffer.byteLength(stderr) > limits.maxOutputBytes && child.pid) { limitExceeded = true; void terminateTree(child.pid); }
      });
      const timeout = setTimeout(() => { timedOut = true; if (child.pid) void terminateTree(child.pid); }, limits.timeoutMs);
      const monitor = setInterval(() => {
        if (!child.pid) return;
        void memoryBytes(child.pid).then((value) => {
          if (value === null) return;
          peakMemoryBytes = Math.max(peakMemoryBytes || 0, value);
          if (value > limits.memoryLimitBytes && child.pid) { limitExceeded = true; void terminateTree(child.pid); }
        });
      }, 500);
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code: number | null) => resolve(code));
      }).catch((error) => { stderr += `\n${error instanceof Error ? error.message : "runner_spawn_failed"}`; return null; });
      clearTimeout(timeout);
      clearInterval(monitor);
      const status = timedOut ? "timeout" : limitExceeded ? "blocked" : exitCode === 0 ? "pass" : "fail";
      return {
        action: action.kind, status, stdout: stdout.slice(0, limits.maxOutputBytes), stderr: (limitExceeded ? `${stderr}\n资源或输出限制已触发。` : stderr).slice(0, limits.maxOutputBytes), exitCode, durationMs: Date.now() - started, peakMemoryBytes, violations, limits, isolationLevel: "local_dev_restricted", commandLabel: command.label,
      };
    } finally {
      fs.rmSync(runRoot, { recursive: true, force: true });
    }
  }
}
