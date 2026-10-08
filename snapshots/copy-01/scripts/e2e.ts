import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProfileRepository } from "@/lib/db/repository";
import { MasteryTruthService, type MasteryClock } from "@/lib/services/mastery-truth-service";

const cwd = process.cwd();
const nextCli = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(cwd, "node_modules", "@playwright", "test", "cli.js");
const e2eDb = path.join(cwd, "data", "e2e.db");
const e2eUploads = path.join(cwd, "data", "e2e-uploads");
const e2eProjectImports = path.join(cwd, "data", "e2e-project-imports");
const e2eChallengeStorage = path.join(cwd, "data", "e2e-challenge-storage");
const runnerPython = process.platform === "win32"
  ? path.join(cwd, ".runner", "python", "Scripts", "python.exe")
  : path.join(cwd, ".runner", "python", "bin", "python");
const defaultSpecs = [
  "e2e/profile-api.spec.ts",
  "e2e/learning-engine.spec.ts",
  "e2e/growth-graph.spec.ts",
  "e2e/evidence-engine.spec.ts",
  "e2e/learning-agent.spec.ts",
  "e2e/project-challenge.spec.ts",
  "e2e/daily-learning-loop.spec.ts",
  "e2e/mentor-deep-reasoning.spec.ts",
  "e2e/cognition-growth.spec.ts",
  "e2e/strategy-brain.spec.ts",
  "e2e/daily-life.spec.ts",
  "e2e/v01-stabilization.spec.ts",
  "e2e/beta-observation.spec.ts",
  "e2e/proactive-companion.spec.ts",
  "e2e/monthly-growth-review.spec.ts",
  "e2e/personal-memory.spec.ts",
  "e2e/agent-action-layer.spec.ts",
  "e2e/personal-operating-loop.spec.ts",
  "e2e/daily-personal-operating-workflow.spec.ts",
  "e2e/real-personal-operating-readiness.spec.ts",
  "e2e/chinese-mobile-ui.spec.ts",
  "e2e/ai-orb-assistant.spec.ts",
  "e2e/planning-buffer.spec.ts",
  "e2e/personal-intelligence.spec.ts",
  "e2e/mastery-truth.spec.ts",
  "e2e/genesis-command-context.spec.ts",
];
const specs = process.env.E2E_SPEC ? [process.env.E2E_SPEC] : defaultSpecs;

function resetArtifacts() {
  for (const suffix of ["", "-shm", "-wal"]) fs.rmSync(`${e2eDb}${suffix}`, { force: true });
  fs.rmSync(e2eUploads, { recursive: true, force: true });
  fs.rmSync(e2eProjectImports, { recursive: true, force: true });
  fs.rmSync(e2eChallengeStorage, { recursive: true, force: true });
}

function prepareFastApiChallengeFixture() {
  const root = path.join(e2eProjectImports, "fastapi-project");
  const write = (relative: string, content: string) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  };
  write("main.py", `from fastapi import FastAPI, HTTPException, Depends, Path\nfrom fastapi.security import HTTPBearer\nfrom pydantic import BaseModel, Field\nimport sqlite3\napp = FastAPI(title="Genesis Challenge API")\nauth = HTTPBearer()\nclass Item(BaseModel):\n    name: str = Field(min_length=2, max_length=80)\n    quantity: int = Field(ge=0, le=1000)\ndef db():\n    connection = sqlite3.connect("challenge.db")\n    connection.execute("create table if not exists items (id integer primary key, name text, quantity integer)")\n    return connection\n@app.get("/health")\ndef health(): return {"status": "ok"}\n@app.post("/items", status_code=201)\ndef create_item(item: Item, token=Depends(auth)):\n    connection = db(); cursor = connection.execute("insert into items(name,quantity) values (?,?)", (item.name,item.quantity)); connection.commit(); return {"id": cursor.lastrowid, **item.model_dump()}\n@app.get("/items/{item_id}")\ndef get_item(item_id: int = Path(ge=1), token=Depends(auth)):\n    row = db().execute("select id,name,quantity from items where id=?", (item_id,)).fetchone()\n    if not row: raise HTTPException(404, "not found")\n    return {"id": row[0], "name": row[1], "quantity": row[2]}\n@app.put("/items/{item_id}")\ndef update_item(item_id: int, item: Item, token=Depends(auth)):\n    connection = db()\n    if not connection.execute("select id from items where id=?", (item_id,)).fetchone(): raise HTTPException(404, "not found")\n    connection.execute("update items set name=?,quantity=? where id=?", (item.name,item.quantity,item_id)); connection.commit(); return {"id": item_id, **item.model_dump()}\n@app.delete("/items/{item_id}", status_code=204)\ndef delete_item(item_id: int, token=Depends(auth)):\n    connection = db(); connection.execute("delete from items where id=?", (item_id,)); connection.commit(); return None\n`);
  write("ai_provider.py", `def call_deepseek(client, prompt: str):\n    return client.chat.completions.create(model="deepseek-chat", messages=[{"role":"user","content":prompt}])\n`);
  write("tests/test_api.py", `from fastapi.testclient import TestClient\nfrom main import app\nclient = TestClient(app)\nheaders = {"Authorization": "Bearer e2e-token"}\ndef test_health(): assert client.get("/health").status_code == 200\ndef test_validation(): assert client.post("/items", json={"name":"x","quantity":-1}, headers=headers).status_code == 422\ndef test_persistence():\n    created = client.post("/items", json={"name":"Genesis","quantity":2}, headers=headers)\n    assert created.status_code == 201\n    assert client.get(f"/items/{created.json()['id']}", headers=headers).json()["name"] == "Genesis"\ndef test_auth(): assert client.get("/items/1").status_code in (401, 403)\n`);
  write("requirements.txt", "fastapi>=0.116\nuvicorn>=0.35\nhttpx>=0.28\npytest>=8.4\n");
  write("migrations/001_init.sql", "create table items(id integer primary key, name text, quantity integer);\n");
  write("Dockerfile", "FROM python:3.14-slim\nCOPY . /app\nCMD [\"uvicorn\",\"main:app\",\"--host\",\"0.0.0.0\"]\n");
  write("README.md", "# FastAPI AI Service\n\n## 安装与运行\n\n运行 `pip install -r requirements.txt`，再执行 `uvicorn main:app` 与 `pytest`。\n\nOpenAPI 文档位于 `/docs`，部署使用 Dockerfile。\n\n## 项目复盘\n\n选择 SQLite 是本地挑战的取舍；生产应迁移 PostgreSQL。认证、事务、失败路径和 AI Provider 均有隔离测试。\n");
}

