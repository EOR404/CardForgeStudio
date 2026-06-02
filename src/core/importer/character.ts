import { createCharacterDraft, createFrontendPackageDraft, createRegexRuleDraft, createScriptDraft, createWorldBookDraft, createWorldBookEntryDraft, uid } from "../schema/defaults";
import type {
  CardScript,
  FrontendCardPackage,
  ImportedSource,
  InternalCharacter,
  InternalWorldBook,
  RegexRule,
  WorldBookEntry
} from "../schema/types";
import { v2CardSchema, v3CardSchema } from "../schema/validators";
import { applyVariableDiffs, parseMvuSetCommands } from "../variable-system/mvu";
import { normalizeWorldBookCategory } from "../worldbook/classify";
import { scanCompatibility } from "./scan";

export type ImportCharacterResult = {
  character: InternalCharacter;
  embeddedWorldBook?: InternalWorldBook;
  frontendPackage?: FrontendCardPackage;
  importedScripts?: CardScript[];
  importedRegexRules?: RegexRule[];
  importedVariableState?: Record<string, unknown>;
  report: ReturnType<typeof scanCompatibility>;
};

export function importCharacterJson(input: unknown, fileName?: string): ImportCharacterResult {
  const importedAt = Date.now();
  const v3 = v3CardSchema.safeParse(input);
  if (v3.success) {
    return importV3Character(v3.data, input, importedAt, fileName);
  }
  const v2 = v2CardSchema.safeParse(input);
  if (v2.success) {
    return importV2Character(v2.data, input, importedAt, fileName);
  }
  if (isLikelyV1(input)) {
    return importV1Character(input as Record<string, unknown>, importedAt, fileName);
  }
  return importGenericJson(input, importedAt, fileName);
}

function importV3Character(card: ReturnType<typeof v3CardSchema.parse>, raw: unknown, importedAt: number, fileName?: string): ImportCharacterResult {
  const result = importV2Character(
    {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: card.data.name,
        description: card.data.description,
        personality: card.data.personality ?? "",
        scenario: card.data.scenario ?? "",
        first_mes: card.data.first_mes ?? "",
        mes_example: card.data.mes_example ?? "",
        creator_notes: card.data.creator_notes ?? "",
        system_prompt: card.data.system_prompt ?? "",
        post_history_instructions: card.data.post_history_instructions ?? "",
        alternate_greetings: card.data.alternate_greetings ?? [],
        character_book: card.data.character_book ?? null,
        tags: card.data.tags ?? [],
        creator: card.data.creator ?? "",
        character_version: card.data.character_version ?? "",
        extensions: card.data.extensions ?? {}
      }
    },
    raw,
    importedAt,
    fileName
  );
  result.character.originalSource = { format: "v3", fileName, raw, importedAt };
  result.report.source = "Character Card V3";
  result.report.detected.format = "Character Card V3";
  result.report.level = result.report.level === "full" ? "partial" : result.report.level;
  result.report.notes.unshift("已按实验性 V3 兼容层导入，非 CardForge 原生字段保留在 extensions / originalSource。");
  result.character.compatibilityReports = [result.report];
  return result;
}

