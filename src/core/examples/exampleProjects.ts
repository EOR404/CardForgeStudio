import {
  createFrontendPackageDraft,
  createPluginDraft,
  createProjectDraft,
  createRegexRuleDraft,
  createScriptDraft,
  createWorldBookEntryDraft,
  uid
} from "../schema/defaults";
import type { Asset, CardProject } from "../schema/types";

export type ExampleProjectDefinition = {
  id: string;
  name: string;
  description: string;
  guideMarkdown: string;
  create: () => CardProject;
};

const samplePng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSHzRgQAAAABJRU5ErkJggg==";

export const exampleProjects: ExampleProjectDefinition[] = [
  {
    id: "light-character",
    name: "轻量角色卡示例",
    description: "单角色、头像、V2 导出和轻量试聊的最短路径。",
    guideMarkdown: guide(
      "轻量角色卡示例",
      "适合第一次打开 CardForge Studio 的轻量制卡用户。",
      [
        "从示例创建项目后进入角色卡页，查看林溪的基础字段、备用开场白和 V2 JSON 预览。",
        "进入资源页，确认示例头像已经关联到角色，并可重新标记为导出封面。",
        "进入测试页发送一轮消息，观察 Prompt 预览和触发日志。",
        "进入导出页选择 V2 JSON 或 V2 PNG，确认发布前检查后导出。"
      ],
      ["项目处于轻量制卡模式。", "至少包含 1 个角色和 1 张图片资源。", "适合验证从制卡到导出的最短闭环。"]
    ),
    create: createLightCharacterExample
  },
  {
    id: "worldbook-driven",
    name: "世界书驱动卡示例",
    description: "角色主字段保持简洁，核心设定拆入世界书条目。",
    guideMarkdown: guide(
      "世界书驱动卡示例",
      "适合学习把背景、组织、规则拆入世界书的作者。",
      [
        "从示例创建项目后进入世界书页，查看雾城、失灯者和巡夜规则条目。",
        "在触发测试中输入“我在雾城遇见失灯者”，观察关键词命中和常驻条目。",
        "返回角色卡页，确认角色主字段保持精炼，世界书通过 linkedWorldBooks 绑定。",
        "在导出页选择嵌入世界书，生成 V2 JSON 并检查 character_book。"
      ],
      ["包含 1 个角色和 1 个世界书。", "世界书条目带分类、关键词、常驻规则和插入顺序。", "适合验证世界书驱动卡流程。"]
    ),
    create: createWorldBookDrivenExample
  },
  {
    id: "mvu-variable",
    name: "MVU 变量卡示例",
    description: "预置变量树和 MVU 命令识别样例。",
    guideMarkdown: guide(
      "MVU 变量卡示例",
      "适合调试变量树、状态更新和变量驱动世界书的重型卡作者。",
      [
        "从示例创建项目后进入高级页的 Variable Lab，查看 player、characters、quests 状态树。",
        "粘贴 _.set('quests.lostLamp.clueCount', 1) 或 JSON Patch，预览变量 diff。",
        "进入世界书页查看变量更新示例条目，并尝试输入“线索”。",
        "在测试页查看变量状态如何进入 Prompt 链路。"
      ],
      ["项目处于高级工程模式。", "角色绑定默认变量系统。", "适合验证 MVU / JSON Patch / 状态块解析入口。"]
    ),
    create: createMvuExample
  },
  {
    id: "regex-lab",
    name: "Regex 调试示例",
    description: "展示正则流水线、替用户行动标记和输出替换。",
    guideMarkdown: guide(
      "Regex 调试示例",
      "适合检查 AI 输出替换、变量提取和正则执行顺序。",
      [
        "从示例创建项目后进入高级页的 Regex Lab。",
        "在测试文本中输入“{{user}}决定打开门”，观察替用户行动标记。",
        "切换到 MVU 提取规则，测试 _.set(...) 文本如何被标记。",
        "在导出页选择不同兼容目标，查看标准 V2 对正则依赖的警告。"
      ],
      ["包含至少 2 条正则规则。", "规则带 target、order 和 replacement。", "适合验证 Regex Lab 流水线。"]
    ),
    create: createRegexExample
  },
  {
    id: "frontend-init",
    name: "前端初始化卡示例",
    description: "包含 HTML/CSS/JS 片段，默认受限 iframe 预览。",
    guideMarkdown: guide(
      "前端初始化卡示例",
      "适合查看前端卡 HTML/CSS/JS 的安全预览方式。",
      [
        "从示例创建项目后进入高级页的 Frontend Sandbox。",
        "查看状态面板初始化页的 HTML、CSS 和默认禁用的 JS。",
        "打开沙盒预览，观察权限审计、按钮标签和 sandbox 日志。",
        "需要测试脚本时只在理解风险后手动开启 allowScripts。"
      ],
      ["包含 1 个前端卡包。", "角色绑定 frontendPackageId。", "脚本默认不运行，适合验证受限 iframe 预览。"]
    ),
    create: createFrontendExample
  },
  {
    id: "script-manager",
    name: "脚本管理示例",
    description: "演示 STscript / Quick Reply / JavaScript 的只读管理。",
    guideMarkdown: guide(
      "脚本管理示例",
      "适合整理 STscript、Quick Reply 和外部脚本线索。",
      [
        "从示例创建项目后进入高级页的 Script Manager。",
        "查看开局状态初始化和 Quick Reply 草案的 language、trigger、compatibility。",
        "确认脚本默认禁用，只做静态管理和安全提示。",
        "在导出页查看脚本依赖如何进入依赖说明。"
      ],
      ["包含多种脚本草案。", "角色通过 linkedScripts 关联脚本。", "适合验证未知脚本默认不执行。"]
    ),
    create: createScriptExample
  },
  {
    id: "plugin-dev",
    name: "插件开发示例",
    description: "包含插件 manifest、权限和贡献点草案。",
    guideMarkdown: guide(
      "插件开发示例",
      "适合插件开发者了解 manifest、权限和 contributes 草案。",
      [
        "从示例创建项目后进入高级页的 Plugin Manager。",
        "查看 WorldBook Auditor 的 id、version、main、permissions 和 contributes。",
        "尝试添加危险权限，观察安全审计提示。",
        "参考 docs/插件开发草案.md 扩展本地插件接口。"
      ],
      ["包含 1 个插件 manifest。", "插件默认未受信任且不执行。", "适合验证插件权限审计和文档入口。"]
    ),
    create: createPluginExample
  },
  {
    id: "multi-project-assets",
    name: "多项目资源库示例",
    description: "多角色、多资源、标签和导出封面选择样例。",
    guideMarkdown: guide(
      "多项目资源库示例",
      "适合学习图片资源、标签、角色关联和导出封面选择。",
      [
        "从示例创建项目后进入资源页，查看头像和导出封面资源。",
        "切换资源详情，观察关联角色、用途标签和使用记录。",
        "进入导出页，确认图片会按头像、封面和角色关联自动排序。",
        "可勾选多张图片批量导出 V2 PNG。"
      ],
      ["包含多角色和多图片资源。", "图片带用途、标签和角色关联。", "适合验证资源库到导出的图片选择流程。"]
    ),
    create: createAssetLibraryExample
  }
];

