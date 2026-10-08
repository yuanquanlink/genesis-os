import { expect, test } from "@playwright/test";

test.describe.serial("Genesis AI Learning Agent", () => {
  test("诊断、五阶段课程、Today Mission、结果与 Evidence 候选形成真实闭环", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/today-learning");

    await page.getByLabel("学习主题").fill("Learning Agent Python 浏览器验收");
    await page.getByRole("textbox", { name: "目标能力", exact: true }).fill("Python 工程能力");
    await page.getByLabel("当前能力等级（0–5）").fill("1");
    await page.getByLabel("目标能力等级（0–5）").selectOption("4");
    await page.getByLabel("学习原因").fill("补齐 Python 工程基础，并通过真实项目证明可以独立交付 AI 应用后端");
    await page.getByLabel("长期动机").fill("成为能够深入现场、理解业务并交付可验证解决方案的 FDE");
    await page.getByLabel("当前基础").fill("会基础 Python，但测试、数据库、错误处理和部署能力尚未系统验证");
    await page.getByLabel("最终目标").fill("独立解释、实现、测试和部署一个可靠的 Python AI 应用后端");
    await page.getByLabel("最终工程成果").fill("交付一个包含 API、Schema、数据库、测试和部署文档的后端项目");
    await page.getByRole("button", { name: "创建并进入资料阶段" }).click();

    await expect(page.getByRole("heading", { name: "Learning Agent Python 浏览器验收" })).toBeVisible();
    await page.getByRole("button", { name: "生成能力诊断与五阶段课程" }).click();
    await expect(page.getByRole("heading", { name: "五阶段掌握路线" })).toBeVisible();
    await expect(page.locator(".agent-phase-list details")).toHaveCount(5);
    await expect(page.locator(".agent-diagnosis")).toContainText("Python");

    await page.getByRole("button", { name: "生成今日任务" }).click();
    await expect(page.locator(".today-mission")).toContainText("今日学习任务");
    await expect(page.locator(".today-mission")).toContainText("验收问题");

    const goalId = await page.locator(".goal-title-row select").inputValue();
    const missionId = await page.evaluate(async (id) => {
      const first = await fetch(`/api/learning-agent/goals/${id}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).then((response) => response.json());
      const retry = await fetch(`/api/learning-agent/goals/${id}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).then((response) => response.json());
      if (first.id !== retry.id || !retry.duplicate) throw new Error("Today Mission idempotency failed");
      return first.id as string;
    }, goalId);
    expect(missionId).toBeTruthy();

    await page.getByLabel("今日完成与理解").fill("我独立解释了输入验证从请求到响应的因果链，并指出了类型正确但业务规则无效的边界。");
    await page.getByLabel("实践产物、测试输出或失败路径").fill("实现了带 Schema、数据库事务和错误处理的 API；自动化测试 8/8 通过，并保留了无效参数的失败日志。");
    await page.getByLabel("复盘：误区与下一次改变").fill("起初把运行成功当成掌握；之后补了反例、失败断言和对请求生命周期的解释，下次会增加延迟复测。");
    await page.getByLabel("产物地址（可选）").fill("https://github.com/example/learning-agent-e2e");
    await page.getByRole("button", { name: "保存结果并交给证据引擎" }).click();

    await expect(page.getByRole("heading", { name: "学习结果与证据交接" })).toBeVisible();
    await expect(page.locator(".agent-result-list").first()).toContainText(/待用户审批|待证据分析/);
    await page.reload();
    await expect(page.locator(".today-mission")).toBeVisible();
    await expect(page.locator(".agent-result-list")).toContainText("掌握评估");

    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "待确认候选" })).toBeVisible();
    await expect(page.locator(".pending-candidate-list")).toContainText("Python 工程能力");
  });

  test("390px 移动端没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today-learning");
    await expect(page.getByLabel("Genesis AI 学习代理")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
