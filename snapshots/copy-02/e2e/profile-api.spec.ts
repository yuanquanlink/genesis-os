import { expect, test } from "@playwright/test";

test("all shipped pages render real content and security headers", async ({ request }) => {
  const pages = [["/", "把学习变成可验证的工程能力"], ["/learning", "AI 深度学习引擎"], ["/self-input", "今天发生了什么？"], ["/digital-life", "画像候选更新"], ["/growth-graph", "Genesis Growth Graph"], ["/timeline", "主事件承载变化"], ["/settings", "清除测试与 Demo 数据"]] as const;
  for (const [url, text] of pages) {
    const response = await request.get(url);
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain(text);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  }
});

test("real browser: input, disabled double submit, approval, evidence update, timeline, and refresh persistence", async ({ page }) => {
  const firstText = "今天完成并部署了真实接口，也补上测试，项目闭环得到验证。";
  const secondText = "这周再次完成生产部署和浏览器测试，为交付闭环增加新证据。";

  await page.goto("/self-input");
  const editor = page.getByPlaceholder("写下真实发生的经历、学习、决定或状态变化……");
  await editor.fill(firstText);
  const submit = page.locator(".entry-form .primary-button");
  let releaseRequest!: () => void;
  const requestGate = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/self-entries", async (route) => { await requestGate; await route.continue(); });
  const firstResponse = page.waitForResponse((response) => response.url().endsWith("/api/self-entries"));
  await submit.click();
  await expect(submit).toBeDisabled();
  releaseRequest();
  await firstResponse;
  await page.unroute("**/api/self-entries");
  await expect(page.getByRole("status")).toContainText(/原文已保存|已复用原记录/);
  await expect(page.locator(".record").filter({ hasText: firstText })).toHaveCount(1);

  await page.goto("/digital-life");
  expect(await page.locator(".proposal-card").count()).toBeGreaterThanOrEqual(1);
  await page.locator(".proposal-card").first().getByRole("button", { name: "批准" }).click();
  await expect(page.locator(".fact-card")).toHaveCount(1);
  await expect(page.locator(".fact-card").first()).toContainText("1 条证据");

  await page.goto("/self-input");
  await editor.fill(secondText);
  await submit.click();
  await expect(page.getByRole("status")).toContainText("已有画像");
  await page.goto("/digital-life");
  await expect(page.locator(".fact-card")).toHaveCount(1);
  await expect(page.locator(".fact-card").first()).toContainText("2 条证据");
  await page.locator(".fact-card details").first().getByText(/查看所有支持证据/).click();
  await expect(page.locator(".fact-card blockquote")).toHaveCount(2);

  await page.goto("/timeline");
  await expect(page.locator(".timeline-content").filter({ hasText: firstText })).toHaveCount(1);
  await expect(page.locator(".timeline-content").filter({ hasText: secondText })).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".timeline-content").filter({ hasText: firstText })).toHaveCount(1);
});

test("API idempotency and explicit test-data cleanup are enforced server-side", async ({ request }) => {
  const requestId = crypto.randomUUID();
  const payload = { content: "这是一条明确标记的测试输入，用于验证请求重试不会重复写入。", category: "project", tags: ["e2e"], importance: 3, occurredAt: new Date().toISOString(), allowAi: true, clientRequestId: requestId, dataKind: "test" };
  const first = await request.post("/api/self-entries", { data: payload });
  expect(first.status()).toBe(201);
  const created = await first.json();
  const retry = await request.post("/api/self-entries", { data: payload });
  expect(retry.status()).toBe(200);
  expect(await retry.json()).toMatchObject({ id: created.id, duplicate: true, duplicateReason: "idempotency_key" });
  const preview = await request.post("/api/data-cleanup", { data: { action: "preview" } });
  expect(preview.ok()).toBeTruthy();
  expect((await preview.json()).entries).toBeGreaterThanOrEqual(1);
  const invalid = await request.post("/api/data-cleanup", { data: { action: "execute", confirmation: "WRONG", keepConfirmedFacts: true } });
  expect(invalid.status()).toBe(400);
  const cleared = await request.post("/api/data-cleanup", { data: { action: "execute", confirmation: "CLEAR_TEST_DATA", keepConfirmedFacts: true } });
  expect(cleared.ok()).toBeTruthy();
  const snapshot = await (await request.get("/api/profile")).json();
  expect(snapshot.entries.some((entry: { id: string }) => entry.id === created.id)).toBeFalsy();
});

test("write APIs reject malformed and cross-site requests", async ({ request }) => {
  const malformed = await request.post("/api/self-entries", { headers: { "Content-Type": "application/json" }, data: "{" });
  expect(malformed.status()).toBe(400);
  const crossSite = await request.post("/api/self-entries", { headers: { "Content-Type": "application/json", "Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site" }, data: {} });
  expect(crossSite.status()).toBe(403);
});
