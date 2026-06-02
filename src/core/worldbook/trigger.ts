import type {
  InternalWorldBook,
  TriggeredWorldBookEntry,
  WorldBookEntry,
  WorldBookEntryCondition,
  WorldBookTriggerAnalysis,
  WorldBookTriggerReview
} from "../schema/types";
import { estimateTokens } from "../token/estimate";
import { getPathValue } from "../variable-system/mvu";

const DEFAULT_WORLD_BOOK_TOKEN_BUDGET = 1200;

export function triggerWorldBookEntries(
  worldBook: InternalWorldBook | undefined,
  latestUserInput: string,
  variableState?: Record<string, unknown>
): TriggeredWorldBookEntry[] {
  return analyzeWorldBookTrigger(worldBook, latestUserInput, variableState).triggeredEntries;
}

export function analyzeWorldBookTrigger(
  worldBook: InternalWorldBook | undefined,
  latestUserInput: string,
  variableState: Record<string, unknown> = {}
): WorldBookTriggerAnalysis {
  const input = latestUserInput || "";
  if (!worldBook) {
    return {
      input,
      tokenBudget: 0,
      usedTokens: 0,
      triggeredEntries: [],
      excludedEntries: [],
      reviewedEntries: []
    };
  }

  const tokenBudget = normalizeTokenBudget(worldBook.tokenBudget);
  const reviewedEntries = worldBook.entries.map((entry) => reviewEntry(worldBook.id, entry, input, variableState)).sort(compareReviews);
  const candidates = reviewedEntries.filter((review) => review.status === "triggered");
  const triggeredEntries: TriggeredWorldBookEntry[] = [];
  let usedTokens = 0;

  for (const review of candidates) {
    if (usedTokens + review.tokens > tokenBudget) {
      review.status = "excluded_by_budget";
      review.reason = `超出世界书 token 预算（${usedTokens} + ${review.tokens} > ${tokenBudget}）。`;
      continue;
    }
    usedTokens += review.tokens;
    triggeredEntries.push(toTriggeredEntry(review));
  }

  return {
    input,
    tokenBudget,
    usedTokens,
    triggeredEntries,
    excludedEntries: reviewedEntries.filter((review) => review.status !== "triggered"),
    reviewedEntries
  };
}

function reviewEntry(
  worldBookId: string,
  entry: WorldBookEntry,
  input: string,
  variableState: Record<string, unknown>
): WorldBookTriggerReview {
  const tokens = estimateTokens(entry.content);
  const base = createReviewBase(worldBookId, entry, tokens);

  if (!entry.enabled) {
    return {
      ...base,
      status: "disabled",
      reason: "条目已禁用。"
    };
  }

  if (!entry.content.trim()) {
    return {
      ...base,
      status: "empty_content",
      reason: "条目内容为空，无法插入。"
    };
  }

  const conditionReview = reviewConditions(entry.conditions ?? [], variableState);
  if (!conditionReview.passed) {
    return {
      ...base,
      status: "missed_condition",
      missingKeys: conditionReview.failedPaths,
      reason: conditionReview.reason
    };
  }

  if (entry.constant) {
    return {
      ...base,
      status: "triggered",
      matchedKeys: ["constant"],
      reason: "常驻条目",
    };
  }

  const primary = findMatches(entry.keys, input, entry.caseSensitive);
  if (!primary.length) {
    return {
      ...base,
      status: "missed_primary",
      missingKeys: entry.keys,
      reason: entry.keys.length ? "未命中主关键词。" : "没有主关键词且非常驻条目。"
    };
  }

  if (entry.selective) {
    const secondary = findMatches(entry.secondaryKeys, input, entry.caseSensitive);
    if (entry.secondaryKeys.length && !secondary.length) {
      return {
        ...base,
        status: "missed_secondary",
        matchedKeys: primary,
        missingKeys: entry.secondaryKeys,
        reason: "主关键词命中，但二级关键词未命中。"
      };
    }
    return {
      ...base,
      status: "triggered",
      matchedKeys: [...primary, ...secondary],
      reason: "关键词 + 二级关键词命中",
    };
  }

  return {
    ...base,
    status: "triggered",
    matchedKeys: primary,
    reason: "关键词命中",
  };
}

