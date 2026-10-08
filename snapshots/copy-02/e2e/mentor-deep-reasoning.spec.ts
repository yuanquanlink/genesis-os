import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Mentor deep reasoning", () => {
  test("结构化分析引用 Context、展示多视角并在刷新后保留", async ({ page }) => {
    await page.goto("/learning");
    await page.getByLabel("学习主题").fill("Genesis Mentor 浏览器验收");
    await page.getByRole("textbox", { name: "目标能力", exact: true }).fill("软件工程");
    await page.getByLabel("当前能力等级（0–5）").fill("1");
    await page.getByLabel("目标能力等级（0–5）").selectOption("4");
    await page.getByLabel("学习原因").fill("补齐成为 FDE 所需的独立工程诊断和交付能力");
    await page.getByLabel("长期动机").fill("用真实证据证明能够解决现场问题，而不是只生成计划");
    await page.getByLabel("当前基础").fill("完成 Genesis OS 项目，但基础体系和无 AI 独立性仍需验证");
    await page.getByLabel("最终目标").fill("独立设计、测试、部署并解释可靠后端服务");
    await page.getByLabel("最终工程成果").fill("包含测试、故障处理和答辩证据的服务");
    await page.getByRole("button", { name: "创建并进入资料阶段" }).click();
    await page.goto("/today-learning");

    await page.getByLabel("导师分析问题").fill("我现在最大的认知漏洞是什么？请区分事实与推测，并给可验证行动。");
    await page.getByRole("button", { name: "运行深度导师分析" }).click();
    const result = page.getByTestId("mentor-deep-analysis");
    await expect(result).toBeVisible();
    await expect(result.getByRole("heading", { name: "事实与证据" })).toBeVisible();
    await expect(result.getByRole("heading", { name: "Perspective Panel" })).toBeVisible();
    await expect(result.locator(".perspective-panel article")).toHaveCount(3);
    await expect(result.locator(".mentor-action-loop li")).toHaveCount(3);
    await expect(result).toContainText("反面解释");
    await expect(result).toContainText(/R\d+|F\d+|GG:|LG:/);

    await page.reload();
    await expect(page.getByTestId("mentor-deep-analysis")).toBeVisible();
    await expect(page.getByTestId("mentor-deep-analysis").locator(".mentor-action-loop li")).toHaveCount(3);
  });

  test("390px Perspective Panel 无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today-learning");
    await expect(page.getByLabel("Genesis Mentor")).toBeVisible();
    await expect(page.getByTestId("mentor-deep-analysis")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});
