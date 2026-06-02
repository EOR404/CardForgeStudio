# 项目要求.md

# CardForge Studio（卡铸工坊）项目需求文档

> 文档版本：v1.0  
> 项目名称：CardForge Studio  
> 项目缩写：CFS  
> 中文名：卡铸工坊  
> 项目目录名：cardforge-studio  
> 内部项目格式名：.cardforge  
> 项目包扩展名：.cardforge.zip  
> 项目定位：个人向、轻量化、本地优先、可扩展的 AI 角色卡 / 世界书 / 重型前端卡创作、调试、资源管理与多标准导出工具  
> 面向生态：SillyTavern / TavernAI / Character Card V1/V2/V3 / Chub 兼容卡 / 世界书驱动卡 / MVU 变量卡 / 正则脚本卡 / 前端渲染卡  
> 开发目标：让用户在一个软件中完成“制卡 → 资源管理 → AI 辅助 → 调试 → 版本对比 → 导出”的完整闭环，不再需要反复在文件管理器、SillyTavern、制卡 Bot、图片工具和 JSON 编辑器之间切换。

---

## 1. 项目总目标

本项目要开发一款桌面与移动端均可使用的角色卡创作工作台。软件应支持轻量角色卡和重型工程化角色卡两种使用路径。

核心目标如下：

1. 支持制作、编辑、导入、导出 Character Card V1、V2、V3，以及 V2 PNG 角色卡。
2. 支持创建、编辑、导入、导出世界书 / World Info / Lorebook。
3. 支持 AI 辅助生成角色卡、世界书、开场白、示例对话、图片提示词、调试报告和修复建议。
4. 支持用户自定义 AI 服务 URL、API Key、模型名、参数和任务分工。
5. 支持不同 AI 负责不同任务，例如文本生成、结构分析、JSON 修复、图片生成、视觉分析、测试诊断。
6. 支持多项目管理、资源库、图片库、预设库、版本快照、导出历史。
7. 支持轻量化测试聊天，用户可以直接在本软件内试卡，不必每次导入 SillyTavern 后再测试。
8. 支持 Prompt 构建链路可视化、世界书触发日志、变量更新日志、正则流水线测试、脚本执行日志。
9. 支持识别和部分适配现代重型角色卡，包括世界书驱动卡、MVU 变量卡、正则卡、脚本卡、前端渲染卡。
10. 支持插件系统，允许高级用户为软件增加导入器、导出器、面板、脚本适配器、重型卡运行时等功能。
11. 以轻量、本地优先、用户可控为原则，不做强制云端、不做强制账号、不绑定单一模型平台。

---

## 2. 产品定位

本软件不是普通聊天软件，也不是完整替代 SillyTavern 的角色扮演前端。

本软件的定位是：

> AI 角色卡 / 世界书 / 前端卡 / 变量卡 / 脚本卡的创作、调试、资源管理与导出工作台。

软件负责：

- 角色卡创建
- 世界书创建
- AI 辅助生成
- 字段级编辑
- 图片资源管理
- 变量管理
- 正则管理
- 脚本识别与沙盒测试
- 前端卡静态 / 沙盒预览
- 轻量测试聊天
- 调试诊断
- 版本快照
- 格式转换
- 多标准导出
- 插件扩展

软件不负责：

- 完整复刻 SillyTavern 的所有聊天生态
- 完整运行所有第三方 SillyTavern 扩展
- 作为长期角色扮演主聊天工具
- 云同步、多人协作、模板市场等商业化功能，除非后续扩展

---

## 3. 用户类型

### 3.1 轻量制卡用户

这类用户主要需求：

- 快速生成角色卡
- 修改角色描述、性格、场景、开场白
- 选择头像
- 简单测试对话
- 导出 V2 PNG 或 V2 JSON
- 不希望看到过多复杂概念，例如 MVU、脚本、插件、正则

这类用户应该进入“轻量制卡模式”。

### 3.2 高级制卡用户

这类用户主要需求：

- 制作多角色项目
- 管理大型世界书
- 使用 AI 分阶段生成和修复
- 使用测试沙盒调试角色稳定性
- 对比不同版本
- 维护资源库、预设库
- 使用正则、变量、脚本和前端 UI

这类用户应该进入“高级工程模式”。

### 3.3 重型卡作者

这类用户主要需求：

- 导入复杂角色卡
- 识别内嵌世界书、正则、MVU、脚本、前端界面
- 查看依赖报告
- 测试世界书触发
- 测试正则流水线
- 调试变量更新
- 沙盒运行前端初始化页面
- 编写插件适配某些社区格式
- 导出依赖说明

这类用户主要使用“重型卡工程视图”。

### 3.4 插件开发者

这类用户主要需求：

- 开发导入器 / 导出器
- 开发面板插件
- 开发运行时适配器
- 开发 MVU 兼容层
- 开发某社区重型卡解析器
- 使用受限 API 操作项目、角色卡、世界书、变量、测试沙盒

这类用户需要插件开发文档和示例插件。

---

## 4. 推荐技术栈

### 4.1 主推荐

桌面端：

```text
Tauri 2 + React + TypeScript + Vite
```

原因：

- 轻量
- 跨平台
- 适合本地文件管理
- 前端生态丰富
- 适合复杂 UI
- 比 Electron 更轻

### 4.2 前端技术

