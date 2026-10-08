import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { managedRunnerPython } from "@/lib/project-challenge/runner-environment";

type CommandResult = ReturnType<typeof spawnSync>;

function execute(command: string, args: string[], root: string, inherit = true): CommandResult {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: inherit ? "inherit" : "pipe",
    encoding: inherit ? undefined : "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw new Error(`GENESIS_RUNNER_SETUP_FAILED: ${result.error.message}`);
  return result;
}

function expectedPackages(requirements: string) {
  return requirements
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [name, version] = line.split("==");
      if (!name || !version) throw new Error(`GENESIS_RUNNER_REQUIREMENTS_UNPINNED: ${line}`);
      return [name.toLowerCase(), version] as const;
    });
}

function installedVersions(python: string, packages: readonly (readonly [string, string])[], root: string) {
  const expression = `import importlib.metadata as m, json; print(json.dumps({name:m.version(name) for name in ${JSON.stringify(packages.map(([name]) => name))}}))`;
  const result = execute(python, ["-c", expression], root, false);
  if (result.status !== 0) return null;
  try { return JSON.parse(String(result.stdout)) as Record<string, string>; }
  catch { return null; }
}

export function setupRunner(root = process.cwd()) {
  const environment = path.join(root, ".runner", "python");
  const python = managedRunnerPython(root);
  const requirementsPath = path.join(root, "runner-requirements.txt");
  const requirements = fs.readFileSync(requirementsPath, "utf8");
  const packages = expectedPackages(requirements);
  const systemPython = process.platform === "win32" ? "py" : "python3";

  fs.mkdirSync(path.dirname(environment), { recursive: true });
  if (!fs.existsSync(python)) {
    console.log(`Creating isolated Python environment at ${environment}`);
    let created: CommandResult;
    try { created = execute(systemPython, [...(process.platform === "win32" ? ["-3"] : []), "-m", "venv", environment], root); }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`GENESIS_RUNNER_SETUP_FAILED: Python 3 could not create the managed environment. Install Python 3 with venv support, then rerun npm run bootstrap. ${reason}`);
    }
    if (created.status !== 0) throw new Error(`GENESIS_RUNNER_SETUP_FAILED: unable to create the managed environment (exit ${created.status}). Install Python 3, then rerun npm run bootstrap.`);
  }

  const installed = installedVersions(python, packages, root);
  const satisfiesPins = installed && packages.every(([name, version]) => installed[name] === version);
  if (!satisfiesPins) {
    console.log("Installing the pinned runner packages declared in runner-requirements.txt. This step may contact the configured Python package index.");
    const result = execute(python, ["-m", "pip", "install", "--disable-pip-version-check", "--require-virtualenv", "--only-binary=:all:", "-r", requirementsPath], root);
    if (result.status !== 0) throw new Error(`GENESIS_RUNNER_SETUP_FAILED: pinned dependency installation exited ${result.status}. No system Python packages were changed.`);
  } else {
    console.log("Pinned runner dependencies already match; installation skipped.");
  }

  const verified = installedVersions(python, packages, root);
  if (!verified || !packages.every(([name, version]) => verified[name] === version))
    throw new Error("GENESIS_RUNNER_SETUP_FAILED: managed package verification did not match runner-requirements.txt.");
  const freeze = execute(python, ["-m", "pip", "freeze"], root, false);
  if (freeze.status !== 0) throw new Error("GENESIS_RUNNER_SETUP_FAILED: unable to record managed package versions.");
  const marker = [
    `requirements_sha256=${crypto.createHash("sha256").update(requirements).digest("hex")}`,
    `python=${python}`,
    "",
    String(freeze.stdout).trim(),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(root, ".runner", "installed.txt"), marker, "utf8");
  console.log(`Restricted local runner prepared: ${python}`);
  return { python, installed: verified };
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) setupRunner();
