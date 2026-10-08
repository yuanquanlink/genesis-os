import { expect, test } from "@playwright/test";

test.describe.serial("Genesis v0.2 P1 Monthly Growth Review", () => {
  test("verified evidence produces one persisted read-only Monthly Review Candidate", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(async () => {
      const headers = { "Content-Type": "application/json" };
      const create = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "create", evidenceType: "project", source: "monthly review E2E", description: "Implemented a documented FastAPI endpoint with validation and saved passing test output.", relatedAbility: "Backend engineering", capturedAt: new Date().toISOString(), dataKind: "user", clientRequestId: crypto.randomUUID() }) });
      if (!create.ok) throw new Error("Evidence creation failed");
      const analyze = await fetch("/api/evidence", { method: "POST", headers, body: JSON.stringify({ action: "analyze" }) });
      if (!analyze.ok) throw new Error("Evidence analysis failed");
    });
    await page.goto("/monthly-review");
    await expect(page.getByLabel("Monthly Growth Review")).toBeVisible();
    await page.getByRole("button", { name: "Generate monthly review" }).click();
    await expect(page.getByRole("status")).toContainText("Monthly Review Candidate generated");
    await expect(page.getByLabel("Monthly Review Candidate")).toBeVisible();
    await expect(page.getByText("Next month recommendations")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Monthly Review Candidate")).toBeVisible();
  });

  test("monthly review page has no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/monthly-review");
    await expect(page.getByLabel("Monthly Growth Review")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
