import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P2 Personal Memory Intelligence", () => {
  test("raw knowledge becomes a pending Memory Candidate and only confirmation persists long-term memory", async ({ page }) => {
    await page.goto("/knowledge");
    await page.locator("textarea").fill("I want to deepen FastAPI backend delivery through tested and documented project work.");
    await page.getByRole("button", { name: "Save knowledge" }).click();
    await expect(page.getByRole("status")).toContainText("Knowledge saved");

    await page.goto("/memory");
    await expect(page.getByLabel("Personal Memory Intelligence")).toBeVisible();
    await page.getByRole("button", { name: "Create Memory Candidates" }).click();
    await expect(page.getByRole("status")).toContainText("Memory Candidate");
    await expect(page.getByLabel("Memory Candidates")).toContainText("FastAPI backend delivery");
    await page.getByRole("button", { name: "Confirm memory" }).first().click();
    await expect(page.getByRole("status")).toContainText("confirmed into Long-term Memory");
    await expect(page.getByLabel("Long-term Memory")).toContainText("FastAPI backend delivery");
    await page.reload();
    await expect(page.getByLabel("Long-term Memory")).toContainText("FastAPI backend delivery");
  });

  test("personal memory page remains within a 390px viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/memory");
    await expect(page.getByLabel("Personal Memory Intelligence")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
