import type { CardProject, InternalCharacter, InternalWorldBook, QualityIssue, RegexRule } from "../schema/types";
import { getV1LossWarnings } from "../exporter/character";
import { uid } from "../schema/defaults";
import { estimateTokens } from "../token/estimate";

const BROAD_WORLD_BOOK_KEYS = new Set(["你", "我", "他", "她", "它", "的", "是", "在", "了", "和", "不", "人", "门"]);
const OOC_PATTERN = /\b(ooc|out\s*of\s*character|jailbreak|ignore\s+previous|developer\s+message)\b|越狱|开发者指令|系统提示|作为\s*(ai|AI|模型)|我是\s*(ai|AI|模型)|脱离角色|角色外/i;

export type CharacterTokenSection = {
  id: string;
  label: string;
  tokens: number;
};

export type CharacterTokenBreakdown = {
  sections: CharacterTokenSection[];
  total: number;
};

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
  if (hasHighTextOverlap(character.description, character.personality ?? "")) {
    issues.push(issue("info", "character.personality", "personality 与 description 重复度较高，建议拆分人格特征和背景描写。"));
  }
  if (character.exampleMessages?.trim()) {
    if (!/<START>/i.test(character.exampleMessages)) {
      issues.push(issue("warning", "character.mes_example", "mes_example 缺少 <START> 分隔标记。"));
    }
    if (!/\{\{char\}\}|<char>|char\s*:/i.test(character.exampleMessages)) {
      issues.push(issue("warning", "character.mes_example", "mes_example 没有明显的 {{char}} 发言标记。"));
    }
  }
  const oocScopes = [
    ["description", character.description],
    ["personality", character.personality ?? ""],
    ["scenario", character.scenario ?? ""],
    ["first_mes", character.firstMessage],
    ["mes_example", character.exampleMessages ?? ""],
    ["system_prompt", character.systemPrompt ?? ""],
    ["post_history_instructions", character.postHistoryInstructions ?? ""]
  ];
  for (const [field, content] of oocScopes) {
    if (OOC_PATTERN.test(content)) issues.push(issue("warning", `character.${field}`, `${field} 可能混入 OOC、越狱或模型身份指令。`));
  }
  const tokenBreakdown = buildCharacterTokenBreakdown(character, worldBook);
  if (tokenBreakdown.total > 3500) {
    issues.push(issue("warning", "character.tokens", `角色卡本体约 ${tokenBreakdown.total} tokens，建议压缩或拆到世界书。`));
  }
  const exampleTokens = tokenBreakdown.sections.find((section) => section.id === "exampleMessages")?.tokens ?? 0;
  if (exampleTokens > 900) issues.push(issue("info", "character.mes_example", "mes_example token 占用较高，可保留少量代表性样例。"));
  if (character.description.length > 6000) {
    issues.push(issue("warning", "character.description", "description 很长，建议拆分到世界书。"));
  }
  getV1LossWarnings(character).forEach((warning) => issues.push(issue("info", "export.v1", `导出 V1 时：${warning}`)));
  return issues;
}

export function buildCharacterTokenBreakdown(character: InternalCharacter, worldBook?: InternalWorldBook): CharacterTokenBreakdown {
  const sections: CharacterTokenSection[] = [
    { id: "description", label: "description", tokens: estimateTokens(character.description) },
    { id: "personality", label: "personality", tokens: estimateTokens(character.personality ?? "") },
    { id: "scenario", label: "scenario", tokens: estimateTokens(character.scenario ?? "") },
    { id: "firstMessage", label: "first_mes", tokens: estimateTokens(character.firstMessage) },
    { id: "exampleMessages", label: "mes_example", tokens: estimateTokens(character.exampleMessages ?? "") },
    { id: "systemPrompt", label: "system_prompt", tokens: estimateTokens(character.systemPrompt ?? "") },
    { id: "postHistoryInstructions", label: "post_history_instructions", tokens: estimateTokens(character.postHistoryInstructions ?? "") },
    { id: "alternateGreetings", label: "alternate_greetings", tokens: estimateTokens(character.alternateGreetings.join("\n")) }
  ];
  if (worldBook) {
    sections.push({
      id: "linkedWorldBook",
      label: "linked_worldbook",
      tokens: worldBook.entries.reduce((sum, entry) => sum + estimateTokens(entry.content), 0)
    });
  }
  return {
    sections,
    total: sections.reduce((sum, section) => sum + section.tokens, 0)
  };
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

function hasHighTextOverlap(left: string, right: string): boolean {
  const leftTerms = textTerms(left);
  const rightTerms = textTerms(right);
  if (leftTerms.size < 10 || rightTerms.size < 10) return false;
  let shared = 0;
  for (const term of leftTerms) {
    if (rightTerms.has(term)) shared += 1;
  }
  const smaller = Math.min(leftTerms.size, rightTerms.size);
  return shared / smaller >= 0.72;
}

function textTerms(value: string): Set<string> {
  const compact = value
    .toLowerCase()
    .replace(/\{\{user\}\}|\{\{char\}\}/g, " ")
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, " ")
    .trim();
  const latinTerms = compact.split(/\s+/).filter((term) => term.length >= 3);
  const cjk = [...compact.replace(/[^\p{Script=Han}]/gu, "")];
  const cjkTerms: string[] = [];
  for (let index = 0; index < cjk.length - 1; index += 1) {
    cjkTerms.push(`${cjk[index]}${cjk[index + 1]}`);
  }
  return new Set([...latinTerms, ...cjkTerms]);
}
