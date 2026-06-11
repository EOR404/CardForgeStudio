export type AppPage =
  | "projects"
  | "dashboard"
  | "characters"
  | "worldbooks"
  | "assets"
  | "ai"
  | "test"
  | "export"
  | "advanced";

export type SearchTarget = {
  page: AppPage;
  selectedCharacterId?: string;
  selectedWorldBookId?: string;
  selectedAssetId?: string;
  selectedProviderId?: string;
};

export type ProjectMode = "light" | "advanced";

export type ProjectTrustLevel = "untrusted" | "restricted" | "trusted";

export type CompatibilityTarget =
  | "sillytavern_v2"
  | "sillytavern_regex"
  | "sillytavern_mvu"
  | "chub"
  | "cardforge_native"
  | "local_test";

export type CardProject = {
  id: string;
  name: string;
  description?: string;
  mode: ProjectMode;
  trustLevel: ProjectTrustLevel;
  compatibilityTarget: CompatibilityTarget;
  characters: InternalCharacter[];
  worldBooks: InternalWorldBook[];
  assets: Asset[];
  aiProviders: AIProviderConfig[];
  aiPresets: AIPreset[];
  aiLogs: AIInvocationLog[];
  tests: TestSession[];
  testCases?: CustomTestCase[];
  versions: VersionSnapshot[];
  exports: ExportRecord[];
  advanced: AdvancedProjectData;
  createdAt: number;
  updatedAt: number;
};

export type InternalCharacter = {
  id: string;
  name: string;
  nickname?: string;
  description: string;
  personality?: string;
  scenario?: string;
  firstMessage: string;
  exampleMessages?: string;
  alternateGreetings: string[];
  systemPrompt?: string;
  postHistoryInstructions?: string;
  creatorNotes?: string;
  tags: string[];
  creator?: string;
  version?: string;
  characterBookId?: string;
  avatarAssetId?: string;
  extensions: Record<string, unknown>;
  originalSource?: ImportedSource;
  compatibilityReports?: CompatibilityReport[];
  linkedWorldBooks: string[];
  linkedScripts: string[];
  linkedRegexRules: string[];
  linkedVariableSystem?: string;
  frontendPackageId?: string;
  createdAt: number;
  updatedAt: number;
};

export type ImportedSource = {
  format: "v1" | "v2" | "v2_png" | "v3" | "charx" | "worldbook" | "unknown";
  fileName?: string;
  raw: unknown;
  importedAt: number;
};

export type InternalWorldBook = {
  id: string;
  name: string;
  description?: string;
  scanDepth?: number;
  tokenBudget?: number;
  recursiveScanning?: boolean;
  entries: WorldBookEntry[];
  createdAt: number;
  updatedAt: number;
};

export type WorldBookEntry = {
  id: string;
  name?: string;
  comment?: string;
  category?: WorldBookEntryCategory;
  keys: string[];
  secondaryKeys: string[];
  content: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  caseSensitive: boolean;
  priority: number;
  insertionOrder: number;
  position: "before_char" | "after_char" | "at_depth" | "authors_note";
  depth?: number;
  probability?: number;
  conditions?: WorldBookEntryCondition[];
  extensions?: Record<string, unknown>;
};

export type WorldBookEntryCategory =
  | "character_core"
  | "world_background"
  | "location"
  | "organization"
  | "item"
  | "rule"
  | "route"
  | "variable"
  | "initialization"
  | "frontend"
  | "hidden_control"
  | "other";

export type WorldBookEntryCondition = {
  path: string;
  operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains";
  value: string | number | boolean;
};

