declare module "pdf-parse" {
  export default function pdf(buffer: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages: number; info?: unknown }>;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  export default function pdf(buffer: Buffer, options?: Record<string, unknown>): Promise<{ text: string; numpages: number; info?: unknown }>;
}