```text
React
TypeScript
Vite
Zustand
Zod
React Hook Form
Tailwind CSS
Monaco Editor
```

用途：

- React：界面组件
- TypeScript：类型安全，适合多格式角色卡和插件 API
- Zustand：轻量状态管理
- Zod：角色卡 / 世界书 / AI 输出 / 插件 manifest 校验
- React Hook Form：表单编辑
- Tailwind CSS：快速构建响应式 UI
- Monaco Editor：JSON、脚本、Prompt、正则编辑器

### 4.3 数据存储

第一阶段：

```text
项目文件夹 + JSON 文件
```

后续增强：

```text
SQLite 索引
```

数据原则：

- 角色卡、世界书、脚本、资源、导出文件保存为用户可见文件。
- SQLite 仅用于索引、标签、搜索、最近打开、资源关联、导出记录等。
- 不要把用户资源锁死在单一数据库中。

### 4.4 手机端策略

手机端不单独写一套功能逻辑。

采用：

```text
同一套 React/TypeScript 核心
桌面：Tauri
移动：响应式 PWA 优先
后续可选：Capacitor 或 Tauri Mobile
```

UI 原则：

- 桌面多栏工作台
- 手机单栏任务流
- 核心组件复用
- 只切换布局壳，不复制业务逻辑

---

## 5. 整体架构

推荐源码结构：

```text
src/
├── core/
│   ├── schema/
│   ├── importer/
│   ├── exporter/
│   ├── worldbook/
│   ├── ai/
│   ├── tester/
│   ├── prompt-builder/
│   ├── regex/
│   ├── variable-system/
│   ├── script-runtime/
│   └── plugin-runtime/
│
├── components/
│   ├── CharacterEditor/
│   ├── WorldBookEditor/
│   ├── AssetLibrary/
│   ├── PresetEditor/
│   ├── TestSandbox/
│   ├── ExportPanel/
│   ├── RegexLab/
│   ├── VariableLab/
│   ├── ScriptManager/
│   └── FrontendCardSandbox/
│
├── layouts/
│   ├── DesktopLayout.tsx
│   └── MobileLayout.tsx
│
├── pages/
│   ├── ProjectsPage.tsx
│   ├── DashboardPage.tsx
│   ├── CharactersPage.tsx
│   ├── WorldBooksPage.tsx
│   ├── AssetsPage.tsx
│   ├── PresetsPage.tsx
│   ├── TestPage.tsx
│   ├── ExportPage.tsx
│   ├── AdvancedPage.tsx
│   └── SettingsPage.tsx
│
├── storage/
│   ├── StorageAdapter.ts
│   ├── TauriStorage.ts
│   ├── BrowserStorage.ts
│   └── IndexedDbStorage.ts
│
└── plugins/
    ├── api/
    ├── sandbox/
    └── loader/
```

---

## 6. 项目文件结构

每个用户项目应是一个可见文件夹。

示例：

```text
CardLabProjects/
└── snow-healer/
    ├── project.json
    ├── characters/
    │   ├── lia.character.json
    │   └── elaine.character.json
    ├── worldbooks/
    │   ├── elysia.worldbook.json
    │   └── moon_church.worldbook.json
    ├── assets/
    │   ├── images/
    │   ├── texts/
    │   ├── references/
    │   └── thumbnails/
    ├── presets/
    │   ├── generation/
    │   ├── testing/
    │   ├── export/
    │   ├── image/
    │   └── prompt/
    ├── regex/
    │   └── rules.json
    ├── variables/
    │   ├── schema.json
    │   └── states/
    ├── scripts/
    │   ├── init/
    │   ├── quick-replies/
    │   ├── mvu/
    │   ├── frontend/
    │   └── custom/
    ├── frontend/
    │   ├── index.html
    │   ├── style.css
    │   ├── main.js
    │   └── manifest.json
    ├── tests/
    │   ├── reports/
    │   ├── sessions/
    │   └── failure-cases/
    ├── versions/
    │   ├── characters/
    │   ├── worldbooks/
    │   └── project-snapshots/
    ├── exports/
    │   ├── v1/
    │   ├── v2/
    │   ├── png/
    │   ├── v3/
    │   └── worldbooks/
    └── logs/
```

项目文件夹必须支持完整备份和迁移。

---

## 7. 主界面布局

### 7.1 桌面端布局

桌面端采用多栏工作台。

总体结构：

```text
顶部栏：
- 当前项目名
- 当前角色/世界书
- 快速保存
- AI 状态
- 当前模式：轻量制卡 / 高级工程
- 导出按钮
- 设置按钮

左侧栏：
- 项目树
- 角色卡
- 世界书
- 图片资源
- 预设
- 测试记录
- 版本历史
- 导出记录
- 高级模块入口

中间主区：
- 当前编辑器
- 角色卡字段编辑器
- 世界书编辑器
- 资源库
- 测试聊天
- 正则实验室
- 变量实验室
- 脚本管理器
- 前端卡沙盒

右侧检查器：
- AI 助手
- 字段操作
- 兼容性报告
- 质量检查
- Token 统计
- 世界书触发日志
- 变量 diff
- 脚本日志

底部面板：
- Prompt 预览
- 调试控制台
- 运行日志
- 导出警告
```

### 7.2 手机端布局

手机端采用单栏任务流，不直接套桌面多栏。

