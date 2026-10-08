import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P1 Monthly Growth Review", () => {
  test("verified evidence produces one persisted read-only Monthly Review Candidate", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const headers = { "Content-Type": "application/json" };
      const create = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "create", evidenceType: "project", source: "monthly review E2E", description: "Implemented a documented FastAPI endpoint with validation and saved passing test output.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: crypto.randomUUID() }) });
      if (!create.ok) throw new Error("Evidence creation failed");
      const analyze = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "analyze" }) });
      if (!analyze.ok) throw new Error("Evidence analysis failed");
    });
    await page.goto("/monthly-review");
    await expect(page.getByLabel("月度成长复盘")).toBeVisible();
    await page.getByRole("button", { name: "生成月度复盘" }).click();
    await expect(page.getByRole("status")).toContainText("月度成长复盘建议已生成");
    await expect(page.getByLabel("月度复盘待确认建议")).toBeVisible();
    await expect(page.getByText("下月建议")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("月度复盘待确认建议")).toBeVisible();
  });

  test("monthly review page has no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/monthly-review");
    await expect(page.getByLabel("月度成长复盘")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
