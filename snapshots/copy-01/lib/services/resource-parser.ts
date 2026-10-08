import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import JSZip from "jszip";
import pdf from "pdf-parse/lib/pdf-parse.js";
import type { z } from "zod";
import type { sourceTypeSchema } from "@/lib/domain/learning";

export type ParsedResource = {
  title: string;
  sourceType: z.infer<typeof sourceTypeSchema>;
  extractedText: string | null;
  status: "ready" | "failed" | "unsupported";
  statusMessage: string;
  errorCode: string | null;
  contentHash: string | null;
  storagePath: string | null;
  mimeType: string | null;
  originalFilename: string | null;
  authorSource?: string | null;
  estimatedMinutes?: number | null;
  difficulty?: number | null;
  coreTopics?: string[];
  prerequisites?: string[];
  keyConcepts?: string[];
  practiceOpportunities?: string[];
  sections?: Array<{ title: string; locatorType: "heading" | "paragraph" | "resource"; locatorValue: string; excerpt: string }>;
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MAX_REMOTE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 1_000_000;

function cleanText(value: string) {
  return value
    .replace(/\0/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARACTERS);
}

function textHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: string[], limit: number) {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function analyzeText(text: string, title: string, authorSource: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const headings = unique(lines.filter((line) => /^#{1,6}\s+/.test(line)).map((line) => line.replace(/^#{1,6}\s+/, "")), 12);
  const fallbackTopics = unique(
    lines.flatMap((line) => line.match(/[A-Za-z][A-Za-z0-9_.-]{2,30}|[\u4e00-\u9fff]{2,10}/g) ?? [])
      .filter((term) => !/^(the|and|for|with|this|that|一个|可以|以及|进行|使用|通过)$/.test(term.toLowerCase())),
    12,
  );
  const keyConcepts = unique([...headings, ...fallbackTopics], 10);
  const paragraphBlocks = text.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block.length >= 20);
  const sectionSources = headings.length
    ? headings.map((heading) => ({ heading, index: text.indexOf(heading) })).filter((item) => item.index >= 0)
    : paragraphBlocks.slice(0, 12).map((block, index) => ({ heading: `段落 ${index + 1}`, index: text.indexOf(block) }));
  const sections: NonNullable<ParsedResource["sections"]> = sectionSources.slice(0, 20).map((item, index) => {
    const next = sectionSources[index + 1]?.index ?? Math.min(text.length, item.index + 1_600);
    const excerpt = cleanText(text.slice(item.index, Math.min(next, item.index + 1_600))).slice(0, 900);
    return { title: item.heading, locatorType: headings.length ? "heading" as const : "paragraph" as const, locatorValue: headings.length ? item.heading : String(index + 1), excerpt };
  });
  if (!sections.length) sections.push({ title, locatorType: "resource", locatorValue: "全文", excerpt: text.slice(0, 900) });
  const codeDensity = (text.match(/```|\b(def|class|function|SELECT|CREATE TABLE|curl|pytest|npm)\b/g) ?? []).length;
  const difficulty = Math.max(1, Math.min(5, 1 + Math.floor(text.length / 12_000) + Math.min(2, Math.floor(codeDensity / 4))));
  return {
    authorSource,
    estimatedMinutes: Math.max(1, Math.ceil(text.length / 600)),
    difficulty,
    coreTopics: keyConcepts.slice(0, 6),
    prerequisites: keyConcepts.slice(0, Math.min(3, Math.max(1, keyConcepts.length - 1))).map((item) => `${item} 的基础概念`),
    keyConcepts,
    practiceOpportunities: unique(keyConcepts.slice(0, 4).map((item) => `围绕“${item}”完成一个可运行的小练习并记录失败路径`), 4),
    sections,
  };
}

function safeFilename(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120) || "resource";
}

function uploadType(filename: string, mimeType: string) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".pdf" || mimeType === "application/pdf") return "pdf" as const;
  if (extension === ".md" || extension === ".markdown" || mimeType === "text/markdown") return "markdown" as const;
  if (extension === ".txt" || mimeType === "text/plain") return "text" as const;
  if (extension === ".epub" || mimeType === "application/epub+zip") return "epub" as const;
  return null;
}

export function describeUploadedResource(file: File, preferredTitle?: string) {
  return {
    title: preferredTitle || file.name,
    sourceType: uploadType(file.name, file.type) ?? "text",
    originalFilename: file.name,
    mimeType: file.type || null,
  };
}

async function parseEpub(bytes: Buffer) {
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const entries = Object.values(archive.files).filter((entry) => !entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name)).slice(0, 300);
  let declaredSize = 0;
  for (const entry of entries) {
    const metadata = entry as unknown as { _data?: { uncompressedSize?: number } };
    declaredSize += metadata._data?.uncompressedSize ?? 0;
    if (declaredSize > MAX_REMOTE_BYTES) throw new Error("epub_uncompressed_too_large");
  }
  const chapters: string[] = [];
  let extractedSize = 0;
  for (const entry of entries) {
    const chapter = await entry.async("string");
    extractedSize += chapter.length;
    if (extractedSize > MAX_TEXT_CHARACTERS) throw new Error("epub_text_too_large");
    chapters.push(chapter);
  }
  return cleanText(cheerio.load(chapters.join("\n"))("body").text());
}

export async function parseUploadedResource(file: File, preferredTitle?: string): Promise<ParsedResource> {
  const sourceType = uploadType(file.name, file.type);
  const title = preferredTitle || file.name;
  if (!sourceType) return { title, sourceType: "text", extractedText: null, status: "unsupported", statusMessage: "不支持此文件类型；仅支持 PDF、Markdown、TXT 和 EPUB。", errorCode: "unsupported_file_type", contentHash: null, storagePath: null, mimeType: file.type || null, originalFilename: file.name };
  if (file.size > MAX_UPLOAD_BYTES) return { title, sourceType, extractedText: null, status: "failed", statusMessage: "文件超过 15 MB，原始文件未写入。请拆分后重试。", errorCode: "file_too_large", contentHash: null, storagePath: null, mimeType: file.type || null, originalFilename: file.name };

  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDirectory = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.GENESIS_UPLOAD_PATH || path.join("uploads", "learning"),
  );
  fs.mkdirSync(uploadDirectory, { recursive: true });
  const storagePath = path.join(uploadDirectory, `${randomUUID()}-${safeFilename(file.name)}`);
  fs.writeFileSync(storagePath, bytes);
  try {
    let extractedText = "";
    if (sourceType === "pdf") extractedText = cleanText((await pdf(bytes)).text);
    else if (sourceType === "epub") extractedText = await parseEpub(bytes);
    else extractedText = cleanText(bytes.toString("utf8"));
    if (extractedText.length < 20) return { title, sourceType, extractedText: null, status: "failed", statusMessage: "原始文件已保存，但没有提取到足够的可读文本；扫描版 PDF 需要先做 OCR。", errorCode: "empty_extraction", contentHash: textHash(bytes.toString("base64")), storagePath, mimeType: file.type || null, originalFilename: file.name };
    return { title, sourceType, extractedText, status: "ready", statusMessage: `已真实解析 ${extractedText.length.toLocaleString("zh-CN")} 个字符。`, errorCode: null, contentHash: textHash(extractedText), storagePath, mimeType: file.type || null, originalFilename: file.name, ...analyzeText(extractedText, title, file.name) };
  } catch (error) {
    console.error("[ResourceParser] upload extraction failed", error);
    return { title, sourceType, extractedText: null, status: "failed", statusMessage: "原始文件已保存，但解析失败。文件不会丢失，可修复解析器后重试。", errorCode: "parse_failed", contentHash: textHash(bytes.toString("base64")), storagePath, mimeType: file.type || null, originalFilename: file.name };
  }
}

function privateAddress(address: string) {
  if (isIP(address) === 6) return address === "::1" || address.toLowerCase().startsWith("fe80:") || address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd");
  const parts = address.split(".").map(Number);
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] === 0;
}

async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("unsafe_url");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("unsafe_url");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("unsafe_url");
}

async function fetchBounded(initialUrl: string) {
  let url = new URL(initialUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "GenesisOS-LearningParser/1.0", Accept: "text/html,text/plain,text/markdown,application/xhtml+xml" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("redirect_without_location");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_REMOTE_BYTES) throw new Error("remote_too_large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("empty_body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REMOTE_BYTES) { await reader.cancel(); throw new Error("remote_too_large"); }
      chunks.push(value);
    }
    return { finalUrl: url, contentType: response.headers.get("content-type") || "", body: Buffer.concat(chunks).toString("utf8") };
  }
  throw new Error("too_many_redirects");
}

async function fetchBoundedWithRetry(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { return await fetchBounded(url); }
    catch (error) {
      lastError = error;
      const code = error instanceof Error ? error.message : "";
      if (code === "unsafe_url" || code === "remote_too_large" || code === "too_many_redirects" || code.startsWith("http_4") && code !== "http_429") throw error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  throw lastError;
}

function githubReadmeUrl(url: URL) {
  if (url.hostname !== "github.com") return url.toString();
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 2) return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/HEAD/README.md`;
  return url.toString();
}

function visibleText(body: string, contentType: string) {
  if (!contentType.includes("html") && !/<html/i.test(body)) return cleanText(body);
  const $ = cheerio.load(body);
  $("script,style,noscript,nav,footer,header,form,svg").remove();
  const main = $("main,article,[role=main]").first();
  return cleanText((main.length ? main : $("body")).text());
}

export async function parseUrlResource(input: { url: string; sourceType: "webpage" | "video" | "playlist" | "github" | "documentation"; title?: string }): Promise<ParsedResource> {
  const parsedUrl = new URL(input.url);
  const title = input.title || parsedUrl.hostname;
  if (input.sourceType === "video" || input.sourceType === "playlist") {
    return { title, sourceType: input.sourceType, extractedText: null, status: "unsupported", statusMessage: "链接已保存，但当前无法合法取得字幕或播放列表正文，因此没有进行内容分析。请上传你有权使用的字幕 TXT/Markdown。", errorCode: "captions_unavailable", contentHash: textHash(input.url), storagePath: null, mimeType: null, originalFilename: null };
  }
  try {
    const target = input.sourceType === "github" ? githubReadmeUrl(parsedUrl) : input.url;
    const remote = await fetchBoundedWithRetry(target);
    const extractedText = visibleText(remote.body, remote.contentType);
    if (extractedText.length < 50) return { title, sourceType: input.sourceType, extractedText: null, status: "failed", statusMessage: "链接可访问，但未提取到足够正文；可能需要登录、JavaScript 渲染或内容权限。未进行分析。", errorCode: "insufficient_content", contentHash: textHash(input.url), storagePath: null, mimeType: remote.contentType, originalFilename: null };
    return { title, sourceType: input.sourceType, extractedText, status: "ready", statusMessage: `已从公开页面真实提取 ${extractedText.length.toLocaleString("zh-CN")} 个字符。`, errorCode: null, contentHash: textHash(extractedText), storagePath: null, mimeType: remote.contentType, originalFilename: null, ...analyzeText(extractedText, title, remote.finalUrl.hostname) };
  } catch (error) {
    console.error("[ResourceParser] URL extraction failed", { url: input.url, error });
    const code = error instanceof Error ? error.message : "fetch_failed";
    const unsafe = code === "unsafe_url";
    return { title, sourceType: input.sourceType, extractedText: null, status: "failed", statusMessage: unsafe ? "出于安全原因拒绝访问本地或私有网络地址。" : "链接已保存，但正文获取失败或受限；系统没有伪装成已分析。", errorCode: code.slice(0, 80), contentHash: textHash(input.url), storagePath: null, mimeType: null, originalFilename: null };
  }
}