底部 Tab：

```text
[项目] [制卡] [资源] [测试] [导出]
```

高级模式下增加：

```text
[高级]
```

手机端页面流程：

```text
项目列表
↓
项目仪表盘
↓
角色列表
↓
字段列表
↓
字段详情编辑
↓
AI 操作
↓
测试
↓
导出
```

手机端原则：

- 不同面板改为页面栈。
- 字段以卡片形式展示。
- 编辑字段时进入全屏编辑页。
- AI 操作使用底部抽屉。
- Prompt 预览、变量日志、脚本日志放入折叠面板。
- 重型功能默认隐藏在高级模式中。

---

## 8. 模式设计

### 8.1 轻量制卡模式

轻量制卡模式面向普通用户。

只展示：

- 项目
- 角色卡
- 世界书基础编辑
- 图片库
- AI 辅助
- 轻量测试
- 导出
- 质量检查
- Token 预算

隐藏：

- MVU
- 脚本
- 正则
- 插件
- 前端卡沙盒
- 依赖图
- 高级 Prompt 构建链

### 8.2 高级工程模式

高级工程模式面向重型卡作者。

展示：

- 世界书主视图
- Regex Lab
- MVU / 变量系统
- 脚本管理器
- 前端卡沙盒
- 插件管理
- 依赖管理器
- Prompt 构建链路
- 调试控制台
- 状态时间线
- 导出兼容报告

### 8.3 自动识别卡片类型

导入角色卡后自动判断卡片类型。

轻量卡特征：

- description/personality/scenario/first_mes 内容完整
- 内嵌世界书少或无
- 无正则
- 无脚本
- 无前端 UI
- 无 MVU
- 无复杂 extensions

中型卡特征：

- 有内嵌世界书
- 有少量正则
- 有少量变量或初始化说明
- 无复杂前端

重型卡特征：

- description 很短或几乎为空
- 内嵌世界书条目很多
- 有正则
- 有 MVU 变量痕迹
- 有脚本 / Quick Reply / STscript
- 有 HTML/CSS/JS 前端
- 有状态栏、按钮、初始化界面
- 有第三方扩展依赖

导入后生成识别报告，并建议工作模式。

---

## 9. 多项目管理

### 9.1 项目列表页

显示：

- 项目名称
- 项目封面
- 最近编辑时间
- 角色卡数量
- 世界书数量
- 资源数量
- 测试报告数量
- 当前兼容目标
- 最近打开状态

操作：

- 新建项目
- 打开项目文件夹
- 导入项目包
- 复制项目
- 删除项目索引
- 打包备份项目
- 从模板创建项目

### 9.2 项目仪表盘

打开项目后显示：

```text
项目：雪国药师系列

角色卡：3 张
世界书：4 个
图片资源：28 张
测试报告：12 个
导出文件：9 个
脚本：5 个
正则：12 条
变量系统：已启用

最近编辑：
- 莉娅 v4
- 艾尔西亚主世界书
- 冷淡角色稳定性测试

待处理问题：
- 莉娅 v4 有 2 条测试失败
- 主世界书有 3 个条目没有关键词
- 有 5 张图片未关联任何角色
- 当前导出到 V1 会丢失 4 类数据
```

### 9.3 项目模板

内置模板：

- 单角色轻量卡项目
- 多角色世界观项目
- 世界书驱动卡项目
- MVU 变量卡项目
- 前端初始化卡项目
- Regex 调试项目
- 插件开发项目

---

## 10. 角色卡编辑功能

### 10.1 支持格式

必须支持：

- TavernAI / Character Card V1
- Character Card V2
- Character Card V3
- V2 PNG 角色卡
- 普通 JSON
- 内部项目格式
- CardForge 项目包

### 10.2 内部角色卡模型

软件内部不应直接以 V1/V2/V3 作为唯一模型，应使用更完整的中间模型。

```ts
type InternalCharacter = {
  id: string
  name: string
  nickname?: string
  description: string
  personality?: string
  scenario?: string
  firstMessage: string
  exampleMessages?: string
  alternateGreetings: string[]
  systemPrompt?: string
  postHistoryInstructions?: string
  creatorNotes?: string
  tags: string[]
  creator?: string
  version?: string
  characterBook?: InternalWorldBook
  assets?: Asset[]
  extensions: Record<string, unknown>
  linkedWorldBooks: string[]
  linkedScripts: string[]
  linkedRegexRules: string[]
  linkedVariableSystem?: string
  frontendPackageId?: string
}
```

### 10.3 字段编辑器

字段包括：

基础字段：

- name
- nickname
- tags
- creator
- character_version

核心提示字段：

- description
- personality
- scenario
- first_mes
- mes_example

高级字段：

- system_prompt
- post_history_instructions
- alternate_greetings
- creator_notes
- extensions
- character_book

每个字段旁边提供 AI 操作：

- 生成
- 润色
- 扩写
- 缩短
- 改风格
- 检查问题
- 拆分到世界书
- 仅重生成此字段
- 与旧版本对比

### 10.4 字段质量检查

检查项：

- 字段是否为空
- first_mes 是否替用户行动
- description 是否过长
- personality 是否和 description 重复
- scenario 是否明确
- mes_example 是否格式规范
- 是否有 OOC 指令混杂
- 是否有人称混乱
- 是否包含过多世界观信息
- 是否适合拆入世界书
- 是否存在明显矛盾

