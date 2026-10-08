import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P2 Personal Memory Intelligence", () => {
  test("raw knowledge becomes a pending Memory Candidate and only confirmation persists long-term memory", async ({ page }) => {
    await page.goto("/knowledge");
    await page.locator("textarea").fill("I want to deepen FastAPI backend delivery through tested and documented project work.");
    await page.getByRole("button", { name: "保存知识" }).click();
    await expect(page.getByRole("status")).toContainText("知识已保存");

    await page.goto("/memory");
    await expect(page.getByLabel("个人长期记忆智能")).toBeVisible();
    await page.getByRole("button", { name: "创建记忆建议" }).click();
    await expect(page.getByRole("status")).toContainText("记忆待确认建议");
    await expect(page.getByLabel("记忆待确认建议")).toContainText("FastAPI backend delivery");
    await page.getByRole("button", { name: "确认记忆" }).first().click();
    await expect(page.getByRole("status")).toContainText("确认为长期记忆");
    await expect(page.getByRole("region", { name: "长期记忆" })).toContainText("FastAPI backend delivery");
    await page.reload();
    await expect(page.getByRole("region", { name: "长期记忆" })).toContainText("FastAPI backend delivery");
  });

  test("personal memory page remains within a 390px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/memory");
    await expect(page.getByLabel("个人长期记忆智能")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