export type Asset = {
  id: string;
  name: string;
  type: "image" | "text" | "json" | "character_card" | "worldbook" | "script" | "other";
  purpose?: AssetPurpose;
  source?: "upload" | "generated" | "imported" | "reference";
  mimeType?: string;
  dataUrl?: string;
  path?: string;
  thumbnailUrl?: string;
  tags: string[];
  linkedCharacterIds: string[];
  linkedWorldBookIds: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type AssetPurpose =
  | "avatar"
  | "cover"
  | "export-cover"
  | "halfbody"
  | "fullbody"
  | "background"
  | "expression"
  | "map"
  | "icon"
  | "reference"
  | "other";

export type AICapability =
  | "chat"
  | "json"
  | "vision"
  | "image-generation"
  | "embeddings"
  | "tools"
  | "streaming";

export type AIProviderConfig = {
  id: string;
  name: string;
  providerType:
    | "openai-compatible"
    | "openai"
    | "deepseek"
    | "anthropic"
    | "gemini"
    | "ollama"
    | "lm-studio"
    | "vllm"
    | "comfyui"
    | "stable-diffusion-webui"
    | "custom";
  baseUrl: string;
  proxyUrl?: string;
  apiKey?: string;
  defaultModel: string;
  models?: string[];
  headers?: Record<string, string>;
  defaultTaskTypes?: string[];
  defaultParams: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    stream?: boolean;
  };
  capabilities: AICapability[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type AIPreset = {
  id: string;
  name: string;
  description?: string;
  taskType: string;
  providerId?: string;
  modelOverride?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  outputMode: "json" | "markdown" | "plain_text" | "yaml" | "custom";
  outputSchema?: object;
  paramsOverride?: {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
  };
  variables: PresetVariable[];
};

export type PresetVariable = {
  key: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type PromptChainSection = {
  id: string;
  label: string;
  source: "character" | "worldbook" | "variables" | "frontend" | "script" | "regex" | "chat" | "system";
  sourceId?: string;
  content: string;
  tokens: number;
  enabled: boolean;
  position: string;
  target?: SearchTarget;
};

export type AIInvocationLog = {
  id: string;
  taskType: string;
  providerId: string;
  providerName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  rawOutput?: string;
  createdAt: number;
};

export type TestSession = {
  id: string;
  name: string;
  characterId: string;
  worldBookId?: string;
  providerId?: string;
  testCaseId?: string;
  testCaseName?: string;
  status?: TestSessionStatus;
  failureNotes?: string;
  messages: ChatMessage[];
  triggeredEntries: TriggeredWorldBookEntry[];
  promptPreview: string;
  promptSections?: PromptChainSection[];
  diagnostics: QualityIssue[];
  variableUpdates?: VariableUpdateLog[];
  createdAt: number;
  updatedAt: number;
};

export type TestSessionStatus = "untagged" | "passed" | "failed" | "needs_review";

export type VariableUpdateLog = {
  source: "assistant" | "manual";
  messageIndex?: number;
  diffs: Array<{
    path: string;
    before: unknown;
    after: unknown;
    operation?: "set" | "remove";
  }>;
  applied: boolean;
  createdAt: number;
};

export type CustomTestCase = {
  id: string;
  name: string;
  prompt: string;
  expected?: string;
  tags: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type TriggeredWorldBookEntry = {
  entryId: string;
  entryName?: string;
  worldBookId: string;
  matchedKeys: string[];
  reason: string;
  insertionOrder: number;
  position: WorldBookEntry["position"];
  tokens: number;
  content: string;
};

export type WorldBookTriggerStatus =
  | "triggered"
  | "excluded_by_budget"
  | "disabled"
  | "missed_condition"
  | "missed_primary"
  | "missed_secondary"
  | "empty_content";

export type WorldBookTriggerReview = {
  entryId: string;
  entryName?: string;
  worldBookId: string;
  status: WorldBookTriggerStatus;
  reason: string;
  matchedKeys: string[];
  missingKeys: string[];
  insertionOrder: number;
  priority: number;
  position: WorldBookEntry["position"];
  tokens: number;
  content: string;
};

export type WorldBookTriggerAnalysis = {
  input: string;
  tokenBudget: number;
  usedTokens: number;
  triggeredEntries: TriggeredWorldBookEntry[];
  excludedEntries: WorldBookTriggerReview[];
  reviewedEntries: WorldBookTriggerReview[];
};

export type VersionSnapshot = {
  id: string;
  label: string;
  notes?: string;
  targetType: "character" | "worldbook" | "project" | "advanced";
  targetId: string;
  data: unknown;
  diffSummary?: FieldDiff[];
  createdAt: number;
};

export type AdvancedSnapshotTarget = "all" | "regex" | "variables" | "scripts" | "frontend" | "plugins";

export type FieldDiff = {
  field: string;
  before: string;
  after: string;
};

export type ExportRecord = {
  id: string;
  characterId?: string;
  characterVersionId?: string;
  worldBookIds: string[];
  assetIds: string[];
  format: "v1_json" | "v2_json" | "v3_json" | "charx" | "v2_png" | "avatar_png" | "worldbook_json" | "project_json";
  outputPath: string;
  warnings: string[];
  createdAt: number;
};

export type QualityIssue = {
  id: string;
  level: "error" | "warning" | "info";
  scope: string;
  message: string;
};

export type CompatibilityReport = {
  id: string;
  source: string;
  level: "full" | "partial" | "readonly" | "unsupported";
  cardKind: "light" | "medium" | "heavy" | "unknown";
  suggestedMode: ProjectMode;
  importedAsReadonly: boolean;
  fieldCompleteness: {
    filled: number;
    total: number;
    missing: string[];
    score: number;
  };
  detected: {
    format: string;
    embeddedWorldBook: boolean;
    regex: boolean;
    mvu: boolean;
    scripts: boolean;
    frontend: boolean;
    extensions: boolean;
  };
  dependencies: CompatibilityDependency[];
  readonlyReasons: string[];
  recommendedActions: string[];
  notes: string[];
  createdAt: number;
};

export type CompatibilityDependency = {
  type: "worldbook" | "regex" | "mvu" | "script" | "frontend" | "extension" | "plugin";
  label: string;
  evidence: string;
};

export type AdvancedProjectData = {
  regexRules: RegexRule[];
  variableSystem: VariableSystem;
  scripts: CardScript[];
  frontendPackages: FrontendCardPackage[];
  plugins: PluginManifest[];
  compatibilityReports: CompatibilityReport[];
};

export type RegexRule = {
  id: string;
  name: string;
  pattern: string;
  replacement: string;
  flags: string;
  enabled: boolean;
  target:
    | "user_input"
    | "ai_output"
    | "before_prompt"
    | "after_prompt"
    | "before_display"
    | "variable_extract";
  order: number;
  tags: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type VariableSystem = {
  id: string;
  name: string;
  state: Record<string, unknown>;
  history: VariableSnapshot[];
  updatedAt: number;
};

export type VariableSnapshot = {
  id: string;
  label: string;
  state: Record<string, unknown>;
  createdAt: number;
};

export type CardScript = {
  id: string;
  name: string;
  language: "stscript" | "quick-reply" | "javascript" | "mvu" | "template" | "custom";
  source: string;
  trigger:
    | "manual"
    | "on_project_open"
    | "on_card_init"
    | "before_prompt_build"
    | "after_prompt_build"
    | "before_user_message"
    | "after_user_message"
    | "before_ai_response"
    | "after_ai_response"
    | "on_regex_match"
    | "on_variable_change"
    | "on_frontend_confirm";
  permissions: string[];
  enabled: boolean;
  compatibility: "native" | "partial" | "external" | "unknown";
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type FrontendCardPackage = {
  id: string;
  name: string;
  html: string;
  css: string;
  js: string;
  assetIds: string[];
  allowScripts: boolean;
  manifest: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  main?: string;
  enabled: boolean;
  permissions: string[];
  contributes?: Record<string, unknown>;
  trusted: boolean;
  notes?: string;
};

export type AIActionResult<T = unknown> = {
  raw: string;
  parsed?: T;
  error?: string;
  log?: AIInvocationLog;
};