### 10.5 Token 预算助手

显示每部分 token 占用：

```text
总 token：3200
description：1800
personality：300
scenario：250
first_mes：220
mes_example：600
常驻世界书：250
```

提供操作：

- 压缩到指定 token
- 删除重复内容
- 把背景拆到世界书
- 压缩示例对话
- 保留人格，压缩世界观
- 低 token 模式生成

---

## 11. 世界书功能

### 11.1 世界书定位

世界书用于存放不一定每轮都需要，但在关键词、变量或场景条件满足时应插入 prompt 的设定。

### 11.2 世界书编辑器字段

每条世界书条目应支持：

```ts
type WorldBookEntry = {
  id: string
  name?: string
  comment?: string
  keys: string[]
  secondaryKeys: string[]
  content: string
  enabled: boolean
  constant: boolean
  selective: boolean
  caseSensitive: boolean
  priority: number
  insertionOrder: number
  position: "before_char" | "after_char" | "at_depth" | "authors_note"
  depth?: number
  probability?: number
  conditions?: WorldBookEntryCondition[]
  extensions?: Record<string, unknown>
}
```

### 11.3 世界书主视图

对于世界书驱动卡，应提供“世界书主视图”。

自动分类：

- 角色核心条目
- 世界背景
- 地点
- 组织
- 物品
- 规则
- 路线
- 变量相关
- 初始化相关
- 前端相关
- 隐藏控制条目

### 11.4 世界书触发模拟器

用户输入测试文本，软件显示：

- 触发了哪些条目
- 为什么触发
- 哪些关键词命中
- 插入顺序
- 插入位置
- token 消耗
- 被预算排除的条目
- 可能应该触发但未触发的条目

### 11.5 世界书问题检查

检查：

- 无关键词条目
- 内容为空条目
- 常驻条目过多
- 重复关键词
- 互相冲突条目
- token 预算不足
- 优先级混乱
- 关键词过宽导致误触发
- 关键词过窄导致不触发

---

## 12. AI 辅助系统

### 12.1 AI Provider 管理

用户必须能自定义：

- Provider 名称
- API 类型
- Base URL
- API Key
- 模型名
- 请求头
- temperature
- top_p
- max_tokens
- stream
- 代理
- 默认任务类型

支持类型：

- OpenAI-compatible
- OpenAI
- DeepSeek
- Anthropic
- Gemini
- Ollama
- LM Studio
- vLLM
- ComfyUI
- Stable Diffusion WebUI
- 自定义 HTTP API

### 12.2 Provider 与 Preset 分离

Provider 负责：

- 连接哪里
- 用什么 key
- 用什么模型

Preset 负责：

- 怎么提示 AI
- 输出什么格式
- 是否要求 JSON
- 使用哪个 schema
- 字段如何填充
- 失败如何重试

### 12.3 AI 分工系统

不同任务可以由不同 AI 完成。

任务类型：

- 角色卡生成
- 字段润色
- 世界书抽取
- JSON 修复
- 格式转换
- 结构检查
- 测试聊天
- 测试诊断
- 图片提示词生成
- 图片生成
- 图片理解
- 变量更新解析
- 脚本分析
- 正则建议

路由配置示例：

```ts
type AIRoutingProfile = {
  id: string
  name: string
  routes: {
    generateCharacter: AIModelRef
    rewriteField: AIModelRef
    generateWorldBook: AIModelRef
    validateCard: AIModelRef
    repairJson: AIModelRef
    testChat: AIModelRef
    diagnoseTest: AIModelRef
    generateImagePrompt: AIModelRef
    generateImage: AIModelRef
    analyzeImage: AIModelRef
  }
}
```

### 12.4 AI 预设系统

预设类型：

- 角色卡生成预设
- 世界书生成预设
- 字段润色预设
- JSON 修复预设
- 测试预设
- 诊断预设
- 图片提示词预设
- 图片生成预设
- 正则生成预设
- MVU 变量生成预设

预设字段：

```ts
type AIPreset = {
  id: string
  name: string
  description?: string
  taskType: string
  providerId?: string
  modelOverride?: string
  systemPrompt: string
  userPromptTemplate: string
  outputMode: "json" | "markdown" | "plain_text" | "yaml" | "custom"
  outputSchema?: object
  paramsOverride?: {
    temperature?: number
    topP?: number
    maxTokens?: number
  }
  variables: PresetVariable[]
}
```

### 12.5 用户自定义输出

用户必须能修改 AI 输出规则。

支持：

- 只输出 JSON
- 输出 Markdown 草稿
- 只输出某个字段
- 输出世界书条目
- 输出图片提示词
- 输出测试报告
- 输出自定义格式

AI 输出后必须经过：

```text
原始输出
↓
解析器
↓
Schema 校验
↓
错误修复
↓
用户确认
↓
写入项目
```

不得无校验覆盖用户数据。

### 12.6 连接测试

Provider 设置页必须有测试按钮。

测试结果要显示：

- 是否连通
- 模型是否可用
- Key 是否有效
- URL 是否可能缺少 /v1
- 返回错误详情
- CORS 问题提示
- 额度或权限问题提示

---

## 13. 图片生成与图片库

### 13.1 图片库

项目资源区应支持：

