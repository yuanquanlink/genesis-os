import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Phase 5 Personal Intelligence", () => {
  test("captures and decomposes a future intention into candidate-only paths", async ({ page }) => {
    await page.goto("/planning-buffer");
    await page.getByLabel("标题").fill("提升 AI 工程能力");
    await page.getByLabel("详细说明").fill("我想通过一个真实项目提升 AI 工程能力，但还没有确定路线。");
    await page.getByLabel("类型").selectOption("future_goal");
    await page.getByRole("button", { name: "加入规划缓存" }).click();
    const candidate = page.locator(".planning-candidate").filter({ hasText: "提升 AI 工程能力" });
    await candidate.getByRole("button", { name: "拆解成可执行路径" }).click();
    await expect(page.getByRole("status")).toContainText("不会自动创建 Goal、Mission 或 Daily Plan");
    await expect(candidate.getByLabel("提升 AI 工程能力 的待审规划拆解")).toBeVisible();
    await expect(candidate).toContainText("小实验驱动");
    await expect(candidate).toContainText("完成信号");
  });

  test("generates an Advisor recommendation with trade-offs and one first action", async ({ page }) => {
    await page.goto("/advisor");
    await expect(page.getByLabel("Genesis Advisor")).toBeVisible();
    await page.getByLabel("你现在最想解决的问题").fill("我现在应该做什么？");
    await page.getByLabel("可用时间").selectOption("30");
    await page.getByRole("button", { name: "帮我判断下一步" }).click();
    await expect(page.getByRole("status")).toContainText("不会自动改变任何正式状态");
    await expect(page.getByLabel("最新 Advisor 待审建议")).toContainText("当前状态");
    await expect(page.getByLabel("最新 Advisor 待审建议")).toContainText("可能收益");
    await expect(page.getByLabel("最新 Advisor 待审建议")).toContainText("现实代价");
    await expect(page.getByLabel("最新 Advisor 待审建议")).toContainText("先做这一件事");
  });

  test("creates an externally-verifiable opportunity candidate without external action", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByLabel("机会中心")).toBeVisible();
    await page.getByLabel("可选关注方向").fill("AI Agent 竞赛与公开作品");
    await page.getByRole("button", { name: "发现一个可验证机会" }).click();
    await expect(page.getByRole("status")).toContainText("需要你核实外部条件");
    const candidate = page.locator(".opportunity-candidate").first();
    await expect(candidate).toContainText("待审机会候选");
    await expect(candidate).toContainText("最小验证");
    await expect(page.getByText("所有机会都需要外部核实")).toBeVisible();
  });

  test("routes an Orb future-planning command into an isolated Planning Candidate", async ({ page }) => {
    await page.goto("/");
    const response = await page.evaluate(async () => {
      const result = await fetch("/api/orb-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "把参加 AI 竞赛这个想法加入未来规划",
          currentPath: "/",
          clientRequestId: crypto.randomUUID(),
          conversation: [],
        }),
      });
      return { status: result.status, body: await result.json() };
    }) as { status: number; body: { meta: { personalIntelligence: Record<string, unknown> } } };
    expect(response.status).toBe(200);
    expect(response.body.meta.personalIntelligence).toMatchObject({ capability: "planning_buffer" });

    const snapshot = await page.evaluate(async () => (await fetch("/api/planning-buffer", { cache: "no-store" })).json()) as {
      candidates: Array<Record<string, unknown>>;
    };
    expect(snapshot.candidates[0]).toMatchObject({ source: "orb", status: "captured", contextEligible: false, formalMutationAllowed: false });
  });

  for (const width of [390, 430]) {
    test(`keeps all Phase 5 intelligence pages usable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/planning-buffer", "/advisor", "/opportunities"]) {
        await page.goto(route);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      }
      await expect(page.getByRole("button", { name: "发现一个可验证机会" })).toBeVisible();
    });
  }
});
