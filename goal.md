# goal.md

# Goal：开发 CardForge Studio（卡铸工坊）

你现在是一个拥有完整项目开发能力的 AI 编程代理。你的任务不是继续讨论需求，而是**根据本文档和同目录下的《项目要求.md》实际创建一个可运行的软件项目**。

请严格遵守本 goal。  
不要只输出设计方案。  
不要只创建空壳。  
不要无限规划。  
你必须尽可能完成一个可以运行、可以编辑角色卡、可以管理项目、可以导入导出、可以调用 AI、可以轻量测试的本地应用。

---

## 0. 重要原则

1. **优先做可运行软件，而不是完美架构图。**
2. **优先完成闭环，而不是实现所有高级功能。**
3. **不要因为功能巨大而停止。能做多少做多少，但必须留下清晰 TODO 和可扩展结构。**
4. **每完成一个模块都要保证项目仍能运行。**
5. **不要把 API Key 写死在代码里。**
6. **不要依赖商业后端服务。**
7. **不要强制用户登录。**
8. **不要破坏本地文件。**
9. **导出、导入、AI 输出都要做基本校验和错误提示。**
10. **如果某些复杂功能无法完整实现，先做“识别 + 展示 + 预留接口 + TODO”，不要完全忽略。**

---

## 1. 你需要阅读的需求来源

请优先阅读并执行：

```text
项目要求.md
```

该文件是完整产品需求文档。

本 `goal.md` 是给开发代理的执行说明，重点是告诉你如何把需求落地成代码。

如果 `项目要求.md` 与 `goal.md` 有冲突：

- 产品范围、功能细节以 `项目要求.md` 为准。
- 开发顺序、取舍策略、落地要求以 `goal.md` 为准。

---

## 2. 最终要做出的软件

软件名称：

```text
英文名：CardForge Studio
缩写：CFS
中文名：卡铸工坊
项目目录名：cardforge-studio
内部项目格式名：.cardforge
项目包扩展名：.cardforge.zip
```

软件定位：

> CardForge Studio（卡铸工坊）是 AI 角色卡 / 世界书 / 重型前端卡的创作、调试、资源管理与多标准导出工作台。

目标用户可以用它完成：

```text
新建项目
↓
新建或导入角色卡
↓
编辑角色字段
↓
使用 AI 生成 / 润色 / 检查
↓
编辑世界书
↓
导入图片资源
↓
选择图片导出 V2 PNG 角色卡
↓
在软件内进行轻量测试聊天
↓
保存版本快照
↓
导出 V1 / V2 / V2 PNG / 世界书 JSON
```

必须同时考虑：

- 轻量卡用户：快速制卡、编辑、导出。
- 重型卡作者：世界书、正则、变量、脚本、前端卡识别与调试入口。
- 插件开发者：未来扩展能力。

---

## 3. 推荐技术栈

除非当前环境明显不支持，否则优先使用：

```text
Tauri 2 + React + TypeScript + Vite
```

前端：

```text
React
TypeScript
Vite
Zustand
Zod
React Hook Form
Tailwind CSS
Monaco Editor 或普通 textarea 兜底
```

本地数据：

```text
项目文件夹 + JSON 文件
```

第一版可以不使用 SQLite。  
如果时间允许，再加入 SQLite 索引。  
不要为了 SQLite 拖慢核心功能。

如果 Tauri 环境无法创建或构建，请退化为：

```text
React + TypeScript + Vite 的 PWA / Web 本地版
```

并保留 StorageAdapter，后续可接 Tauri 文件系统。

---

## 4. 最小可运行闭环

你必须优先完成以下闭环。  
这些功能完成前，不要沉迷插件系统、MVU 完整兼容、复杂前端卡运行时。

### 4.1 项目管理闭环

必须实现：

- 项目列表页
- 新建项目
- 打开项目
- 项目仪表盘
- 项目数据保存到本地浏览器存储或项目文件结构
- 项目中包含：
  - characters
  - worldbooks
  - assets
  - presets
  - tests
  - versions
  - exports

