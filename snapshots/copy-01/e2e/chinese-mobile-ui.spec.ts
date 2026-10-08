import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/learning",
  "/today-learning#mentor",
  "/review-center",
  "/strategy",
  "/missions",
  "/planning-buffer",
  "/project-challenge",
  "/knowledge",
  "/memory",
  "/growth-graph",
  "/evidence",
  "/usage",
];

for (const width of [390, 430]) {
  test(`keeps core Chinese journeys usable without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
      await expect(page.locator("main")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${route} 在 ${width}px 出现横向溢出`).toBeLessThanOrEqual(dimensions.viewport + 1);
      const navigation = page.getByRole("navigation", { name: "移动端主要导航" });
      await expect(navigation).toBeVisible();
      for (const label of ["今日", "学习", "导师", "成长", "我的"]) {
        const target = navigation.getByText(label, { exact: true });
        await expect(target).toBeVisible();
        const box = await target.locator("xpath=..").boundingBox();
        expect(box?.height, `${label} 触控目标高度不足`).toBeGreaterThanOrEqual(44);
      }
      if (route.includes("#mentor")) await expect(page.locator("#mentor")).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/Generate weekly insight|No weekly insight has been generated|Evidence-based capability model|Personal growth knowledge graph/);
    }
  });
}

test("keeps every secondary capability reachable from the mobile 我的面板", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "我的" }).click();
  const dialog = page.getByRole("dialog", { name: "我的 Genesis" });
  await expect(dialog).toBeVisible();
  for (const label of ["使命", "战略", "未来规划", "审查中心", "工程挑战", "知识库", "长期记忆", "使用概览", "设置与数据"]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }
});
