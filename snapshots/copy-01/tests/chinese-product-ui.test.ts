import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Genesis Chinese product UI contract", () => {
  it("keeps zh-CN and the permanent design contract wired into the project", () => {
    expect(read("app/layout.tsx")).toContain('<html lang="zh-CN"');
    const design = read("DESIGN.md");
    expect(design).toContain("Calm Intelligence");
    expect(design).toContain("390px");
    expect(design).toContain("## 5. Dark mode");
    expect(read("AGENTS.md")).toContain("DESIGN.md");
  });

  it("provides five Chinese mobile destinations while retaining secondary capabilities", () => {
    const source = read("components/genesis-mobile-navigation.tsx");
    for (const label of ["今日", "学习", "导师", "成长", "我的"]) expect(source).toContain(label);
    for (const path of [
      "/missions",
      "/strategy",
      "/review-center",
      "/project-challenge",
      "/knowledge",
      "/memory",
      "/usage",
    ]) expect(source).toContain(path);
  });

  it("keeps major product chrome Chinese and removes known English fallback copy", () => {
    const surfaces = [
      "components/personal-operating-loop.tsx",
      "components/daily-learning-loop.tsx",
      "components/learning-agent.tsx",
      "components/growth-graph.tsx",
      "components/evidence-engine.tsx",
      "components/proactive-companion.tsx",
      "components/personal-memory.tsx",
      "components/cognition-growth.tsx",
      "components/usage-dashboard.tsx",
    ].map(read).join("\n");
    for (const required of ["晨间简报", "今日计划", "晚间复盘", "成长图谱", "证据候选", "主动导师", "长期记忆"]) {
      expect(surfaces).toContain(required);
    }
    for (const forbidden of [
      "Generate weekly insight",
      "No weekly insight has been generated yet",
      "Evidence-based capability model",
      "Personal growth knowledge graph",
      "Learning Result → Evidence",
      "Evening Reflection</span>",
      "Tomorrow Plan ·",
      "Daily World Model",
      "Reading Intelligence",
      "Business Heir Training",
      "Movie Reflection",
    ]) expect(surfaces).not.toContain(forbidden);
  });

  it("keeps deterministic user-facing AI fallbacks in Simplified Chinese", () => {
    const services = [
      "lib/services/agent-action-service.ts",
      "lib/services/proactive-companion-service.ts",
      "lib/services/monthly-review-service.ts",
      "lib/services/personal-memory-service.ts",
      "lib/services/strategy-service.ts",
    ].map(read).join("\n");
    for (const forbidden of [
      "Choose one bounded deliverable",
      "This is a Mission Candidate",
      "Approved Evidence is required",
      "At least one verified Evidence record",
      "User-confirmed long-term memory candidate",
      "Project and learning records exist",
    ]) expect(services).not.toContain(forbidden);
    for (const required of ["使命待确认建议", "已验证证据", "月度复盘", "长期记忆", "工程交付"]) {
      expect(services).toContain(required);
    }
  });

  it("adds a Simplified Chinese output contract at the single AI Router boundary", () => {
    const router = read("lib/ai/router.ts");
    expect(router).toContain("ZH_CN_OUTPUT_CONTRACT");
    expect(router).toContain("所有面向用户的自然语言内容必须使用简体中文");
    expect(router).toContain("withChineseOutputContract(request)");
  });
});
