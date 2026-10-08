import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P4 Personal Operating Loop", () => {
  test("Morning Brief, confirmed Daily Plan, and Evening Reflection form a persistent evidence-bound daily loop", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "生成战略建议" }).click();
    await page.getByRole("button", { name: "批准建议" }).click();

    await page.goto("/missions");
    await page.getByRole("button", { name: "生成使命建议" }).click();
    await page.getByRole("button", { name: "确认使命" }).click();
    await expect(page.getByLabel("进行中的使命")).toBeVisible();

    await page.goto("/");
    const loop = page.getByRole("region", { name: "个人每日运行闭环" });
    await expect(loop).toBeVisible();
    await loop.getByRole("button", { name: "生成晨间简报" }).click();
    await expect(loop.getByText("晨间简报已生成。", { exact: true })).toBeVisible();
    await expect(loop.getByText("当前使命：")).toBeVisible();

    await loop.getByLabel("今日精力").selectOption("4");
    await loop.getByRole("button", { name: "生成今日计划建议" }).click();
    await expect(loop.getByText("建议精力：")).toBeVisible();
    await loop.getByRole("button", { name: "确认今日计划" }).click();
    await expect(loop.getByText("今日计划已激活。", { exact: true })).toBeVisible();
    await expect(loop.getByText("精力：")).toBeVisible();

    await loop.getByLabel("今天完成的内容").fill("完成最高优先级交付任务，并保留可验证产物。");
    await loop.getByLabel("未完成内容与原因").fill("验证步骤需要比预估更多的专注时间。");
    await loop.getByLabel("出现的新问题").fill("实现前没有准备好最终验收命令。");
    await loop.getByLabel("明日调整建议").fill("从验证命令开始，并保持第一项交付范围更小。");
    await loop.getByRole("button", { name: "提交晚间复盘" }).click();
    await expect(loop.getByText(/晚间复盘已保存|原始复盘已保存/)).toBeVisible();
    await expect(loop.getByRole("status")).toContainText("待确认后续建议与证据建议");
    await page.reload();
    await expect(page.getByRole("region", { name: "个人每日运行闭环" }).getByText("晨间简报", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "个人每日运行闭环" }).getByText(/待确认成长证据建议|待确认推断/).first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
