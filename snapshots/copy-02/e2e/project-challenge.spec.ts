import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Project Challenge", () => {
  test("FastAPI 项目经安全执行、答辩和批准后形成 Ability Snapshot", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/project-challenge");

    await page.getByLabel("学习主题").fill("FastAPI Project Challenge 浏览器验收");
    await page.getByRole("textbox", { name: "目标能力", exact: true }).fill("后端工程");
    await page.getByLabel("学习原因").fill("验证我能独立完成可运行、可测试、可解释的 AI 应用后端");
    await page.getByLabel("当前基础").fill("会 Python 基础，正在验证 API、数据库、测试、异常处理和部署能力");
    await page.getByLabel("最终目标").fill("独立交付并答辩一个 FastAPI AI 服务");
    await page.getByLabel("最终工程成果").fill("交付包含 API、Pydantic、SQLite、认证、测试、OpenAPI、README 和 AI Provider 的 FastAPI 服务");
    await page.getByRole("button", { name: "创建并进入资料阶段" }).click();

    await expect(page.getByTestId("project-challenge")).toBeVisible();
    await expect(page.getByText("仅本地单用户开发使用")).toBeVisible();
    await page.getByText("创建工程挑战").click();
    await page.getByRole("button", { name: "创建正式工程挑战" }).click();
    await expect(page.getByRole("heading", { name: /正式工程挑战/ }).last()).toBeVisible();

    await page.getByRole("button", { name: "本地路径" }).click();
    await page.getByLabel("项目来源").fill(path.join(process.cwd(), "data", "e2e-project-imports", "fastapi-project"));
    await page.getByLabel("AI 提示次数").fill("1");
    await page.getByLabel("用户修改次数").fill("6");
    await page.getByLabel("自评独立性").selectOption("4");
    await page.getByRole("button", { name: "提交项目并分析" }).click();
    await expect(page.getByText("项目已导入并完成静态仓库分析")).toBeVisible();
    await expect(page.locator(".analysis-metrics")).toContainText("5");

    await page.getByRole("button", { name: "运行安全验收" }).click();
    await expect(page.getByText("Machine Verification · PASS")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".criteria-grid details.pass")).toHaveCount(15);
    await expect(page.locator(".runner-output")).toContainText("stdout / stderr");

    await page.getByRole("button", { name: "进入 Defense Mode" }).click();
    const answers = page.locator(".defense-panel textarea");
    await expect(answers).toHaveCount(6);
    for (let index = 0; index < 6; index += 1) {
      await answers.nth(index).fill("我选择这种设计是为了把输入边界、事务持久化、认证和失败路径分开验证。并发增加时会引入连接池、事务隔离、幂等键、限流和可观测性；数据库失败必须回滚并返回结构化错误。如果不能使用 AI，我会查官方文档、拆分实现、编写失败测试并用日志复现。 ");
    }
    await page.getByRole("button", { name: "提交答辩并计算独立性" }).click();
    await expect(page.getByText("Evidence Candidate 等待用户批准")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".final-score-row")).toContainText("独立性");

    await expect(page.getByText("Evidence 审批单次最多提升 1 级")).toBeVisible();
    await page.getByLabel("批准能力等级").selectOption("1");
    await page.getByRole("button", { name: "批准并更新 Growth Graph" }).click();
    await expect(page.getByText("Ability Snapshot 已持久化")).toBeVisible();
    await expect(page.locator(".ability-change")).toContainText("现在");
    await expect(page.locator(".ability-change")).toContainText("1/5");

    await page.reload();
    await expect(page.getByText("Ability Snapshot 已持久化")).toBeVisible();
    await expect(page.locator(".ability-change")).toContainText("1/5");
    await page.goto("/growth-graph");
    await expect(page.getByText("后端工程").first()).toBeVisible();
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "能力变化", exact: true })).toBeVisible();
    await expect(page.locator(".change-list")).toContainText("后端工程");
  });

  test("390px 工程挑战页面无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/project-challenge");
    await expect(page.getByTestId("project-challenge")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    await expect(page.getByRole("button", { name: "运行安全验收" })).toBeVisible();
  });
});
