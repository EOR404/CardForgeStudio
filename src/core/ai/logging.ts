import { estimateTokens } from "../prompt-builder/buildPrompt";
import { now, uid } from "../schema/defaults";
import type { AIInvocationLog, AIProviderConfig, ChatMessage } from "../schema/types";
import { callOpenAICompatibleDetailed } from "./client";

const MODEL_PRICE_USD_PER_TOKEN: Array<{
  match: RegExp;
  input: number;
  output: number;
}> = [
  { match: /gpt-4o-mini/i, input: 0.00000015, output: 0.0000006 },
  { match: /gpt-4o(?!-mini)/i, input: 0.0000025, output: 0.00001 },
  { match: /gpt-3\.5/i, input: 0.0000005, output: 0.0000015 }
];

export class LoggedAIError extends Error {
  readonly log: AIInvocationLog;

  constructor(message: string, log: AIInvocationLog) {
    super(message);
    this.name = "LoggedAIError";
    this.log = log;
  }
}

export async function runLoggedCompletion(
  provider: AIProviderConfig,
  messages: ChatMessage[],
  taskType: string,
  params: Partial<AIProviderConfig["defaultParams"]> = {}
): Promise<{ content: string; log: AIInvocationLog }> {
  const startedAt = performance.now();
  try {
    const result = await callOpenAICompatibleDetailed(provider, messages, params);
    const log = createAIInvocationLog({
      provider,
      taskType,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      success: true,
      rawOutput: result.content
    });
    return { content: result.content, log };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const inputTokens = estimateMessageTokens(messages);
    const log = createAIInvocationLog({
      provider,
      taskType,
      inputTokens,
      outputTokens: 0,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      success: false,
      errorMessage: message
    });
    throw new LoggedAIError(message, log);
  }
}

export function maybeAIInvocationLog(error: unknown): AIInvocationLog | undefined {
  return error instanceof LoggedAIError ? error.log : undefined;
}

export function createAIInvocationLog(input: {
  provider: AIProviderConfig;
  taskType: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  rawOutput?: string;
}): AIInvocationLog {
  const totalTokens = input.inputTokens + input.outputTokens;
  return {
    id: uid("ailog"),
    taskType: input.taskType,
    providerId: input.provider.id,
    providerName: input.provider.name,
    model: input.provider.defaultModel,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens,
    estimatedCostUsd: estimateCostUsd(input.provider.defaultModel, input.inputTokens, input.outputTokens),
    durationMs: input.durationMs,
    success: input.success,
    errorMessage: input.errorMessage,
    rawOutput: input.rawOutput?.slice(0, 8000),
    createdAt: now()
  };
}

function estimateMessageTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = MODEL_PRICE_USD_PER_TOKEN.find((item) => item.match.test(model));
  if (!rates) return 0;
  return roundUsd(inputTokens * rates.input + outputTokens * rates.output);
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