如果无法直接写入真实文件夹，则先用浏览器本地存储模拟，并提供导入/导出项目 JSON。

### 4.2 角色卡编辑闭环

必须实现：

- 新建角色卡
- 编辑以下字段：
  - name
  - description
  - personality
  - scenario
  - first_mes
  - mes_example
  - system_prompt
  - post_history_instructions
  - alternate_greetings
  - tags
  - creator
  - character_version
- 实时 V2 JSON 预览
- 保存角色卡
- 复制角色卡
- 删除角色卡
- 字段基础校验

### 4.3 世界书闭环

必须实现：

- 新建世界书
- 新建条目
- 编辑：
  - name/comment
  - keys
  - secondary_keys
  - content
  - enabled
  - constant
  - selective
  - insertion_order
  - position
- 保存世界书
- 世界书条目列表
- 世界书触发测试：
  - 用户输入一段文本
  - 显示命中的条目

### 4.4 导入导出闭环

必须实现：

- 导出 V1 JSON
- 导出 V2 JSON
- 导入 V1 JSON
- 导入 V2 JSON
- 导出世界书 JSON
- 导入世界书 JSON

尽力实现：

- V2 PNG 导出
- V2 PNG 导入

如果 PNG metadata 写入短时间内无法完成：

- 先实现“图片 + JSON 分离导出”
- 在界面明确标注“PNG 嵌入待完善”
- 保留 PNG 嵌入模块接口

### 4.5 图片资源闭环

必须实现：

- 拖入 / 选择图片
- 图片资源列表
- 缩略图预览
- 设为角色头像
- 导出时选择项目图片

如果真实文件无法保存，先把图片转为 object URL 或 base64 暂存，并明确 TODO。

### 4.6 AI Provider 闭环

必须实现：

- AI 设置页
- 添加 Provider
- 编辑：
  - name
  - baseUrl
  - apiKey
  - model
  - temperature
  - maxTokens
- 保存 Provider
- 测试连接
- OpenAI-compatible chat completions 调用
- API Key 不写死
- API Key 不导出到项目数据中，或导出时默认清空

### 4.7 AI 辅助制卡闭环

必须实现至少这些 AI 操作：

- 根据一句话生成角色卡草稿
- 润色当前字段
- 检查角色卡问题
- 从角色卡拆分世界书建议

AI 输出必须：

- 显示原始输出
- 尝试解析
- 失败时不覆盖原数据
- 成功时需要用户点击“应用”

### 4.8 轻量测试聊天闭环

必须实现：

- 测试聊天页
- 使用当前角色卡字段构建 Prompt
- 用户输入消息
- 调用 AI Provider
- 显示 AI 回复
- 保存测试记录
- 显示本轮使用的 Prompt 预览
- 显示触发的世界书条目

---

## 5. 第一版必须包含的界面

### 5.1 桌面布局

实现一个基础多栏布局：

```text
顶部栏：
- 应用名
- 当前项目名
- 保存按钮
- 模式切换：轻量 / 高级
- 设置按钮

左侧栏：
- 项目
- 角色卡
- 世界书
- 资源
- AI 预设
- 测试
- 导出
- 高级

中间主区：
- 当前页面内容

右侧栏：
- AI 助手
- 质量检查
- Token / 字数统计
- 兼容性提示
```

即使 UI 不华丽，也必须清晰可用。

### 5.2 手机布局

必须做响应式适配，不要直接压缩桌面三栏。

小屏时切换为：

```text
底部 Tab：
[项目] [制卡] [资源] [测试] [导出]
```

高级功能放入“更多 / 高级”入口。

### 5.3 必须有的页面

实现以下页面：

1. ProjectsPage  
   项目列表、新建项目、打开项目。

2. DashboardPage  
   当前项目概览。

3. CharacterPage  
   角色卡列表与字段编辑。

4. WorldBookPage  
   世界书列表与条目编辑。

5. AssetsPage  
   图片资源库。

6. AISettingsPage  
   AI Provider 与预设设置。

7. TestSandboxPage  
   轻量测试聊天。

8. ExportPage  
   导出 V1/V2/世界书/PNG。

