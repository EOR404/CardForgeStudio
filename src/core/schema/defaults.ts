import type {
  AdvancedProjectData,
  AIProviderConfig,
  AIPreset,
  CardProject,
  CardScript,
  CustomTestCase,
  FrontendCardPackage,
  InternalCharacter,
  InternalWorldBook,
  PluginManifest,
  RegexRule,
  VariableSystem,
  WorldBookEntry
} from "./types";

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function now(): number {
  return Date.now();
}

export function createCharacterDraft(name = "未命名角色"): InternalCharacter {
  const time = now();
  return {
    id: uid("char"),
    name,
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    exampleMessages: "",
    alternateGreetings: [],
    systemPrompt: "",
    postHistoryInstructions: "",
    creatorNotes: "",
    tags: [],
    creator: "",
    version: "0.1.0",
    extensions: {},
    linkedWorldBooks: [],
    linkedScripts: [],
    linkedRegexRules: [],
    createdAt: time,
    updatedAt: time
  };
}

export function createWorldBookDraft(name = "新世界书"): InternalWorldBook {
  const time = now();
  return {
    id: uid("wb"),
    name,
    description: "",
    scanDepth: 2,
    tokenBudget: 1200,
    recursiveScanning: false,
    entries: [],
    createdAt: time,
    updatedAt: time
  };
}

export function createWorldBookEntryDraft(partial: Partial<WorldBookEntry> = {}): WorldBookEntry {
  return {
    id: uid("wbe"),
    name: "",
    comment: "",
    category: "other",
    keys: [],
    secondaryKeys: [],
    content: "",
    enabled: true,
    constant: false,
    selective: false,
    caseSensitive: false,
    priority: 0,
    insertionOrder: 100,
    position: "before_char",
    probability: 100,
    extensions: {},
    ...partial
  };
}

export function createProviderDraft(): AIProviderConfig {
  const time = now();
  return {
    id: uid("provider"),
    name: "OpenAI-compatible",
    providerType: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    defaultModel: "gpt-4o-mini",
    models: [],
    headers: {},
    defaultParams: {
      temperature: 0.7,
      topP: 1,
      maxTokens: 1200,
      stream: false
    },
    capabilities: ["chat", "json"],
    enabled: true,
    createdAt: time,
    updatedAt: time
  };
}

export function createBuiltInPresets(): AIPreset[] {
  return [
    {
      id: "preset_generate_character",
      name: "一句话生成角色卡",
      taskType: "generateCharacter",
      systemPrompt:
        "你是角色卡编辑助手。只输出 JSON，不输出 Markdown。不要替 {{user}} 行动，默认使用中文。",
      userPromptTemplate:
        "根据灵感生成角色卡草稿：{{idea}}。字段包括 name, description, personality, scenario, first_mes, mes_example, tags。",
      outputMode: "json",
      variables: [{ key: "idea", label: "角色灵感", required: true }]
    },
    {
      id: "preset_rewrite_field",
      name: "字段润色",
      taskType: "rewriteField",
      systemPrompt: "你是角色卡字段编辑助手。保持设定一致，不替用户行动。",
      userPromptTemplate: "请将字段 {{field}} 改写为 {{style}} 风格：\n{{content}}",
      outputMode: "plain_text",
      variables: [
        { key: "field", label: "字段名", required: true },
        { key: "style", label: "目标风格", defaultValue: "更自然" },
        { key: "content", label: "字段内容", required: true }
      ]
    },
    {
      id: "preset_worldbook_suggest",
      name: "拆分世界书建议",
      taskType: "worldBookSuggest",
      systemPrompt:
        "你是世界书结构化助手。只输出 JSON 数组，每项包含 name, keys, content, category, constant, selective。keys 是字符串数组。category 使用 character_core/world_background/location/organization/item/rule/route/variable/initialization/frontend/hidden_control/other。",
      userPromptTemplate: "从以下角色卡或长设定文本中抽取适合进入世界书的条目，并自动生成关键词和分类：\n{{source}}",
      outputMode: "json",
      variables: [{ key: "source", label: "角色卡或长设定文本", required: true }]
    },
    {
      id: "preset_validate_card",
      name: "角色卡问题检查",
      taskType: "validateCard",
      systemPrompt:
        "你是角色卡质检助手。只输出 JSON 数组，每项包含 level(error/warning/info), scope, message。重点检查空字段、替 {{user}} 行动、人称混乱、人格矛盾、世界观过多和可拆分到世界书的内容。",
      userPromptTemplate: "请检查以下角色卡并给出可执行问题列表：\n{{character}}",
      outputMode: "json",
      variables: [{ key: "character", label: "角色卡 JSON", required: true }],
      paramsOverride: { temperature: 0.2, maxTokens: 1200 }
    },
    {
      id: "preset_test_chat",
      name: "测试聊天回复",
      taskType: "testChat",
      systemPrompt:
        "你是测试沙盒中的角色扮演模型。严格遵守 Prompt，不替 {{user}} 行动，保持角色语气。",
      userPromptTemplate:
        "以下是 CardForge Studio 构建的完整测试 Prompt。请只输出角色本轮回复。\n\n{{prompt}}",
      outputMode: "plain_text",
      variables: [{ key: "prompt", label: "Prompt 预览", required: true }],
      paramsOverride: { temperature: 0.8, maxTokens: 900 }
    },
    {
      id: "preset_diagnose_test",
      name: "测试诊断报告",
      taskType: "diagnoseTest",
      systemPrompt:
        "你是角色卡测试诊断助手。只输出 JSON 数组，每项包含 level(error/warning/info), scope, message。",
      userPromptTemplate:
        "请诊断以下测试记录，关注人格稳定、设定召回、是否替用户行动、世界书触发准确性和修复建议。\n角色：{{character}}\nPrompt：{{prompt}}\n聊天：{{messages}}\n触发世界书：{{triggered}}",
      outputMode: "json",
      variables: [
        { key: "character", label: "角色", required: true },
        { key: "prompt", label: "Prompt", required: true },
        { key: "messages", label: "聊天", required: true },
        { key: "triggered", label: "触发世界书", required: false }
      ],
      paramsOverride: { temperature: 0.2, maxTokens: 1200 }
    }
  ];
}

