"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Brain,
  Command,
  Compass,
  Eye,
  FileCheck2,
  Home,
  Inbox,
  Network,
  PenLine,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";

const commands = [
  { id: "today", label: "打开今日运行", description: "查看当前状态、优先级与下一步", group: "每日运行", href: "/", icon: Home, keywords: "today 每日 计划" },
  { id: "planning", label: "记录未来想法", description: "保存为 Planning Candidate，不进入正式计划", group: "快速记录", href: "/planning-buffer", icon: Inbox, keywords: "未来 规划 想法 inbox" },
  { id: "self-input", label: "记录今天发生的事", description: "保留原始记录，AI 推测仍需确认", group: "快速记录", href: "/self-input", icon: PenLine, keywords: "输入 记录 经历 反思" },
  { id: "orb", label: "打开 Genesis Orb", description: "询问已批准上下文或生成受控行动候选", group: "AI 助手", action: "orb", icon: Sparkles, keywords: "agent ai 助手 对话" },
  { id: "context", label: "检查 AI 能看到什么", description: "查看 ContextEngine 的实际可见范围", group: "安全与透明度", href: "/context-inspector", icon: Eye, keywords: "context 上下文 隐私 可见 审计" },
  { id: "learning", label: "进入学习总览", description: "材料、路线、练习与掌握验证", group: "学习成长", href: "/learning", icon: BookOpen, keywords: "学习 mastery 掌握" },
  { id: "knowledge", label: "打开个人知识库", description: "查看来源、信任与知识关系", group: "个人智能", href: "/knowledge", icon: BookOpen, keywords: "知识 资料 source" },
  { id: "memory", label: "查看长期记忆", description: "管理经确认的长期记忆与候选", group: "个人智能", href: "/memory", icon: Brain, keywords: "记忆 memory" },
  { id: "advisor", label: "打开个人顾问", description: "比较方向、取舍与最小行动", group: "个人智能", href: "/advisor", icon: Compass, keywords: "顾问 建议 方向" },
  { id: "growth", label: "查看成长图谱", description: "基于证据查看能力变化", group: "学习成长", href: "/growth-graph", icon: Network, keywords: "成长 能力 graph" },
  { id: "evidence", label: "查看能力证据", description: "检查来源、验证状态与审批边界", group: "学习成长", href: "/evidence", icon: FileCheck2, keywords: "证据 evidence 能力" },
  { id: "settings", label: "打开设置与数据", description: "Provider、备份恢复与本地运行设置", group: "系统", href: "/settings", icon: Settings, keywords: "设置 provider 备份" },
] as const;

export function GenesisCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return commands;
    return commands.filter((item) => `${item.label} ${item.description} ${item.group} ${item.keywords}`.toLocaleLowerCase("zh-CN").includes(normalized));
  }, [query]);

  useEffect(() => {
    const openPalette = () => { setActiveIndex(0); setOpen(true); };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (!value) setActiveIndex(0);
          return !value;
        });
      }
    };
    window.addEventListener("genesis:open-command-palette", openPalette);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("genesis:open-command-palette", openPalette);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function execute(item: (typeof commands)[number]) {
    setOpen(false);
    setQuery("");
    if ("href" in item) router.push(item.href);
    else window.dispatchEvent(new CustomEvent("genesis:open-orb"));
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="genesis-command-trigger" aria-label="打开 Genesis 快速指令" onClick={() => { setActiveIndex(0); setOpen(true); }}>
        <Search aria-hidden="true" size={16} /><span>快速指令</span><kbd>Ctrl K</kbd>
      </button>
      {open ? (
        <div className="command-palette-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-palette-title">
            <header>
              <Search aria-hidden="true" size={20} />
              <label>
                <span id="command-palette-title">搜索 Genesis 能力或动作</span>
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") { event.preventDefault(); close(); }
                    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, results.length - 1)); }
                    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
                    if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); execute(results[activeIndex]); }
                  }}
                  placeholder="例如：记录想法、学习、上下文…"
                  aria-controls="genesis-command-results"
                />
              </label>
              <button type="button" className="icon-button" aria-label="关闭快速指令" onClick={close}><X aria-hidden="true" size={18} /></button>
            </header>
            <div id="genesis-command-results" className="command-results" role="listbox" aria-label="快速指令结果">
              {results.length ? results.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => execute(item)}
                  >
                    <span className="command-icon"><Icon aria-hidden="true" size={18} /></span>
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <em>{item.group}</em>
                  </button>
                );
              }) : (
                <div className="command-empty"><Command aria-hidden="true" size={22} /><strong>没有匹配的能力</strong><p>换一个中文关键词，或清空搜索查看全部入口。</p></div>
              )}
            </div>
            <footer><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>Esc</kbd> 关闭</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