function importV2Character(card: ReturnType<typeof v2CardSchema.parse>, raw: unknown, importedAt: number, fileName?: string): ImportCharacterResult {
  const source: ImportedSource = { format: "v2", fileName, raw, importedAt };
  const character = createCharacterDraft(card.data.name || "导入角色");
  const extensions = card.data.extensions ?? {};
  let embeddedWorldBook: InternalWorldBook | undefined;
  if (card.data.character_book) {
    embeddedWorldBook = importWorldBookJson(card.data.character_book, `${card.data.name || "角色"} 内嵌世界书`);
    character.characterBookId = embeddedWorldBook.id;
    character.linkedWorldBooks = [embeddedWorldBook.id];
  }
  Object.assign(character, {
    name: card.data.name,
    description: card.data.description,
    personality: card.data.personality,
    scenario: card.data.scenario,
    firstMessage: card.data.first_mes,
    exampleMessages: card.data.mes_example,
    creatorNotes: card.data.creator_notes ?? "",
    systemPrompt: card.data.system_prompt ?? "",
    postHistoryInstructions: card.data.post_history_instructions ?? "",
    alternateGreetings: card.data.alternate_greetings ?? [],
    tags: card.data.tags ?? [],
    creator: card.data.creator ?? "",
    version: card.data.character_version ?? "",
    extensions,
    originalSource: source,
    updatedAt: Date.now()
  });
  const report = scanCompatibility({
    source: "Character Card V2",
    raw,
    embeddedWorldBook: Boolean(embeddedWorldBook),
    extensions
  });
  const frontendPackage = extractFrontendPackage(raw, character.name);
  const importedScripts = extractScriptDrafts(raw, character.name);
  const importedRegexRules = extractRegexRules(raw, character.name);
  const importedVariableState = extractVariableState(raw);
  if (frontendPackage) {
    character.frontendPackageId = frontendPackage.id;
    report.notes.unshift("已提取前端卡片段并创建 Frontend Sandbox 草案。");
  }
  if (importedScripts.length) {
    character.linkedScripts = [...new Set([...character.linkedScripts, ...importedScripts.map((script) => script.id)])];
    report.notes.unshift("已提取脚本片段并创建 Script Manager 草案，默认禁用。");
  }
  if (importedRegexRules.length) {
    character.linkedRegexRules = [...new Set([...character.linkedRegexRules, ...importedRegexRules.map((rule) => rule.id)])];
    report.notes.unshift("已提取正则片段并创建 Regex Lab 规则。");
  }
  if (importedVariableState) {
    report.notes.unshift("已提取变量状态，导入项目时会合并到 Variable Lab。");
  }
  character.compatibilityReports = [report];
  return { character, embeddedWorldBook, frontendPackage, importedScripts, importedRegexRules, importedVariableState, report };
}

function importV1Character(card: Record<string, unknown>, importedAt: number, fileName?: string): ImportCharacterResult {
  const source: ImportedSource = { format: "v1", fileName, raw: card, importedAt };
  const character = createCharacterDraft(stringField(card.name, "导入角色"));
  Object.assign(character, {
    description: stringField(card.description),
    personality: stringField(card.personality),
    scenario: stringField(card.scenario),
    firstMessage: stringField(card.first_mes),
    exampleMessages: stringField(card.mes_example),
    originalSource: source,
    updatedAt: Date.now()
  });
  const report = scanCompatibility({
    source: "Character Card V1",
    raw: card,
    embeddedWorldBook: false,
    extensions: {}
  });
  const frontendPackage = extractFrontendPackage(card, character.name);
  const importedScripts = extractScriptDrafts(card, character.name);
  const importedRegexRules = extractRegexRules(card, character.name);
  const importedVariableState = extractVariableState(card);
  if (frontendPackage) {
    character.frontendPackageId = frontendPackage.id;
    report.notes.unshift("已提取前端卡片段并创建 Frontend Sandbox 草案。");
  }
  if (importedScripts.length) {
    character.linkedScripts = [...new Set([...character.linkedScripts, ...importedScripts.map((script) => script.id)])];
    report.notes.unshift("已提取脚本片段并创建 Script Manager 草案，默认禁用。");
  }
  if (importedRegexRules.length) {
    character.linkedRegexRules = [...new Set([...character.linkedRegexRules, ...importedRegexRules.map((rule) => rule.id)])];
    report.notes.unshift("已提取正则片段并创建 Regex Lab 规则。");
  }
  if (importedVariableState) {
    report.notes.unshift("已提取变量状态，导入项目时会合并到 Variable Lab。");
  }
  report.notes.push("V1 字段已补全为空字符串；高级字段不存在。");
  character.compatibilityReports = [report];
  return { character, frontendPackage, importedScripts, importedRegexRules, importedVariableState, report };
}

