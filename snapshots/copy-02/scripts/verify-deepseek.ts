export {};

const baseUrl = process.env.GENESIS_VERIFY_URL || "http://127.0.0.1:3000";

async function main() {
  const response = await fetch(`${baseUrl}/api/ai/mentor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseUrl },
    body: JSON.stringify({
      module: "ai_mentor",
      prompt: "请用一句中文提出一个可验证的问题，区分学习 FastAPI 时的‘看懂了’和‘真正掌握’。",
      context: "Genesis OS AI Provider 集成真实验收；只需要给出一个问题。",
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
  const events = body.split(/\r?\n\r?\n/).filter(Boolean).map((block) => block.split(/\r?\n/).find((line) => line.startsWith("data: "))).filter(Boolean).map((line) => JSON.parse(line!.slice(6)) as { type: string; text?: string; error?: string; requestId?: string });
  const error = events.find((item) => item.type === "error");
  if (error) throw new Error(error.error || "stream error");
  const text = events.filter((item) => item.type === "delta").map((item) => item.text).join("");
  const done = events.find((item) => item.type === "done");
  console.log(JSON.stringify({ status: response.status, provider: response.headers.get("X-AI-Provider"), model: response.headers.get("X-AI-Model"), text, requestId: done?.requestId || null }, null, 2));
}

void main();
