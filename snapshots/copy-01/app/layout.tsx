import type { Metadata } from "next";
import { AIOrbAssistant } from "@/components/ai-orb-assistant";
import { GenesisCommandPalette } from "@/components/genesis-command-palette";
import { GenesisMobileNavigation } from "@/components/genesis-mobile-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "Genesis OS · 个人进化系统",
  description: "以证据驱动学习、项目闭环与长期成长的个人 AI 操作系统",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        {children}
        <GenesisCommandPalette />
        <AIOrbAssistant />
        <GenesisMobileNavigation />
      </body>
    </html>
  );
}