function importGenericJson(input: unknown, importedAt: number, fileName?: string): ImportCharacterResult {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const character = createCharacterDraft(stringField(raw.name, "普通 JSON 导入"));
  Object.assign(character, {
    description: stringField(raw.description),
    personality: stringField(raw.personality),
    scenario: stringField(raw.scenario),
    firstMessage: stringField(raw.first_mes ?? raw.firstMessage),
    exampleMessages: stringField(raw.mes_example ?? raw.exampleMessages),
    extensions: { importedUnknownJson: raw },
    originalSource: { format: "unknown", fileName, raw: input, importedAt },
    updatedAt: Date.now()
  });
  const report = scanCompatibility({
    source: "Unknown JSON",
    raw: input,
    embeddedWorldBook: false,
    extensions: character.extensions
  });
  const frontendPackage = extractFrontendPackage(input, character.name);
  const importedScripts = extractScriptDrafts(input, character.name);
  const importedRegexRules = extractRegexRules(input, character.name);
  const importedVariableState = extractVariableState(input);
  if (frontendPackage) {
    character.frontendPackageId = frontendPackage.id;
    report.notes.unshift("已提取前端卡片段并创建 Frontend Sandbox 草案。");
  }
  if (importedScripts.length) {
    character.linkedScripts = [...new Set([...character.linkedScripts, ...importedScripts.map((script) => script.id)])];
    report.notes.unshift("已提取脚本片段并创建 Script Manager 草案，默认禁用。");
  }
  if (importedRegexRules.length) {
    character.linkedRegexRules = [...new Set([...character.linkedRegexRules, ...importedRegexRules.map((rule) => rule.id)])];
    report.notes.unshift("已提取正则片段并创建 Regex Lab 规则。");
  }
  if (importedVariableState) {
    report.notes.unshift("已提取变量状态，导入项目时会合并到 Variable Lab。");
  }
  report.level = "partial";
  report.notes.push("未识别为标准 V1/V2，已尽量映射同名字段并保留原始 JSON。");
  character.compatibilityReports = [report];
  return { character, frontendPackage, importedScripts, importedRegexRules, importedVariableState, report };
}

function extractVariableState(raw: unknown): Record<string, unknown> | undefined {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const extensions = data.extensions && typeof data.extensions === "object" ? (data.extensions as Record<string, unknown>) : {};
  const cardforge = extensions.cardforge && typeof extensions.cardforge === "object" ? (extensions.cardforge as Record<string, unknown>) : {};
  const candidates = [
    data.variables,
    data.variableState,
    data.variable_state,
    data.stat_data,
    data.statData,
    extensions.variables,
    extensions.variableState,
    extensions.variable_state,
    extensions.stat_data,
    extensions.statData,
    extensions.mvu,
    cardforge.variables,
    cardforge.variableState,
    cardforge.mvu
  ];
  const merged = candidates.reduce<Record<string, unknown>>((state, candidate) => deepMergeRecords(state, variableStateFromCandidate(candidate)), {});
  return Object.keys(merged).length ? merged : undefined;
}

function variableStateFromCandidate(candidate: unknown): Record<string, unknown> {
  if (candidate === undefined || candidate === null) return {};
  if (typeof candidate === "string") {
    const text = candidate.trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return variableStateFromCandidate(parsed);
    } catch {
      const commands = parseMvuSetCommands(text);
      return commands.length ? applyVariableDiffs({}, commands).state : {};
    }
  }
  if (Array.isArray(candidate)) {
    return candidate.reduce<Record<string, unknown>>((state, item) => deepMergeRecords(state, variableStateFromCandidate(item)), {});
  }
  if (!isRecord(candidate)) return {};
  const nested =
    candidate.state ??
    candidate.variables ??
    candidate.variableState ??
    candidate.variable_state ??
    candidate.stat_data ??
    candidate.statData;
  if (nested !== undefined) return variableStateFromCandidate(nested);
  const commandText = stringField(candidate.command ?? candidate.commands ?? candidate.mvu);
  if (commandText.trim()) return variableStateFromCandidate(commandText);
  return cloneRecord(candidate);
}