- 拖入图片
- 生成缩略图
- 标签
- 搜索
- 重命名
- 备注
- 关联角色
- 关联世界书
- 最近使用
- 收藏
- 一键设为角色头像
- 一键设为导出封面

图片类型：

- 头像
- 半身图
- 全身图
- 背景
- 表情差分
- 地图
- 图标
- 参考图
- 导出封面

### 13.2 全局库与项目库

分为：

- 全局资源库
- 项目资源库

导出时可以选择：

- 当前项目图片
- 全局图片
- 最近使用
- 从文件临时导入

### 13.3 图片生成 AI

支持：

- 根据角色卡生成头像
- 根据 description 生成立绘
- 根据 first_mes 生成场景图
- 生成背景图
- 生成表情差分
- 生成导出卡面图

生成流程：

```text
角色卡字段
↓
图像提示词生成器
↓
用户可编辑 positive / negative prompt
↓
图片生成 Provider
↓
生成多张候选图
↓
保存到项目图片库
↓
可用于导出 PNG 角色卡
```

### 13.4 图片 Provider

支持：

- ComfyUI
- Stable Diffusion WebUI / A1111
- OpenAI-compatible image API
- 自定义 HTTP API
- 本地文件导入

---

## 14. 测试沙盒

### 14.1 轻量聊天测试

用户在软件内直接与角色测试。

功能：

- 使用当前角色卡
- 使用当前世界书
- 使用当前 AI Provider
- 显示当前 Prompt 结构
- 显示触发的世界书
- 显示 token 消耗
- 保存测试会话
- 标记失败样本
- 一键生成修复建议

### 14.2 自动测试用例

内置测试：

- 身份测试
- 人格稳定测试
- 世界观召回测试
- 不替用户行动测试
- 抗 OOC 测试
- 世界书触发测试
- 变量更新测试
- 前端初始化测试

用户可自定义测试用例。

### 14.3 A/B 对比测试

支持比较：

- 角色版本 A vs B
- 世界书版本 A vs B
- Prompt 预设 A vs B
- 模型 A vs B

输出：

- 风格差异
- 稳定性评分
- 设定召回评分
- token 消耗
- 失败样本
- 推荐保留字段

### 14.4 测试诊断报告

报告包括：

- 角色稳定性
- 语气一致性
- 设定召回
- 是否替用户行动
- 世界书触发准确性
- 变量更新准确性
- 正则处理是否正常
- 脚本执行是否成功
- 修复建议

---

## 15. Prompt 构建链路可视化

重型卡必须支持完整 Prompt 链路查看。

显示顺序：

```text
全局 System Prompt
↓
角色卡 system_prompt
↓
角色 description
↓
personality
↓
scenario
↓
世界书常驻条目
↓
世界书关键词触发条目
↓
变量状态注入
↓
前端初始化结果
↓
脚本注入内容
↓
正则处理前内容
↓
正则处理后内容
↓
示例对话
↓
聊天历史
↓
post_history_instructions
↓
用户最新消息
```

每段必须显示：

- 来源
- token 数
- 是否启用
- 插入位置
- 可复制内容
- 可跳转到源条目
- 是否由插件/脚本生成

---

## 16. Regex Lab

### 16.1 正则管理

支持：

- 正则规则列表
- 命中测试
- 替换测试
- 作用位置
- 执行顺序
- 启用/禁用
- 标签
- 备注

作用位置：

- 用户输入
- AI 输出
- Prompt 构建前
- Prompt 构建后
- 消息显示前
- 变量更新提取
- 脚本触发

### 16.2 正则流水线测试

显示：

```text
原始文本
↓
Regex A
↓
Regex B
↓
Regex C
↓
最终文本
```

每一步展示：

- 是否命中
- 命中内容
- 替换结果
- diff
- 执行耗时
- 错误信息

---

## 17. MVU / 变量系统

### 17.1 变量系统定位

变量系统用于支持重型卡的状态管理。

变量可表示：

- 玩家 HP
- 背包
- 金钱
- 地点
- 时间
- 好感度
- 信任值
- 任务状态
- 关系阶段
- 队伍成员
- 世界事件 flag

### 17.2 变量树

界面显示为树：

```text
玩家
├── HP
├── MP
├── 背包

角色
├── 莉娅
│   ├── 好感度
│   ├── 信任
│   └── 状态

世界
├── 日期
├── 地点
└── 天气
```

支持：

- 查看
- 编辑
- 搜索路径
- 类型标注
- 默认值
- 当前值
- 历史值
- 快照
- 回滚

### 17.3 变量更新解析

支持解析：

- MVU 命令
- JSON Patch
- YAML 状态块
- 正则提取
- 插件自定义解析器

显示变量 diff：

```text
角色.莉娅.好感度：20 → 24
玩家.HP：100 → 92
任务.寻找月草：未开始 → 进行中
```

### 17.4 变量注入 Prompt

支持将变量状态注入：

- system_prompt
- character_prompt
- worldbook
- chat message
- custom section

用户可配置注入模板。

### 17.5 变量驱动世界书

世界书条目支持变量条件：

```text
角色.莉娅.好感度 >= 80
玩家.HP <= 0
任务.月神祭.状态 == 进行中
```

---

## 18. 脚本管理器

### 18.1 脚本类型

支持识别和管理：

