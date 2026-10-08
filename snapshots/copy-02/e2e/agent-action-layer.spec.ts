import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P3 Agent Action Layer", () => {
  test("approved Strategy becomes a user-confirmed Mission and then pending Evidence", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "Generate strategy candidate" }).click();
    await expect(page.getByLabel("Strategy candidate")).toBeVisible();
    await page.getByRole("button", { name: "Approve candidate" }).click();
    await expect(page.getByLabel("Current strategy")).toBeVisible();

    await page.goto("/missions");
    await expect(page.getByLabel("Agent Action Layer")).toBeVisible();
    await page.getByRole("button", { name: "Generate Mission Candidate" }).click();
    await expect(page.getByLabel("Mission Candidates")).toContainText("Goal:");
    await page.getByRole("button", { name: "Confirm Mission" }).click();
    await expect(page.getByRole("status")).toContainText("Mission activated");
    await expect(page.getByLabel("Active Missions")).toBeVisible();

    const completion = page.getByLabel(/Completion evidence for/);
    await completion.fill("Implemented a documented API delivery loop, ran its tests, and recorded the remaining deployment limitation for review.");
    await page.getByRole("button", { name: "Complete and create Evidence" }).click();
    await expect(page.getByRole("status")).toContainText("Mission completed");
    await expect(page.getByText(/Pending Growth Evidence Candidate|Evidence analysis pending/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Pending Growth Evidence Candidate|Evidence analysis pending/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
