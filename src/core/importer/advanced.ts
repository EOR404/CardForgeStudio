import { createFrontendPackageDraft, createRegexRuleDraft, createScriptDraft } from "../schema/defaults";
import type { CardScript, FrontendCardPackage, RegexRule } from "../schema/types";

type FrontendSourceFile = {
  name: string;
  text: string;
};

const regexTargets: RegexRule["target"][] = [
  "user_input",
  "ai_output",
  "before_prompt",
  "after_prompt",
  "before_display",
  "variable_extract"
];

const scriptLanguages: CardScript["language"][] = ["stscript", "quick-reply", "javascript", "mvu", "template", "custom"];
const scriptTriggers: CardScript["trigger"][] = [
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
const scriptCompatibility: CardScript["compatibility"][] = ["native", "partial", "external", "unknown"];

export function importRegexRulesFromConfig(input: unknown, fileName = "regex.json"): RegexRule[] {
  const candidates = collectCandidates(input, ["regexRules", "regex_rules", "rules", "regex", "substitutions"]);
  return candidates
    .filter(isRecord)
    .map((candidate, index) => normalizeRegexRule(candidate, fileName, index))
    .filter((rule) => rule.pattern.trim());
}

export function importScriptsFromConfig(input: unknown, fileName = "script.json"): CardScript[] {
  const candidates = collectCandidates(input, ["scripts", "script", "quickReplies", "quick_replies", "commands"]);
  return candidates
    .filter(isRecord)
    .map((candidate, index) => normalizeScript(candidate, fileName, index))
    .filter((script) => script.source.trim());
}

export function importScriptFile(text: string, fileName: string): CardScript[] {
  const parsed = tryParseJson(text);
  if (parsed !== undefined) {
    const scripts = importScriptsFromConfig(parsed, fileName);
    if (scripts.length) return scripts;
  }
  return [
    createScriptDraft({
      name: stripExtension(fileName) || "导入脚本",
      language: inferScriptLanguage(fileName),
      source: text,
      enabled: false,
      compatibility: "unknown",
      notes: `从 ${fileName} 导入。未知脚本默认不执行。`
    })
  ];
}

export function importFrontendPackageFromFiles(files: FrontendSourceFile[]): FrontendCardPackage {
  if (!files.length) throw new Error("请选择至少一个前端卡文件。");
  let html = "";
  let css = "";
  let js = "";
  let manifest: Record<string, unknown> = { permissions: [] };
  let name = stripExtension(files[0].name) || "导入前端卡";
  let assetIds: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      html = file.text;
      continue;
    }
    if (lower.endsWith(".css")) {
      css = file.text;
      continue;
    }
    if (lower.endsWith(".js") || lower.endsWith(".mjs")) {
      js = file.text;
      continue;
    }
    if (lower.endsWith(".json")) {
      const parsed = tryParseJson(file.text);
      if (isRecord(parsed)) {
        const packageLike = normalizeFrontendPackageShape(parsed);
        html = packageLike.html ?? html;
        css = packageLike.css ?? css;
        js = packageLike.js ?? js;
        manifest = packageLike.manifest ?? manifestFromJson(parsed, manifest);
        name = packageLike.name ?? stringValue(manifest.name, name);
        assetIds = packageLike.assetIds ?? assetIds;
      }
    }
  }

  return createFrontendPackageDraft({
    name,
    html: html || "<section><h1>Imported Frontend Card</h1><p>未找到 HTML 文件，已创建静态占位。</p></section>",
    css,
    js,
    manifest,
    assetIds,
    allowScripts: false
  });
}

function normalizeRegexRule(candidate: Record<string, unknown>, fileName: string, index: number): RegexRule {
  const target = oneOf(candidate.target ?? candidate.scope ?? candidate.placement, regexTargets, mapRegexTarget(candidate.placement));
  return createRegexRuleDraft({
    name: stringValue(candidate.name ?? candidate.scriptName ?? candidate.label, `${stripExtension(fileName) || "导入正则"} ${index + 1}`),
    pattern: stringValue(candidate.pattern ?? candidate.regex ?? candidate.findRegex ?? candidate.find ?? candidate.search, ""),
    replacement: stringValue(candidate.replacement ?? candidate.replace ?? candidate.replaceString ?? candidate.substitute, ""),
    flags: normalizeRegexFlags(stringValue(candidate.flags, "g")),
    enabled: booleanValue(candidate.enabled ?? (candidate.disabled === undefined ? true : !booleanValue(candidate.disabled, false)), true),
    target,
    order: numberValue(candidate.order ?? candidate.sortOrder ?? candidate.priority, 100 + index),
    tags: stringList(candidate.tags),
    notes: optionalString(candidate.notes ?? candidate.comment ?? candidate.description)
  });
}

function normalizeScript(candidate: Record<string, unknown>, fileName: string, index: number): CardScript {
  return createScriptDraft({
    name: stringValue(candidate.name ?? candidate.label ?? candidate.title, `${stripExtension(fileName) || "导入脚本"} ${index + 1}`),
    language: oneOf(candidate.language ?? candidate.type, scriptLanguages, inferScriptLanguage(fileName)),
    source: stringValue(candidate.source ?? candidate.code ?? candidate.script ?? candidate.command ?? candidate.content, ""),
    trigger: oneOf(candidate.trigger ?? candidate.event, scriptTriggers, "manual"),
    permissions: stringList(candidate.permissions),
    enabled: false,
    compatibility: oneOf(candidate.compatibility, scriptCompatibility, "unknown"),
    notes: optionalString(candidate.notes ?? candidate.comment ?? `从 ${fileName} 导入。未知脚本默认不执行。`)
  });
}

function collectCandidates(input: unknown, keys: string[]): unknown[] {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return [];
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return [value];
  }
  return [input];
}

function normalizeFrontendPackageShape(input: Record<string, unknown>): {
  name?: string;
  html?: string;
  css?: string;
  js?: string;
  manifest?: Record<string, unknown>;
  assetIds?: string[];
} {
  const manifest = isRecord(input.manifest) ? input.manifest : undefined;
  return {
    name: optionalString(input.name ?? manifest?.name),
    html: optionalString(input.html ?? input.indexHtml ?? input.index_html),
    css: optionalString(input.css ?? input.style ?? input.styles),
    js: optionalString(input.js ?? input.javascript ?? input.mainJs ?? input.main_js),
    manifest,
    assetIds: stringList(input.assetIds ?? input.assets).filter(Boolean)
  };
}

function manifestFromJson(input: Record<string, unknown>, fallback: Record<string, unknown>): Record<string, unknown> {
  if (input.html || input.css || input.js || input.javascript || input.indexHtml) return fallback;
  return input;
}

function mapRegexTarget(value: unknown): RegexRule["target"] {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("user")) return "user_input";
  if (text.includes("prompt") && text.includes("before")) return "before_prompt";
  if (text.includes("prompt") && text.includes("after")) return "after_prompt";
  if (text.includes("display")) return "before_display";
  if (text.includes("variable")) return "variable_extract";
  return "ai_output";
}

function inferScriptLanguage(fileName: string): CardScript["language"] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".stscript")) return "stscript";
  if (lower.endsWith(".mvu")) return "mvu";
  if (lower.includes("quick") || lower.endsWith(".qr.json")) return "quick-reply";
  if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "javascript";
  if (lower.endsWith(".tmpl") || lower.endsWith(".template")) return "template";
  return "custom";
}

function normalizeRegexFlags(flags: string): string {
  const unique = [...new Set(flags.split("").filter((flag) => "dgimsuvy".includes(flag)))].join("");
  return unique || "g";
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