export function createPresetDraft(partial: Partial<AIPreset> = {}): AIPreset {
  return {
    id: uid("preset"),
    name: "新 AI 预设",
    description: "",
    taskType: "custom",
    providerId: "",
    modelOverride: "",
    systemPrompt: "你是 CardForge Studio 的创作助手。",
    userPromptTemplate: "{{input}}",
    outputMode: "plain_text",
    paramsOverride: {
      temperature: 0.7,
      maxTokens: 1200
    },
    variables: [{ key: "input", label: "输入", required: true }],
    ...partial
  };
}

export function createCustomTestCaseDraft(partial: Partial<CustomTestCase> = {}): CustomTestCase {
  const time = now();
  return {
    id: uid("case"),
    name: "自定义测试用例",
    prompt: "请保持当前角色回应这个场景。",
    expected: "记录你希望观察的行为、语气或设定召回点。",
    tags: ["custom"],
    enabled: true,
    createdAt: time,
    updatedAt: time,
    ...partial
  };
}

export function createAdvancedDefaults(): AdvancedProjectData {
  const time = now();
  return {
    regexRules: [
      createRegexRuleDraft({
        name: "替用户行动检查",
        pattern: "(你|{{user}})(决定|走向|说|想)",
        replacement: "[可能替用户行动]$&",
        flags: "gi",
        target: "ai_output"
      })
    ],
    variableSystem: createVariableSystemDraft(),
    scripts: [createScriptDraft()],
    frontendPackages: [createFrontendPackageDraft()],
    plugins: [createPluginDraft()],
    compatibilityReports: [
      {
        id: uid("compat"),
        source: "内置初始化",
        level: "partial",
        cardKind: "medium",
        suggestedMode: "advanced",
        importedAsReadonly: false,
        fieldCompleteness: {
          filled: 0,
          total: 0,
          missing: [],
          score: 1
        },
        detected: {
          format: "cardforge-native",
          embeddedWorldBook: false,
          regex: true,
          mvu: true,
          scripts: true,
          frontend: true,
          extensions: true
        },
        dependencies: [
          { type: "regex", label: "Regex Lab", evidence: "内置替用户行动检查" },
          { type: "mvu", label: "变量系统", evidence: "默认变量树" },
          { type: "script", label: "脚本管理器", evidence: "只读脚本草案" },
          { type: "frontend", label: "前端沙盒", evidence: "静态预览草案" }
        ],
        readonlyReasons: [],
        recommendedActions: ["高级模块已初始化，可按需启用。"],
        notes: ["高级模块已建立数据结构，未知脚本默认禁用。"],
        createdAt: time
      }
    ]
  };
}

