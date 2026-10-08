import { expect, test } from "@playwright/test";

test.describe.serial("AI 深度学习引擎", () => {
  test("从零学习 FastAPI 的完整纵向闭环", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/learning");

    await page.getByLabel("学习主题").fill("从零学习 FastAPI 浏览器验收");
    await page.getByLabel("学习原因").fill("为了独立交付可靠的 AI 应用后端，并验证学习证据、失败边界与工程结果");
    await page.getByLabel("当前基础").fill("会基础 Python 语法，但没有独立部署过带数据库和测试的 API 服务");
    await page.getByLabel("最终目标").fill("能够独立解释、实现、测试、部署并向他人讲解 FastAPI 后端");
    await page.getByLabel("每天投入分钟").fill("45");
    await page.getByLabel("每周投入天数").fill("5");
    await page.getByLabel("最终工程成果").fill("部署一个包含参数验证、数据库、错误处理、测试和文档的 FastAPI 服务");
    await page.getByRole("button", { name: "创建并进入资料阶段" }).click();
    await expect(page.getByRole("heading", { name: "从零学习 FastAPI 浏览器验收" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "fastapi-browser-guide.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# 请求验证\n所有外部输入都必须经过 Schema 验证。\n\n# 数据库事务\n原始记录先提交，AI 分析失败不能丢失原文。\n\n# 失败路径\n超时、权限、重复请求和无效参数必须返回可恢复错误。\n\n# 测试与部署\n使用自动化测试、日志和真实部署结果作为掌握证据。"),
    });
    await page.getByRole("button", { name: "保存原文件并解析" }).click();
    await expect(page.getByText(/已真实解析/)).toBeVisible();
    await page.getByText("查看解析结构与引用位置").click();
    await expect(page.locator(".resource-analysis blockquote").first()).toContainText("heading:");

    await page.getByRole("button", { name: "生成基线诊断" }).click();
    await expect(page.getByRole("heading", { name: "请独立回答，不查资料" })).toBeVisible();
    const answers = page.locator(".question-list textarea");
    await expect(answers).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      await answers.nth(index).fill("因为输入边界影响内部状态，所以需要解释因果链、构造反例，并用失败测试、断言、日志、部署输出和迁移场景验证。这个结论仍受资料范围限制。");
    }
    await page.getByRole("button", { name: "提交并生成估时与知识地图" }).click();
    await expect(page.getByText("学习时间范围与不确定性")).toBeVisible();
    await expect(page.getByText("掌握度来自证据，不来自点击")).toBeVisible();
    await expect(page.locator(".estimate-breakdown")).toContainText("工程");
    await expect(page.locator(".knowledge-path article").first()).toContainText("证据");

    await page.getByRole("button", { name: "开始今日会话" }).click();
    for (let index = 0; index < 21; index += 1) {
      await expect(page.locator(".session-response")).toBeVisible();
      if (index === 15) await page.getByLabel("代码来源").selectOption("ai_generated");
      await page.locator(".session-response").fill("因为前提决定机制与结果，所以我会给出反例、失败条件、测试断言、运行日志和部署输出。```python\nfrom fastapi import FastAPI\napp = FastAPI()\n```我会独立修改并解释验证步骤，而不把 AI 生成代码直接计为掌握。");
      await page.getByRole("button", { name: "提交回答并识别漏洞" }).click();
    }
    await expect(page.getByText("已完成 1 次完整会话")).toBeVisible();
    await expect(page.locator(".knowledge-path article").first()).toContainText(/掌握 \d+%/);

    await page.goto("/today-learning");
    await expect(page.getByTestId("phase2-dashboard")).toContainText("今天的学习决策");
    const formal = page.getByTestId("formal-assessment");
    await formal.getByRole("button", { name: "生成 8 种题型" }).click();
    const formalQuestions = formal.locator("fieldset");
    await expect(formalQuestions).toHaveCount(8);
    for (let index = 0; index < 8; index += 1) {
      const question = formalQuestions.nth(index);
      const answer = "因为输入边界影响事务状态，所以要使用 Schema 校验、结构化异常、失败测试和幂等键；迁移到并发场景时还要验证回滚和冲突。";
      const directSelect = question.locator(":scope > select");
      if (await directSelect.count()) await directSelect.selectOption({ index: 1 });
      else await question.locator("textarea").fill(answer);
    }
    await formal.getByRole("button", { name: "提交原始作答并生成证据候选" }).click();
    await expect(formal).toContainText("最近评估已评分");
    await expect(formal).toContainText(/pending|等待 Evidence|待分析|待审批/);

    const codeAssessment = page.getByTestId("code-assessment");
    await codeAssessment.getByLabel("用户代码").fill("from fastapi import FastAPI, HTTPException\napp = FastAPI()\n\n@app.get('/items/{item_id}')\ndef read_item(item_id: int):\n    if item_id < 1:\n        raise HTTPException(400, 'invalid')\n    return {'id': item_id}\n\ndef test_invalid():\n    assert True");
    await codeAssessment.getByLabel("为什么这样写？").fill("路由先验证输入，因为无效 ID 不应进入业务逻辑，并用异常表达失败路径。");
    await codeAssessment.getByLabel("条件变化时怎么办？").fill("并发写入时增加事务、幂等键、冲突处理和并发测试。");
    await codeAssessment.getByLabel("哪里可能失败？").fill("外部依赖超时和数据库冲突可能失败，需要回滚、日志和失败测试。");
    await codeAssessment.getByRole("button", { name: "提交静态评估" }).click();
    await expect(codeAssessment).toContainText("最近静态评估");
    await expect(codeAssessment).toContainText("为什么选择这种结构");

    await page.getByLabel("演示、测试和验收证据").fill("浏览器流程、参数校验、数据库事务、错误路径、自动化测试和生产构建均已完成真实验收。");
    await page.getByLabel("复盘：做对、做错、下次改变").fill("这次先定义验收再实现；AI 生成代码没有直接算成独立掌握。下次会更早验证受限来源并保留失败日志。");
    await page.getByLabel("当前状态").selectOption("reviewed");
    await page.getByRole("button", { name: "保存成果、写入时间线并生成画像候选" }).click();
    await expect(page.locator(".outcome-proof")).toContainText("部署一个包含参数验证");

    await page.reload();
    await expect(page.getByRole("heading", { name: "从零学习 FastAPI 浏览器验收" })).toBeVisible();
    await expect(page.getByText("已完成 1 次完整会话")).toBeVisible();
    await page.goto("/timeline");
    await expect(page.getByText("完成深度学习会话").first()).toBeVisible();
    await page.goto("/digital-life");
    await expect(page.getByText("画像候选更新")).toBeVisible();
    await expect(page.getByRole("button", { name: "批准" }).first()).toBeVisible();
    await page.goto("/growth-graph");
    await expect(page.getByRole("button", { name: "修改并批准" }).first()).toBeVisible();
    await page.getByRole("button", { name: "修改并批准" }).first().click();
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "能力变化", exact: true })).toBeVisible();
    await expect(page.locator(".change-list article").first()).toBeVisible();
  });

  test("无字幕视频、受限链接和独立学习页面给出真实状态", async ({ page }) => {
    await page.goto("/learning-resources");
    await expect(page.getByRole("heading", { name: "学习资料" })).toBeVisible();
    const sourceType = page.locator(".resource-inputs form").first().locator("select");
    await sourceType.selectOption("video");
    await page.locator(".resource-inputs form").first().locator('input[type="url"]').fill("https://www.youtube.com/watch?v=no-captions-test");
    await page.getByRole("button", { name: "保存并真实解析" }).click();
    await expect(page.getByText(/无法合法取得字幕/)).toBeVisible();
    await expect(page.getByText(/captions_unavailable/)).toBeVisible();

    await sourceType.selectOption("documentation");
    await page.locator(".resource-inputs form").first().locator('input[type="url"]').fill("http://127.0.0.1:9/private-document");
    await page.getByRole("button", { name: "保存并真实解析" }).click();
    await expect(page.getByText(/安全原因拒绝访问|无法访问|解析失败/).first()).toBeVisible();

    for (const [path, heading] of [["/learning-goals", "学习目标"], ["/today-learning", "今日学习"], ["/knowledge-map", "知识地图"], ["/review-center", "复习中心"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await page.goto("/today-learning");
    await page.getByRole("button", { name: "运行深度导师分析" }).click();
    await expect(page.getByTestId("mentor-deep-analysis")).toBeVisible();
    await expect(page.getByTestId("mentor-deep-analysis").locator(".mentor-action-loop li")).toHaveCount(3);
    await expect(page.getByText(/demo · local-genesis-mentor-deep-v1/i)).toBeVisible();
  });

  test("移动端布局仍可导航且没有横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/today-learning");
    await expect(page.getByRole("heading", { name: "今日学习" })).toBeVisible();
    await expect(page.getByTestId("learning-phase2")).toBeVisible();
    await expect(page.getByTestId("phase2-dashboard")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.locator(".learning-shell .sidebar nav").getByRole("link", { name: "复习中心" }).click();
    await expect(page.getByRole("heading", { name: "复习中心" })).toBeVisible();
  });
});
