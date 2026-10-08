import "server-only";
import { AIProviderError } from "@/lib/ai/providers/errors";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek";
import { OpenAIProvider } from "@/lib/ai/providers/openai";
import type {
  AICompletion,
  AIProvider,
  AIProviderId,
  AIRequest,
  AIStreamEvent,
} from "@/lib/ai/providers/types";

const knownProviders = new Set<AIProviderId>([
  "deepseek",
  "openai",
  "moonshot",
  "gemini",
  "anthropic",
]);

const providerFactories: Partial<Record<AIProviderId, () => AIProvider>> = {
  deepseek: () => new DeepSeekProvider(),
  openai: () => new OpenAIProvider(),
};

export class AIRouter {
  readonly selectedProviderId: AIProviderId;
  private readonly provider: AIProvider;

  constructor(providerId = process.env.MODEL_PROVIDER || "deepseek") {
    if (!knownProviders.has(providerId as AIProviderId))
      throw new AIProviderError(
        "unsupported_provider",
        `不支持的 AI Provider：${providerId}`,
        false,
      );
    this.selectedProviderId = providerId as AIProviderId;
    const factory = providerFactories[this.selectedProviderId];
    if (!factory)
      throw new AIProviderError(
        "unsupported_provider",
        `${this.selectedProviderId} Provider 尚未安装适配器。`,
        false,
      );
    this.provider = factory();
  }

  isRealConfigured() {
    return this.provider.isConfigured();
  }
  mode() {
    return this.isRealConfigured() ? ("real" as const) : ("demo" as const);
  }
  modelFor(
    taskClass: Parameters<AIProvider["modelFor"]>[0],
    requestedModel?: string,
  ) {
    return this.provider.modelFor(taskClass, requestedModel);
  }
  complete<T>(request: AIRequest<T>): Promise<AICompletion<T>> {
    return this.provider.complete(request);
  }
  stream(
    request: Omit<AIRequest, "schema" | "schemaName">,
  ): AsyncGenerator<AIStreamEvent> {
    return this.provider.stream(request);
  }
}

export function getAIRouter() {
  return new AIRouter();
}
