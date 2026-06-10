import { targetLabel } from "../exporter/report";
import { trustLevelLabel } from "../security/trust";
import type { AppPage, CardProject, CompatibilityReport, SearchTarget } from "../schema/types";

export type ProjectSearchResult = {
  id: string;
  sourceType: SearchSourceType;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  excerpt: string;
  matchedFields: string[];
  target: SearchTarget;
  score: number;
};

export type SearchSourceType =
  | "project"
  | "character"
  | "worldbook"
  | "worldbook-entry"
  | "asset"
  | "ai-provider"
  | "ai-preset"
  | "ai-log"
  | "test-case"
  | "test-session"
  | "version"
  | "export"
  | "regex"
  | "variables"
  | "script"
  | "frontend"
  | "plugin"
  | "compatibility-report";

type SearchField = {
  label: string;
  value: unknown;
  weight?: number;
};

type SearchDocument = {
  id: string;
  sourceType: SearchSourceType;
  sourceLabel: string;
  title: string;
  subtitle?: string;
  fields: SearchField[];
  target: SearchTarget;
  updatedAt?: number;
};

const DEFAULT_LIMIT = 36;

export function searchProject(project: CardProject, query: string, limit = DEFAULT_LIMIT): ProjectSearchResult[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.length) return [];

  return buildSearchDocuments(project)
    .map((document) => scoreDocument(document, tokens))
    .filter((result): result is ProjectSearchResult => Boolean(result))
    .sort((a, b) => b.score - a.score || a.sourceLabel.localeCompare(b.sourceLabel) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

function buildSearchDocuments(project: CardProject): SearchDocument[] {
  const documents: SearchDocument[] = [];
  const add = (document: SearchDocument) => documents.push(document);
  const pageTarget = (page: AppPage, extra: Omit<SearchTarget, "page"> = {}): SearchTarget => ({ page, ...extra });

  add({
    id: `project:${project.id}`,
    sourceType: "project",
    sourceLabel: "项目",
    title: project.name,
    subtitle: project.mode === "light" ? "轻量制卡工程" : "高级工程",
    fields: [
      field("项目名", project.name, 8),
      field("描述", project.description, 6),
      field("模式", project.mode, 3),
      field("信任等级", [project.trustLevel, trustLevelLabel(project.trustLevel)], 5),
      field("兼容目标", [project.compatibilityTarget, targetLabel(project.compatibilityTarget)], 5)
    ],
    target: pageTarget("dashboard"),
    updatedAt: project.updatedAt
  });

  for (const character of project.characters) {
    const linkedWorldBooks = character.linkedWorldBooks.map((id) => project.worldBooks.find((book) => book.id === id)?.name ?? id);
    add({
      id: `character:${character.id}`,
      sourceType: "character",
      sourceLabel: "角色卡",
      title: character.name || "未命名角色",
      subtitle: character.tags.join(", ") || "无标签",
      fields: [
        field("角色名", character.name, 10),
        field("昵称", character.nickname, 8),
        field("描述", character.description, 7),
        field("性格", character.personality, 6),
        field("场景", character.scenario, 6),
        field("首句", character.firstMessage, 6),
        field("示例对话", character.exampleMessages, 5),
        field("备用开场", character.alternateGreetings, 5),
        field("系统提示", character.systemPrompt, 5),
        field("后置指令", character.postHistoryInstructions, 5),
        field("作者备注", character.creatorNotes, 4),
        field("标签", character.tags, 8),
        field("作者", character.creator, 3),
        field("版本", character.version, 3),
        field("绑定世界书", linkedWorldBooks, 5),
        field("扩展", character.extensions, 2),
        field("导入来源", character.originalSource ? [character.originalSource.format, character.originalSource.fileName] : undefined, 2)
      ],
      target: pageTarget("characters", { selectedCharacterId: character.id }),
      updatedAt: character.updatedAt
    });

    for (const report of character.compatibilityReports ?? []) {
      addCompatibilityReport(report, add, pageTarget("characters", { selectedCharacterId: character.id }), character.name);
    }
  }

  for (const worldBook of project.worldBooks) {
    add({
      id: `worldbook:${worldBook.id}`,
      sourceType: "worldbook",
      sourceLabel: "世界书",
      title: worldBook.name || "未命名世界书",
      subtitle: `${worldBook.entries.length} 条目`,
      fields: [
        field("世界书名", worldBook.name, 10),
        field("描述", worldBook.description, 6),
        field("条目名", worldBook.entries.map((entry) => entry.name ?? entry.comment), 5),
        field("关键词", worldBook.entries.flatMap((entry) => [...entry.keys, ...entry.secondaryKeys]), 7),
        field("条目内容", worldBook.entries.map((entry) => entry.content), 4)
      ],
      target: pageTarget("worldbooks", { selectedWorldBookId: worldBook.id }),
      updatedAt: worldBook.updatedAt
    });

    for (const entry of worldBook.entries) {
      add({
        id: `worldbook-entry:${worldBook.id}:${entry.id}`,
        sourceType: "worldbook-entry",
        sourceLabel: "世界书条目",
        title: entry.name || entry.comment || "未命名条目",
        subtitle: worldBook.name,
        fields: [
          field("条目名", entry.name, 10),
          field("注释", entry.comment, 7),
          field("关键词", entry.keys, 8),
          field("次级关键词", entry.secondaryKeys, 7),
          field("内容", entry.content, 7),
          field("位置", entry.position, 2),
          field("条件", entry.conditions, 3),
          field("扩展", entry.extensions, 2)
        ],
        target: pageTarget("worldbooks", { selectedWorldBookId: worldBook.id }),
        updatedAt: worldBook.updatedAt
      });
    }
  }

  for (const asset of project.assets) {
    add({
      id: `asset:${asset.id}`,
      sourceType: "asset",
      sourceLabel: "资源",
      title: asset.name || "未命名资源",
      subtitle: `${asset.type}${asset.mimeType ? ` / ${asset.mimeType}` : ""}`,
      fields: [
        field("资源名", asset.name, 10),
        field("类型", asset.type, 4),
        field("用途", asset.purpose, 6),
        field("来源", asset.source, 3),
        field("MIME", asset.mimeType, 3),
        field("路径", asset.path, 4),
        field("标签", asset.tags, 7),
        field("备注", asset.notes, 6),
        field("关联角色", asset.linkedCharacterIds.map((id) => project.characters.find((character) => character.id === id)?.name ?? id), 5),
        field("关联世界书", asset.linkedWorldBookIds.map((id) => project.worldBooks.find((book) => book.id === id)?.name ?? id), 5)
      ],
      target: pageTarget("assets", { selectedAssetId: asset.id }),
      updatedAt: asset.updatedAt
    });
  }

  for (const provider of project.aiProviders) {
    add({
      id: `ai-provider:${provider.id}`,
      sourceType: "ai-provider",
      sourceLabel: "AI Provider",
      title: provider.name || "未命名 Provider",
      subtitle: provider.defaultModel,
      fields: [
        field("Provider 名称", provider.name, 10),
        field("类型", provider.providerType, 5),
        field("Base URL", provider.baseUrl, 4),
        field("代理转发", provider.proxyUrl, 3),
        field("默认模型", provider.defaultModel, 8),
        field("模型列表", provider.models, 4),
        field("默认任务", provider.defaultTaskTypes, 6),
        field("能力", provider.capabilities, 4)
      ],
      target: pageTarget("ai", { selectedProviderId: provider.id }),
      updatedAt: provider.updatedAt
    });
  }

  for (const preset of project.aiPresets) {
    add({
      id: `ai-preset:${preset.id}`,
      sourceType: "ai-preset",
      sourceLabel: "AI 预设",
      title: preset.name || "未命名预设",
      subtitle: `${preset.taskType} / ${preset.outputMode}`,
      fields: [
        field("预设名", preset.name, 10),
        field("描述", preset.description, 6),
        field("任务类型", preset.taskType, 7),
        field("模型覆盖", preset.modelOverride, 5),
        field("系统提示", preset.systemPrompt, 6),
        field("用户模板", preset.userPromptTemplate, 7),
        field("输出模式", preset.outputMode, 4),
        field("变量", preset.variables, 5),
        field("Schema", preset.outputSchema, 3)
      ],
      target: pageTarget("ai", { selectedProviderId: preset.providerId }),
      updatedAt: project.updatedAt
    });
  }

  for (const log of project.aiLogs ?? []) {
    add({
      id: `ai-log:${log.id}`,
      sourceType: "ai-log",
      sourceLabel: "AI 调用",
      title: `${log.taskType} / ${log.model}`,
      subtitle: `${log.success ? "success" : "error"} / ${log.totalTokens} tokens`,
      fields: [
        field("任务", log.taskType, 9),
        field("Provider", log.providerName, 7),
        field("模型", log.model, 7),
        field("状态", log.success ? "success" : "error", 5),
        field("错误", log.errorMessage, 8),
        field("原始输出", log.rawOutput, 5),
        field("Token", [log.inputTokens, log.outputTokens, log.totalTokens], 3)
      ],
      target: pageTarget("ai", { selectedProviderId: log.providerId }),
      updatedAt: log.createdAt
    });
  }

  for (const session of project.tests) {
    add({
      id: `test-session:${session.id}`,
      sourceType: "test-session",
      sourceLabel: "测试记录",
      title: session.name || "未命名测试",
      subtitle: `${session.testCaseName ?? "自由测试"} / ${session.status ?? "untagged"} / ${session.messages.length} 消息`,
      fields: [
        field("记录名", session.name, 10),
        field("测试用例", [session.testCaseName, session.testCaseId], 8),
        field("状态", session.status, 6),
        field("失败备注", session.failureNotes, 8),
        field("角色", project.characters.find((character) => character.id === session.characterId)?.name ?? session.characterId, 6),
        field("世界书", project.worldBooks.find((book) => book.id === session.worldBookId)?.name ?? session.worldBookId, 5),
        field("消息", session.messages.map((message) => `${message.role}: ${message.content}`), 7),
        field("Prompt", session.promptPreview, 6),
        field("Prompt 链路", session.promptSections?.map((section) => [section.label, section.source, section.position, section.content]), 6),
        field("触发条目", session.triggeredEntries.map((entry) => [entry.entryName, entry.matchedKeys, entry.reason, entry.content]), 6),
        field("诊断", session.diagnostics.map((issue) => `${issue.level}: ${issue.scope} ${issue.message}`), 6)
      ],
      target: pageTarget("test", {
        selectedCharacterId: session.characterId,
        selectedWorldBookId: session.worldBookId,
        selectedProviderId: session.providerId
      }),
      updatedAt: session.updatedAt
    });
  }

  for (const testCase of project.testCases ?? []) {
    add({
      id: `test-case:${testCase.id}`,
      sourceType: "test-case",
      sourceLabel: "测试用例",
      title: testCase.name || "未命名测试用例",
      subtitle: `${testCase.enabled ? "enabled" : "disabled"} / ${testCase.tags.join(", ") || "无标签"}`,
      fields: [
        field("用例名", testCase.name, 10),
        field("提示词", testCase.prompt, 8),
        field("期望", testCase.expected, 7),
        field("标签", testCase.tags, 6),
        field("状态", testCase.enabled ? "enabled" : "disabled", 3)
      ],
      target: pageTarget("test"),
      updatedAt: testCase.updatedAt
    });
  }

  for (const snapshot of project.versions) {
    const targetCharacter = snapshot.targetType === "character" ? project.characters.find((character) => character.id === snapshot.targetId) : undefined;
    add({
      id: `version:${snapshot.id}`,
      sourceType: "version",
      sourceLabel: "版本快照",
      title: snapshot.label || "未命名快照",
      subtitle: targetCharacter?.name ?? snapshot.targetType,
      fields: [
        field("快照名", snapshot.label, 10),
        field("备注", snapshot.notes, 7),
        field("目标", [snapshot.targetType, targetCharacter?.name, snapshot.targetId], 6),
        field("差异", snapshot.diffSummary?.map((diff) => `${diff.field}: ${diff.before} => ${diff.after}`), 6),
        field("数据", snapshot.data, 3)
      ],
      target: pageTarget(targetCharacter ? "characters" : "dashboard", { selectedCharacterId: targetCharacter?.id }),
      updatedAt: snapshot.createdAt
    });
  }

  for (const record of project.exports) {
    add({
      id: `export:${record.id}`,
      sourceType: "export",
      sourceLabel: "导出记录",
      title: record.outputPath || record.format,
      subtitle: record.format,
      fields: [
        field("格式", record.format, 8),
        field("输出路径", record.outputPath, 9),
        field("角色", record.characterId ? project.characters.find((character) => character.id === record.characterId)?.name ?? record.characterId : undefined, 6),
        field("世界书", record.worldBookIds.map((id) => project.worldBooks.find((book) => book.id === id)?.name ?? id), 5),
        field("资源", record.assetIds.map((id) => project.assets.find((asset) => asset.id === id)?.name ?? id), 5),
        field("警告", record.warnings, 6)
      ],
      target: pageTarget("export", {
        selectedCharacterId: record.characterId,
        selectedWorldBookId: record.worldBookIds[0],
        selectedAssetId: record.assetIds[0]
      }),
      updatedAt: record.createdAt
    });
  }

  for (const rule of project.advanced.regexRules) {
    add({
      id: `regex:${rule.id}`,
      sourceType: "regex",
      sourceLabel: "Regex",
      title: rule.name || "未命名正则",
      subtitle: `${rule.target} / ${rule.enabled ? "enabled" : "disabled"}`,
      fields: [
        field("规则名", rule.name, 10),
        field("Pattern", rule.pattern, 9),
        field("Replacement", rule.replacement, 7),
        field("Flags", rule.flags, 3),
        field("目标", rule.target, 5),
        field("标签", rule.tags, 5),
        field("备注", rule.notes, 6)
      ],
      target: pageTarget("advanced"),
      updatedAt: rule.updatedAt
    });
  }

  add({
    id: `variables:${project.advanced.variableSystem.id}`,
    sourceType: "variables",
    sourceLabel: "变量系统",
    title: project.advanced.variableSystem.name || "变量系统",
    subtitle: "Variable Lab",
    fields: [
      field("变量系统名", project.advanced.variableSystem.name, 10),
      field("当前状态", project.advanced.variableSystem.state, 8),
      field("历史", project.advanced.variableSystem.history.map((snapshot) => [snapshot.label, snapshot.state]), 5)
    ],
    target: pageTarget("advanced"),
    updatedAt: project.advanced.variableSystem.updatedAt
  });

  for (const script of project.advanced.scripts) {
    add({
      id: `script:${script.id}`,
      sourceType: "script",
      sourceLabel: "脚本",
      title: script.name || "未命名脚本",
      subtitle: `${script.language} / ${script.trigger}`,
      fields: [
        field("脚本名", script.name, 10),
        field("语言", script.language, 5),
        field("触发器", script.trigger, 5),
        field("源码", script.source, 8),
        field("权限", script.permissions, 5),
        field("兼容性", script.compatibility, 4),
        field("备注", script.notes, 6)
      ],
      target: pageTarget("advanced"),
      updatedAt: script.updatedAt
    });
  }

  for (const frontendPackage of project.advanced.frontendPackages) {
    add({
      id: `frontend:${frontendPackage.id}`,
      sourceType: "frontend",
      sourceLabel: "前端卡",
      title: frontendPackage.name || "未命名前端卡",
      subtitle: frontendPackage.allowScripts ? "允许受限脚本" : "脚本禁用",
      fields: [
        field("前端包名", frontendPackage.name, 10),
        field("HTML", frontendPackage.html, 8),
        field("CSS", frontendPackage.css, 6),
        field("JS", frontendPackage.js, 6),
        field("Manifest", frontendPackage.manifest, 5),
        field("资源", (frontendPackage.assetIds ?? []).map((id) => project.assets.find((asset) => asset.id === id)?.name ?? id), 5)
      ],
      target: pageTarget("advanced"),
      updatedAt: frontendPackage.updatedAt
    });
  }

  for (const plugin of project.advanced.plugins) {
    add({
      id: `plugin:${plugin.id}`,
      sourceType: "plugin",
      sourceLabel: "插件",
      title: plugin.name || "未命名插件",
      subtitle: `${plugin.version} / ${plugin.enabled ? "enabled" : "disabled"}`,
      fields: [
        field("插件名", plugin.name, 10),
        field("版本", plugin.version, 4),
        field("入口", plugin.main, 5),
        field("权限", plugin.permissions, 6),
        field("Contributes", plugin.contributes, 5),
        field("备注", plugin.notes, 6)
      ],
      target: pageTarget("advanced"),
      updatedAt: project.updatedAt
    });
  }

  for (const report of project.advanced.compatibilityReports) {
    addCompatibilityReport(report, add, pageTarget("advanced"));
  }

  return documents;
}

function addCompatibilityReport(
  report: CompatibilityReport,
  add: (document: SearchDocument) => void,
  target: SearchTarget,
  owner?: string
) {
  add({
    id: `compatibility-report:${target.selectedCharacterId ?? "project"}:${report.id}`,
    sourceType: "compatibility-report",
    sourceLabel: "兼容报告",
    title: report.source || "导入扫描报告",
    subtitle: owner ? `${owner} / ${report.level}` : `${report.detected.format} / ${report.level}`,
    fields: [
      field("来源", report.source, 10),
      field("所属", owner, 6),
      field("格式", report.detected.format, 7),
      field("等级", report.level, 5),
      field("卡类型", report.cardKind, 5),
      field("建议模式", report.suggestedMode, 5),
      field("检测结果", report.detected, 5),
      field("依赖", report.dependencies.map((dependency) => `${dependency.type}: ${dependency.label} ${dependency.evidence}`), 6),
      field("只读原因", report.readonlyReasons, 6),
      field("建议操作", report.recommendedActions, 6),
      field("备注", report.notes, 5),
      field("缺失字段", report.fieldCompleteness.missing, 5)
    ],
    target,
    updatedAt: report.createdAt
  });
}

function scoreDocument(document: SearchDocument, tokens: string[]): ProjectSearchResult | undefined {
  const titleText = normalizeForSearch(document.title);
  const subtitleText = normalizeForSearch(document.subtitle ?? "");
  const searchableFields = document.fields
    .map((item) => ({ ...item, text: textValue(item.value), normalized: normalizeForSearch(textValue(item.value)) }))
    .filter((item) => item.normalized);
  const haystack = [titleText, subtitleText, ...searchableFields.map((item) => item.normalized)].join(" ");
  if (!tokens.every((token) => haystack.includes(token))) return undefined;

  let score = 0;
  for (const token of tokens) {
    if (titleText === token) score += 120;
    else if (titleText.startsWith(token)) score += 70;
    else if (titleText.includes(token)) score += 46;
    if (subtitleText.includes(token)) score += 12;

    for (const fieldItem of searchableFields) {
      if (!fieldItem.normalized.includes(token)) continue;
      const occurrences = Math.min(countOccurrences(fieldItem.normalized, token), 4);
      score += occurrences * (fieldItem.weight ?? 4);
    }
  }

  const matchedFields = searchableFields
    .filter((item) => tokens.some((token) => item.normalized.includes(token)))
    .map((item) => item.label)
    .filter((label, index, labels) => labels.indexOf(label) === index)
    .slice(0, 5);
  const excerpt = buildExcerpt(searchableFields, tokens) || document.subtitle || document.sourceLabel;
  const recencyScore = document.updatedAt ? Math.min(8, Math.max(0, Math.floor((document.updatedAt - 1_600_000_000_000) / 100_000_000_000))) : 0;

  return {
    id: document.id,
    sourceType: document.sourceType,
    sourceLabel: document.sourceLabel,
    title: document.title,
    subtitle: document.subtitle,
    excerpt,
    matchedFields,
    target: document.target,
    score: score + recencyScore
  };
}

function field(label: string, value: unknown, weight?: number): SearchField {
  return { label, value, weight };
}

function tokenizeQuery(query: string): string[] {
  return normalizeForSearch(query)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token, index, tokens) => tokens.indexOf(token) === index);
}

