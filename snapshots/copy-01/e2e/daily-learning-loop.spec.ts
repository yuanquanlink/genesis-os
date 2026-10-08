import { expect, test } from "@playwright/test";

test.describe.serial("Daily Learning Loop", () => {
  test("Morning Brief、晚间反思、日报与明日计划形成可持久化闭环", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/today-learning");
    await page.getByLabel("学习主题").fill("Daily Learning Loop 浏览器验收");
    await page.getByRole("textbox", { name: "目标能力", exact: true }).fill("FastAPI 后端工程");
    await page.getByLabel("当前能力等级（0–5）").fill("1");
    await page.getByLabel("目标能力等级（0–5）").selectOption("4");
    await page.getByLabel("学习原因").fill("通过每日学习、复习与工程挑战形成可验证的后端能力");
    await page.getByLabel("长期动机").fill("成为能独立诊断现场问题并交付方案的 FDE");
    await page.getByLabel("当前基础").fill("会基础 Python，但数据库失败路径与工程交付尚未验证");
    await page.getByLabel("最终目标").fill("独立实现、测试和解释一个 FastAPI 服务");
    await page.getByLabel("最终工程成果").fill("带数据库、异常、测试和 README 的 FastAPI 项目");
    await page.getByRole("button", { name: "创建并进入资料阶段" }).click();

    await expect(page.getByLabel("每日学习闭环")).toBeVisible();
    await expect(page.locator(".morning-brief")).toContainText("今日唯一主任务");
    await expect(page.locator(".morning-answer-grid")).toContainText("当前最大风险");
    await page.getByRole("button", { name: "生成能力诊断与五阶段课程" }).click();
    await page.getByRole("button", { name: "生成今日任务" }).click();
    await page.getByRole("button", { name: "刷新晨报" }).click();
    await expect(page.locator(".morning-primary")).toContainText("基础理解");

    await page.getByLabel("实际学习时间（分钟）").fill("70");
    await page.getByLabel("明日可用时间（分钟）").fill("90");
    await page.getByLabel("今天实际完成了什么").fill("完成 FastAPI 输入校验练习，保存了成功响应、422 失败响应和测试输出。");
    await page.getByLabel("哪里卡住").fill("数据库异常回滚和统一错误响应仍不稳定。");
    await page.getByLabel("今天最大的收获").fill("类型正确不代表业务规则有效，必须用负向测试验证边界。");
    await page.getByLabel("没有完成什么").fill("没有完成数据库失败路径的集成测试。");
    await page.getByLabel("未完成原因").fill("任务拆分过大，调试时间超过预估。");
    await page.getByRole("button", { name: "保存复盘并生成日报" }).click();

    await expect(page.locator(".daily-reflection-saved")).toContainText("时间线已关联");
    await expect(page.getByRole("heading", { name: "事实、问题与反面解释" })).toBeVisible();
    await expect(page.locator(".daily-growth-report")).toContainText("另一种解释");
    await expect(page.locator(".tomorrow-plan")).toContainText("可用 90 分钟");
    await expect(page.locator(".tomorrow-plan li")).toHaveCount(3);
    await page.reload();
    await expect(page.locator(".daily-reflection-saved")).toBeVisible();
    await expect(page.locator(".daily-growth-report")).toBeVisible();
    await expect(page.locator(".tomorrow-plan")).toBeVisible();

    const goalId = await page.locator(".goal-title-row select").inputValue();
    const retry = await page.evaluate(async (id) => {
      const clientRequestId = crypto.randomUUID();
      const body = { action: "submit_evening", goalId: id, clientRequestId, actualMinutes: 70, completed: "网络重试不应创建第二条晚间反思记录。", stuck: "数据库异常回滚仍需继续验证。", biggestGain: "明确了失败路径必须由测试证明。", unfinished: "集成测试尚未完成。", unfinishedReason: "时间不足。", tomorrowAvailableMinutes: 90 };
      const first = await fetch("/api/daily-learning-loop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.json());
      const second = await fetch("/api/daily-learning-loop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((response) => response.json());
      return { firstId: first.reflection?.id, secondId: second.reflection?.id, firstDuplicate: first.duplicate, secondDuplicate: second.duplicate };
    }, goalId);
    expect(retry.firstId).toBe(retry.secondId);
    expect(retry.firstDuplicate).toBe(true);
    expect(retry.secondDuplicate).toBe(true);

    await page.goto("/timeline");
    await expect(page.locator("main")).toContainText("晚间学习复盘");
    await page.goto("/evidence");
    await expect(page.locator("main")).toContainText("用户每日反思");
  });

  test("390px Daily Learning Loop 无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today-learning");
    await expect(page.getByLabel("每日学习闭环")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});
