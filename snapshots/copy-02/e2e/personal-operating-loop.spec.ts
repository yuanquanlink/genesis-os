import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P4 Personal Operating Loop", () => {
  test("Morning Brief, confirmed Daily Plan, and Evening Reflection form a persistent evidence-bound daily loop", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "Generate strategy candidate" }).click();
    await page.getByRole("button", { name: "Approve candidate" }).click();

    await page.goto("/missions");
    await page.getByRole("button", { name: "Generate Mission Candidate" }).click();
    await page.getByRole("button", { name: "Confirm Mission" }).click();
    await expect(page.getByLabel("Active Missions")).toBeVisible();

    await page.goto("/");
    const loop = page.getByRole("region", { name: "Personal Operating Loop" });
    await expect(loop).toBeVisible();
    await loop.getByRole("button", { name: "Generate Morning Brief" }).click();
    await expect(loop.getByText("Morning Brief generated.")).toBeVisible();
    await expect(loop.getByText("Active Mission:")).toBeVisible();

    await loop.getByLabel("Today energy").selectOption("4");
    await loop.getByRole("button", { name: "Generate Daily Plan Candidate" }).click();
    await expect(loop.getByText("Candidate energy:")).toBeVisible();
    await loop.getByRole("button", { name: "Confirm Daily Plan" }).click();
    await expect(loop.getByText("Daily Plan activated.")).toBeVisible();
    await expect(loop.getByText("Energy:")).toBeVisible();

    await loop.getByLabel("Operating reflection completed").fill("Completed the highest-priority delivery task and preserved a testable artifact.");
    await loop.getByLabel("Operating reflection unfinished reason").fill("The verification step required more focused time than expected.");
    await loop.getByLabel("Operating reflection new problems").fill("The final acceptance command was not prepared before implementation.");
    await loop.getByLabel("Operating reflection tomorrow adjustment").fill("Start from the verification command and keep the first deliverable smaller.");
    await loop.getByRole("button", { name: "Save Evening Reflection" }).click();
    await expect(loop.getByText(/Evening Reflection saved|Raw reflection was saved/)).toBeVisible();
    await expect(loop.getByText(/Pending Growth Evidence Candidate|Reflection Evidence analysis is pending/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Personal Operating Loop" }).getByText("Morning Brief", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Personal Operating Loop" }).getByText(/Pending Growth Evidence Candidate|Reflection Evidence analysis is pending/)).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
