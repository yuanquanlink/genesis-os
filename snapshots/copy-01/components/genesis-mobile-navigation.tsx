"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle2,
  Compass,
  FileCheck2,
  History,
  Home,
  Inbox,
  Menu,
  Network,
  PenLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  X,
} from "lucide-react";

const primary = [
  { href: "/", label: "今日", icon: Home, match: (path: string) => path === "/" },
  { href: "/learning", label: "学习", icon: BookOpen, match: (path: string) => path.startsWith("/learning") },
  { href: "/today-learning#mentor", label: "导师", icon: Brain, match: (path: string) => path === "/today-learning" },
  { href: "/growth-graph", label: "成长", icon: Network, match: (path: string) => path === "/growth-graph" || path === "/evidence" },
] as const;

const groups = [
  {
    label: "每日运行",
    links: [
      ["/", "今日", Home],
      ["/missions", "使命", CheckCircle2],
      ["/strategy", "战略", Compass],
      ["/planning-buffer", "未来规划", Inbox],
      ["/advisor", "个人顾问", Compass],
      ["/opportunities", "机会中心", Sparkles],
      ["/context-inspector", "AI 上下文检查", ShieldCheck],
      ["/monthly-review", "月度成长复盘", BarChart3],
    ],
  },
  {
    label: "学习成长",
    links: [
      ["/learning", "学习总览", BookOpen],
      ["/learning-goals", "学习目标", Compass],
      ["/learning-resources", "学习资料", BookOpen],
      ["/today-learning", "今日学习", Sparkles],
      ["/knowledge-map", "知识地图", Network],
      ["/review-center", "审查中心", ShieldCheck],
      ["/project-challenge", "工程挑战", SquareTerminal],
      ["/growth-graph", "成长图谱", Network],
      ["/evidence", "能力证据", FileCheck2],
    ],
  },
  {
    label: "个人智能",
    links: [
      ["/today-learning#mentor", "AI 导师", Brain],
      ["/knowledge", "知识库", BookOpen],
      ["/memory", "长期记忆", Brain],
      ["/digital-life", "数字分身", Sparkles],
      ["/self-input", "自我输入", PenLine],
      ["/timeline", "成长时间线", History],
    ],
  },
  {
    label: "认知与工具",
    links: [
      ["/cognition", "认知成长", Compass],
      ["/usage", "使用概览", BarChart3],
      ["/settings", "设置与数据", Settings],
    ],
  },
] as const;

export function GenesisMobileNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <nav className="mobile-primary-nav" aria-label="移动端主要导航">
        {primary.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link key={item.label} href={item.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
              <Icon aria-hidden="true" size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button type="button" aria-expanded={open} aria-controls="genesis-mobile-modules" onClick={() => setOpen(true)}>
          <Menu aria-hidden="true" size={19} />
          <span>我的</span>
        </button>
      </nav>
      {open ? (
        <div className="mobile-nav-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section id="genesis-mobile-modules" className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-nav-title">
            <header>
              <div>
                <span className="section-kicker">全部能力</span>
                <h2 id="mobile-nav-title">我的 Genesis</h2>
                <p>所有既有能力均保留，并按使用场景分组。</p>
              </div>
              <button ref={closeButton} type="button" className="icon-button" aria-label="关闭全部能力菜单" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={19} />
              </button>
            </header>
            <button
              type="button"
              className="mobile-command-entry"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("genesis:open-command-palette"));
              }}
            >
              <Search aria-hidden="true" size={18} />
              <span><strong>快速指令</strong><small>搜索全部能力、记录想法或打开 Orb</small></span>
            </button>
            <div className="mobile-nav-groups">
              {groups.map((group) => (
                <section key={group.label} aria-labelledby={`mobile-group-${group.label}`}>
                  <h3 id={`mobile-group-${group.label}`}>{group.label}</h3>
                  <div>
                    {group.links.map(([href, label, Icon]) => (
                      <Link key={`${href}-${label}`} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>
                        <Icon aria-hidden="true" size={18} />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
