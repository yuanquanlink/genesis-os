import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Phase 5 Step 1 Planning Buffer", () => {
  test("captures and explicitly approves a planning candidate without claiming formal conversion", async ({ page }) => {
    await page.goto("/planning-buffer");
    await expect(page.getByLabel("未来规划缓存区")).toBeVisible();
    await page.getByLabel("标题").fill("明年参加一次 AI 竞赛");
    await page.getByLabel("详细说明").fill("先记录这个意图，之后再评估竞赛方向、所需能力和可用时间。");
    await page.getByLabel("类型").selectOption("future_goal");
    await page.getByRole("button", { name: "加入规划缓存" }).click();
    await expect(page.getByRole("status")).toContainText("不会进入正式计划");

    const candidate = page.locator(".planning-candidate").filter({ hasText: "明年参加一次 AI 竞赛" });
    await expect(candidate).toContainText("已捕获");
    await candidate.getByRole("button", { name: "批准进入规划准备" }).click();
    await expect(page.getByRole("status")).toContainText("尚未创建 Goal、Mission 或 Daily Plan");
    await expect(candidate).toContainText("已批准进入规划准备");

    const snapshot = await page.evaluate(async () => {
      const response = await fetch("/api/planning-buffer", { cache: "no-store" });
      if (!response.ok) throw new Error("Planning Buffer API failed");
      return response.json();
    }) as { boundary: Record<string, boolean>; candidates: Array<Record<string, unknown>> };
    expect(snapshot.boundary).toMatchObject({ candidateOnly: true, contextEligible: false, formalMutationAllowed: false, conversionAvailable: false });
    expect(snapshot.candidates[0]).toMatchObject({ status: "approved", contextEligible: false, formalMutationAllowed: false });
  });

  for (const width of [390, 430]) {
    test(`keeps the planning workflow usable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/planning-buffer");
      await expect(page.getByLabel("未来规划缓存区")).toBeVisible();
      await expect(page.getByRole("button", { name: "加入规划缓存" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    });
  }
});

