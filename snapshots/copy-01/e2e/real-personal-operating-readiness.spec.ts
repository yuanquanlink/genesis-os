import { expect, test } from "@playwright/test";

test.describe("Phase 4 Step 10 Day 1 readiness fixture", () => {
  for (const width of [390, 430]) {
    test(`exposes owner controls at ${width}px without creating a fake Day 1 record`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      const context = page.getByRole("region", { name: "已确认认知控制" });
      await expect(context).toContainText("选择 Genesis 今天可以使用的正式信息");
      await expect(context).toContainText("待处理候选不会进入上下文");
      const validation = page.getByRole("region", { name: "所有者真实使用验证" });
      await expect(validation).toContainText("这里不会模拟一天");
      await expect(validation.getByRole("button", { name: "开始真实第 1 天" })).toBeVisible();
      await expect(validation).toContainText("系统事实、所有者自述与 AI 推断");
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      const snapshot = await (await page.request.get("/api/beta-validation")).json() as { logs: unknown[] };
      expect(snapshot.logs).toEqual([]);
    });
  }
});
