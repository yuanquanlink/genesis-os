import { expect, test } from "@playwright/test";

test.describe.serial("Production-readiness daily life loop", () => {
  test("today renders live daily priorities and self-input presets create pending evidence", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Daily Life Loop")).toBeVisible();
    await page.goto("/self-input");
    await page.getByRole("button", { name: "项目进度" }).click();
    await page.locator("textarea").first().fill("Completed a documented project endpoint with validation and a saved test result.");
    await page.getByRole("button", { name: /保存原文/ }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "Engineering delivery", exact: true })).toBeVisible();
  });

  test("daily life loop remains within a 390px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.getByLabel("Daily Life Loop")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