- STscript
- Quick Reply Scripts
- JavaScript
- MVU command
- Regex-linked scripts
- Template scripts
- Frontend JS
- Custom plugin scripts

### 18.2 脚本字段

```ts
type CardScript = {
  id: string
  name: string
  language: string
  source: string
  trigger: string
  permissions: string[]
  enabled: boolean
  compatibility: "native" | "partial" | "external" | "unknown"
  notes?: string
}
```

### 18.3 脚本触发时机

支持：

- manual
- on_project_open
- on_card_init
- before_prompt_build
- after_prompt_build
- before_user_message
- after_user_message
- before_ai_response
- after_ai_response
- on_regex_match
- on_variable_change
- on_frontend_confirm

### 18.4 脚本兼容性

显示：

- 原生可运行
- 可模拟运行
- 需要插件适配
- 只能静态查看
- 因安全原因禁用

### 18.5 安全原则

未知 JS 默认不执行。

脚本不得：

- 读取 API Key
- 直接访问任意文件
- 执行系统命令
- 上传项目数据
- 绕过权限系统

---

## 19. 前端卡沙盒

### 19.1 前端卡定义

前端卡包结构：

```text
frontend/
├── index.html
├── style.css
├── main.js
├── manifest.json
└── assets/
```

### 19.2 功能

支持：

- 静态预览
- 沙盒交互预览
- 初始化流程测试
- 按钮点击日志
- 状态变化日志
- 生成初始消息预览
- 修改变量预览
- 启用世界书条目预览
- 发送给 AI 的内容预览

### 19.3 安全

使用：

- iframe sandbox
- Web Worker
- 权限白名单
- 禁止直接访问宿主 API
- 禁止读取 Key
- 禁止直接文件访问
- 用户确认后运行

---

## 20. 插件系统

### 20.1 插件目标

允许高级用户扩展软件未内置的功能。

插件类型：

- 导入器
- 导出器
- 面板
- 命令
- AI Provider
- 图片 Provider
- 变量解析器
- 脚本适配器
- 前端卡运行时
- 社区格式兼容器

### 20.2 插件 manifest

示例：

```json
{
  "id": "author.regex-lab",
  "name": "Regex Lab",
  "version": "1.0.0",
  "main": "dist/index.js",
  "permissions": [
    "project.read",
    "regex.read",
    "regex.write"
  ],
  "contributes": {
    "panels": [
      {
        "id": "regexLab",
        "title": "Regex Lab",
        "location": "rightPanel"
      }
    ],
    "commands": [
      {
        "id": "regex.test",
        "title": "测试正则"
      }
    ],
    "importers": [
      {
        "id": "sillytavern.regex.import",
        "extensions": [".json"]
      }
    ]
  }
}
```

### 20.3 插件权限

权限示例：

- project.read
- project.write
- character.read
- character.write
- worldbook.read
- worldbook.write
- regex.read
- regex.write
- variable.read
- variable.write
- script.read
- script.write
- chat.test
- ai.call
- asset.read
- asset.write

禁止默认开放：

- apiKey.read
- fs.fullAccess
- shell.execute
- network.fullAccess

### 20.4 插件运行安全

- 默认禁用未知插件
- 用户手动安装
- 用户手动授予权限
- 插件运行在沙盒
- 插件异常不能破坏项目
- 插件不得读取 API Key

---

## 21. 导入功能

### 21.1 支持导入

- V1 JSON
- V2 JSON
- V2 PNG
- V3 JSON
- 世界书 JSON
- 普通图片
- 文本设定
- 项目包
- 前端卡资源
- Regex 配置
- 脚本配置
- 插件导入格式

### 21.2 导入扫描报告

导入后必须显示：

```text
格式：V2 PNG
字段完整度：良好
内嵌世界书：有
正则：有/无
MVU：疑似/无
脚本：有/无
前端 UI：有/无
依赖插件：检测到/未检测
兼容等级：完全支持 / 部分支持 / 只读查看
建议模式：轻量制卡 / 高级工程
```

### 21.3 导入保护

- 导入前不覆盖原项目
- 复杂卡默认只读扫描
- 用户确认后转换
- 保留原始文件
- 生成备份

---

## 22. 导出功能

### 22.1 支持导出

- V1 JSON
- V2 JSON
- V2 PNG
- V3 JSON
- 世界书 JSON
- 角色头像 PNG
- 项目包 .cardforge.zip
- 导出报告
- 依赖说明

### 22.2 V2 PNG 导出

流程：

```text
选择角色版本
↓
选择图片库中的图片
↓
选择导出标准
↓
生成角色卡 JSON
↓
base64 编码
↓
写入 PNG metadata / tEXt chunk
↓
保存 PNG
↓
保存同名 JSON 备份
↓
记录导出历史
```

### 22.3 导出损失提示

导出前必须提示：

```text
导出 V1 会丢失：
- alternate_greetings
- character_book
- system_prompt
- post_history_instructions
- extensions
- 脚本
- 前端 UI
- MVU 数据

导出 V2 PNG 可保留：
- 角色主字段
- 部分 character_book
- extensions

但不能保证：
- CardForge 原生脚本在 SillyTavern 中运行
- 前端卡 runtime 在 SillyTavern 中运行
```

### 22.4 导出历史

每次导出保存记录：

