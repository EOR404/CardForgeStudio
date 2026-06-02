import type { AIInvocationLog } from "../schema/types";

export type AIProviderCostSummary = {
  providerId: string;
  providerName: string;
  calls: number;
  successes: number;
  totalTokens: number;
  totalCostUsd: number;
  averageDurationMs: number;
};

export type AILogCostSummary = {
  totalCalls: number;
  successfulCalls: number;
  successRate: number;
  totalTokens: number;
  totalCostUsd: number;
  todayCostUsd: number;
  todayCalls: number;
  byProvider: AIProviderCostSummary[];
};

export function summarizeAILogs(logs: AIInvocationLog[], now = Date.now()): AILogCostSummary {
  const todayKey = dayKey(now);
  const byProvider = new Map<string, AIProviderCostSummary & { durationTotal: number }>();
  let successfulCalls = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let todayCostUsd = 0;
  let todayCalls = 0;

  for (const log of logs) {
    if (log.success) successfulCalls += 1;
    totalTokens += log.totalTokens;
    totalCostUsd += log.estimatedCostUsd;
    if (dayKey(log.createdAt) === todayKey) {
      todayCostUsd += log.estimatedCostUsd;
      todayCalls += 1;
    }

    const current =
      byProvider.get(log.providerId) ??
      {
        providerId: log.providerId,
        providerName: log.providerName,
        calls: 0,
        successes: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        averageDurationMs: 0,
        durationTotal: 0
      };
    current.calls += 1;
    current.successes += log.success ? 1 : 0;
    current.totalTokens += log.totalTokens;
    current.totalCostUsd += log.estimatedCostUsd;
    current.durationTotal += log.durationMs;
    current.averageDurationMs = Math.round(current.durationTotal / current.calls);
    byProvider.set(log.providerId, current);
  }

  return {
    totalCalls: logs.length,
    successfulCalls,
    successRate: logs.length ? Math.round((successfulCalls / logs.length) * 100) : 0,
    totalTokens,
    totalCostUsd: roundUsd(totalCostUsd),
    todayCostUsd: roundUsd(todayCostUsd),
    todayCalls,
    byProvider: [...byProvider.values()]
      .map(({ durationTotal: _durationTotal, ...summary }) => ({
        ...summary,
        totalCostUsd: roundUsd(summary.totalCostUsd)
      }))
      .sort((left, right) => right.totalCostUsd - left.totalCostUsd || right.calls - left.calls)
  };
}

function dayKey(value: number): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
