import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { LearningRepository } from "@/lib/db/learning-repository";
import { ProjectChallengeService, FASTAPI_REQUIREMENTS } from "@/lib/services/project-challenge-service";
import { GrowthService } from "@/lib/services/growth-service";
import { RestrictedLocalRunner } from "@/lib/project-challenge/restricted-local-runner";
import { calculateProjectIndependence } from "@/lib/domain/project-challenge";

function write(root: string, relative: string, content: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function fastApiFixture(root: string) {
  write(root, "main.py", `from fastapi import FastAPI, HTTPException, Depends, Path\nfrom fastapi.security import HTTPBearer\nfrom pydantic import BaseModel, Field\nimport sqlite3\napp = FastAPI(title="Challenge API")\nauth = HTTPBearer()\nclass Item(BaseModel):\n    name: str = Field(min_length=2, max_length=80)\n    quantity: int = Field(ge=0, le=1000)\ndef db():\n    connection = sqlite3.connect("challenge.db")\n    connection.execute("create table if not exists items (id integer primary key, name text, quantity integer)")\n    return connection\n@app.get("/health")\ndef health(): return {"status": "ok"}\n@app.post("/items", status_code=201)\ndef create_item(item: Item, token=Depends(auth)):\n    connection = db()\n    cursor = connection.execute("insert into items(name,quantity) values (?,?)", (item.name,item.quantity))\n    connection.commit()\n    return {"id": cursor.lastrowid, **item.model_dump()}\n@app.get("/items/{item_id}")\ndef get_item(item_id: int = Path(ge=1), token=Depends(auth)):\n    row = db().execute("select id,name,quantity from items where id=?", (item_id,)).fetchone()\n    if not row: raise HTTPException(404, "not found")\n    return {"id": row[0], "name": row[1], "quantity": row[2]}\n@app.put("/items/{item_id}")\ndef update_item(item_id: int, item: Item, token=Depends(auth)):\n    connection = db()\n    if not connection.execute("select id from items where id=?", (item_id,)).fetchone(): raise HTTPException(404, "not found")\n    connection.execute("update items set name=?,quantity=? where id=?", (item.name,item.quantity,item_id)); connection.commit(); return {"id": item_id, **item.model_dump()}\n@app.delete("/items/{item_id}", status_code=204)\ndef delete_item(item_id: int, token=Depends(auth)):\n    connection = db(); connection.execute("delete from items where id=?", (item_id,)); connection.commit(); return None\n`);
  write(root, "ai_provider.py", `def call_deepseek(client, prompt: str):\n    return client.chat.completions.create(model="deepseek-chat", messages=[{"role":"user","content":prompt}])\n`);
  write(root, "tests/test_api.py", `from fastapi.testclient import TestClient\nfrom main import app\nclient = TestClient(app)\nheaders = {"Authorization": "Bearer test-token"}\ndef test_health(): assert client.get("/health").status_code == 200\ndef test_validation(): assert client.post("/items", json={"name":"x","quantity":-1}, headers=headers).status_code == 422\ndef test_persistence():\n    created = client.post("/items", json={"name":"Genesis","quantity":2}, headers=headers)\n    assert created.status_code == 201\n    assert client.get(f"/items/{created.json()['id']}", headers=headers).json()["name"] == "Genesis"\ndef test_auth(): assert client.get("/items/1").status_code in (401, 403)\n`);
  write(root, "requirements.txt", "fastapi>=0.116\nuvicorn>=0.35\nhttpx>=0.28\npytest>=8.4\n");
  write(root, "migrations/001_init.sql", "create table items(id integer primary key, name text, quantity integer);\n");
  write(root, "Dockerfile", "FROM python:3.14-slim\nCOPY . /app\nCMD [\"uvicorn\",\"main:app\",\"--host\",\"0.0.0.0\"]\n");
  write(root, "README.md", `# FastAPI AI Service\n\n## 安装与运行\n\n运行 pip install -r requirements.txt，然后 uvicorn main:app。执行 pytest。\n\nOpenAPI 文档位于 /docs。部署使用 Dockerfile。\n\n## 项目复盘\n\n选择 SQLite 是本地挑战的取舍；生产应迁移 PostgreSQL。认证、事务、失败路径和 AI Provider 均有隔离测试。\n`);
}

describe("Project Challenge vertical loop", () => {
  let directory = "";
  let importRoot = "";
  let repository: ProfileRepository;
  let service: ProjectChallengeService;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-project-challenge-"));
    importRoot = path.join(directory, "imports");
    fs.mkdirSync(importRoot, { recursive: true });
    process.env.GENESIS_PROJECT_IMPORT_ROOTS = importRoot;
    process.env.GENESIS_CHALLENGE_STORAGE_PATH = path.join(directory, "storage");
    process.env.GENESIS_RUNNER_PYTHON = process.platform === "win32" ? path.join(process.cwd(), ".runner", "python", "Scripts", "python.exe") : path.join(process.cwd(), ".runner", "python", "bin", "python");
    process.env.OPENAI_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    service = new ProjectChallengeService(repository);
  });

  afterEach(() => {
    repository.close();
    delete process.env.GENESIS_PROJECT_IMPORT_ROOTS;
    delete process.env.GENESIS_CHALLENGE_STORAGE_PATH;
    delete process.env.GENESIS_RUNNER_PYTHON;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("runs FastAPI verification, defense, Evidence approval and Ability snapshot without duplicates", async () => {
    const goal = new LearningService(repository).createGoal({ clientRequestId: crypto.randomUUID(), title: "FastAPI 与 AI 应用后端工程", purpose: "独立交付 API、数据库、测试、AI 调用和部署", targetAbility: "后端工程", currentLevel: 1, targetLevelScore: 4, targetLevel: "proficient", dailyMinutes: 60, deadline: null, engineeringOutcome: "可运行 FastAPI AI 服务" });
    new LearningRepository(repository.db).createDiagnostic(goal.id, {
      questions: ["concept", "explanation", "correction", "transfer", "practice"].map((type) => ({ id: type, type: type as "concept" | "explanation" | "correction" | "transfer" | "practice", prompt: `请解释 FastAPI ${type} 的工程取舍`, rubric: ["边界", "验证"], concept: "FastAPI 工程" })),
      knowledgeNodes: [{ title: "FastAPI 工程", description: "用真实接口、数据库、测试和答辩验证工程能力", difficulty: 4, prerequisiteIndexes: [] }],
    }, "demo");
    const createRequest = crypto.randomUUID();
    const challenge = service.createChallenge(goal.id, { clientRequestId: createRequest, challengeTitle: "FastAPI AI 应用后端正式工程挑战", targetAbilities: ["后端工程", "API 设计", "测试工程"], requirements: FASTAPI_REQUIREMENTS, acceptanceCriteria: FASTAPI_REQUIREMENTS, difficulty: 4, deadline: null, maxAiAssistance: 3, requiredTests: ["单元测试", "API 集成测试", "参数失败测试", "持久化测试"], requiredDocs: ["README", "OpenAPI", "项目复盘"], deploymentRequirement: "Dockerfile 与本地运行步骤", allowNetwork: false });
    expect(service.createChallenge(goal.id, { clientRequestId: createRequest, challengeTitle: "FastAPI AI 应用后端正式工程挑战", targetAbilities: ["后端工程", "API 设计", "测试工程"], requirements: FASTAPI_REQUIREMENTS, acceptanceCriteria: FASTAPI_REQUIREMENTS, difficulty: 4, deadline: null, maxAiAssistance: 3, requiredTests: ["单元测试"], requiredDocs: ["README"], deploymentRequirement: "本地运行", allowNetwork: false }).duplicate).toBe(true);
    const project = path.join(importRoot, "fastapi-project");
    fastApiFixture(project);
    const submissionRequest = crypto.randomUUID();
    const submission = await service.submitRepository(String(challenge.id), { clientRequestId: submissionRequest, sourceType: "local_path", localPath: project, sourceUrl: null, aiAssistanceCount: 1, userModificationCount: 6, selfReportedIndependence: 4 });
    expect((await service.submitRepository(String(challenge.id), { clientRequestId: submissionRequest, sourceType: "local_path", localPath: project, sourceUrl: null, aiAssistanceCount: 1, userModificationCount: 6, selfReportedIndependence: 4 })).duplicate).toBe(true);
    const verification = await service.verifySubmission(String(submission.id), { clientRequestId: crypto.randomUUID() });
    expect(verification.status, JSON.stringify(verification.criteria, null, 2)).toBe("pass");
    expect(verification.isolationLevel).toBe("local_dev_restricted");
    expect(verification.criteria.every((item) => item.status === "pass")).toBe(true);
    const defense = await service.createDefense(String(submission.id), { clientRequestId: crypto.randomUUID() });
    const answers = defense.questions.map((question: { key: string }, index: number) => ({ questionKey: question.key, answer: `第${index + 1}题：因为约束和替代方案不同，需要说明取舍。如果无效输入或数据库失败，就使用事务回滚、幂等、4xx、超时和结构化错误；通过单元测试、集成测试、负载测试、指标和失败路径验证。没有 AI 时我会查文档、分步骤实现、调试并复现结果。`, answerDurationSeconds: 90, confidence: 4 }));
    const answerRequest = crypto.randomUUID();
    const completed = await service.submitDefense(String(defense.id), { clientRequestId: answerRequest, answers });
    if (!completed.result) throw new Error("Expected a persisted Project Challenge result");
    expect(completed.result.status).toBe("pass");
    expect(completed.result.candidateId).toBeTruthy();
    expect(repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
    const evidenceBefore = repository.db.prepare("SELECT COUNT(*) count FROM evidence_items WHERE source_type='project_challenge'").get();
    const retry = await service.submitDefense(String(defense.id), { clientRequestId: answerRequest, answers });
    expect(retry.duplicate).toBe(true);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM evidence_items WHERE source_type='project_challenge'").get()).toEqual(evidenceBefore);
    new GrowthService(repository).decideCandidate(String(completed.result.candidateId), { action: "approve", name: "后端工程", currentLevel: 2, nextImprovement: "完成带并发、监控与真实部署的更高难度挑战" });
    expect(Number((repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get() as { count: number }).count)).toBeGreaterThan(0);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM curriculum_adjustments WHERE trigger_type='evidence'").get()).toEqual({ count: 1 });
  }, 30_000);

  it("blocks environment/file access, kills infinite loops, records failures, and calculates assistance penalties", async () => {
    const unsafe = path.join(importRoot, "unsafe");
    fs.mkdirSync(unsafe);
    write(unsafe, "main.py", "import os\nprint(os.environ)\nprint(open('../.env').read())\n");
    const runner = new RestrictedLocalRunner();
    const blocked = await runner.run(unsafe, { kind: "python_entry", entryFile: "main.py" }, { timeoutMs: 1_000 });
    expect(blocked.status).toBe("blocked");
    expect(blocked.violations.map((item) => item.code)).toEqual(expect.arrayContaining(["environment_access", "filesystem_access", "path_escape"]));

    const hanging = path.join(importRoot, "hanging");
    fs.mkdirSync(hanging);
    write(hanging, "loop.py", "while True:\n    pass\n");
    const timeout = await runner.run(hanging, { kind: "python_entry", entryFile: "loop.py" }, { timeoutMs: 500 });
    expect(timeout.status).toBe("timeout");

    const failing = path.join(importRoot, "failing");
    fs.mkdirSync(failing);
    write(failing, "fail.py", "raise SystemExit(2)\n");
    expect((await runner.run(failing, { kind: "python_entry", entryFile: "fail.py" })).status).toBe("fail");
    expect((await runner.run(failing, { kind: "fastapi_probe", module: "missing_app" })).status).toBe("fail");

    const independent = calculateProjectIndependence({ tutorHintCount: 0, aiAssistanceCount: 1, maxAiAssistance: 3, userModificationCount: 6, initialQuality: 0.9, repairScore: 0.9, designExplanationScore: 0.9, defenseScore: 0.9, selfReportedIndependence: 4 });
    const assisted = calculateProjectIndependence({ tutorHintCount: 8, aiAssistanceCount: 12, maxAiAssistance: 3, userModificationCount: 1, initialQuality: 0.9, repairScore: 0.5, designExplanationScore: 0.5, defenseScore: 0.5, selfReportedIndependence: 1 });
    expect(independent.score).toBeGreaterThan(assisted.score);
    expect(assisted.rationale.assistancePenalty).toBeGreaterThan(0);
  }, 15_000);
});
