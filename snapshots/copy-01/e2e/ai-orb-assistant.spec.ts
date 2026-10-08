import { expect, test } from "@playwright/test";

test("renders the global Genesis AI Orb and opens the Chinese assistant panel", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "打开 Genesis AI Orb" });
  await expect(trigger).toBeVisible();
  await expect(page.getByTestId("genesis-orb-webgpu")).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Genesis Agent 控制台" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Orb 状态")).toBeVisible();
  await expect(dialog.getByText("仅读已批准上下文")).toBeVisible();
  await expect(dialog.getByLabel("Orb 对话区域")).toBeVisible();
  await expect(dialog.getByLabel("你的问题")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "发送" })).toBeVisible();
});

for (const width of [390, 430]) {
  test(`keeps AI Orb usable above mobile navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const navigation = page.getByRole("navigation", { name: "移动端主要导航" });
    const trigger = page.getByRole("button", { name: "打开 Genesis AI Orb" });
    await expect(navigation).toBeVisible();
    await expect(trigger).toBeVisible();
    await expect(page.getByTestId("genesis-orb-webgpu")).toBeVisible();

    const navBox = await navigation.boundingBox();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox && navBox ? triggerBox.y + triggerBox.height <= navBox.y + 1 : false).toBe(true);

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Genesis Agent 控制台" });
    await expect(dialog).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(dimensions.document, `Orb 在 ${width}px 出现横向溢出`).toBeLessThanOrEqual(dimensions.viewport + 1);
    await expect(page.getByRole("button", { name: "发送" })).toBeVisible();
  });
}

test("opens the Genesis AI Orb through a real mobile touch event at 390px", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3210",
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "打开 Genesis AI Orb" });
    await expect(trigger).toBeVisible();
    await trigger.tap();
    await expect(page.getByRole("dialog", { name: "Genesis Agent 控制台" })).toBeVisible();
    await expect(page.getByRole("button", { name: "关闭 Orb 助手" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("creates an Agent Action Candidate preview without executing formal changes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "打开 Genesis AI Orb" }).click();
  const dialog = page.getByRole("dialog", { name: "Genesis Agent 控制台" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("你的问题").fill("帮我安排今晚学习计算机网络");
  await dialog.getByRole("button", { name: "发送" }).click();

  await expect(dialog.getByLabel("Agent 行动预览")).toBeVisible();
  await expect(dialog.getByText("Action Candidate", { exact: true })).toBeVisible();
  await expect(dialog.getByText("待 Owner Confirmation → Projection → Execution")).toBeVisible();
  await expect(dialog.locator(".orb-action-candidate").getByText("不创建正式 Daily Plan，不修改 Mission", { exact: false })).toBeVisible();
});
