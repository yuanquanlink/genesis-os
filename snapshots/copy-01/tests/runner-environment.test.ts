import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { managedRunnerPython, resolveRunnerPython, runnerNotReadyMessage } from "@/lib/project-challenge/runner-environment";

const temporary: string[] = [];
afterEach(() => { for (const target of temporary.splice(0)) fs.rmSync(target, { recursive: true, force: true }); });

describe("managed project runner environment", () => {
  it("uses a repository-local interpreter path on every platform", () => {
    expect(managedRunnerPython("C:\\repo", "win32")).toBe(path.join("C:\\repo", ".runner", "python", "Scripts", "python.exe"));
    expect(managedRunnerPython("/repo", "linux")).toBe(path.join("/repo", ".runner", "python", "bin", "python"));
  });

  it("fails clearly instead of falling back to an unmanaged system Python", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-runner-missing-")); temporary.push(root);
    const expected = managedRunnerPython(root);
    expect(() => resolveRunnerPython({ root })).toThrow(runnerNotReadyMessage(expected));
  });

  it("accepts only an interpreter path that actually exists", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-runner-ready-")); temporary.push(root);
    const python = path.join(root, "controlled-python");
    fs.writeFileSync(python, "managed fixture", "utf8");
    expect(resolveRunnerPython({ root, configured: python })).toBe(python);
  });
});
