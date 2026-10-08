import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const environment = path.join(root, ".runner", "python");
const python = process.platform === "win32"
  ? path.join(environment, "Scripts", "python.exe")
  : path.join(environment, "bin", "python");
const systemPython = process.platform === "win32" ? "py" : "python3";
const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Runner setup command failed (${result.status}): ${command}`);
};

fs.mkdirSync(path.dirname(environment), { recursive: true });
if (!fs.existsSync(python)) run(systemPython, [...(process.platform === "win32" ? ["-3"] : []), "-m", "venv", environment]);
run(python, ["-m", "pip", "install", "--disable-pip-version-check", "--require-virtualenv", "-r", path.join(root, "runner-requirements.txt")]);
const freeze = spawnSync(python, ["-m", "pip", "freeze"], { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
if (freeze.status !== 0) throw new Error("Unable to record runner tool versions");
fs.writeFileSync(path.join(root, ".runner", "installed.txt"), freeze.stdout, "utf8");
console.log(`Restricted local runner prepared: ${python}`);