function extractRegexRules(raw: unknown, fallbackName: string): RegexRule[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const extensions = data.extensions && typeof data.extensions === "object" ? (data.extensions as Record<string, unknown>) : {};
  const cardforge = extensions.cardforge && typeof extensions.cardforge === "object" ? (extensions.cardforge as Record<string, unknown>) : {};
  const candidates: Array<{ value: unknown; label: string }> = [
    { value: data.regex, label: "regex" },
    { value: data.regexes, label: "regexes" },
    { value: data.regexRules, label: "regexRules" },
    { value: data.regex_rules, label: "regex_rules" },
    { value: data.substitutions, label: "substitutions" },
    { value: data.substitution, label: "substitution" },
    { value: extensions.regex, label: "extensions.regex" },
    { value: extensions.regexes, label: "extensions.regexes" },
    { value: extensions.regexRules, label: "extensions.regexRules" },
    { value: extensions.regex_rules, label: "extensions.regex_rules" },
    { value: extensions.substitutions, label: "extensions.substitutions" },
    { value: cardforge.regex, label: "cardforge.regex" },
    { value: cardforge.regexRules, label: "cardforge.regexRules" }
  ];
  const rules = candidates.flatMap(({ value, label }) => regexRulesFromCandidate(value, fallbackName, label));
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.pattern}:${rule.replacement}:${rule.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function regexRulesFromCandidate(candidate: unknown, fallbackName: string, label: string): RegexRule[] {
  if (candidate === undefined || candidate === null) return [];
  if (typeof candidate === "string") {
    const parsed = parseRegexString(candidate);
    if (!parsed) return [];
    return [createImportedRegexRule(fallbackName, parsed.pattern, parsed.replacement, parsed.flags, label)];
  }
  if (Array.isArray(candidate)) {
    return candidate.flatMap((item, index) => regexRulesFromCandidate(item, fallbackName, `${label} ${index + 1}`));
  }
  if (typeof candidate !== "object") return [];
  const record = candidate as Record<string, unknown>;
  const pattern = stringField(record.pattern ?? record.find ?? record.match ?? record.regex ?? record.source).trim();
  const replacement = stringField(record.replacement ?? record.replace ?? record.substitute ?? record.substitution ?? record.with ?? record.value);
  if (!pattern && Object.keys(record).length) {
    return Object.entries(record).flatMap(([key, value]) => regexRulesFromCandidate(value, fallbackName, `${label}.${key}`));
  }
  if (!pattern) return [];
  return [
    createRegexRuleDraft({
      name: stringField(record.name ?? record.label ?? record.title, `${fallbackName} 导入正则`),
      pattern,
      replacement,
      flags: normalizeRegexFlags(record.flags),
      enabled: !Boolean(record.disabled ?? record.disable),
      target: normalizeRegexTarget(record.target ?? record.scope ?? label),
      order: numberField(record.order ?? record.insertionOrder, 100),
      tags: [...new Set(["imported", ...stringList(record.tags)])],
      notes: `从导入卡 ${label} 提取。请在 Regex Lab 复核目标和顺序。`
    })
  ];
}

function createImportedRegexRule(fallbackName: string, pattern: string, replacement: string, flags: string, label: string): RegexRule {
  return createRegexRuleDraft({
    name: `${fallbackName} 导入正则`,
    pattern,
    replacement,
    flags,
    target: normalizeRegexTarget(label),
    tags: ["imported"],
    notes: `从导入卡 ${label} 提取。请在 Regex Lab 复核目标和顺序。`
  });
}

function parseRegexString(value: string): { pattern: string; replacement: string; flags: string } | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const substitute = trimmed.match(/^s\/((?:\\\/|[^/])*)\/((?:\\\/|[^/])*)\/([a-z]*)$/i);
  if (substitute) {
    return {
      pattern: substitute[1].replace(/\\\//g, "/"),
      replacement: substitute[2].replace(/\\\//g, "/"),
      flags: normalizeRegexFlags(substitute[3])
    };
  }
  const literal = trimmed.match(/^\/((?:\\\/|[^/])*)\/([a-z]*)$/i);
  if (literal) {
    return {
      pattern: literal[1].replace(/\\\//g, "/"),
      replacement: "",
      flags: normalizeRegexFlags(literal[2])
    };
  }
  return undefined;
}

function normalizeRegexFlags(value: unknown): string {
  const flags = String(value ?? "g")
    .split("")
    .filter((flag, index, array) => /[dgimsuvy]/.test(flag) && array.indexOf(flag) === index)
    .join("");
  return flags || "g";
}

function normalizeRegexTarget(value: unknown): RegexRule["target"] {
  const text = String(value ?? "").toLowerCase();
  const targets: RegexRule["target"][] = ["user_input", "ai_output", "before_prompt", "after_prompt", "before_display", "variable_extract"];
  const exact = targets.find((target) => target === text);
  if (exact) return exact;
  if (/user|input/.test(text)) return "user_input";
  if (/prompt.*before|before.*prompt/.test(text)) return "before_prompt";
  if (/prompt.*after|after.*prompt/.test(text)) return "after_prompt";
  if (/display|before_display/.test(text)) return "before_display";
  if (/variable|mvu|extract/.test(text)) return "variable_extract";
  return "ai_output";
}

function extractScriptDrafts(raw: unknown, fallbackName: string): CardScript[] {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const extensions = data.extensions && typeof data.extensions === "object" ? (data.extensions as Record<string, unknown>) : {};
  const cardforge = extensions.cardforge && typeof extensions.cardforge === "object" ? (extensions.cardforge as Record<string, unknown>) : {};
  const candidates: Array<{ value: unknown; label: string }> = [
    { value: data.scripts, label: "scripts" },
    { value: data.script, label: "script" },
    { value: data.stscript, label: "stscript" },
    { value: data.quickReplies, label: "quick-reply" },
    { value: data.quick_replies, label: "quick-reply" },
    { value: data.quickReply, label: "quick-reply" },
    { value: data.quick_reply, label: "quick-reply" },
    { value: data.javascript, label: "javascript" },
    { value: data.js, label: "javascript" },
    { value: extensions.scripts, label: "extensions.scripts" },
    { value: extensions.script, label: "extensions.script" },
    { value: extensions.stscript, label: "extensions.stscript" },
    { value: extensions.quickReplies, label: "extensions.quick-reply" },
    { value: extensions.quick_replies, label: "extensions.quick-reply" },
    { value: extensions.quickReply, label: "extensions.quick-reply" },
    { value: extensions.quick_reply, label: "extensions.quick-reply" },
    { value: extensions.javascript, label: "extensions.javascript" },
    { value: extensions.js, label: "extensions.javascript" },
    { value: cardforge.scripts, label: "cardforge.scripts" }
  ];
  const scripts = candidates.flatMap(({ value, label }) => scriptsFromCandidate(value, fallbackName, label));
  const seen = new Set<string>();
  return scripts.filter((script) => {
    const key = `${script.language}:${script.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scriptsFromCandidate(candidate: unknown, fallbackName: string, label: string): CardScript[] {
  if (candidate === undefined || candidate === null) return [];
  if (typeof candidate === "string") {
    const source = candidate.trim();
    if (!looksLikeScriptSource(source, label)) return [];
    return [createImportedScript(fallbackName, source, label)];
  }
  if (Array.isArray(candidate)) {
    return candidate.flatMap((item, index) => scriptsFromCandidate(item, fallbackName, `${label} ${index + 1}`));
  }
  if (typeof candidate !== "object") return [];
  const record = candidate as Record<string, unknown>;
  const source = stringField(record.source ?? record.code ?? record.script ?? record.command ?? record.commands ?? record.content ?? record.value).trim();
  if (!source && Object.keys(record).length) {
    return Object.entries(record).flatMap(([key, value]) => scriptsFromCandidate(value, fallbackName, `${label}.${key}`));
  }
  if (!looksLikeScriptSource(source, label)) return [];
  return [
    createScriptDraft({
      name: stringField(record.name ?? record.label ?? record.title, `${fallbackName} 导入脚本`),
      language: normalizeScriptLanguage(record.language ?? record.type ?? label, source),
      source,
      trigger: normalizeScriptTrigger(record.trigger),
      permissions: stringList(record.permissions),
      enabled: false,
      compatibility: "partial",
      notes: `从导入卡 ${label} 提取。默认禁用，请审阅后再决定是否适配。`
    })
  ];
}

function createImportedScript(fallbackName: string, source: string, label: string): CardScript {
  return createScriptDraft({
    name: `${fallbackName} 导入脚本`,
    language: normalizeScriptLanguage(label, source),
    source,
    trigger: "manual",
    permissions: [],
    enabled: false,
    compatibility: "partial",
    notes: `从导入卡 ${label} 提取。默认禁用，请审阅后再决定是否适配。`
  });
}

function looksLikeScriptSource(source: string, label: string): boolean {
  if (!source) return false;
  if (/script|quick|stscript|javascript|js/i.test(label)) return true;
  return /(?:^|\n)\s*\/\w+|_\.(set|assign|update)\s*\(|\b(function|const|let|var|document\.|window\.|fetch\(|setTimeout\()/i.test(source);
}

function normalizeScriptLanguage(value: unknown, source: string): CardScript["language"] {
  const text = `${String(value ?? "")} ${source.slice(0, 120)}`.toLowerCase();
  if (/quick[\s_-]?reply|quick/.test(text)) return "quick-reply";
  if (/stscript|\/setvar|\/send|\/run|\/if|\/echo/.test(text)) return "stscript";
  if (/mvu|_\.(set|assign|update)/.test(text)) return "mvu";
  if (/template|handlebars|mustache/.test(text)) return "template";
  if (/javascript|\bjs\b|document\.|window\.|function|=>|const |let |var /.test(text)) return "javascript";
  return "custom";
}

function normalizeScriptTrigger(value: unknown): CardScript["trigger"] {
  const text = String(value ?? "");
  const triggers: CardScript["trigger"][] = [
    "manual",
    "on_project_open",
    "on_card_init",
    "before_prompt_build",
    "after_prompt_build",
    "before_user_message",
    "after_user_message",
    "before_ai_response",
    "after_ai_response",
    "on_regex_match",
    "on_variable_change",
    "on_frontend_confirm"
  ];
  return triggers.includes(text as CardScript["trigger"]) ? (text as CardScript["trigger"]) : "manual";
}

function extractFrontendPackage(raw: unknown, fallbackName: string): FrontendCardPackage | undefined {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const extensions = data.extensions && typeof data.extensions === "object" ? (data.extensions as Record<string, unknown>) : {};
  const candidates = [
    data.frontend,
    data.frontendPackage,
    data.frontend_package,
    data.frontend_card,
    data.ui,
    extensions.frontend,
    extensions.frontendPackage,
    extensions.frontend_package,
    extensions.cardforge && typeof extensions.cardforge === "object" ? (extensions.cardforge as Record<string, unknown>).frontend : undefined
  ];

  for (const candidate of candidates) {
    const frontend = frontendFromCandidate(candidate, fallbackName);
    if (frontend) return frontend;
  }
  return frontendFromCandidate(data, fallbackName);
}

function frontendFromCandidate(candidate: unknown, fallbackName: string): FrontendCardPackage | undefined {
  if (typeof candidate === "string") return frontendFromHtmlString(candidate, fallbackName);
  if (!candidate || typeof candidate !== "object") return undefined;
  const record = candidate as Record<string, unknown>;
  const html = stringField(record.html ?? record.indexHtml ?? record.index_html ?? record.template ?? record.body ?? record.markup ?? record.content);
  const css = stringField(record.css ?? record.style ?? record.styles);
  const js = stringField(record.js ?? record.javascript ?? record.script ?? record.mainJs ?? record.main_js);
  const manifest = record.manifest && typeof record.manifest === "object" ? (record.manifest as Record<string, unknown>) : { permissions: [] };
  if (!html.trim() && !css.trim() && !js.trim()) return undefined;
  return createFrontendPackageDraft({
    name: stringField(record.name, `${fallbackName} 前端卡`),
    html: html || "<main><p>导入的前端卡未提供 HTML。</p></main>",
    css,
    js,
    allowScripts: false,
    manifest: {
      ...manifest,
      importedFrom: "character.extensions"
    }
  });
}

function frontendFromHtmlString(value: string, fallbackName: string): FrontendCardPackage | undefined {
  if (!/<(?:html|body|main|section|div|button|style|script)\b/i.test(value)) return undefined;
  const css = extractTagBlocks(value, "style").join("\n");
  const js = extractTagBlocks(value, "script").join("\n");
  const html = value
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .trim();
  return createFrontendPackageDraft({
    name: `${fallbackName} 前端卡`,
    html: html || "<main><p>导入的前端卡仅包含样式或脚本。</p></main>",
    css,
    js,
    allowScripts: false,
    manifest: { permissions: [], importedFrom: "character.extensions" }
  });
}

function extractTagBlocks(value: string, tagName: "style" | "script"): string[] {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  return [...value.matchAll(pattern)].map((match) => match[1].trim()).filter(Boolean);
}

export function importWorldBookJson(input: unknown, fallbackName = "导入世界书"): InternalWorldBook {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const worldBook = createWorldBookDraft(stringField(raw.name, fallbackName));
  worldBook.description = stringField(raw.description);
  worldBook.scanDepth = numberField(raw.scan_depth ?? raw.scanDepth, 2);
  worldBook.tokenBudget = numberField(raw.token_budget ?? raw.tokenBudget, 1200);
  worldBook.recursiveScanning = Boolean(raw.recursive_scanning ?? raw.recursiveScanning);
  const entries = raw.entries;
  if (Array.isArray(entries)) {
    worldBook.entries = entries.map((entry, index) => importWorldBookEntry(entry, index));
  } else if (entries && typeof entries === "object") {
    worldBook.entries = Object.values(entries).map((entry, index) => importWorldBookEntry(entry, index));
  }
  worldBook.updatedAt = Date.now();
  return worldBook;
}

function importWorldBookEntry(input: unknown, index: number): WorldBookEntry {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  return createWorldBookEntryDraft({
    id: String(raw.uid ?? raw.id ?? uid("wbe")),
    name: stringField(raw.name ?? raw.comment),
    comment: stringField(raw.comment ?? raw.name),
    category: normalizeWorldBookCategory(raw.category ?? cardforgeExtension(raw.extensions).category),
    keys: stringList(raw.key ?? raw.keys),
    secondaryKeys: stringList(raw.keysecondary ?? raw.secondary_keys ?? raw.secondaryKeys),
    content: stringField(raw.content),
    enabled: !Boolean(raw.disable),
    constant: Boolean(raw.constant),
    selective: Boolean(raw.selective),
    caseSensitive: Boolean(raw.case_sensitive ?? raw.caseSensitive),
    priority: numberField(raw.priority, 0),
    insertionOrder: numberField(raw.order ?? raw.insertion_order ?? raw.insertionOrder, index),
    position: normalizePosition(raw.position),
    depth: optionalNumber(raw.depth),
    probability: numberField(raw.probability, 100),
    extensions: typeof raw.extensions === "object" && raw.extensions ? (raw.extensions as Record<string, unknown>) : {}
  });
}

function cardforgeExtension(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const extension = (value as Record<string, unknown>).cardforge;
  return extension && typeof extension === "object" ? (extension as Record<string, unknown>) : {};
}

function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = cloneRecord(base);
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(next[key]) && isRecord(value)) {
      next[key] = deepMergeRecords(next[key] as Record<string, unknown>, value);
    } else {
      next[key] = cloneUnknown(value);
    }
  }
  return next;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneUnknown(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLikelyV1(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const card = input as Record<string, unknown>;
  return ["name", "description", "first_mes"].some((field) => field in card) && !("spec" in card);
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function numberField(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizePosition(value: unknown): WorldBookEntry["position"] {
  if (value === "after_char" || value === "at_depth" || value === "authors_note") return value;
  if (value === 1 || value === "1" || value === "after") return "after_char";
  if (value === 2 || value === "2") return "authors_note";
  return "before_char";
}
