import type { AIProviderConfig, ChatMessage } from "../schema/types";
import { estimateTokens } from "../prompt-builder/buildPrompt";

export type AICompletionResult = {
  content: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type OpenAICompatibleMessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export type OpenAICompatibleMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAICompatibleMessageContentPart[];
};

export async function callOpenAICompatible(
  config: AIProviderConfig,
  messages: ChatMessage[],
  params: Partial<AIProviderConfig["defaultParams"]> = {}
): Promise<string> {
  const result = await callOpenAICompatibleDetailed(config, messages, params);
  return result.content;
}

export async function callOpenAICompatibleDetailed(
  config: AIProviderConfig,
  messages: ChatMessage[],
  params: Partial<AIProviderConfig["defaultParams"]> = {}
): Promise<AICompletionResult> {
  return callOpenAICompatibleMessagesDetailed(config, messages, params);
}

export async function callOpenAICompatibleMessagesDetailed(
  config: AIProviderConfig,
  messages: OpenAICompatibleMessage[],
  params: Partial<AIProviderConfig["defaultParams"]> = {}
): Promise<AICompletionResult> {
  if (!config.baseUrl) throw new Error("Provider 缺少 Base URL。");
  if (!config.defaultModel) throw new Error("Provider 缺少模型名。");
  const endpoint = normalizeChatEndpoint(config.baseUrl);
  const proxyEndpoint = normalizeProxyEndpoint(config.proxyUrl);
  const stream = params.stream ?? config.defaultParams.stream ?? false;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers ?? {})
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const body = {
    model: config.defaultModel,
    messages,
    temperature: params.temperature ?? config.defaultParams.temperature ?? 0.7,
    top_p: params.topP ?? config.defaultParams.topP,
    max_tokens: params.maxTokens ?? config.defaultParams.maxTokens ?? 1200,
    stream
  };
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await sendProviderRequest(endpoint, headers, body, proxyEndpoint, config.providerType);
  } catch (error) {
    throw new Error(`网络请求失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const text = await safeResponseText(response);
    const hint =
      response.status === 401
        ? "API Key 无效或权限不足。"
        : response.status === 404
          ? "接口不存在，检查 Base URL 是否缺少 /v1。"
          : response.status === 429
            ? "请求过于频繁或额度不足。"
            : "Provider 返回错误。";
    throw new Error(`${hint} HTTP ${response.status}: ${text}`);
  }
  if (stream) {
    const content = await readOpenAIStream(response);
    if (!content) throw new Error("AI 流式响应中没有可用文本。");
    const inputTokens = estimateMessageTokens(messages);
    const outputTokens = estimateTokens(content);
    return {
      content,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }
  const json = await readCompletionJson(response) as {
    choices?: Array<{ message?: { content?: string }; text?: string }>;
    error?: { message?: string };
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text;
  if (!content) throw new Error(json.error?.message || "AI 响应中没有可用文本。");
  const inputTokens = json.usage?.prompt_tokens ?? estimateMessageTokens(messages);
  const outputTokens = json.usage?.completion_tokens ?? estimateTokens(content);
  return {
    content,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    inputTokens,
    outputTokens,
    totalTokens: json.usage?.total_tokens ?? inputTokens + outputTokens
  };
}

export async function testProviderConnection(config: AIProviderConfig): Promise<string> {
  return callOpenAICompatible(
    config,
    [
      { role: "system", content: "You are a connectivity test. Reply with OK." },
      { role: "user", content: "Return OK only." }
    ],
    { maxTokens: 32, temperature: 0 }
  );
}

export function parseOpenAIStreamText(streamText: string): string {
  let content = "";
  for (const rawLine of streamText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    if (data === "[DONE]") break;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{
          delta?: { content?: string };
          message?: { content?: string };
          text?: string;
        }>;
      };
      content += json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? json.choices?.[0]?.text ?? "";
    } catch {
      continue;
    }
  }
  return content;
}

function normalizeChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

function normalizeProxyEndpoint(proxyUrl?: string): string | undefined {
  const trimmed = proxyUrl?.trim();
  return trimmed || undefined;
}

function sendProviderRequest(
  endpoint: string,
  headers: Record<string, string>,
  body: object,
  proxyEndpoint: string | undefined,
  providerType: AIProviderConfig["providerType"]
): Promise<Response> {
  if (!proxyEndpoint) {
    return fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  }
  return fetch(proxyEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint,
      method: "POST",
      headers,
      body,
      providerType
    })
  });
}

async function safeResponseText(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 800);
}

async function readOpenAIStream(response: Response): Promise<string> {
  return parseOpenAIStreamText(unwrapProxyText(await response.text()));
}

async function readCompletionJson(response: Response): Promise<unknown> {
  const json = await response.json();
  return unwrapProxyJson(json);
}

function unwrapProxyJson(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json) || !("body" in json)) return json;
  const body = (json as { body?: unknown }).body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return json;
    }
  }
  return body ?? json;
}

function unwrapProxyText(text: string): string {
  try {
    const parsed = JSON.parse(text) as { body?: unknown };
    return typeof parsed.body === "string" ? parsed.body : text;
  } catch {
    return text;
  }
}

function estimateMessageTokens(messages: OpenAICompatibleMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateContentTokens(message.content) + 4, 0);
}

function estimateContentTokens(content: OpenAICompatibleMessage["content"]): number {
  if (typeof content === "string") return estimateTokens(content);
  return content.reduce((sum, part) => {
    if (part.type === "text") return sum + estimateTokens(part.text);
    return sum + 85;
  }, 0);
}