9. AdvancedPage  
   正则、变量、脚本、前端卡、插件入口。第一版可以是半成品入口，但不能完全没有。

---

## 6. 数据模型要求

请创建清晰的 TypeScript 类型。  
类型必须集中放在 `src/core/schema` 或类似目录。

### 6.1 Project

```ts
type CardProject = {
  id: string
  name: string
  description?: string
  mode: "light" | "advanced"
  characters: InternalCharacter[]
  worldBooks: InternalWorldBook[]
  assets: Asset[]
  aiProviders: AIProviderConfig[]
  aiPresets: AIPreset[]
  tests: TestSession[]
  versions: VersionSnapshot[]
  exports: ExportRecord[]
  advanced?: AdvancedProjectData
  createdAt: number
  updatedAt: number
}
```

### 6.2 Character

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
  characterBookId?: string
  avatarAssetId?: string
  extensions: Record<string, unknown>
  createdAt: number
  updatedAt: number
}
```

### 6.3 WorldBook

```ts
type InternalWorldBook = {
  id: string
  name: string
  description?: string
  scanDepth?: number
  tokenBudget?: number
  recursiveScanning?: boolean
  entries: WorldBookEntry[]
  createdAt: number
  updatedAt: number
}
```

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
  extensions?: Record<string, unknown>
}
```

### 6.4 Asset

```ts
type Asset = {
  id: string
  name: string
  type: "image" | "text" | "json" | "character_card" | "worldbook" | "script" | "other"
  mimeType?: string
  dataUrl?: string
  path?: string
  thumbnailUrl?: string
  tags: string[]
  linkedCharacterIds: string[]
  linkedWorldBookIds: string[]
  createdAt: number
  updatedAt: number
}
```

### 6.5 AI Provider

```ts
type AIProviderConfig = {
  id: string
  name: string
  providerType:
    | "openai-compatible"
    | "openai"
    | "deepseek"
    | "anthropic"
    | "gemini"
    | "ollama"
    | "custom"
  baseUrl: string
  apiKey?: string
  defaultModel: string
  models?: string[]
  headers?: Record<string, string>
  defaultParams: {
    temperature?: number
    topP?: number
    maxTokens?: number
    stream?: boolean
  }
  capabilities: AICapability[]
  enabled: boolean
  createdAt: number
  updatedAt: number
}
```

### 6.6 AdvancedProjectData

第一版先定义结构，部分 UI 可先做占位。

```ts
type AdvancedProjectData = {
  regexRules: RegexRule[]
  variableSystem?: VariableSystem
  scripts: CardScript[]
  frontendPackages: FrontendCardPackage[]
  plugins: PluginManifest[]
  compatibilityReports: CompatibilityReport[]
}
```

---

## 7. 格式转换要求

### 7.1 Internal → V1

导出字段：

```json
{
  "name": "",
  "description": "",
  "personality": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": ""
}
```

如果有 V1 不支持的数据，导出前提示会丢失：

- alternate_greetings
- character_book
- system_prompt
- post_history_instructions
- tags
- creator
- extensions
- scripts
- regex
- variables
- frontend

### 7.2 Internal → V2