function guide(title: string, audience: string, steps: string[], checkpoints: string[]): string {
  return [
    `# ${title}`,
    "",
    "## 适合",
    audience,
    "",
    "## 操作路径",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## 验收点",
    ...checkpoints.map((item) => `- ${item}`)
  ].join("\n");
}

function createBase(name: string, description: string, mode: "light" | "advanced" = "advanced"): CardProject {
  const project = createProjectDraft(name, mode);
  project.description = description;
  project.characters = [];
  project.worldBooks = [];
  project.assets = [];
  project.tests = [];
  project.versions = [];
  project.exports = [];
  return project;
}

function createLightCharacterExample(): CardProject {
  const project = createBase("轻量角色卡示例", "快速制卡、设头像、试聊和导出 V2 JSON/PNG 的示例。", "light");
  const character = createProjectDraft("tmp").characters[0];
  Object.assign(character, {
    name: "林溪",
    description: "林溪是旧书店的夜班店员，习惯把客人的烦恼夹进书页里慢慢整理。",
    personality: "温和、敏锐，偶尔用轻微的玩笑缓和气氛。",
    scenario: "{{user}} 在雨夜走进即将打烊的旧书店。",
    firstMessage: "门铃轻响，林溪从柜台后的台灯旁抬头。“雨下得很急，要不要先擦擦外套？”",
    exampleMessages: "<START>\n{{user}}: 你这里有适合失眠的人看的书吗？\n{{char}}: 有，但我更想先问问你，是睡不着，还是不太想睡？",
    tags: ["轻量卡", "现代", "旧书店"],
    creator: "CardForge Studio",
    version: "example-1.0"
  });
  const asset = createImageAsset("linxi-avatar.png", ["头像", "示例"], [character.id]);
  character.avatarAssetId = asset.id;
  project.characters = [character];
  project.assets = [asset];
  return project;
}

