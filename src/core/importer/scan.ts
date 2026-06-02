import { uid } from "../schema/defaults";
import type { CompatibilityDependency, CompatibilityReport, ProjectMode } from "../schema/types";

type ScanOptions = {
  source: string;
  raw: unknown;
  embeddedWorldBook: boolean;
  extensions: Record<string, unknown>;
};

const coreFields = ["name", "description", "personality", "scenario", "first_mes", "mes_example"];

export function scanCompatibility(options: ScanOptions): CompatibilityReport {
  const rawText = safeStringify(options.raw);
  const lower = rawText.toLowerCase();
  const data = getDataObject(options.raw);
  const completeness = scanFieldCompleteness(data);
  const entryCount = countWorldBookEntries(data.character_book ?? data.characterBook ?? (data as Record<string, unknown>).book);
  const dependencies = collectDependencies(lower, options.embeddedWorldBook, options.extensions, entryCount);
  const detected = {
    format: options.source,
    embeddedWorldBook: options.embeddedWorldBook,
    regex: dependencies.some((item) => item.type === "regex"),
    mvu: dependencies.some((item) => item.type === "mvu"),
    scripts: dependencies.some((item) => item.type === "script"),
    frontend: dependencies.some((item) => item.type === "frontend"),
    extensions: Object.keys(options.extensions ?? {}).length > 0
  };
  const advancedSignals = dependencies.filter((item) => item.type !== "worldbook" && item.type !== "extension").length;
  const worldBookSignal = entryCount > 0 ? 1 : 0;
  const sparseCharacterSignal = String(data.description ?? "").trim().length < 80 && entryCount >= 5 ? 1 : 0;
  const score = advancedSignals + worldBookSignal + sparseCharacterSignal;
  const cardKind: CompatibilityReport["cardKind"] =
    score >= 3 || entryCount >= 12 ? "heavy" : score >= 1 ? "medium" : completeness.score >= 0.6 ? "light" : "unknown";
  const suggestedMode: ProjectMode = cardKind === "light" ? "light" : "advanced";
  const readonlyReasons = buildReadonlyReasons(cardKind, dependencies);
  const level = resolveLevel(cardKind, detected, readonlyReasons);
  return {
    id: uid("compat"),
    source: options.source,
    level,
    cardKind,
    suggestedMode,
    importedAsReadonly: readonlyReasons.length > 0,
    fieldCompleteness: completeness,
    detected,
    dependencies,
    readonlyReasons,
    recommendedActions: buildActions(cardKind, detected, completeness, readonlyReasons),
    notes: buildNotes(options.embeddedWorldBook, detected, cardKind, entryCount),
    createdAt: Date.now()
  };
}

function collectDependencies(
  lower: string,
  embeddedWorldBook: boolean,
  extensions: Record<string, unknown>,
  entryCount: number
): CompatibilityDependency[] {
  const dependencies: CompatibilityDependency[] = [];
  if (embeddedWorldBook) {
    dependencies.push({
      type: "worldbook",
      label: "内嵌世界书",
      evidence: entryCount ? `${entryCount} 条条目` : "character_book"
    });
  }
  addWhen(dependencies, /regex|正则|replace|substitute|substitution|scripted_regex/.test(lower), "regex", "正则规则", "regex / replace / substitute");
  addWhen(dependencies, /mvu|_\.(set|assign|update)|变量|variable|stat_data|状态栏|好感度/.test(lower), "mvu", "MVU / 变量系统", "mvu / _.set / variable");
  addWhen(dependencies, /stscript|quick[\s_-]?reply|javascript|script|on_chat|execute/.test(lower), "script", "脚本 / Quick Reply", "script / stscript / quick reply");
  addWhen(dependencies, /<html|<style|<script|frontend|iframe|document\.|<button/.test(lower), "frontend", "前端卡界面", "html / style / script / frontend");
  addWhen(dependencies, /plugin|插件|extension|酒馆助手|sillytavern|tavern/.test(lower), "plugin", "第三方扩展依赖", "plugin / extension / SillyTavern");
  if (Object.keys(extensions ?? {}).length) {
    dependencies.push({
      type: "extension",
      label: "extensions",
      evidence: Object.keys(extensions).slice(0, 6).join(", ")
    });
  }
  return dedupeDependencies(dependencies);
}

