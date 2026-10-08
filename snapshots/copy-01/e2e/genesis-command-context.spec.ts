import { expect, test } from "@playwright/test";

test("opens the global command palette and navigates to the Context inspector", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "搜索 Genesis 能力或动作" });
  await expect(palette).toBeVisible();
  await palette.getByPlaceholder("例如：记录想法、学习、上下文…").fill("上下文");
  await palette.getByRole("option", { name: /检查 AI 能看到什么/ }).click();

  await expect(page).toHaveURL(/\/context-inspector$/);
  await expect(page.getByRole("heading", { name: "准确看到 Genesis 能使用什么" })).toBeVisible();
  await expect(page.getByText("待确认与已拒绝候选", { exact: true })).toBeVisible();
  await expect(page.getByText("这是只读检查视图。", { exact: false })).toBeVisible();
});

test("opens governed Orb from the command palette", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "搜索 Genesis 能力或动作" });
  await palette.getByPlaceholder("例如：记录想法、学习、上下文…").fill("Orb");
  await palette.getByRole("option", { name: /打开 Genesis Orb/ }).click();
  await expect(page.getByRole("dialog", { name: "Genesis Agent 控制台" })).toBeVisible();
});

for (const width of [390, 430]) {
  test(`keeps command and Context transparency usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "我的" }).click();
    const navigation = page.getByRole("dialog", { name: "我的 Genesis" });
    await navigation.getByRole("button", { name: /快速指令/ }).click();
    const palette = page.getByRole("dialog", { name: "搜索 Genesis 能力或动作" });
    await expect(palette).toBeVisible();
    await palette.getByPlaceholder("例如：记录想法、学习、上下文…").fill("上下文");
    await palette.getByRole("option", { name: /检查 AI 能看到什么/ }).click();
    await expect(page).toHaveURL(/\/context-inspector$/);

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.getByRole("navigation", { name: "Context 用途" })).toBeVisible();
  });
}
