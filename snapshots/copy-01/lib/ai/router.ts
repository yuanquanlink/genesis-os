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

const ZH_CN_OUTPUT_CONTRACT = {
  role: "system" as const,
  content:
    "所有面向用户的自然语言内容必须使用简体中文（zh-CN）。保留 JSON 键、枚举值、ID、代码、URL、来源原始标题、模型名和必要专有名词；不得翻译或改写结构化协议字段。错误、限制、建议和解释也必须使用中文。",
};

function withChineseOutputContract<T extends { messages: AIRequest["messages"] }>(
  request: T,
): T {
  return {
    ...request,
    messages: [ZH_CN_OUTPUT_CONTRACT, ...request.messages],
  };
}

export class AIRouter {
  readonly selectedProviderId: AIProviderId;
  private readonly provider: AIProvider;

  constructor(providerId = process.env.MODEL_PROVIDER || "deepseek") {
    if (!knownProviders.has(providerId as AIProviderId))
      throw new AIProviderError(
        "unsupported_provider",
        `不支持的 AI 服务提供方：${providerId}`,
        false,
      );
    this.selectedProviderId = providerId as AIProviderId;
    const factory = providerFactories[this.selectedProviderId];
    if (!factory)
      throw new AIProviderError(
        "unsupported_provider",
        `${this.selectedProviderId} 服务提供方尚未安装适配器。`,
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
    return this.provider.complete(withChineseOutputContract(request));
  }
  stream(
    request: Omit<AIRequest, "schema" | "schemaName">,
  ): AsyncGenerator<AIStreamEvent> {
    return this.provider.stream(withChineseOutputContract(request));
  }
}

export function getAIRouter() {
  return new AIRouter();
}
