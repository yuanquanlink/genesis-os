export {};

const baseUrl = process.env.GENESIS_VERIFY_URL || "http://127.0.0.1:3000";

async function jsonRequest(
  path: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      `${path} HTTP ${response.status}: ${JSON.stringify(result)}`,
    );
  return result;
}

async function ask(
  module: "ai_mentor" | "daily_summary",
  prompt: string,
  contextMode: "full" | "none" = "full",
) {
  const response = await fetch(`${baseUrl}/api/ai/mentor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({ module, prompt, context: "AI能力验收", contextMode }),
  });
  const raw = await response.text();
  if (!response.ok)
    throw new Error(`AI HTTP ${response.status}: ${raw.slice(0, 500)}`);
  const events = raw
    .split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) =>
      block.split(/\r?\n/).find((line) => line.startsWith("data: ")),
    )
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line!.slice(6)) as {
          type: string;
          text?: string;
          error?: string;
        },
    );
  const error = events.find((item) => item.type === "error");
  if (error) throw new Error(error.error || "AI stream failed");
  return {
    provider: response.headers.get("X-AI-Provider"),
    model: response.headers.get("X-AI-Model"),
    evidenceCount: Number(response.headers.get("X-AI-Evidence-Count") || 0),
    text: events
      .filter((item) => item.type === "delta")
      .map((item) => item.text)
      .join(""),
  };
}

async function verifyLearningEngine() {
  const title = "Python高级工程能力提升";
  const goal = await jsonRequest("/api/learning/goals", "POST", {
    clientRequestId: crypto.randomUUID(),
    title,
    purpose:
      "补齐 Python 工程基础，形成能够独立设计、测试、调试和交付服务端系统的能力",
    currentBasis:
      "能借助 AI 编写基础 Python，但缺少运行时、并发、类型、测试、性能和工程化的系统诊断",
    finalGoal:
      "能够独立解释 Python 核心机制，并完成可测试、可观测、可部署的工程项目",
    targetLevel: "proficient",
    masteryLevel: 5,
    dailyMinutes: 90,
    weeklyDays: 5,
    deadline: null,
    engineeringOutcome:
      "交付一个包含异步并发、类型校验、数据库事务、测试、性能分析、文档和部署的 Python 服务",
    fdeLinked: true,
    dataKind: "test",
  });
  const goalId = String(goal.id);
  const form = new FormData();
  form.set("goalId", goalId);
  form.set("clientRequestId", crypto.randomUUID());
  form.set("title", "Python高级工程诊断资料");
  form.set(
    "file",
    new File(
      [
        "# Python运行时与对象模型\n理解引用、可变性、迭代器、生成器、装饰器和上下文管理器。\n\n# 类型与接口设计\n使用类型提示、泛型、协议和数据验证定义稳定边界。\n\n# 并发与异步\n区分线程、进程、事件循环、阻塞与背压，并用基准测试验证。\n\n# 工程质量\n使用pytest、属性测试、日志、性能剖析、数据库事务和CI证明可靠性。",
      ],
      "python-advanced.md",
      { type: "text/markdown" },
    ),
  );
  const upload = await fetch(`${baseUrl}/api/learning/resources/upload`, {
    method: "POST",
    headers: { Origin: baseUrl },
    body: form,
  });
  if (!upload.ok)
    throw new Error(
      `upload HTTP ${upload.status}: ${(await upload.text()).slice(0, 500)}`,
    );
  await jsonRequest(`/api/learning/goals/${goalId}/baseline`, "POST", {});
  const snapshot = (await (await fetch(`${baseUrl}/api/learning`)).json()) as {
    goals: Array<Record<string, unknown>>;
    diagnostics: Array<Record<string, unknown>>;
    nodes: Array<Record<string, unknown>>;
    resources: Array<Record<string, unknown>>;
  };
  const storedGoal = snapshot.goals.find((item) => item.id === goalId);
  const diagnostic = snapshot.diagnostics.find(
    (item) => item.goalId === goalId,
  );
  return {
    goal: storedGoal,
    resourceStatuses: snapshot.resources
      .filter((item) => item.goalId === goalId)
      .map((item) => ({ title: item.title, status: item.status })),
    diagnostic: diagnostic
      ? {
          mode: diagnostic.modelMode,
          provider: diagnostic.provider,
          status: diagnostic.status,
          questions: diagnostic.questions,
        }
      : null,
    path: snapshot.nodes
      .filter((item) => item.goalId === goalId)
      .map((item) => ({
        position: item.position,
        title: item.title,
        status: item.status,
        difficulty: item.difficulty,
      })),
  };
}

async function main() {
  const target = process.argv[2] || "all";
  if (target === "all" || target === "mentor") {
    const mentor = await ask(
    "ai_mentor",
    "请读取我的Genesis OS画像。\n\n结合我的目标成为FDE，分析我目前最大的问题是什么。\n\n不要安慰我，请像一个严格的长期导师一样指出问题。\n要求：\n1. 根据已有事实分析\n2. 区分事实和推测\n3. 给出未来90天最重要的三个行动\n4. 告诉我如果我是20岁的马斯克，我现在应该关注什么",
  );
    console.log("=== AI MENTOR ===\n", JSON.stringify(mentor, null, 2));
  }
  if (target === "all" || target === "daily") {
    const summary = await ask("daily_summary", "今日成长总结");
    console.log("=== DAILY SUMMARY ===\n", JSON.stringify(summary, null, 2));
  }
  if (target === "all" || target === "learning") {
    const learning = await verifyLearningEngine();
    console.log("=== LEARNING ENGINE ===\n", JSON.stringify(learning, null, 2));
  }
  if (target === "context") {
    const question = "分析我的问题";
    const withoutContext = await ask("ai_mentor", question, "none");
    const withContext = await ask("ai_mentor", question, "full");
    const signalChecks = {
      school: /湖南工商大学|湖工商/.test(withContext.text),
      major: /计算机/.test(withContext.text),
      fde: /FDE/i.test(withContext.text),
      project: /Genesis|Kinetix|雷达|工作台/i.test(withContext.text),
      weakness: /编程|数学|执行|闭环/.test(withContext.text),
    };
    console.log("=== CONTEXT COMPARISON ===\n", JSON.stringify({ withoutContext, withContext, signalChecks }, null, 2));
    if (Object.values(signalChecks).some((passed) => !passed))
      throw new Error(`Context acceptance failed: ${JSON.stringify(signalChecks)}`);
  }
}

void main();
