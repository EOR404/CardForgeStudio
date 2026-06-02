import { sanitizeProjectForExport } from "../exporter/character";
import {
  createAdvancedDefaults,
  createCharacterDraft,
  createFrontendPackageDraft,
  createPresetDraft,
  createProjectDraft,
  createProviderDraft,
  createRegexRuleDraft,
  createScriptDraft,
  createWorldBookDraft,
  createWorldBookEntryDraft,
  now,
  uid
} from "../schema/defaults";
import type {
  AdvancedProjectData,
  AIProviderConfig,
  AIPreset,
  Asset,
  CardProject,
  CardScript,
  CompatibilityReport,
  CustomTestCase,
  ExportRecord,
  FrontendCardPackage,
  InternalCharacter,
  InternalWorldBook,
  PluginManifest,
  ProjectMode,
  RegexRule,
  TestSession,
  VersionSnapshot,
  WorldBookEntry,
  WorldBookEntryCategory
} from "../schema/types";
import { cardProjectImportSchema, formatZodIssues } from "../schema/validators";

type UnknownRecord = Record<string, unknown>;

const assetTypes: Asset["type"][] = ["image", "text", "json", "character_card", "worldbook", "script", "other"];
const assetPurposes: NonNullable<Asset["purpose"]>[] = [
  "avatar",
  "cover",
  "export-cover",
  "halfbody",
  "fullbody",
  "background",
  "expression",
  "map",
  "icon",
  "reference",
  "other"
];
const assetSources: NonNullable<Asset["source"]>[] = ["upload", "generated", "imported", "reference"];
const providerTypes: AIProviderConfig["providerType"][] = [
  "openai-compatible",
  "openai",
  "deepseek",
  "anthropic",
  "gemini",
  "ollama",
  "custom"
];
const aiCapabilities: AIProviderConfig["capabilities"][number][] = [
  "chat",
  "json",
  "vision",
  "image-generation",
  "embeddings",
  "tools",
  "streaming"
];
const outputModes: AIPreset["outputMode"][] = ["json", "markdown", "plain_text", "yaml", "custom"];
const worldBookCategories: WorldBookEntryCategory[] = [
  "character_core",
  "world_background",
  "location",
  "organization",
  "item",
  "rule",
  "route",
  "variable",
  "initialization",
  "frontend",
  "hidden_control",
  "other"
];
const worldBookPositions: WorldBookEntry["position"][] = ["before_char", "after_char", "at_depth", "authors_note"];
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
const projectModes: ProjectMode[] = ["light", "advanced"];
const snapshotTargetTypes: VersionSnapshot["targetType"][] = ["character", "worldbook", "project", "advanced"];
const exportFormats: ExportRecord["format"][] = ["v1_json", "v2_json", "v3_json", "v2_png", "worldbook_json", "project_json"];
const testStatuses: NonNullable<TestSession["status"]>[] = ["untagged", "passed", "failed", "needs_review"];

