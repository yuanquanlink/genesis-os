"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Send, Sparkles, X } from "lucide-react";
import type { OrbAssistantResponse } from "@/lib/domain/ai-orb";
import type { OrbAgentResult } from "@/lib/domain/orb-agent";
import { createOrbRenderer } from "@/lib/orb/orb-renderer";
import { orbParamsForState, type OrbParams } from "@/lib/orb/presets";

type Turn = {
  role: "user" | "assistant";
  content: string;
};

type OrbState = "idle" | "active" | "loading" | "error";
type OrbRenderState = "booting" | "ready" | "fallback";

function currentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.hash || ""}`;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `orb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AIOrbAssistant() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<OrbState>("idle");
  const [renderState, setRenderState] = useState<OrbRenderState>("booting");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState("受控 Agent 模式 · 等待命令");
  const [meta, setMeta] = useState<OrbAssistantResponse["meta"] | null>(null);
  const [agent, setAgent] = useState<OrbAgentResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const titleId = "genesis-ai-orb-title";

  const currentParams = useMemo(() => orbParamsForState(state), [state]);
  const paramsRef = useRef<OrbParams>(currentParams);

  useEffect(() => {
    paramsRef.current = currentParams;
  }, [currentParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return createOrbRenderer({
      canvas,
      getParams: () => paramsRef.current,
      onReady: () => setRenderState("ready"),
      onError: (error) => {
        setRenderState("fallback");
        setStatus(`Orb 渲染降级：${error.message}`);
      },
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  useEffect(() => {
    const openFromGenesis = () => {
      setState((current) => current === "idle" ? "active" : current);
      setOpen(true);
    };
    window.addEventListener("genesis:open-orb", openFromGenesis);
    return () => window.removeEventListener("genesis:open-orb", openFromGenesis);
  }, []);

  useEffect(() => {
    if (!open) return;
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [agent, open, state, turns]);

  async function send() {
    const message = input.trim();
    if (!message || state === "loading") return;
    const nextTurns = [...turns, { role: "user" as const, content: message }];
    setTurns(nextTurns);
    setInput("");
    setState("loading");
    setStatus("正在通过 AI Router 读取已批准上下文…");
    try {
      const response = await fetch("/api/orb-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          currentPath: currentPath(),
          clientRequestId: requestId(),
          conversation: nextTurns.slice(-8),
        }),
      });
      const data = (await response.json()) as OrbAssistantResponse | { error?: string };
      if (!response.ok || !("answer" in data)) throw new Error("error" in data && data.error ? data.error : "Orb 请求失败");
      setMeta(data.meta);
      setAgent(data.answer.agent ?? null);
      setStatus(
        `${data.meta.provider} · ${data.meta.model} · ${data.meta.approvedProjectionCount} 条已批准 Context · ${data.answer.agent ? "Agent 已规划" : "只读回答"}`,
      );
      setTurns((current) => [...current, { role: "assistant", content: data.answer.answer }]);
      setState("active");
    } catch (error) {
      setState("error");
      const messageText = error instanceof Error ? error.message : "Orb 暂时无法响应";
      setStatus(messageText);
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content: `Orb 遇到错误：${messageText}。没有创建或修改任何正式数据；请稍后重试，或进入使用概览检查 Provider 状态。`,
        },
      ]);
    }
  }

  return (
    <aside
      className={`genesis-ai-orb is-${state} render-${renderState} ${open ? "is-open" : "is-closed"}`}
      aria-label="Genesis AI Orb"
      data-render-state={renderState}
    >
      {open ? (
        <section className="orb-panel" role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <header className="orb-panel-header">
            <div className="orb-header-main">
              <div className="orb-panel-identity">
                <span className="orb-avatar" aria-hidden="true">◌</span>
                <div>
                  <span className="section-kicker">Genesis Orb</span>
                  <h2 id={titleId}>Genesis Agent 控制台</h2>
                </div>
              </div>
              <button type="button" className="icon-button" aria-label="关闭 Orb 助手" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="orb-status-badges" aria-label="Orb 状态">
              <span>{meta ? `${meta.provider} · ${meta.model}` : "模型待连接"}</span>
              <span>{meta ? `${meta.approvedProjectionCount} 条已批准 Context` : "仅读已批准上下文"}</span>
              <span>{agent ? "Agent 已规划" : state === "loading" ? "正在思考" : "待命"}</span>
            </div>

            <div className="orb-context-indicator" role="status">
              {state === "error" ? <AlertCircle aria-hidden="true" size={16} /> : <Sparkles aria-hidden="true" size={16} />}
              <span>{status}</span>
            </div>
          </header>

          <div className="orb-conversation" aria-label="Orb 对话区域">
            {turns.length ? (
              <>
                {turns.map((turn, index) => (
                  <article key={`${turn.role}-${index}`} className={`orb-message ${turn.role}`}>
                    <span>{turn.role === "user" ? "你" : "Genesis Orb"}</span>
                    <p>{turn.content}</p>
                    {turn.role === "assistant" && meta ? (
                      <small>
                        来源：{meta.provider} · {meta.dailySourceRefs.length} 个今日引用
                        {meta.fallbackReason ? ` · 降级：${meta.fallbackReason}` : ""}
                      </small>
                    ) : null}
                  </article>
                ))}
                {agent ? (
                  <section className="orb-agent-console" aria-label="Agent 行动预览">
                    <div className="orb-agent-heading">
                      <span>Agent 行动预览</span>
                      <strong>{agent.intent.label}</strong>
                    </div>
                    <ol className="orb-agent-steps">
                      {agent.plan.map((step) => (
                        <li key={`${step.order}-${step.toolName}`}>
                          <b>{step.order}. {step.title}</b>
                          <small>{step.description}</small>
                          <em>{step.toolName} · {step.requiresOwnerConfirmation ? "需要确认" : "只读"}</em>
                        </li>
                      ))}
                    </ol>
                    {agent.actionCandidate ? (
                      <div className="orb-action-candidate">
                        <span>Action Candidate</span>
                        <p>{agent.actionCandidate.expectedChange}</p>
                        <small>
                          ID：{agent.actionCandidate.id} · 目标：{agent.actionCandidate.targetModule} · 风险：{agent.actionCandidate.riskLevel} · 权限：{agent.actionCandidate.requiredPermission}
                        </small>
                        <b>待 Owner Confirmation → Projection → Execution</b>
                      </div>
                    ) : (
                      <p className="orb-agent-boundary">本次为只读工具调用，没有创建或修改正式数据。</p>
                    )}
                    <details>
                      <summary>工具审计</summary>
                      {agent.tools.map((tool) => (
                        <p key={tool.id}>
                          <span>{tool.toolName}</span>
                          <small>{tool.permissionScope} · {tool.status}</small>
                        </p>
                      ))}
                    </details>
                  </section>
                ) : null}
                <div ref={conversationEndRef} aria-hidden="true" />
              </>
            ) : (
              <div className="orb-empty">
                <strong>把 Genesis 当作受控 Agent 使用</strong>
                <p>可以问当前状态，也可以输入“帮我安排今晚学习计算机网络”。涉及状态改变时只会生成待确认候选。</p>
              </div>
            )}
          </div>

          <form
            className="orb-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <label>
              <span>你的问题</span>
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                minLength={2}
                maxLength={2_000}
                placeholder="例如：帮我安排今晚学习计算机网络"
                onChange={(event) => setInput(event.target.value)}
                onInput={(event) => {
                  const target = event.currentTarget;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
            </label>
            <button type="submit" className="primary-button" disabled={!input.trim() || state === "loading"}>
              {state === "loading" ? <Loader2 aria-hidden="true" size={16} className="orb-spin" /> : <Send aria-hidden="true" size={16} />}
              {state === "loading" ? "发送中" : "发送"}
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="orb-runtime-trigger"
        aria-label={open ? "关闭 Genesis AI Orb" : "打开 Genesis AI Orb"}
        aria-expanded={open}
        data-state={state}
        data-render-state={renderState}
        onClick={() => {
          if (!open && state === "idle") setState("active");
          setOpen((value) => !value);
        }}
      >
        <canvas ref={canvasRef} className="orb-runtime-canvas" aria-hidden="true" data-testid="genesis-orb-webgpu" />
        <span className="orb-runtime-fallback" aria-hidden="true" />
        <span className="orb-runtime-glow" aria-hidden="true" />
        <span className="sr-only">{open ? "关闭 Genesis AI Orb" : "打开 Genesis AI Orb"}</span>
      </button>
    </aside>
  );
}