function createWorldBookDrivenExample(): CardProject {
  const project = createBase("世界书驱动卡示例", "用世界书承载背景、组织和规则，角色字段保持精炼。");
  const character = createProjectDraft("tmp").characters[0];
  character.name = "巡夜人艾蔻";
  character.description = "艾蔻负责巡查雾城边界，熟悉钟塔、灰巷和失灯者传闻。";
  character.personality = "警觉、克制，信任需要被慢慢建立。";
  character.scenario = "{{user}} 在雾城宵禁后遇见艾蔻。";
  character.firstMessage = "“停下。”艾蔻举起旧式提灯，灯芯却是冷蓝色的。“宵禁后还在街上，你最好有个可信的理由。”";
  character.tags = ["世界书驱动", "雾城"];
  const worldBook = createProjectDraft("tmp").worldBooks[0];
  worldBook.name = "雾城主世界书";
  worldBook.description = "雾城、钟塔、灰巷和失灯者的核心设定。";
  worldBook.entries = [
    createWorldBookEntryDraft({
      name: "雾城",
      category: "location",
      keys: ["雾城", "灰雾"],
      content: "雾城被潮湿灰雾包围，钟塔负责每日三次净雾钟声。",
      insertionOrder: 10
    }),
    createWorldBookEntryDraft({
      name: "失灯者",
      category: "character_core",
      keys: ["失灯者", "灯灭"],
      content: "失灯者是在灰雾中失去姓名的人，通常会避开钟声。",
      insertionOrder: 20
    }),
    createWorldBookEntryDraft({
      name: "巡夜规则",
      category: "rule",
      constant: true,
      content: "巡夜人不能在没有证据时伤害平民，但会记录所有宵禁违规。",
      insertionOrder: 1
    })
  ];
  character.linkedWorldBooks = [worldBook.id];
  project.characters = [character];
  project.worldBooks = [worldBook];
  return project;
}

function createMvuExample(): CardProject {
  const project = createWorldBookDrivenExample();
  project.id = uid("project");
  project.name = "MVU 变量卡示例";
  project.description = "演示变量树、好感度、地点和任务状态。";
  project.advanced.variableSystem.state = {
    player: { hp: 100, coins: 12, location: "雾城灰巷" },
    characters: { echo: { affection: 20, trust: 10, status: "巡夜中" } },
    quests: { lostLamp: { state: "未开始", clueCount: 0 } }
  };
  project.characters[0].linkedVariableSystem = project.advanced.variableSystem.id;
  project.worldBooks[0].entries.push(
    createWorldBookEntryDraft({
      name: "变量更新示例",
      category: "variable",
      keys: ["线索", "失灯者"],
      content: "当 {{user}} 找到线索时，AI 可能输出 _.set('quests.lostLamp.clueCount', 1)。",
      insertionOrder: 30
    })
  );
  return project;
}

function createRegexExample(): CardProject {
  const project = createBase("Regex 调试示例", "预置多条正则规则，用于测试 AI 输出替换和变量更新提取。");
  project.characters = createLightCharacterExample().characters;
  project.advanced.regexRules = [
    createRegexRuleDraft({
      name: "标记替用户行动",
      pattern: "({{user}}|你)(决定|走向|说|想)",
      replacement: "[可能替用户行动]$&",
      flags: "gi",
      target: "ai_output",
      order: 1
    }),
    createRegexRuleDraft({
      name: "提取 MVU set 命令",
      pattern: "_\\.set\\(([^)]+)\\)",
      replacement: "[变量更新:$1]",
      flags: "g",
      target: "variable_extract",
      order: 2
    })
  ];
  return project;
}

