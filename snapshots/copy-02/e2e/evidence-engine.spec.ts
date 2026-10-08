import { expect, test } from "@playwright/test";

test("Evidence Engine: sync, analyze, approve candidate and persist ability change", async ({ page }) => {
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "成长证据", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "同步来源" }).click();
  await expect(page.locator(".evidence-stats")).toContainText("全部证据");
  await page.getByRole("button", { name: "分析证据" }).click();
  await expect(page.locator(".pending-candidates-card")).toContainText("待确认候选");
  await expect(page.locator(".pending-candidate-list article").first()).toBeVisible();

  await page.locator(".pending-candidate-list article a").first().click();
  await expect(page.getByRole("heading", { name: "Genesis Growth Graph" })).toBeVisible();
  await expect(page.locator(".candidate-grid>article").first()).toBeVisible();
  await page.locator(".candidate-actions button:first-child").first().click();

  await page.goto("/evidence");
  await expect(page.locator(".change-card")).toContainText("能力变化");
  await expect(page.locator(".change-list article").first()).toBeVisible();
});

test("Evidence Engine has no horizontal overflow at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/evidence");
  await expect(page.getByRole("heading", { name: "成长证据", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