export function normalizeImportedProject(raw: unknown, sourceLabel = "项目", options: { stripSecrets?: boolean } = {}): CardProject {
  const parsed = cardProjectImportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${sourceLabel}不是有效的 CardForge 项目：${formatZodIssues(parsed.error.issues)}`);
  }

  const source = parsed.data as Partial<CardProject>;
  const mode = oneOf(source.mode, projectModes, "light");
  const base = createProjectDraft(asString(source.name, "导入项目"), mode);
  const advanced = normalizeAdvancedProjectData(source.advanced, base.advanced);
  const project: CardProject = {
    ...base,
    id: asString(source.id, uid("project")),
    name: asString(source.name, "导入项目"),
    description: optionalString(source.description) ?? "",
    mode,
    characters: objectArray(source.characters).map(normalizeCharacter),
    worldBooks: objectArray(source.worldBooks).map(normalizeWorldBook),
    assets: objectArray(source.assets).map(normalizeAsset),
    aiProviders: source.aiProviders === undefined ? base.aiProviders : objectArray(source.aiProviders).map(normalizeProvider),
    aiPresets: source.aiPresets === undefined ? base.aiPresets : objectArray(source.aiPresets).map(normalizePreset),
    aiLogs: objectArray(source.aiLogs).map(normalizeAIInvocationLog),
    tests: objectArray(source.tests).map(normalizeTestSession),
    testCases: objectArray(source.testCases).map(normalizeTestCase),
    versions: objectArray(source.versions).map(normalizeVersionSnapshot),
    exports: objectArray(source.exports).map(normalizeExportRecord),
    advanced,
    createdAt: asNumber(source.createdAt, now()),
    updatedAt: now()
  };

  const sanitized = options.stripSecrets === false ? project : sanitizeProjectForExport(project);
  return {
    ...sanitized,
    aiLogs: sanitized.aiLogs ?? [],
    testCases: sanitized.testCases ?? [],
    updatedAt: now()
  };
}

export function tryNormalizeImportedProject(raw: unknown, sourceLabel = "项目", options: { stripSecrets?: boolean } = {}): CardProject | undefined {
  try {
    return normalizeImportedProject(raw, sourceLabel, options);
  } catch {
    return undefined;
  }
}

function normalizeCharacter(value: UnknownRecord, index: number): InternalCharacter {
  const base = createCharacterDraft(asString(value.name, `导入角色 ${index + 1}`));
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("char")),
    name: asString(value.name, base.name),
    nickname: optionalString(value.nickname),
    description: asString(value.description, ""),
    personality: optionalString(value.personality) ?? "",
    scenario: optionalString(value.scenario) ?? "",
    firstMessage: asString(value.firstMessage ?? value.first_mes, ""),
    exampleMessages: optionalString(value.exampleMessages ?? value.mes_example) ?? "",
    alternateGreetings: stringArray(value.alternateGreetings ?? value.alternate_greetings),
    systemPrompt: optionalString(value.systemPrompt ?? value.system_prompt) ?? "",
    postHistoryInstructions: optionalString(value.postHistoryInstructions ?? value.post_history_instructions) ?? "",
    creatorNotes: optionalString(value.creatorNotes ?? value.creator_notes) ?? "",
    tags: stringArray(value.tags),
    creator: optionalString(value.creator) ?? "",
    version: optionalString(value.version ?? value.character_version) ?? "",
    characterBookId: optionalString(value.characterBookId),
    avatarAssetId: optionalString(value.avatarAssetId),
    extensions: record(value.extensions),
    originalSource: isRecord(value.originalSource) ? (value.originalSource as InternalCharacter["originalSource"]) : undefined,
    compatibilityReports: objectArray(value.compatibilityReports) as CompatibilityReport[],
    linkedWorldBooks: stringArray(value.linkedWorldBooks),
    linkedScripts: stringArray(value.linkedScripts),
    linkedRegexRules: stringArray(value.linkedRegexRules),
    linkedVariableSystem: optionalString(value.linkedVariableSystem),
    frontendPackageId: optionalString(value.frontendPackageId),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeWorldBook(value: UnknownRecord, index: number): InternalWorldBook {
  const base = createWorldBookDraft(asString(value.name, `导入世界书 ${index + 1}`));
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("wb")),
    name: asString(value.name, base.name),
    description: optionalString(value.description) ?? "",
    scanDepth: asNumber(value.scanDepth ?? value.scan_depth, 2),
    tokenBudget: asNumber(value.tokenBudget ?? value.token_budget, 1200),
    recursiveScanning: asBoolean(value.recursiveScanning ?? value.recursive_scanning, false),
    entries: objectArray(value.entries).map(normalizeWorldBookEntry),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeWorldBookEntry(value: UnknownRecord, index: number): WorldBookEntry {
  const base = createWorldBookEntryDraft();
  return {
    ...base,
    ...value,
    id: asString(value.id ?? value.uid, uid("wbe")),
    name: optionalString(value.name) ?? optionalString(value.comment) ?? "",
    comment: optionalString(value.comment) ?? optionalString(value.name) ?? "",
    category: oneOf(value.category, worldBookCategories, "other"),
    keys: stringArray(value.keys ?? value.key),
    secondaryKeys: stringArray(value.secondaryKeys ?? value.keysecondary),
    content: asString(value.content, ""),
    enabled: value.disable === undefined ? asBoolean(value.enabled, true) : !asBoolean(value.disable, false),
    constant: asBoolean(value.constant, false),
    selective: asBoolean(value.selective, false),
    caseSensitive: asBoolean(value.caseSensitive ?? value.case_sensitive, false),
    priority: asNumber(value.priority, 0),
    insertionOrder: asNumber(value.insertionOrder ?? value.order, index + 100),
    position: oneOf(value.position, worldBookPositions, "before_char"),
    depth: optionalNumber(value.depth),
    probability: optionalNumber(value.probability) ?? 100,
    conditions: objectArray(value.conditions) as WorldBookEntry["conditions"],
    extensions: record(value.extensions)
  };
}

function normalizeAsset(value: UnknownRecord): Asset {
  return {
    ...value,
    id: asString(value.id, uid("asset")),
    name: asString(value.name, "导入资源"),
    type: oneOf(value.type, assetTypes, "other"),
    purpose: oneOf(value.purpose, assetPurposes, "other"),
    source: oneOf(value.source, assetSources, "imported"),
    mimeType: optionalString(value.mimeType),
    dataUrl: optionalString(value.dataUrl),
    path: optionalString(value.path),
    thumbnailUrl: optionalString(value.thumbnailUrl),
    tags: stringArray(value.tags),
    linkedCharacterIds: stringArray(value.linkedCharacterIds),
    linkedWorldBookIds: stringArray(value.linkedWorldBookIds),
    notes: optionalString(value.notes),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeProvider(value: UnknownRecord): AIProviderConfig {
  const base = createProviderDraft();
  const params = record(value.defaultParams);
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("provider")),
    name: asString(value.name, base.name),
    providerType: oneOf(value.providerType, providerTypes, "openai-compatible"),
    baseUrl: asString(value.baseUrl, ""),
    apiKey: optionalString(value.apiKey) ?? "",
    defaultModel: asString(value.defaultModel, ""),
    models: stringArray(value.models),
    headers: stringRecord(value.headers),
    defaultParams: {
      temperature: optionalNumber(params.temperature),
      topP: optionalNumber(params.topP),
      maxTokens: optionalNumber(params.maxTokens),
      stream: optionalBoolean(params.stream)
    },
    capabilities: stringArray(value.capabilities).filter((item): item is AIProviderConfig["capabilities"][number] =>
      aiCapabilities.includes(item as AIProviderConfig["capabilities"][number])
    ),
    enabled: asBoolean(value.enabled, true),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizePreset(value: UnknownRecord): AIPreset {
  const base = createPresetDraft();
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("preset")),
    name: asString(value.name, base.name),
    description: optionalString(value.description),
    taskType: asString(value.taskType, "custom"),
    providerId: optionalString(value.providerId),
    modelOverride: optionalString(value.modelOverride),
    systemPrompt: asString(value.systemPrompt, base.systemPrompt),
    userPromptTemplate: asString(value.userPromptTemplate, base.userPromptTemplate),
    outputMode: oneOf(value.outputMode, outputModes, "plain_text"),
    outputSchema: isRecord(value.outputSchema) ? value.outputSchema : undefined,
    paramsOverride: isRecord(value.paramsOverride) ? value.paramsOverride as AIPreset["paramsOverride"] : undefined,
    variables: objectArray(value.variables).map((variable) => ({
      key: asString(variable.key, "input"),
      label: asString(variable.label, asString(variable.key, "输入")),
      defaultValue: optionalString(variable.defaultValue),
      required: optionalBoolean(variable.required)
    }))
  };
}

function normalizeAIInvocationLog(value: UnknownRecord): CardProject["aiLogs"][number] {
  return {
    id: asString(value.id, uid("ailog")),
    taskType: asString(value.taskType, "imported"),
    providerId: asString(value.providerId, ""),
    providerName: asString(value.providerName, ""),
    model: asString(value.model, ""),
    inputTokens: asNumber(value.inputTokens, 0),
    outputTokens: asNumber(value.outputTokens, 0),
    totalTokens: asNumber(value.totalTokens, 0),
    estimatedCostUsd: asNumber(value.estimatedCostUsd, 0),
    durationMs: asNumber(value.durationMs, 0),
    success: asBoolean(value.success, false),
    errorMessage: optionalString(value.errorMessage),
    rawOutput: optionalString(value.rawOutput),
    createdAt: asNumber(value.createdAt, now())
  };
}

function normalizeTestSession(value: UnknownRecord): TestSession {
  return {
    id: asString(value.id, uid("test")),
    name: asString(value.name, "导入测试"),
    characterId: asString(value.characterId, ""),
    worldBookId: optionalString(value.worldBookId),
    providerId: optionalString(value.providerId),
    testCaseId: optionalString(value.testCaseId),
    testCaseName: optionalString(value.testCaseName),
    status: oneOf(value.status, testStatuses, "untagged"),
    failureNotes: optionalString(value.failureNotes),
    messages: objectArray(value.messages).map((message) => ({
      role: oneOf(message.role, ["system", "user", "assistant"] as const, "user"),
      content: asString(message.content, "")
    })),
    triggeredEntries: objectArray(value.triggeredEntries) as TestSession["triggeredEntries"],
    promptPreview: asString(value.promptPreview, ""),
    promptSections: objectArray(value.promptSections) as TestSession["promptSections"],
    diagnostics: objectArray(value.diagnostics) as TestSession["diagnostics"],
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeTestCase(value: UnknownRecord): CustomTestCase {
  return {
    id: asString(value.id, uid("case")),
    name: asString(value.name, "导入测试用例"),
    prompt: asString(value.prompt, ""),
    expected: optionalString(value.expected),
    tags: stringArray(value.tags),
    enabled: asBoolean(value.enabled, true),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeVersionSnapshot(value: UnknownRecord): VersionSnapshot {
  return {
    id: asString(value.id, uid("version")),
    label: asString(value.label, "导入快照"),
    notes: optionalString(value.notes),
    targetType: oneOf(value.targetType, snapshotTargetTypes, "project"),
    targetId: asString(value.targetId, ""),
    data: cloneUnknown(value.data),
    diffSummary: objectArray(value.diffSummary) as VersionSnapshot["diffSummary"],
    createdAt: asNumber(value.createdAt, now())
  };
}

function normalizeExportRecord(value: UnknownRecord): ExportRecord {
  return {
    id: asString(value.id, uid("export")),
    characterId: optionalString(value.characterId),
    characterVersionId: optionalString(value.characterVersionId),
    worldBookIds: stringArray(value.worldBookIds),
    assetIds: stringArray(value.assetIds),
    format: oneOf(value.format, exportFormats, "project_json"),
    outputPath: asString(value.outputPath, ""),
    warnings: stringArray(value.warnings),
    createdAt: asNumber(value.createdAt, now())
  };
}

function normalizeAdvancedProjectData(value: unknown, fallback = createAdvancedDefaults()): AdvancedProjectData {
  if (!isRecord(value)) return fallback;
  const source = record(value);
  const variableSystem = record(source.variableSystem);
  return {
    regexRules: source.regexRules === undefined ? fallback.regexRules : objectArray(source.regexRules).map(normalizeRegexRule),
    variableSystem: {
      ...fallback.variableSystem,
      ...variableSystem,
      id: asString(variableSystem.id, fallback.variableSystem.id),
      name: asString(variableSystem.name, fallback.variableSystem.name),
      state: record(variableSystem.state),
      history: objectArray(variableSystem.history).map((snapshot) => ({
        id: asString(snapshot.id, uid("varsnap")),
        label: asString(snapshot.label, "导入变量快照"),
        state: record(snapshot.state),
        createdAt: asNumber(snapshot.createdAt, now())
      })),
      updatedAt: asNumber(variableSystem.updatedAt, now())
    },
    scripts: source.scripts === undefined ? fallback.scripts : objectArray(source.scripts).map(normalizeScript),
    frontendPackages: source.frontendPackages === undefined ? fallback.frontendPackages : objectArray(source.frontendPackages).map(normalizeFrontendPackage),
    plugins: source.plugins === undefined ? fallback.plugins : objectArray(source.plugins).map(normalizePlugin),
    compatibilityReports:
      source.compatibilityReports === undefined
        ? fallback.compatibilityReports
        : objectArray(source.compatibilityReports) as CompatibilityReport[]
  };
}

function normalizeRegexRule(value: UnknownRecord): RegexRule {
  const base = createRegexRuleDraft();
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("regex")),
    name: asString(value.name, base.name),
    pattern: asString(value.pattern, ""),
    replacement: asString(value.replacement, ""),
    flags: asString(value.flags, "g"),
    enabled: asBoolean(value.enabled, true),
    target: oneOf(value.target, regexTargets, "ai_output"),
    order: asNumber(value.order, 100),
    tags: stringArray(value.tags),
    notes: optionalString(value.notes),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeScript(value: UnknownRecord): CardScript {
  const base = createScriptDraft();
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("script")),
    name: asString(value.name, base.name),
    language: oneOf(value.language, scriptLanguages, "custom"),
    source: asString(value.source, ""),
    trigger: oneOf(value.trigger, scriptTriggers, "manual"),
    permissions: stringArray(value.permissions),
    enabled: asBoolean(value.enabled, false),
    compatibility: oneOf(value.compatibility, scriptCompatibility, "unknown"),
    notes: optionalString(value.notes),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizeFrontendPackage(value: UnknownRecord): FrontendCardPackage {
  const base = createFrontendPackageDraft();
  return {
    ...base,
    ...value,
    id: asString(value.id, uid("frontend")),
    name: asString(value.name, base.name),
    html: asString(value.html, ""),
    css: asString(value.css, ""),
    js: asString(value.js, ""),
    assetIds: stringArray(value.assetIds),
    allowScripts: asBoolean(value.allowScripts, false),
    manifest: record(value.manifest),
    createdAt: asNumber(value.createdAt, now()),
    updatedAt: asNumber(value.updatedAt, now())
  };
}

function normalizePlugin(value: UnknownRecord): PluginManifest {
  return {
    id: asString(value.id, uid("plugin")),
    name: asString(value.name, "导入插件"),
    version: asString(value.version, "0.1.0"),
    main: optionalString(value.main),
    enabled: asBoolean(value.enabled, false),
    permissions: stringArray(value.permissions),
    contributes: isRecord(value.contributes) ? value.contributes : undefined,
    trusted: asBoolean(value.trusted, false),
    notes: optionalString(value.notes)
  };
}

function objectArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function record(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, typeof nested === "string" ? nested : String(nested ?? "")]));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function cloneUnknown(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
