import type { AIProviderConfig, ChatMessage } from "../schema/types";
import { estimateTokens } from "../prompt-builder/buildPrompt";

export type AICompletionResult = {
  content: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  if (!config.baseUrl) throw new Error("Provider 缺少 Base URL。");
  if (!config.defaultModel) throw new Error("Provider 缺少模型名。");
  const endpoint = normalizeChatEndpoint(config.baseUrl);
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
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
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
  const json = (await response.json()) as {
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

async function safeResponseText(response: Response): Promise<string> {
  const text = await response.text();
  return text.slice(0, 800);
}

async function readOpenAIStream(response: Response): Promise<string> {
  if (!response.body) return parseOpenAIStreamText(await response.text());
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let streamText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    streamText += decoder.decode(value, { stream: true });
  }
  streamText += decoder.decode();
  return parseOpenAIStreamText(streamText);
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}