function reviewConditions(
  conditions: WorldBookEntryCondition[],
  variableState: Record<string, unknown>
): { passed: boolean; failedPaths: string[]; reason: string } {
  const failed = conditions.filter((condition) => !evaluateCondition(condition, variableState));
  if (!failed.length) return { passed: true, failedPaths: [], reason: "" };
  return {
    passed: false,
    failedPaths: failed.map((condition) => condition.path),
    reason: `变量条件未满足：${failed.map(formatCondition).join("; ")}`
  };
}

function evaluateCondition(condition: WorldBookEntryCondition, variableState: Record<string, unknown>): boolean {
  const actual = getPathValue(variableState, condition.path);
  const expected = condition.value;
  switch (condition.operator) {
    case "==":
      return normalizeComparable(actual) === normalizeComparable(expected);
    case "!=":
      return normalizeComparable(actual) !== normalizeComparable(expected);
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case "contains":
      return containsValue(actual, expected);
    default:
      return false;
  }
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.map(normalizeComparable).includes(normalizeComparable(expected));
  if (typeof actual === "string") return actual.includes(String(expected));
  return normalizeComparable(actual).includes(normalizeComparable(expected));
}

function normalizeComparable(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatCondition(condition: WorldBookEntryCondition): string {
  return `${condition.path} ${condition.operator} ${String(condition.value)}`;
}

function createReviewBase(worldBookId: string, entry: WorldBookEntry, tokens: number): WorldBookTriggerReview {
  return {
    entryId: entry.id,
    entryName: entry.name || entry.comment,
    worldBookId,
    status: "missed_primary",
    reason: "",
    matchedKeys: [],
    missingKeys: [],
    insertionOrder: entry.insertionOrder,
    priority: entry.priority,
    position: entry.position,
    tokens,
    content: entry.content
  };
}

function toTriggeredEntry(review: WorldBookTriggerReview): TriggeredWorldBookEntry {
  return {
    entryId: review.entryId,
    entryName: review.entryName,
    worldBookId: review.worldBookId,
    matchedKeys: review.matchedKeys,
    reason: review.reason,
    insertionOrder: review.insertionOrder,
    position: review.position,
    tokens: review.tokens,
    content: review.content
  };
}

function findMatches(keys: string[], input: string, caseSensitive: boolean): string[] {
  const haystack = caseSensitive ? input : input.toLowerCase();
  return keys.filter((key) => {
    const needle = caseSensitive ? key : key.toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

function normalizeTokenBudget(value: number | undefined): number {
  const budget = Number.isFinite(value) ? Number(value) : DEFAULT_WORLD_BOOK_TOKEN_BUDGET;
  return Math.max(0, Math.floor(budget));
}

function compareReviews(a: Pick<WorldBookTriggerReview, "insertionOrder" | "priority" | "entryName" | "entryId">, b: Pick<WorldBookTriggerReview, "insertionOrder" | "priority" | "entryName" | "entryId">): number {
  if (a.insertionOrder !== b.insertionOrder) return a.insertionOrder - b.insertionOrder;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return (a.entryName || a.entryId).localeCompare(b.entryName || b.entryId);
}

export function summarizeTriggered(entries: TriggeredWorldBookEntry[]): string {
  if (!entries.length) return "未触发世界书条目。";
  return entries
    .map(
      (entry) =>
        `- ${entry.entryName || entry.entryId}: ${entry.reason} (${entry.matchedKeys.join(", ")}) / ${entry.position} / order ${entry.insertionOrder} / ${entry.tokens} tokens`
    )
    .join("\n");
}
