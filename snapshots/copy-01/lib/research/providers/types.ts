import type {
  ResearchOperation,
  ResearchResult,
} from "@/lib/domain/research";

export type SearchOptions = { maxResults?: number };
export type CrawlOptions = { maxResults?: number };

export interface ResearchProvider {
  readonly id: "tavily";
  isConfigured(): boolean;
  search(query: string, options?: SearchOptions): Promise<ResearchResult>;
  extract(url: string): Promise<ResearchResult>;
  crawl(url: string, options?: CrawlOptions): Promise<ResearchResult>;
  research(topic: string): Promise<ResearchResult>;
}

export type ResearchProviderRequest = {
  operation: ResearchOperation;
  value: string;
  maxResults?: number;
};
