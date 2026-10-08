import path from "node:path";
import { expect, test } from "@playwright/test";
import { ProfileRepository } from "@/lib/db/repository";
import { ApprovedContextProjectionService } from "@/lib/services/approved-context-projection-service";

const OWNER = "genesis-owner";
const e2eDb = path.join(process.cwd(), "data", "e2e.db");

function projectDailyContext(strategyId: string, missionId: string) {
  const repository = new ProfileRepository(e2eDb);
  try {
    const service = new ApprovedContextProjectionService(repository);
    for (const [sourceDomain, sourceRecordId] of [["strategy", strategyId], ["mission", missionId]] as const) {
      const preview = service.preview({ sourceDomain, sourceRecordId, purpose: "daily_operation" });
      const authorization = service.authorize({ sourceDomain, sourceRecordId, purpose: "daily_operation", sourceVersion: preview.sourceVersion, previewHash: preview.previewHash, actor: OWNER, clientRequestId: crypto.randomUUID() });
      service.confirm({ authorizationId: authorization.id, actor: OWNER, clientRequestId: crypto.randomUUID() });
    }
  } finally { repository.close(); }
}

function formalTruthCounts() {
  const repository = new ProfileRepository(e2eDb);
  try {
    return {
      abilities: Number(repository.db.prepare("SELECT count(*) FROM ability_change_snapshots").pluck().get()),
      mastery: Number(repository.db.prepare("SELECT count(*) FROM mastery_decisions").pluck().get()),
    };
  } finally { repository.close(); }
}

test.describe.serial("Phase 4 Step 9 Daily Personal Operating Workflow", () => {
  test("approved Context drives an owner-confirmed plan, execution, reflection, and separated Daily Close", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "生成战略建议" }).click();
    await page.getByRole("button", { name: "批准建议" }).click();
    const strategySnapshot = await (await page.request.get("/api/strategy")).json() as { strategy: { id: string } };

    await page.goto("/missions");
    await page.getByRole("button", { name: "生成使命建议" }).click();
    await page.getByRole("button", { name: "确认使命" }).click();
    const missionSnapshot = await (await page.request.get("/api/missions")).json() as { missions: Array<{ id: string; status: string }> };
    const missionId = missionSnapshot.missions.find((mission) => mission.status === "active")!.id;
    projectDailyContext(strategySnapshot.strategy.id, missionId);

    const before = formalTruthCounts();
    await page.goto("/");
    const loop = page.getByRole("region", { name: "个人每日运行闭环" });
    await expect(loop.getByLabel("今日运行状态", { exact: true })).toContainText("战略 → 使命来源关系已确认");
    await loop.getByRole("button", { name: "生成晨间简报" }).click();
    await expect(loop.getByText("晨间简报已生成。", { exact: true })).toBeVisible();
    await expect(loop.getByText("2 条合格认知投影")).toBeVisible();

    await loop.getByLabel("今日精力").selectOption("4");
    await loop.getByRole("button", { name: "生成今日计划建议" }).click();
    await expect(loop.getByText("建议精力：")).toBeVisible();
    await loop.getByRole("button", { name: "确认今日计划" }).click();
    await expect(loop.getByText("今日计划已激活。", { exact: true })).toBeVisible();
    await expect(loop.getByText(/保护缓冲/).first()).toBeVisible();
    await loop.getByRole("button", { name: "标记完成" }).first().click();
    await expect(loop.getByText("任务块完成状态已记录；未自动修改证据、能力或掌握状态。", { exact: true })).toBeVisible();

    await loop.getByLabel("今天实际发生的事情").fill("完成一项有边界的使命任务并运行验收检查。");
    await loop.getByLabel("今天完成的内容").fill("完成第一项已确认计划块并保留真实产物。");
    await loop.getByLabel("未完成内容与原因").fill("第二个计划块仍待处理，因为保留了保护缓冲。");
    await loop.getByLabel("出现的新问题").fill("验证边界情况需要一次有针对性的迁移练习。");
    await loop.getByLabel("超出预期的困难").fill("调试验证边界比预计耗时更长。");
    await loop.getByLabel("今天学到的内容").fill("失败路径需要明确来源和独立验收断言。");
    await loop.getByLabel("今天的重要决策").fill("保持范围有界，没有消耗保护缓冲。");
    await loop.getByLabel("明日调整建议").fill("先做迁移练习，再增加其他功能。");
    await loop.getByLabel("实际学习分钟数").fill("48");
    await loop.getByRole("button", { name: "提交晚间复盘" }).click();
    await expect(loop.getByText(/晚间复盘已保存|原始复盘已保存/)).toBeVisible();

    const close = loop.getByRole("article", { name: "今日总结" });
    await expect(close).toContainText("系统事实");
    await expect(close).toContainText("所有者自述");
    await expect(close).toContainText("待确认推断");
    await expect(close).toContainText("自动验证：否");
    await expect(close).toContainText(/确定性候选降级|AI 路由分析/);
    expect(formalTruthCounts()).toEqual(before);

    for (const width of [390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
