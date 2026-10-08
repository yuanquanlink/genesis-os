import { expect, test } from "@playwright/test";

test.describe.serial("Genesis OS v0.1 stabilization", () => {
  test("usage dashboard exports data and backup preview remains confirmation-gated", async ({ page }) => {
    await page.goto("/usage");
    await page.getByRole("button", { name: "Run integrity check" }).click();
    await expect(page.getByText(/No repairable data-integrity issues found|issue\(s\) need attention/)).toBeVisible();
    await expect(page.getByLabel("User Usage Dashboard")).toBeVisible();
    await expect(page.getByRole("link", { name: "导出 JSON 备份" })).toHaveAttribute("href", /format=json/);
    await expect(page.getByRole("link", { name: "导出 Markdown 报告" })).toHaveAttribute("href", /format=markdown/);
    await expect(page.getByRole("button", { name: "确认合并备份" })).toHaveCount(0);
  });

  for (const width of [390, 430]) {
    test(`${width}px critical pages have no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ["/", "/self-input", "/today-learning", "/growth-graph", "/strategy", "/usage"]) {
        await page.goto(route);
        await expect(page.locator("body")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  }
});
