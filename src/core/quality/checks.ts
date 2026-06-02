import type { CardProject, InternalCharacter, InternalWorldBook, QualityIssue, RegexRule } from "../schema/types";
import { getV1LossWarnings } from "../exporter/character";
import { uid } from "../schema/defaults";
import { estimateTokens } from "../token/estimate";

const BROAD_WORLD_BOOK_KEYS = new Set(["你", "我", "他", "她", "它", "的", "是", "在", "了", "和", "不", "人", "门"]);

export function checkCharacterQuality(character: InternalCharacter, worldBook?: InternalWorldBook): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (!character.name.trim()) issues.push(issue("error", "character.name", "name 为空。"));
  if (!character.firstMessage.trim()) issues.push(issue("error", "character.first_mes", "first_mes 为空。"));
  if (!character.description.trim() && !worldBook?.entries.some((entry) => entry.constant || entry.keys.length)) {
    issues.push(issue("warning", "character.description", "description 为空，且没有世界书核心条目兜底。"));
  }
  if (/(你|{{user}}).{0,10}(说|决定|走|看|想|伸手|吻|拥抱)/i.test(character.firstMessage)) {
    issues.push(issue("warning", "character.first_mes", "first_mes 可能替 {{user}} 行动。"));
  }
  if (character.description.length > 6000) {
    issues.push(issue("warning", "character.description", "description 很长，建议拆分到世界书。"));
  }
  getV1LossWarnings(character).forEach((warning) => issues.push(issue("info", "export.v1", `导出 V1 时：${warning}`)));
  return issues;
}

export function checkWorldBookQuality(worldBook: InternalWorldBook): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seenKeys = new Map<string, string>();
  const insertionOrders = new Map<number, string[]>();
  const tokenBudget = worldBook.tokenBudget ?? 1200;
  const enabledEntries = worldBook.entries.filter((entry) => entry.enabled);
  const constantTokenTotal = enabledEntries
    .filter((entry) => entry.constant)
    .reduce((sum, entry) => sum + estimateTokens(entry.content), 0);
  if (!worldBook.entries.length) issues.push(issue("info", worldBook.name, "世界书还没有条目。"));
  if (tokenBudget <= 0) issues.push(issue("warning", worldBook.name, "世界书 token budget 小于等于 0，所有条目都会被预算排除。"));
  if (constantTokenTotal > tokenBudget * 0.6) {
    issues.push(issue("warning", worldBook.name, "常驻条目占用超过 token budget 的 60%，可能挤掉关键词触发条目。"));
  }
  for (const entry of worldBook.entries) {
    const entryLabel = entry.name || entry.comment || entry.id;
    if (!entry.keys.length && !entry.constant) issues.push(issue("warning", entry.name || entry.id, "世界书条目没有关键词。"));
    if (!entry.content.trim()) issues.push(issue("error", entry.name || entry.id, "世界书条目内容为空。"));
    if (entry.selective && !entry.secondaryKeys.length) issues.push(issue("info", entry.name || entry.id, "selective 已启用但没有 secondary_keys。"));
    if (entry.position === "at_depth" && entry.depth === undefined) issues.push(issue("info", entryLabel, "position 为 at_depth，但 depth 未设置。"));
    if (entry.probability !== undefined && (entry.probability <= 0 || entry.probability > 100)) {
      issues.push(issue("warning", entryLabel, "probability 应在 1 到 100 之间。"));
    }
    for (const condition of entry.conditions ?? []) {
      if (!condition.path.trim()) issues.push(issue("warning", entryLabel, "变量条件缺少 path。"));
      if (condition.operator === "contains" && typeof condition.value === "boolean") {
        issues.push(issue("info", entryLabel, "contains 条件使用布尔值通常无法命中，建议改为 ==。"));
      }
    }
    if (estimateTokens(entry.content) > tokenBudget) issues.push(issue("warning", entry.name || entry.id, "条目内容超过世界书 token budget，触发时会被预算排除。"));
    const orderEntries = insertionOrders.get(entry.insertionOrder) ?? [];
    orderEntries.push(entryLabel);
    insertionOrders.set(entry.insertionOrder, orderEntries);
    for (const key of [...entry.keys, ...entry.secondaryKeys]) {
      const normalized = normalizeWorldBookKey(key);
      if (!normalized) {
        issues.push(issue("warning", entryLabel, "存在空关键词。"));
        continue;
      }
      if (normalized.length <= 1 || BROAD_WORLD_BOOK_KEYS.has(normalized)) {
        issues.push(issue("info", entryLabel, `关键词「${key}」过宽，可能导致误触发。`));
      }
      const previous = seenKeys.get(normalized);
      if (previous) issues.push(issue("info", entry.name || entry.id, `关键词「${key}」与「${previous}」重复。`));
      seenKeys.set(normalized, entryLabel);
    }
  }
  for (const [order, labels] of insertionOrders) {
    if (labels.length > 1) issues.push(issue("info", worldBook.name, `insertion_order ${order} 被多个条目共用：${labels.join(", ")}。`));
  }
  return issues;
}

export function checkRegexRules(rules: RegexRule[]): QualityIssue[] {
  return rules.flatMap((rule) => {
    try {
      if (!rule.pattern.trim()) return [issue("warning", rule.name, "正则 pattern 为空。")];
      new RegExp(rule.pattern, rule.flags);
      return [];
    } catch (error) {
      return [issue("error", rule.name, `正则 pattern 无效：${error instanceof Error ? error.message : String(error)}`)];
    }
  });
}

export function projectDashboardIssues(project: CardProject): QualityIssue[] {
  const characterIssues = project.characters.flatMap((character) =>
    checkCharacterQuality(character, project.worldBooks.find((book) => character.linkedWorldBooks.includes(book.id)))
  );
  const worldIssues = project.worldBooks.flatMap(checkWorldBookQuality);
  const regexIssues = checkRegexRules(project.advanced.regexRules);
  return [...characterIssues, ...worldIssues, ...regexIssues].slice(0, 20);
}

function issue(level: QualityIssue["level"], scope: string, message: string): QualityIssue {
  return { id: uid("issue"), level, scope, message };
}

function normalizeWorldBookKey(key: string): string {
  return key.trim().toLowerCase();
}
