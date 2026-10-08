import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Strategic Brain", () => {
  test("candidate approval, formal strategy, feedback, and mobile layout persist", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "Generate strategy candidate" }).click();
    await expect(page.getByLabel("Strategy candidate")).toBeVisible();
    await page.getByRole("button", { name: "Approve candidate" }).click();
    await expect(page.getByLabel("Current strategy")).toBeVisible();
    const detailLink = page.getByRole("link", { name: "View details" });
    await detailLink.click();
    await expect(page.getByRole("heading", { name: /Deliver verifiable|Formal strategy/ })).toBeVisible();
    await page.getByLabel("Strategy feedback").fill("The short weekly focus helped reduce scope.");
    await page.getByRole("button", { name: "Save feedback" }).click();
    await expect(page.getByRole("status")).toContainText("Feedback saved");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByText("The short weekly focus helped reduce scope.")).toBeVisible();
  });

  test("candidate rejection does not create a formal strategy", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "Generate strategy candidate" }).click();
    await expect(page.getByLabel("Strategy candidate")).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept("Rejected in browser acceptance."));
    await page.getByRole("button", { name: "Reject candidate" }).click();
    await expect(page.getByText("Candidate rejected. No formal strategy was created.")).toBeVisible();
  });
});
