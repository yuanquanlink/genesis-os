"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Genesis page error]", error); }, [error]);
  return <main style={{ maxWidth: 680, margin: "12vh auto", padding: 32 }}>
    <p style={{ color: "#9e423a", fontSize: 12 }}>GENESIS 暂时无法读取数据</p>
    <h1>你的数据没有被自动覆盖</h1>
    <p style={{ lineHeight: 1.7, opacity: .72 }}>请检查数据库路径与磁盘权限后重试。若问题持续，保留终端中的错误编号用于排查。</p>
    <button onClick={reset} style={{ marginTop: 18, padding: "10px 16px", borderRadius: 8, border: 0, cursor: "pointer" }}>重新加载</button>
  </main>;
}
