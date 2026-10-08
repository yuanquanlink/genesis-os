import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v1 Beta observation", () => {
  test("usage exposes local observation metrics and saves local feedback without a new page", async ({ page }) => {
    await page.goto("/usage");
    await expect(page.getByLabel("Beta usage metrics")).toContainText("Beta run");
    await expect(page.getByRole("region", { name: "Beta feedback" })).toBeVisible();
    await page.getByLabel("Beta feedback type").selectOption("difficulty");
    await page.getByLabel("Beta feedback content").fill("The Day 3 Daily Plan confirmation needs clearer local guidance in the Beta flow.");
    await page.getByRole("button", { name: "Save local feedback" }).click();
    await expect(page.getByRole("status")).toContainText("Feedback saved locally");
    await page.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByRole("status")).toContainText("reviewed locally");
    await page.getByRole("button", { name: "Mark resolved" }).click();
    await expect(page.getByRole("status")).toContainText("resolved locally");
    await page.reload();
    await expect(page.getByText("The Day 3 Daily Plan confirmation needs clearer local guidance in the Beta flow.")).toBeVisible();
    await expect(page.getByText("resolved", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Beta validation log" })).toBeVisible();
    await page.getByRole("button", { name: "Record today" }).click();
    await expect(page.getByRole("status")).toContainText("validation snapshot was recorded locally");
    await expect(page.getByText(/Recorded days/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Recent 30 day trend")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });
});