function addWhen(
  dependencies: CompatibilityDependency[],
  condition: boolean,
  type: CompatibilityDependency["type"],
  label: string,
  evidence: string
) {
  if (condition) dependencies.push({ type, label, evidence });
}

function dedupeDependencies(dependencies: CompatibilityDependency[]): CompatibilityDependency[] {
  const seen = new Set<string>();
  return dependencies.filter((item) => {
    const key = `${item.type}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scanFieldCompleteness(data: Record<string, unknown>): CompatibilityReport["fieldCompleteness"] {
  const missing = coreFields.filter((field) => !String(data[field] ?? "").trim());
  const filled = coreFields.length - missing.length;
  return {
    filled,
    total: coreFields.length,
    missing,
    score: Number((filled / coreFields.length).toFixed(2))
  };
}

function buildReadonlyReasons(cardKind: CompatibilityReport["cardKind"], dependencies: CompatibilityDependency[]): string[] {
  const reasons: string[] = [];
  if (cardKind === "heavy") reasons.push("检测为重型卡，复杂依赖默认按只读线索导入。");
  for (const dependency of dependencies) {
    if (dependency.type === "script") reasons.push("脚本内容默认禁用，仅静态查看。");
    if (dependency.type === "frontend") reasons.push("前端卡代码仅在 iframe sandbox 中预览。");
    if (dependency.type === "plugin") reasons.push("第三方插件依赖不会自动安装或执行。");
  }
  return [...new Set(reasons)];
}

function resolveLevel(
  cardKind: CompatibilityReport["cardKind"],
  detected: CompatibilityReport["detected"],
  readonlyReasons: string[]
): CompatibilityReport["level"] {
  if (readonlyReasons.length && cardKind === "heavy") return "readonly";
  if (detected.scripts || detected.frontend || detected.mvu || detected.regex) return "partial";
  if (cardKind === "unknown") return "partial";
  return "full";
}

function buildActions(
  cardKind: CompatibilityReport["cardKind"],
  detected: CompatibilityReport["detected"],
  completeness: CompatibilityReport["fieldCompleteness"],
  readonlyReasons: string[]
): string[] {
  const actions: string[] = [];
  if (cardKind !== "light") actions.push("建议切换到高级工程模式查看依赖。");
  if (detected.embeddedWorldBook) actions.push("进入世界书页测试关键词触发。");
  if (detected.regex) actions.push("在 Regex Lab 中复核替换规则。");
  if (detected.mvu) actions.push("在 Variable Lab 中查看变量树和 MVU 命令。");
  if (detected.scripts) actions.push("在 Script Manager 中静态审阅脚本，确认后再启用。");
  if (detected.frontend) actions.push("在 Frontend Sandbox 中用受限 iframe 预览。");
  if (completeness.missing.length) actions.push(`补齐缺失字段：${completeness.missing.join(", ")}。`);
  if (readonlyReasons.length) actions.push("保留原始 JSON，确认依赖后再进行深度转换。");
  return actions.length ? actions : ["可按轻量制卡流程继续编辑和导出。"];
}

function buildNotes(
  embeddedWorldBook: boolean,
  detected: CompatibilityReport["detected"],
  cardKind: CompatibilityReport["cardKind"],
  entryCount: number
): string[] {
  return [
    `识别类型：${cardKind}。`,
    embeddedWorldBook ? `检测到内嵌世界书${entryCount ? `（约 ${entryCount} 条）` : ""}并已转换。` : "未检测到内嵌世界书。",
    detected.scripts ? "检测到脚本痕迹，默认只做静态查看。" : "未检测到脚本痕迹。",
    detected.frontend ? "检测到前端卡痕迹，可在高级沙盒中静态预览。" : "未检测到前端卡痕迹。"
  ];
}

function countWorldBookEntries(book: unknown): number {
  if (!book || typeof book !== "object") return 0;
  const entries = (book as Record<string, unknown>).entries;
  if (Array.isArray(entries)) return entries.length;
  if (entries && typeof entries === "object") return Object.keys(entries).length;
  return 0;
}

function getDataObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  if (record.data && typeof record.data === "object") return record.data as Record<string, unknown>;
  return record;
}

function safeStringify(raw: unknown): string {
  try {
    return JSON.stringify(raw) ?? "";
  } catch {
    return String(raw);
  }
}

