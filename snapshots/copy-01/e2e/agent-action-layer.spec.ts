import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P3 Agent Action Layer", () => {
  test("approved Strategy becomes a user-confirmed Mission and then pending Evidence", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "生成战略建议" }).click();
    await expect(page.getByLabel("战略待确认建议")).toBeVisible();
    await page.getByRole("button", { name: "批准建议" }).click();
    await expect(page.getByLabel("当前战略")).toBeVisible();

    await page.goto("/missions");
    await expect(page.getByLabel("使命执行层")).toBeVisible();
    await page.getByRole("button", { name: "生成使命建议" }).click();
    await expect(page.getByLabel("使命待确认建议")).toContainText("目标：");
    await page.getByRole("button", { name: "确认使命" }).click();
    await expect(page.getByRole("status")).toContainText("使命已激活");
    await expect(page.getByLabel("进行中的使命")).toBeVisible();

    const completion = page.getByLabel(/的完成证据/);
    await completion.fill("Implemented a documented API delivery loop, ran its tests, and recorded the remaining deployment limitation for review.");
    await page.getByRole("button", { name: "完成并创建证据" }).click();
    await expect(page.getByRole("status")).toContainText("使命已完成");
    await expect(page.getByText(/待确认成长证据建议|证据分析待处理/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/待确认成长证据建议|证据分析待处理/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
