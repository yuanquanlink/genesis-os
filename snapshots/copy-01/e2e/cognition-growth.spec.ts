import { expect, test } from "@playwright/test";

test.describe.serial("Cognition Growth MVP", () => {
  test("four modules generate, reflection persists, and daily or weekly regeneration is idempotent", async ({ page }) => {
    test.setTimeout(60_000);
    const moduleIds = ["thinking_model", "book_intelligence", "business_learning", "movie_reflection"];
    await page.goto("/cognition");
    await expect(page.locator(".cognition-intro")).toBeVisible();
    await expect(page.locator(".cognition-tabs button")).toHaveCount(4);

    for (let index = 0; index < 4; index += 1) {
      const selectedTab = page.locator(".cognition-tabs button").nth(index);
      await selectedTab.click();
      await expect(selectedTab).toHaveAttribute("aria-selected", "true");
      const responsePromise = page.waitForResponse(
        (response) => response.url().endsWith("/api/cognition") && response.request().method() === "POST",
      );
      await page.locator(".cognition-generate").click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      const generated = await response.json() as { item: { moduleId: string } };
      expect(generated.item.moduleId).toBe(moduleIds[index]);
      await expect(page.locator(".cognition-module-detail")).toBeVisible();
      await expect(page.locator(".cognition-source-line").first()).toContainText("summary_only");
    }

    await page.locator(".cognition-tabs button").first().click();
    await page.getByLabel("我的反思").fill("我会先把这个模型写成一个可观察的假设，再记录一个反例和失败路径，而不是把一次顺利完成当成长期掌握。");
    await page.getByRole("button", { name: "保存反思并分析" }).click();
    await expect(page.locator(".cognition-analysis")).toBeVisible();
    await expect(page.locator(".cognition-analysis")).toContainText("反方观点");
    await page.reload();
    await expect(page.locator(".cognition-analysis")).toBeVisible();

    const idempotency = await page.evaluate(async () => {
      const snapshot = await fetch("/api/cognition").then((response) => response.json());
      const world = snapshot.items.find((item: { moduleId: string }) => item.moduleId === "thinking_model");
      const reading = snapshot.items.find((item: { moduleId: string }) => item.moduleId === "book_intelligence");
      const post = (moduleId: string) => fetch("/api/cognition", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", moduleId, topic: "retry", clientRequestId: crypto.randomUUID() }),
      }).then((response) => response.json());
      const [worldRetry, readingRetry, evidence] = await Promise.all([post("thinking_model"), post("book_intelligence"), fetch("/api/evidence").then((response) => response.json())]);
      return {
        worldId: world.id, worldRetryId: worldRetry.item.id, worldDuplicate: worldRetry.duplicate,
        readingId: reading.id, readingRetryId: readingRetry.item.id, readingDuplicate: readingRetry.duplicate,
        selfReflection: evidence.items.some((item: { evidenceType: string; confidence: number; impact: number }) => item.evidenceType === "self_reflection" && item.confidence <= 0.25 && item.impact === 0),
      };
    });
    expect(idempotency.worldRetryId).toBe(idempotency.worldId);
    expect(idempotency.worldDuplicate).toBe(true);
    expect(idempotency.readingRetryId).toBe(idempotency.readingId);
    expect(idempotency.readingDuplicate).toBe(true);
    expect(idempotency.selfReflection).toBe(true);
  });

  test("390px cognition page has no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cognition");
    await expect(page.locator(".cognition-tabs")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});
