import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileRepository } from "@/lib/db/repository";
import { LearningService } from "@/lib/services/learning-service";
import { LearningPhase2Service } from "@/lib/services/learning-phase2-service";
import {
  calculatePhase2Mastery,
  effectiveIndependence,
  independenceWeightedScore,
  scheduleNextReview,
} from "@/lib/domain/learning-phase2";

describe("Learning Agent Phase 2", () => {
  let directory = "";
  let repository: ProfileRepository;
  let learning: LearningService;
  let phase2: LearningPhase2Service;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "genesis-learning-phase2-"));
    process.env.GENESIS_UPLOAD_PATH = path.join(directory, "uploads");
    process.env.OPENAI_API_KEY = "";
    process.env.DEEPSEEK_API_KEY = "";
    process.env.MODEL_PROVIDER = "deepseek";
    repository = new ProfileRepository(path.join(directory, "test.db"));
    learning = new LearningService(repository);
    phase2 = new LearningPhase2Service(repository);
  });

  afterEach(() => {
    repository.close();
    delete process.env.GENESIS_UPLOAD_PATH;
    delete process.env.MODEL_PROVIDER;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function preparedGoal() {
    const goal = learning.createGoal({
      clientRequestId: crypto.randomUUID(),
      title: "FastAPI 与 AI 应用后端工程",
      purpose: "独立交付带 API、数据库、测试、AI 调用与部署的后端服务",
      targetAbility: "后端工程",
      currentLevel: 1,
      targetLevelScore: 4,
      targetLevel: "proficient",
      dailyMinutes: 60,
      deadline: null,
      engineeringOutcome: "可运行、可测试、可部署的 FastAPI AI 服务",
    });
    const form = new FormData();
    form.set("goalId", goal.id);
    form.set("clientRequestId", crypto.randomUUID());
    form.set(
      "file",
      new File(
        [
          "# API 输入边界\n使用 Pydantic Schema 验证参数。\n\n# 数据库事务\n失败时回滚并返回结构化错误。\n\n# 测试与部署\n使用 pytest 覆盖成功和失败路径，并通过容器部署。",
        ],
        "fastapi.md",
        { type: "text/markdown" },
      ),
    );
    await learning.addUploadedResource(form);
    const baseline = await learning.generateBaseline(goal.id);
    learning.submitBaseline(goal.id, {
      answers: baseline.questions.map((question: { id: string; rubric: string[] }, index: number) => ({
        questionId: question.id,
        answer: `${question.rubric.join("、")}；解释输入、机制、边界、失败路径、测试和迁移。`,
        responseTimeSeconds: 35 + index,
        confidence: 4,
      })),
    });
    return goal;
  }

  it("persists all formal answers once and creates review, adjustment and pending evidence", async () => {
    const goal = await preparedGoal();
    const clientRequestId = crypto.randomUUID();
    const assessment = await phase2.createAssessment(goal.id, {
      clientRequestId,
      nodeId: null,
      missionId: null,
      assessmentType: "immediate",
    });
    const duplicateAssessment = await phase2.createAssessment(goal.id, {
      clientRequestId,
      nodeId: null,
      missionId: null,
      assessmentType: "immediate",
    });
    expect(assessment.questions).toHaveLength(8);
    expect(new Set(assessment.questions.map((question) => question.type))).toEqual(
      new Set(["concept_explanation", "choice", "true_false", "correction", "transfer", "code_task", "mini_project", "delayed_recall"]),
    );
    expect(duplicateAssessment.duplicate).toBe(true);

    const submission = {
      clientRequestId: crypto.randomUUID(),
      answers: assessment.questions.map((question, index) => ({
        questionId: question.id,
        userAnswer: question.type === "choice"
          ? String(question.options[2])
          : question.type === "true_false"
            ? String(question.options[1])
            : `第 ${index + 1} 题：因为输入边界影响事务状态，所以实现 Schema 校验、异常处理和失败测试；迁移到并发场景时增加幂等键。`,
        answerDurationSeconds: 50 + index,
        confidence: 4,
        hintCount: index === 5 ? 2 : 0,
        independenceLevel: index === 5 ? 3 : 4,
      })),
    };
    const saved = await phase2.submitAssessment(String(assessment.id), submission);
    const retry = await phase2.submitAssessment(String(assessment.id), submission);
    expect(saved.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM assessment_attempts WHERE assessment_id=?").get(assessment.id)).toEqual({ count: 8 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM mastery_evidence WHERE assessment_attempt_id IS NOT NULL").get()).toEqual({ count: 8 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM assessment_attempts WHERE assessment_id=? AND is_delayed=1").get(assessment.id)).toEqual({ count: 0 });
    expect(repository.db.prepare("SELECT a.raw_score FROM assessment_attempts a JOIN assessment_questions q ON q.id=a.question_id WHERE a.assessment_id=? AND q.question_type='choice'").get(assessment.id)).toEqual({ raw_score: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM review_schedule WHERE goal_id=?").get(goal.id)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM curriculum_adjustments WHERE goal_id=? AND trigger_type='assessment'").get(goal.id)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM evidence_items WHERE source_type='formal_assessment'").get()).toEqual({ count: 1 });
    expect(Number((repository.db.prepare("SELECT COUNT(*) count FROM growth_evidence_candidates WHERE status='pending'").get() as { count: number }).count)).toBeGreaterThanOrEqual(1);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });

  it("stores code assessment once and keeps ability changes behind approval", async () => {
    const goal = await preparedGoal();
    const clientRequestId = crypto.randomUUID();
    const payload = {
      clientRequestId,
      nodeId: null,
      language: "python",
      filename: "main.py",
      sourceCode: "from fastapi import FastAPI, HTTPException\napp = FastAPI()\n\n@app.get('/items/{item_id}')\ndef read_item(item_id: int):\n    if item_id < 1:\n        raise HTTPException(400, 'invalid')\n    return {'id': item_id}\n\ndef test_invalid():\n    assert True",
      userExplanation: "路由先验证输入，因为无效 ID 不应进入业务逻辑，并用异常表达失败路径。",
      changedConditionAnswer: "如果改为并发写入，我会增加事务、幂等键和并发冲突测试。",
      failureAnalysis: "外部依赖超时和数据库冲突会失败，需要超时、回滚、日志和测试。",
      hintCount: 1,
      independenceLevel: 3,
    };
    const saved = await phase2.submitCodeAssessment(goal.id, payload);
    const retry = await phase2.submitCodeAssessment(goal.id, payload);
    expect(saved.duplicate).toBe(false);
    expect(saved.followUpQuestions).toHaveLength(3);
    expect(retry.duplicate).toBe(true);
    expect(repository.db.prepare("SELECT COUNT(*) count FROM code_assessments WHERE client_request_id=?").get(clientRequestId)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM evidence_items WHERE source_type='code_assessment'").get()).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM ability_change_snapshots").get()).toEqual({ count: 0 });
  });

  it("counts delayed recall only in an explicitly delayed assessment", async () => {
    const goal = await preparedGoal();
    const assessment = await phase2.createAssessment(goal.id, {
      clientRequestId: crypto.randomUUID(),
      nodeId: null,
      missionId: null,
      assessmentType: "delayed",
    });
    await phase2.submitAssessment(String(assessment.id), {
      clientRequestId: crypto.randomUUID(),
      answers: assessment.questions.map((question, index) => ({
        questionId: question.id,
        userAnswer: question.type === "choice"
          ? String(question.options[2])
          : question.type === "true_false"
            ? String(question.options[1])
            : `延迟作答 ${index + 1}：独立重建机制、边界、失败条件、测试和迁移应用。`,
        answerDurationSeconds: 70,
        confidence: 3,
        hintCount: 0,
        independenceLevel: 4,
      })),
    });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM assessment_attempts WHERE assessment_id=? AND is_delayed=1").get(assessment.id)).toEqual({ count: 1 });
    expect(repository.db.prepare("SELECT COUNT(*) count FROM mastery_evidence WHERE goal_id=? AND is_delayed=1").get(goal.id)).toEqual({ count: 1 });
  });

  it("reduces practical credit when hints lower effective independence", () => {
    expect(effectiveIndependence(4, 0)).toBe(4);
    expect(effectiveIndependence(4, 4)).toBe(2);
    expect(independenceWeightedScore(0.9, 4, 4, true)).toBeLessThan(
      independenceWeightedScore(0.9, 4, 0, true),
    );
    const mastery = calculatePhase2Mastery({
      immediateCorrectness: 0.9,
      delayedCorrectness: 0,
      explanation: 0.9,
      correction: 0.8,
      transfer: 0.8,
      practice: 0.9,
      engineeringIndependence: 0.4,
    });
    expect(mastery.mastery).toBeLessThan(0.8);
  });

  it("shortens review intervals for repeated errors and weak transfer", () => {
    const strong = scheduleNextReview({ score: 0.9, responseTimeSeconds: 80, expectedSeconds: 180, confidence: 4, hintCount: 0, independenceLevel: 4, repeatedError: false, transferScore: 0.9, previousIntervalDays: 7 });
    const weak = scheduleNextReview({ score: 0.9, responseTimeSeconds: 80, expectedSeconds: 180, confidence: 4, hintCount: 4, independenceLevel: 4, repeatedError: true, transferScore: 0.2, previousIntervalDays: 7 });
    expect(strong.intervalDays).toBeGreaterThan(weak.intervalDays);
    expect(weak.reason).toContain("重复错误");
  });
});