```ts
type ExportRecord = {
  id: string
  characterId: string
  characterVersionId: string
  worldBookIds: string[]
  assetIds: string[]
  format: string
  outputPath: string
  warnings: string[]
  createdAt: number
}
```

---

## 23. 版本管理

### 23.1 快照

支持对以下内容创建快照：

- 角色卡
- 世界书
- 变量系统
- 正则规则
- 脚本
- 前端卡
- 整个项目

### 23.2 版本操作

- 创建快照
- 命名版本
- 添加备注
- 对比版本
- 回滚版本
- 复制为新分支
- 从版本导出

### 23.3 对比内容

支持比较：

- 角色字段差异
- 世界书条目差异
- 正则差异
- 变量 schema 差异
- 脚本差异
- 测试结果差异
- 导出警告差异

---

## 24. 资源管理

### 24.1 支持资源类型

- 图片
- 文本文档
- JSON
- 世界书
- 角色卡
- Markdown
- 前端资源
- 脚本
- Prompt 模板
- 导出文件
- 参考资料

### 24.2 资源操作

- 拖拽导入
- 复制到项目库
- 仅引用原路径
- 生成缩略图
- 标签
- 搜索
- 关联角色
- 关联世界书
- 查看使用记录
- 删除
- 重命名
- 移动到全局库
- 复制到其他项目

### 24.3 导出时图片选择

导出面板应支持：

- 从项目图片库选择
- 从全局图片库选择
- 从最近使用选择
- 临时从文件导入
- 批量用多个图片导出多个 PNG 卡

---

## 25. 兼容目标选择

用户创建项目或导出时应选择目标平台：

- SillyTavern 标准 V2
- SillyTavern + Regex
- SillyTavern + MVU / 酒馆助手
- Chub 兼容
- CardForge 原生增强卡
- 仅本软件测试

不同目标影响：

- 可用字段
- 是否允许脚本
- 是否允许前端卡
- 导出警告
- 兼容性报告
- 预设推荐

---

## 26. 安全模型

### 26.1 信任等级

项目有信任等级：

- 不信任：只读查看，不运行脚本
- 受限信任：运行沙盒脚本
- 完全信任：允许项目插件运行，但仍不能读取 API Key

### 26.2 API Key 安全

- API Key 不得保存在项目文件夹
- API Key 默认隐藏
- 项目导出不包含 Key
- 配置导出默认移除 Key
- 插件和脚本不得读取 Key
- 支持一键清除 Key

### 26.3 脚本安全

未知脚本默认禁用。

所有脚本执行前显示：

- 脚本来源
- 权限需求
- 风险提示
- 是否允许运行

---

## 27. 错误恢复

必须支持：

- 自动保存
- 撤销/重做
- 导入前备份
- 导出失败不破坏原文件
- AI 输出解析失败显示原文
- 脚本执行失败可回滚状态
- 项目损坏时恢复最近快照
- PNG 嵌入失败时保留 JSON

---

## 28. 搜索系统

支持全项目搜索：

- 角色名
- 字段内容
- 世界书条目
- 关键词
- 变量路径
- 正则规则
- 脚本内容
- 图片标签
- 导出记录
- 测试报告

搜索结果应能跳转到源位置。

---

## 29. 模型成本与日志

AI 调用应记录：

- Provider
- 模型
- 任务类型
- 输入 token
- 输出 token
- 估算费用
- 耗时
- 是否成功
- 错误信息
- 原始输出

用户可查看：

- 单次调用成本
- 当前项目总成本
- 今日总成本
- 不同 Provider 成本对比

---

## 30. 内置示例项目

必须提供示例：

1. 轻量角色卡示例
2. 世界书驱动卡示例
3. MVU 变量卡示例
4. Regex 调试示例
5. 前端初始化卡示例
6. 脚本管理示例
7. 插件开发示例
8. 多项目资源库示例

每个示例应带说明文档。

---

## 31. 主要用户流程

### 31.1 轻量制卡流程

```text
新建项目
↓
选择轻量角色卡模板
↓
输入一句话灵感
↓
选择 AI 生成预设
↓
生成角色卡字段
↓
用户编辑字段
↓
AI 检查质量
↓
选择图片或生成图片
↓
轻量测试聊天
↓
修复问题
↓
导出 V2 PNG / V2 JSON
```

### 31.2 世界书驱动卡流程

```text
新建项目
↓
导入长设定文本
↓
AI 抽取世界书条目
↓
自动分类条目
↓
测试关键词触发
↓
绑定角色卡
↓
轻量测试
↓
导出角色卡 + 世界书
```

### 31.3 重型卡导入流程

```text
导入 V2 PNG / JSON
↓
自动扫描字段、世界书、正则、脚本、MVU、前端 UI
↓
生成兼容性报告
↓
建议进入高级工程模式
↓
用户查看依赖
↓
用户选择只读、转换、或使用插件适配
↓
进入重型卡工程视图
```

### 31.4 重型卡调试流程

```text
打开重型卡项目
↓
查看 Prompt 构建链路
↓
测试世界书触发
↓
测试正则流水线
↓
运行前端初始化沙盒
↓
测试聊天
↓
查看变量 diff
↓
查看脚本日志
↓
标记失败样本
↓
AI 生成修复建议
↓
保存新版本
```

### 31.5 导出流程

