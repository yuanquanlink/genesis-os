import { expect, test } from "@playwright/test";

test("Growth Graph: evidence analysis, user approval, Mentor context and refresh persistence", async ({
  page,
  request,
}) => {
  const profileBefore = (await (await request.get("/api/profile")).json()) as {
    facts: unknown[];
  };
  const source = await request.post("/api/self-entries", {
    data: {
      content:
        "我是湖南工商大学计算机卓工大一学生，目标成为FDE。我做过Genesis OS、Kinetix和湖工商雷达，优势是产品意识和AI工具使用，短板是基础体系、软件工程规范和持续深挖能力。",
      category: "reflection",
      tags: ["growth-graph", "FDE"],
      importance: 5,
      occurredAt: new Date().toISOString(),
      allowAi: false,
      clientRequestId: crypto.randomUUID(),
      dataKind: "user",
    },
  });
  expect(source.ok()).toBeTruthy();

  await page.goto("/growth-graph");
  await expect(
    page.getByRole("heading", { name: "Genesis Growth Graph" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "根据证据重新分析" }).click();
  await expect(page.locator(".candidate-grid>article")).toHaveCount(4);
  await expect(page.locator(".candidate-grid")).toContainText("Demo AI");
  await expect(page.locator(".recommendation-section")).toContainText("未来 90 天");
  await expect(page.locator(".recommendation-section")).toContainText("FastAPI");

  const abilityCandidate = page
    .locator(".candidate-grid>article")
    .filter({ hasText: "产品意识" });
  await expect(abilityCandidate).toHaveCount(1);
  await abilityCandidate.getByLabel("能力等级").selectOption("2");
  await abilityCandidate.getByRole("button", { name: "修改并批准" }).click();
  await expect(page.locator(".growth-radar")).toContainText("产品意识");
  await expect(page.locator(".growth-radar")).toContainText("2/5");

  const profileAfter = (await (await request.get("/api/profile")).json()) as {
    facts: unknown[];
  };
  expect(profileAfter.facts).toHaveLength(profileBefore.facts.length);
  await page.reload();
  await expect(page.locator(".growth-radar")).toContainText("产品意识");
  await expect(page.locator(".growth-radar")).toContainText("1 条证据");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
  await expect(page.locator(".growth-shell .sidebar")).toBeVisible();
});