async function prepareMasteryTruthFixture() {
  class FixtureClock implements MasteryClock {
    now() { return new Date("2026-07-01T08:00:00.000Z"); }
  }
  const repository = new ProfileRepository(e2eDb);
  try {
    const goal = { id: randomUUID() };
    const at = "2026-07-01T08:00:00.000Z";
    repository.db.prepare(
      `INSERT INTO learning_goals
       (id,user_id,client_request_id,title,purpose,target_level,daily_minutes,deadline,engineering_outcome,status,created_at,updated_at,current_basis,final_goal,mastery_level,weekly_days,fde_linked,data_kind,target_ability,current_level,target_level_score,motivation)
       VALUES (?,'genesis-owner',?,?,'通过浏览器验证课程完成与八门 Mastery Gate 的严格分离','proficient',60,NULL,'交付可运行、可测试、可答辩的陌生业务后端','active',?,?,?,'完成八门 Gate 并仅生成待用户批准的 Evidence Candidate',5,5,1,'test','FastAPI 后端工程',1,4,'验证真实掌握边界和可审计 retake')`,
    ).run(goal.id, randomUUID(), "Phase 1 Mastery Browser Fixture", at, at, "课程阶段可完成，但尚未通过统一认证");
    const service = new MasteryTruthService(repository, new FixtureClock());
    await service.act({ action: "initialize", goalId: goal.id, pilotSlug: "fastapi-backend-engineering-v1" });
    await service.act({ action: "complete_course", goalId: goal.id });
    const evidenceId = randomUUID();
    const evidenceAt = "2026-07-04T08:00:00.000Z";
    repository.db.prepare(
      `INSERT INTO evidence_items
       (id,user_id,evidence_type,source_type,source_id,source,description,related_ability,content_hash,data_kind,captured_at,verification_status,confidence,impact,created_at,updated_at)
       VALUES (?,'genesis-owner','learning','phase1_e2e_fixture',?,'Isolated browser fixture','Verified persisted provenance for production Mastery service','FastAPI 后端工程',?,'test',?,'verified',0.8,0.4,?,?)`,
    ).run(evidenceId, evidenceId, evidenceId, evidenceAt, evidenceAt, evidenceAt);
  } finally { repository.close(); }
}

function startServer() {
  const server = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3210"], {
    cwd,
    env: {
      ...process.env,
      GENESIS_DB_PATH: "./data/e2e.db",
      GENESIS_UPLOAD_PATH: "./data/e2e-uploads",
      GENESIS_PROJECT_IMPORT_ROOTS: e2eProjectImports,
      GENESIS_CHALLENGE_STORAGE_PATH: e2eChallengeStorage,
      GENESIS_RUNNER_PYTHON: runnerPython,
      OPENAI_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      MODEL_PROVIDER: "deepseek",
      ALLOWED_ORIGINS: "http://127.0.0.1:3210,http://localhost:3210",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[server] ${String(chunk)}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${String(chunk)}`));
  return server;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3210/api/profile");
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("E2E server did not become healthy within 30 seconds");
}

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolve) => child.once("exit", (code) => resolve(code ?? 1)));
}

async function stopServer(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null) return;
  server.kill("SIGTERM");
  server.stdout?.destroy();
  server.stderr?.destroy();
  server.unref();
  await new Promise((resolve) => setTimeout(resolve, 350));
}

async function runSpec(spec: string) {
  resetArtifacts();
  prepareFastApiChallengeFixture();
  if (spec === "e2e/mastery-truth.spec.ts") await prepareMasteryTruthFixture();
  const server = startServer();
  try {
    await waitForServer();
    const runner = spawn(process.execPath, [playwrightCli, "test", spec, "--workers=1"], { cwd, stdio: "inherit" });
    return await waitForExit(runner);
  } finally {
    await stopServer(server);
    resetArtifacts();
  }
}

async function main() {
  for (const spec of specs) {
    const exitCode = await runSpec(spec);
    if (exitCode !== 0) process.exit(exitCode);
  }
}

void main();