```text
选择角色版本
↓
选择世界书
↓
选择图片
↓
选择导出目标
↓
运行发布前检查
↓
显示数据损失提示
↓
确认导出
↓
写入导出历史
```

---

## 32. 发布前检查清单

导出前检查：

- 角色名存在
- first_mes 存在
- description 或世界书核心条目存在
- JSON schema 合法
- 图片存在
- 世界书条目无明显错误
- 正则无语法错误
- 变量 schema 合法
- 脚本无高风险权限
- 导出目标兼容
- 数据损失提示已确认
- PNG metadata 写入成功

---

## 33. 验收标准

### 33.1 轻量卡验收

软件必须能完成：

- 新建项目
- 新建角色卡
- AI 生成角色字段
- 手动编辑字段
- 导入图片
- 导出 V2 JSON
- 导出 V2 PNG
- 再导入该 PNG 并正确读取角色卡
- 进行至少 3 轮测试聊天
- 显示世界书触发日志
- 显示 token 统计
- 保存版本快照

### 33.2 世界书验收

软件必须能完成：

- 新建世界书
- 新建条目
- 设置关键词
- 设置常驻 / 选择性触发
- 测试触发
- 导出世界书 JSON
- 嵌入角色卡 character_book

### 33.3 AI 验收

软件必须能完成：

- 添加自定义 OpenAI-compatible Provider
- 添加自定义 Base URL
- 添加 API Key
- 测试连接
- 使用 Provider 生成角色字段
- 使用不同 Provider 执行不同任务
- 用户可修改 Prompt 预设
- AI 输出失败时不覆盖原数据

### 33.4 资源库验收

软件必须能完成：

- 拖入图片
- 生成缩略图
- 标签管理
- 选择图片作为导出头像
- 查看资源被哪些角色使用

### 33.5 重型卡验收

软件必须能完成：

- 导入含内嵌世界书的 V2 卡
- 识别世界书驱动卡
- 显示 extensions
- 显示正则规则
- 显示脚本列表
- 显示 MVU 疑似变量结构
- 前端 HTML 静态预览
- 沙盒运行受信任前端
- 生成兼容性报告
- 导出依赖说明

### 33.6 安全验收

软件必须保证：

- 项目导出不包含 API Key
- 插件默认不能读取 Key
- 未知脚本默认不执行
- JS 脚本运行在沙盒中
- 导入复杂卡时默认只读扫描
- 导出失败不破坏源文件

---

## 34. 不做或暂缓的功能

第一版不要求：

- 云同步
- 多人协作
- 商业账号系统
- 模板市场
- 完整复刻 SillyTavern 全部扩展
- 完整兼容所有酒馆助手 API
- 完整运行所有 STscript 命令
- 完整 CHARX 高级资源包支持
- 节点式工作流编辑器
- 内置大型图片模型
- 内置模型计费系统

---

## 35. 项目命名与品牌规范

本项目最终采用以下名称：

```text
英文名：CardForge Studio
缩写：CFS
中文名：卡铸工坊
项目目录名：cardforge-studio
内部项目格式名：.cardforge
项目包扩展名：.cardforge.zip
```

名称含义：

```text
Card = 角色卡
Forge = 锻造、工坊、打磨、制作
Studio = 工作室、创作工作台
```

CardForge Studio 的含义不是“简单生成一张角色卡”，而是像工坊一样对角色卡、世界书、图片、变量、脚本、前端、插件、测试流程进行组合、打磨、调试和导出。

推荐定位语：

> CardForge Studio（卡铸工坊）：项目化的 AI 角色卡 / 世界书创作、调试、资源管理与多标准导出工作台。

软件内显示规范：

```text
应用标题：CardForge Studio
中文界面标题：卡铸工坊
首次启动欢迎语：欢迎使用 CardForge Studio（卡铸工坊）
项目包名称示例：my-character.cardforge.zip
默认项目根目录：CardForgeProjects/
默认项目文件夹示例：CardForgeProjects/snow-healer/
```

---

## 36. 最终总结

本软件必须同时服务两类需求：

轻量卡：

```text
简单、快速、低门槛、生成后可直接测试和导出。
```

重型卡：

```text
可视化、可调试、可扩展、可追踪、可适配现代前端卡生态。
```

最终用户体验应是：

```text
打开项目
↓
选择角色
↓
编辑卡
↓
从资源库选图
↓
AI 辅助生成 / 修复
↓
本地测试
↓
查看世界书 / 正则 / 变量 / 脚本日志
↓
保存版本
↓
导出目标格式
```

本项目的核心价值不是“生成一张角色卡”，而是让角色卡创作进入工程化流程：

```text
结构化创作
+
AI 辅助
+
资源管理
+
调试诊断
+
版本追踪
+
多标准导出
+
插件扩展
```

开发过程中必须始终遵守以下原则：

1. 本地优先。
2. 不绑定单一 AI。
3. 用户数据可见、可备份、可迁移。
4. 轻量用户不被复杂功能打扰。
5. 高级用户可以进入完整工程视图。
6. 插件和脚本必须安全沙盒化。
7. 导出必须明确提示兼容性和数据损失。
8. AI 输出必须经过校验，不得直接覆盖关键数据。
9. 重型卡以“识别、拆解、模拟、插件适配”为目标，不承诺完整复刻所有 SillyTavern 扩展。
10. 1.0 版本必须形成完整闭环，而不是只能演示部分功能。