function createFrontendExample(): CardProject {
  const project = createBase("前端初始化卡示例", "保存前端 HTML/CSS/JS 片段并使用 iframe sandbox 预览。");
  project.characters = createLightCharacterExample().characters;
  project.advanced.frontendPackages = [
    createFrontendPackageDraft({
      name: "状态面板初始化页",
      html: "<main><h1>雾城状态</h1><p id=\"status\">等待巡夜人确认身份。</p><button>确认</button></main>",
      css: "body{margin:0;background:#f6fbfa;color:#172033;font-family:sans-serif}main{padding:18px}button{border:0;background:#0f766e;color:white;padding:8px 12px;border-radius:6px}",
      js: "document.querySelector('button')?.addEventListener('click',()=>{document.querySelector('#status').textContent='身份已确认';});",
      allowScripts: false,
      manifest: { permissions: [], entry: "index.html", risk: "sandboxed-preview" }
    })
  ];
  project.characters[0].frontendPackageId = project.advanced.frontendPackages[0].id;
  return project;
}

function createScriptExample(): CardProject {
  const project = createBase("脚本管理示例", "展示脚本只读管理和兼容性标注。");
  project.characters = createLightCharacterExample().characters;
  project.advanced.scripts = [
    createScriptDraft({
      name: "开局状态初始化",
      language: "stscript",
      source: "/setvar key=location 雾城灰巷\n/setvar key=trust 10",
      trigger: "on_card_init",
      compatibility: "partial",
      notes: "示例只静态查看，不直接执行。"
    }),
    createScriptDraft({
      name: "Quick Reply 草案",
      language: "quick-reply",
      source: "巡夜日志::请用三条短句总结当前线索。",
      trigger: "manual",
      compatibility: "external"
    })
  ];
  project.characters[0].linkedScripts = project.advanced.scripts.map((script) => script.id);
  return project;
}

function createPluginExample(): CardProject {
  const project = createBase("插件开发示例", "插件 manifest、权限和贡献点草案。");
  project.advanced.plugins = [
    createPluginDraft({
      id: "example.worldbook-auditor",
      name: "WorldBook Auditor",
      version: "0.1.0",
      permissions: ["project.read", "worldbook.read", "worldbook.write"],
      contributes: {
        panels: [{ id: "worldbookAudit", title: "世界书审计", location: "rightPanel" }],
        commands: [{ id: "worldbook.audit", title: "检查世界书关键词" }]
      }
    })
  ];
  return project;
}

function createAssetLibraryExample(): CardProject {
  const project = createBase("多项目资源库示例", "多角色、多图片资源、标签和关联关系样例。");
  const base = createLightCharacterExample();
  const second = createWorldBookDrivenExample().characters[0];
  const assetA = createImageAsset("linxi-avatar.png", ["头像", "现代"], [base.characters[0].id], "avatar");
  const assetB = createImageAsset("echo-cover.png", ["封面", "雾城"], [second.id], "export-cover");
  base.characters[0].avatarAssetId = assetA.id;
  second.avatarAssetId = assetB.id;
  project.characters = [base.characters[0], second];
  project.assets = [assetA, assetB];
  project.worldBooks = createWorldBookDrivenExample().worldBooks;
  project.characters[1].linkedWorldBooks = [project.worldBooks[0].id];
  return project;
}

function createImageAsset(name: string, tags: string[], linkedCharacterIds: string[], purpose: Asset["purpose"] = "reference"): Asset {
  const time = Date.now();
  return {
    id: uid("asset"),
    name,
    type: "image",
    purpose,
    source: "imported",
    mimeType: "image/png",
    dataUrl: samplePng,
    thumbnailUrl: samplePng,
    tags,
    linkedCharacterIds,
    linkedWorldBookIds: [],
    notes: "内置示例图，仅用于资源库和导出流程演示。",
    createdAt: time,
    updatedAt: time
  };
}
