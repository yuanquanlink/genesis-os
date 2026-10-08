import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P0 proactive companion", () => {
  test("knowledge persists, can be searched, and remains usable at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/knowledge");
    await expect(page.getByLabel("个人知识库")).toBeVisible();
    await page.locator("textarea").fill("FastAPI dependency injection makes auth and database code easier to test.");
    await page.getByRole("button", { name: "保存知识" }).click();
    await expect(page.getByRole("status")).toContainText("知识已保存");
    await page.getByLabel("检索知识").fill("dependency injection");
    await page.getByRole("button", { name: "检索" }).click();
    await expect(page.getByText("FastAPI dependency injection makes auth and database code easier to test.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("a verified evidence record produces an evidence-linked pending recommendation candidate", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const headers = { "Content-Type": "application/json" };
      const create = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "create", evidenceType: "project", source: "proactive E2E", description: "Implemented a tested FastAPI endpoint with validation and recorded its successful test output.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: crypto.randomUUID() }) });
      if (!create.ok) throw new Error("Evidence creation failed");
      const analyze = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "analyze" }) });
      if (!analyze.ok) throw new Error("Evidence analysis failed");
    });
    await page.reload();
    await expect(page.getByLabel("主动导师")).toBeVisible();
    await page.getByRole("button", { name: "生成每周洞察" }).click();
    await expect(page.getByRole("status")).toContainText("每周洞察待确认建议已生成");
    await expect(page.getByText("建议待确认项")).toBeVisible();
    await expect(page.getByText("能力证据：", { exact: true })).toBeVisible();
  });

  test("today remains within a 390px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByLabel("每日生活闭环")).toBeVisible();
    await expect(page.getByLabel("主动导师")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