导出结构：

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "",
    "description": "",
    "personality": "",
    "scenario": "",
    "first_mes": "",
    "mes_example": "",
    "creator_notes": "",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": [],
    "character_book": null,
    "tags": [],
    "creator": "",
    "character_version": "",
    "extensions": {}
  }
}
```

### 7.3 V1/V2 导入

导入时：

- 保留原始 JSON
- 转换到 InternalCharacter
- 生成兼容性报告
- 缺失字段填空
- 不要因字段缺失崩溃

### 7.4 V2 PNG

尽力实现：

- 从 PNG 读取 chara / Chara tEXt chunk
- base64 decode
- JSON parse
- 导入角色卡

导出：

- 选择图片
- 将 V2 JSON base64 编码
- 写入 PNG tEXt chunk
- 保存 PNG

如果库或环境限制导致无法完成，保留模块和 TODO，并实现 JSON 分离导出兜底。

---

## 8. AI 调用实现要求

### 8.1 OpenAI-compatible Client

实现通用函数：

```ts
async function callOpenAICompatible(
  config: AIProviderConfig,
  messages: ChatMessage[],
  params?: Partial<AIProviderConfig["defaultParams"]>
): Promise<string>
```

要求：

- baseUrl 用户自定义
- 支持 `/chat/completions`
- 处理 401、404、429、网络错误
- 错误信息显示给用户
- 不吞错误
- 不在 console 泄露完整 apiKey

### 8.2 AI 生成角色卡

默认 Prompt 要求：

- 输出 JSON
- 字段包括 name、description、personality、scenario、first_mes、mes_example
- 不替 {{user}} 行动
- 语言默认中文
- 不输出 Markdown
- 输出失败时给用户看原始文本

### 8.3 字段级 AI

字段级操作：

- 生成字段
- 润色字段
- 缩短字段
- 扩写字段
- 改为更自然
- 改为更简洁
- 改为更沉浸

### 8.4 世界书 AI

支持：

- 从角色卡拆分世界书建议
- 从长文本抽取世界书条目
- 自动生成 keys
- 自动分类条目

---

## 9. 轻量测试聊天实现要求

### 9.1 Prompt 构建

第一版 Prompt 可以简单但必须可视化：

```text
System Prompt:
{character.systemPrompt}

Character:
Name: {name}
Description: {description}
Personality: {personality}
Scenario: {scenario}

World Info:
{triggered worldbook entries}

Example Messages:
{mes_example}

Post History Instructions:
{postHistoryInstructions}

