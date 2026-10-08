import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v1 Beta observation", () => {
  test("usage exposes local observation metrics and saves local feedback without a new page", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByLabel("Beta 使用指标")).toContainText("Beta 运行");
    await expect(page.getByRole("region", { name: "Beta 反馈" })).toBeVisible();
    await page.getByLabel("Beta 反馈类型").selectOption("difficulty");
    await page.getByLabel("Beta 反馈内容").fill("第 3 天的今日计划确认需要更清晰的本地指引。");
    await page.getByRole("button", { name: "保存本地反馈" }).click();
    await expect(page.getByRole("status")).toContainText("反馈已保存在本地");
    await page.getByRole("button", { name: "标记已审查" }).click();
    await expect(page.getByRole("status")).toContainText("已审查");
    await page.getByRole("button", { name: "标记已解决" }).click();
    await expect(page.getByRole("status")).toContainText("已解决");
    await page.reload();
    await expect(page.getByText("第 3 天的今日计划确认需要更清晰的本地指引。")).toBeVisible();
    await expect(page.getByText("已解决", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Beta 验证记录" })).toBeVisible();
    await page.getByRole("button", { name: "记录今天" }).click();
    await expect(page.getByRole("status")).toContainText("今日验证快照");
    await expect(page.getByText(/已记录天数/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("最近 30 天趋势")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