export function createRegexRuleDraft(partial: Partial<RegexRule> = {}): RegexRule {
  const time = now();
  return {
    id: uid("regex"),
    name: "新正则规则",
    pattern: "",
    replacement: "",
    flags: "g",
    enabled: true,
    target: "ai_output",
    order: 100,
    tags: [],
    createdAt: time,
    updatedAt: time,
    ...partial
  };
}

export function createVariableSystemDraft(): VariableSystem {
  const time = now();
  return {
    id: uid("vars"),
    name: "默认变量树",
    state: {
      player: { hp: 100, location: "未设定" },
      world: { day: 1, weather: "晴" },
      relationships: {}
    },
    history: [],
    updatedAt: time
  };
}

export function createScriptDraft(partial: Partial<CardScript> = {}): CardScript {
  const time = now();
  return {
    id: uid("script"),
    name: "只读脚本草案",
    language: "javascript",
    source: "// 未知脚本默认不执行。请在受信任后再启用。",
    trigger: "manual",
    permissions: [],
    enabled: false,
    compatibility: "unknown",
    notes: "CardForge 第一版只做静态管理，不 eval 未知代码。",
    createdAt: time,
    updatedAt: time,
    ...partial
  };
}

export function createFrontendPackageDraft(partial: Partial<FrontendCardPackage> = {}): FrontendCardPackage {
  const time = now();
  return {
    id: uid("frontend"),
    name: "前端卡沙盒草案",
    html: "<section><h1>CardForge Frontend Card</h1><p>静态预览已启用。</p></section>",
    css: "body{font-family:sans-serif;padding:16px;color:#172033} h1{font-size:20px}",
    js: "console.log('脚本默认禁用，需受信任后手动开启。')",
    assetIds: [],
    allowScripts: false,
    manifest: { permissions: [] },
    createdAt: time,
    updatedAt: time,
    ...partial
  };
}

export function createPluginDraft(partial: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "local.example-plugin",
    name: "本地插件示例",
    version: "0.1.0",
    main: "dist/index.js",
    enabled: false,
    permissions: ["project.read"],
    contributes: {
      panels: [{ id: "example", title: "示例面板", location: "rightPanel" }]
    },
    trusted: false,
    notes: "插件运行时仅保留草案，默认禁用且不能读取 API Key。",
    ...partial
  };
}

export function createProjectDraft(name = "我的 CardForge 项目", mode: "light" | "advanced" = "light"): CardProject {
  const time = now();
  const character = createCharacterDraft("示例角色");
  const worldBook = createWorldBookDraft("示例世界书");
  Object.assign(character, {
    description: "示例角色是边境药坊的年轻记录员，负责整理月草、梦境污染和旅人病历。",
    personality: "耐心、谨慎，习惯先观察再回答。她会提醒 {{user}} 注意寒夜和药量。",
    scenario: "{{user}} 在雪夜来到边境药坊，想打听月草的线索。",
    firstMessage: "门外的雪还没停，示例角色把药柜上的铜铃按住。“先进来吧。你是为了月草来的？”",
    exampleMessages:
      "<START>\n{{user}}: 月草真的能稳定梦境污染吗？\n{{char}}: 能，但不能乱用。它会先放大梦境里的裂缝，再把裂缝边缘缝合起来。",
    systemPrompt: "保持角色视角，不替 {{user}} 行动。回答要简洁、可测试。",
    tags: ["示例", "轻量卡", "月草"],
    creator: "CardForge Studio",
    version: "0.1.0"
  });
  worldBook.entries = [
    createWorldBookEntryDraft({
      name: "世界核心",
      category: "world_background",
      keys: ["月草", "药师"],
      content: "月草是寒地稀有药材，常被药师用于稳定梦境污染。",
      insertionOrder: 10
    })
  ];
  character.linkedWorldBooks = [worldBook.id];
  return {
    id: uid("project"),
    name,
    description: "",
    mode,
    characters: [character],
    worldBooks: [worldBook],
    assets: [],
    aiProviders: [createProviderDraft()],
    aiPresets: createBuiltInPresets(),
    aiLogs: [],
    tests: [],
    testCases: [],
    versions: [],
    exports: [],
    advanced: createAdvancedDefaults(),
    createdAt: time,
    updatedAt: time
  };
}
