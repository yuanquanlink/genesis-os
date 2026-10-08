import fs from "node:fs";
import path from "node:path";

export function managedRunnerPython(root = process.cwd(), platform = process.platform) {
  return platform === "win32"
    ? path.join(root, ".runner", "python", "Scripts", "python.exe")
    : path.join(root, ".runner", "python", "bin", "python");
}

export function runnerNotReadyMessage(python: string) {
  return `GENESIS_RUNNER_NOT_READY: managed Python runner was not found at ${python}. Run \"npm run bootstrap\" from the repository root, then retry.`;
}

export function resolveRunnerPython(options: { root?: string; configured?: string; platform?: NodeJS.Platform } = {}) {
  const root = options.root || process.cwd();
  const platform = options.platform || process.platform;
  const python = options.configured
    ? path.resolve(root, options.configured)
    : managedRunnerPython(root, platform);
  if (!fs.existsSync(python)) throw new Error(runnerNotReadyMessage(python));
  return python;
}
