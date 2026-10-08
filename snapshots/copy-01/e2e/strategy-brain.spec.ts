import { expect, test } from "@playwright/test";

test.describe.serial("Genesis Strategic Brain", () => {
  test("candidate approval rejects a cross-site write before accessing formal data", async ({ request }) => {
    const response = await request.post(`/api/strategy/candidates/${crypto.randomUUID()}/approve`, {
      headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      data: {},
    });
    expect(response.status()).toBe(403);
  });

  test("candidate approval, formal strategy, feedback, and mobile layout persist", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "生成战略建议" }).click();
    await expect(page.getByLabel("战略待确认建议")).toBeVisible();
    await page.getByRole("button", { name: "批准建议" }).click();
    await expect(page.getByLabel("当前战略")).toBeVisible();
    const detailLink = page.getByRole("link", { name: "查看详情" });
    await detailLink.click();
    await expect(page.getByRole("heading", { name: /可验证|正式战略/ })).toBeVisible();
    await page.getByLabel("战略反馈").fill("本周聚焦缩小了范围，并帮助完成一个可验证闭环。");
    await page.getByRole("button", { name: "保存反馈" }).click();
    await expect(page.getByRole("status")).toContainText("反馈已保存");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByText("本周聚焦缩小了范围，并帮助完成一个可验证闭环。")).toBeVisible();
  });

  test("candidate rejection does not create a formal strategy", async ({ page }) => {
    await page.goto("/strategy");
    await page.getByRole("button", { name: "生成战略建议" }).click();
    await expect(page.getByLabel("战略待确认建议")).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept("浏览器验收中拒绝此建议。"));
    await page.getByRole("button", { name: "拒绝建议" }).click();
    await expect(page.getByText("战略建议已拒绝，没有创建正式战略。")).toBeVisible();
  });
});