function normalizeForSearch(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKC")
    .replace(/[，。！？、；：“”‘’（）【】《》]/g, " ")
    .replace(/[^\p{L}\p{N}_./:-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return compact(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return compact(value.map(textValue).filter(Boolean).join(" "));
  try {
    return compact(JSON.stringify(value, redactor));
  } catch {
    return String(value);
  }
}

function redactor(key: string, value: unknown): unknown {
  if (["apiKey", "dataUrl", "thumbnailUrl", "raw"].includes(key)) return undefined;
  return value;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildExcerpt(fields: Array<SearchField & { text: string; normalized: string }>, tokens: string[]): string {
  for (const fieldItem of fields) {
    const token = tokens.find((item) => fieldItem.normalized.includes(item));
    if (!token) continue;
    const index = fieldItem.normalized.indexOf(token);
    return `${fieldItem.label}: ${clipAround(fieldItem.text, index, token.length)}`;
  }
  return "";
}

function clipAround(text: string, index: number, tokenLength: number): string {
  if (text.length <= 140) return text;
  const start = Math.max(0, index - 48);
  const end = Math.min(text.length, index + tokenLength + 72);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function countOccurrences(text: string, token: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    const found = text.indexOf(token, index);
    if (found === -1) break;
    count += 1;
    index = found + token.length;
  }
  return count;
}