Chat:
...
```

### 9.2 世界书触发

实现基础触发：

- 扫描用户最新消息
- 如果包含 entry.keys 中任一关键词，则触发
- constant 为 true 的条目始终触发
- enabled 为 false 不触发

显示触发日志。

### 9.3 测试保存

每次测试会话保存：

- 使用的角色 ID
- 使用的世界书 ID
- 使用的 Provider
- 消息列表
- 触发的世界书
- Prompt 预览
- 时间

---

## 10. 高级功能第一版要求

高级功能很多，不要求全部完整，但必须搭好结构，做出可见入口和基础能力。

### 10.1 Regex Lab

第一版实现：

- 正则规则列表
- 新增规则
- 编辑 pattern / replacement
- 输入测试文本
- 显示匹配结果和替换结果

### 10.2 Variable Lab / MVU

第一版实现：

- 变量树 JSON 编辑器
- 显示当前变量状态
- 支持手动编辑
- 支持简单变量 diff
- 支持从 AI 输出中识别类似 `_.set('路径', 值)` 的更新命令

不要求完整 MVU 兼容。

### 10.3 Script Manager

第一版实现：

- 脚本列表
- 新增脚本
- 编辑脚本文本
- 标注脚本类型
- 标注兼容性：
  - native
  - partial
  - external
  - unknown
- 默认不执行未知脚本

### 10.4 Frontend Card Sandbox

第一版实现：

- 能保存 HTML/CSS/JS 片段
- 能在 iframe 中静态预览 HTML
- 默认禁用 JS 或使用 sandbox 限制
- 提示安全风险

### 10.5 Plugin Manager

第一版实现：

- 插件列表
- 插件 manifest 类型定义
- 显示插件权限
- 安装本地插件可以先不做完整执行
- 保留插件 API 目录和示例

---

## 11. 安全要求

### 11.1 API Key

必须做到：

- 不写死
- 输入框默认 password
- 导出项目时不包含 apiKey，或导出前提示移除
- 日志中不打印完整 apiKey
- 插件和脚本无法读取 apiKey

### 11.2 脚本和前端

必须做到：

- 未知脚本默认禁用
- 前端卡使用 iframe sandbox
- 禁止直接访问本地文件系统
- 禁止 shell.execute
- 插件权限最小化
- 不要为了省事直接 eval 未知代码

### 11.3 数据保护

必须做到：

- 删除前确认
- 导入复杂卡前保留原始文件
- AI 应用修改前需用户确认
- 导出失败不破坏原文件
- 保存时尽量使用不可破坏式更新

---

## 12. UI 细节要求

### 12.1 角色编辑页

左侧：

- 角色列表
- 新建角色
- 搜索角色

中间：

- 字段表单
- 分组：
  - 基础信息
  - 核心字段
  - 高级字段
  - 备用开场白
  - JSON 预览

右侧：

- AI 助手
- 字段操作
- 质量检查
- Token 统计
- 兼容性提示

### 12.2 世界书页

左侧：

- 世界书列表

中间：

- 条目表格 / 卡片列表
- 条目详情编辑

右侧：

- 触发测试
- token 统计
- 问题检查

### 12.3 资源页

- 图片网格
- 资源详情
- 标签
- 搜索
- 关联角色
- 设为头像

### 12.4 测试页

左侧：

- 测试会话列表

中间：

- 聊天窗口

右侧：

- Prompt 预览
- 世界书触发日志
- AI 参数
- 诊断按钮

### 12.5 导出页

步骤式：

1. 选择角色
2. 选择版本
3. 选择图片
4. 选择格式
5. 兼容检查
6. 导出

---

## 13. 质量检查功能

实现基础检查：

- name 为空
- first_mes 为空
- description 为空且没有世界书核心条目
- first_mes 可能替 user 行动
- description 太长
- 世界书无关键词
- 世界书内容为空
- 正则 pattern 无效
- 导出格式会丢失数据

显示等级：

- error
- warning
- info

---

## 14. 版本管理第一版

必须实现：

- 创建角色快照
- 查看快照列表
- 从快照恢复
- 快照备注
- 简单字段 diff

暂不要求复杂分支系统。

---

## 15. 文档要求

必须生成项目内文档：

```text
README.md
docs/
├── 架构说明.md
├── 用户使用说明.md
├── AI配置说明.md
├── 插件开发草案.md
└── 已知限制.md
```

README 至少包含：

- 项目名称：CardForge Studio（卡铸工坊）
- 项目缩写：CFS
- 项目介绍
- 安装依赖
- 启动方式
- 构建方式
- 当前已实现功能
- 已知限制
- 后续 TODO

---

## 16. 测试要求

至少添加基础测试或自检脚本：

- schema 转换测试
- V1 导入导出测试
- V2 导入导出测试
- 世界书触发测试
- AI Provider 配置校验测试
- Regex 替换测试

如果没有测试框架，至少写 `src/core/__tests__` 或 `scripts/self-check.ts`。

---

## 17. 开发执行顺序

请按以下顺序开发。

### Phase 1：项目骨架

1. 创建项目
2. 安装依赖
3. 创建基础布局
4. 创建路由 / 页面
5. 创建全局状态
6. 创建 schema 类型
7. 实现本地存储

完成后确认应用可启动。

### Phase 2：项目与角色卡

1. 项目列表
2. 新建项目
3. 角色卡列表
4. 角色卡编辑
5. V2 JSON 预览
6. V1/V2 导入导出

完成后确认能创建并导出角色卡。

### Phase 3：世界书与资源库

1. 世界书编辑
2. 世界书触发测试
3. 图片资源库
4. 角色头像关联
5. 导出时选择图片

### Phase 4：AI

1. AI Provider 设置
2. 测试连接
3. OpenAI-compatible 调用
4. AI 生成角色草稿
5. 字段级润色
6. AI 输出应用前确认

### Phase 5：测试沙盒

1. Prompt 构建器
2. 测试聊天
3. 世界书触发日志
4. 测试会话保存

### Phase 6：导出完善

1. V1/V2/世界书导出
2. 尝试 V2 PNG
3. 导出损失提示
4. 导出历史

### Phase 7：高级入口

1. Regex Lab 基础
2. Variable Lab 基础
3. Script Manager 基础
4. Frontend Sandbox 基础
5. Plugin Manager 草案

### Phase 8：打磨

1. 响应式手机布局
2. 质量检查
3. 版本快照
4. README
5. 自检
6. 修复明显 bug

---

## 18. 不要做的事

不要：

- 只写需求文档不写代码
- 只写 UI 空壳没有数据
- 把所有数据放在一个不可读数据库里
- 写死 API Key
- 写死某个模型平台
- 未经确认直接覆盖 AI 生成结果
- 直接 eval 未知脚本
- 让插件读取 API Key
- 因为 V3/CHARX/MVU 太复杂就完全不留接口
- 因为无法完美实现 PNG 嵌入就放弃 JSON 导出
- 因为项目大就停止实现

---

## 19. 如果时间不足时的取舍

如果无法全部完成，优先级如下：

最高优先级：

1. 项目管理
2. 角色卡编辑
3. V1/V2 导入导出
4. 世界书编辑
5. AI Provider 自定义
6. AI 生成角色卡
7. 测试聊天
8. 图片资源库
9. 导出页

中优先级：

1. V2 PNG 嵌入
2. 版本快照
3. 质量检查
4. Regex Lab
5. Variable Lab
6. Script Manager

低优先级：

1. 完整插件运行时
2. 完整 MVU 兼容
3. 完整前端卡运行
4. V3/CHARX 完整支持
5. 多模型 A/B 自动测试

但即使低优先级未完成，也要保留清晰接口和 TODO。

---

## 20. 最终交付物

完成后，项目目录必须包含：

```text
package.json
src/
README.md
docs/
goal.md
项目要求.md
```

如果使用 Tauri：

```text
src-tauri/
```

项目推荐目录名：

```text
cardforge-studio/
```

必须能通过以下命令之一启动：

```bash
npm install
npm run dev
```

或：

```bash
pnpm install
pnpm dev
```

README 中必须写明实际命令。

---

## 21. 最终自检清单

开发结束前，请逐项检查：

- [ ] 应用可以启动
- [ ] 可以新建项目
- [ ] 可以新建角色卡
- [ ] 可以编辑角色字段
- [ ] 可以导出 V2 JSON
- [ ] 可以导入 V2 JSON
- [ ] 可以导出 V1 JSON
- [ ] 可以新建世界书
- [ ] 可以测试世界书触发
- [ ] 可以添加图片资源
- [ ] 可以设置 AI Provider
- [ ] 可以调用 OpenAI-compatible API
- [ ] AI 输出不会自动覆盖用户数据
- [ ] 可以进行测试聊天
- [ ] 可以查看 Prompt 预览
- [ ] 可以保存测试记录
- [ ] 可以创建版本快照
- [ ] 有导出损失提示
- [ ] 有 Regex Lab 基础入口
- [ ] 有 Variable Lab 基础入口
- [ ] 有 Script Manager 基础入口
- [ ] 有 Frontend Sandbox 基础入口
- [ ] 有 Plugin Manager 草案
- [ ] 手机窄屏布局可用
- [ ] README 完整
- [ ] 没有写死 API Key
- [ ] 没有直接 eval 未知脚本

---

## 22. 开发代理行为要求

你是开发代理，请按以下方式工作：

1. 先检查当前目录是否已有项目。
2. 如果没有，创建新项目。
3. 不要询问用户使用什么技术栈，默认使用本文推荐方案。
4. 每一步都实际修改文件。
5. 不要只回复计划。
6. 大功能可以分文件实现。
7. 对复杂功能先做基础版，再留 TODO。
8. 如果遇到构建错误，主动修复。
9. 完成后运行构建或至少运行类型检查。
10. 最终输出：
    - 已完成内容
    - 未完成内容
    - 启动方式
    - 关键文件位置
    - 下一步建议

---

## 23. 项目最终愿景

最终软件应让用户从传统低效流程：

```text
想角色
↓
找制卡 Bot
↓
复制 JSON
↓
导入 SillyTavern
↓
测试
↓
发现不合适
↓
回头改
↓
重新导入
```

变成：

```text
打开项目
↓
写灵感
↓
AI 生成
↓
字段编辑
↓
资源库选图
↓
世界书管理
↓
本地测试
↓
查看 Prompt / 世界书 / 变量 / 正则日志
↓
保存版本
↓
一键导出
```

这就是本项目的核心目标。

请现在开始实现，而不是继续讨论。
