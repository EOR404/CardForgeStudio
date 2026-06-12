# CardForge Studio（卡铸工坊）

CardForge Studio，缩写 CFS，是一个本地优先的 AI 角色卡 / 世界书创作、调试、资源管理与多标准导出工作台。

当前版本是 React + TypeScript + Vite 的 Web/PWA 基础版，已保留 StorageAdapter 和核心模块边界，后续可接入 Tauri 文件系统。

## 启动

```bash
corepack pnpm install
corepack pnpm dev
```

构建：

```bash
corepack pnpm build
```

自检：

```bash
corepack pnpm self-check
```

## 文档

- [架构说明](docs/架构说明.md)
- [用户使用说明](docs/用户使用说明.md)
- [AI 配置说明](docs/AI配置说明.md)
- [插件开发草案](docs/插件开发草案.md)
- [已知限制](docs/已知限制.md)

## 已实现功能

- 多项目管理：新建、打开、复制、删除索引、导入/导出项目 JSON，并保存项目默认兼容目标和信任等级。
- 轻量/高级模式：顶部栏可切换当前项目模式；轻量模式收起高级工程入口，高级模式开放 Regex、变量、脚本、前端卡和插件工具。
- 项目包：导出/导入 `.cardforge.zip`，按 `characters/`、`worldbooks/`、`assets/`、`frontend/`、`scripts/`、`versions/`、`logs/` 等目录保存；外部路径资源会写入 `assets/references.json`，不会伪装成已打包文件。
- 可见项目文件夹：在支持 File System Access API 的 Chromium 浏览器中保存/打开项目文件夹；Tauri 文件系统适配已预留。
- 内置示例项目：轻量卡、世界书驱动、MVU、Regex、前端初始化卡、脚本管理、插件开发、多项目资源库，每个示例都带可展开和下载的 Markdown 操作说明。
- 全项目搜索：仪表盘可搜索角色、世界书条目、资源、AI 配置、测试、导出和高级模块，并跳转到来源。
- 角色卡编辑：创建、复制、删除、字段编辑、`creator_notes`、`extensions` JSON 编辑、V2 JSON 实时预览、字段 token 分布、质量检查和版本快照。
- 版本管理：角色、世界书、项目与高级模块快照备注、快照列表、当前字段/条目差异、从角色/世界书快照复制为新分支、Regex/变量/脚本/前端/插件配置恢复，并可在导出页选择角色快照版本。
- 导入导出：V1 JSON、V2 JSON、实验性 V3 JSON、基础 CHARX 资源包、世界书 JSON、角色头像 PNG、V2 PNG metadata 读写实现，角色页可直接导入 JSON/PNG/CHARX，JSON 解析失败时可保留原文并调用 `jsonRepair` AI 路由修复后导入；导出页提供 V1/V2/V3/世界书 JSON 格式转换台，可从项目图片库、全局图片库、最近使用或临时文件选择导出图片，角色导出支持当前状态或指定快照，V2 PNG 支持多图片批量导出，并按项目默认兼容目标生成发布前检查、依赖说明和 Markdown 导出报告。
- 世界书：条目编辑、快照/恢复、自动分类视图、本地从 `.txt/.md` 长设定拆分条目、AI 从长设定文本抽取条目、关键词/常驻/选择性触发、变量条件触发、触发测试、触发原因、插入位置/order、token 消耗、预算排除、未触发原因和关键词/预算/顺序问题审计。
- 图片资源库：图片/文本/JSON/脚本资源导入、拖拽、外部路径/URL 引用、本地图片缩略图生成、用途标记、项目库与本机全局库互相复制、移动到全局库、复制到其他项目、AI 图片理解、标签、角色/世界书关联、使用记录和导出图片选择。
- AI 图片生成：资源页可根据当前角色生成图片提示词，编辑 positive/negative prompt，调用图片 Provider 生成候选图，并在确认后保存到项目图片库。
- AI Provider：OpenAI-compatible/OpenAI/DeepSeek/Anthropic/Gemini/Ollama/LM Studio/vLLM/ComfyUI/Stable Diffusion WebUI/自定义 HTTP API 类型配置、Key 密码输入、一键清除 Key/敏感 headers、模型列表、自定义 headers、topP/stream 参数、能力标签、HTTP 转发端点、默认任务类型、连接测试、AI 草稿、字段生成/润色/缩短/扩写/风格化、角色质检、JSON 修复导入、世界书拆分、长文本条目抽取和图片理解。
- AI 预设：可编辑任务 Prompt、输出模式、变量、Provider 路由和模型覆盖，制卡 AI 操作会实际使用预设。
- AI 路由：任务调用优先使用预设显式绑定的 Provider，其次使用 Provider 的默认任务类型，再回退到当前选中 Provider 和首个可用 Provider。
- AI 调用日志：记录任务类型、Provider、模型、token、耗时、成功/失败、原始输出摘要和粗估费用，可查看今日费用与 Provider 成本对比。
- 测试沙盒：内置身份/性格/世界书/越狱/变量/前端测试用例、自定义测试用例、Prompt 构建链路可视化、分段 token/来源/复制/条目级跳转、变量/前端/脚本/正则链路预览、世界书触发日志、AI 回复变量更新识别与手动应用、失败样本标记、角色快照 A/B 对比和测试记录保存。
- 测试诊断：测试聊天支持 `testChat` 任务路由，诊断按钮支持 `diagnoseTest` 预设并保存诊断记录。
- 高级入口：Regex Lab、Variable Lab、Script Manager、Frontend Sandbox、Plugin Manager。
- Regex Lab：正则规则新增、导入 JSON、选择、编辑目标/顺序/标签/启用状态，按流水线展示命中、错误和替换结果。
- 变量实验室：变量 JSON 编辑、手动 diff、MVU `_.set` / `_.assign`、JSON Patch、JSON/YAML 状态块更新预览、应用命令和历史快照回滚。
- 脚本管理：脚本草案新增、导入脚本/JSON、选择、编辑语言/触发器/权限/兼容性，危险权限提示，当前版本不执行脚本。
- 前端沙盒：HTML/CSS/JS/manifest 多文件导入与受限 iframe 预览，可绑定资源库资源并随前端卡导出 `frontend/assets/`，显示初始消息、变量预览、按钮标签、世界书条目预览、发送给 AI 的内容预览、权限白名单、Web Worker 预检和 ready/click/state/error 沙盒日志。
- 插件管理：新增/导入 manifest、编辑入口/权限/contributes、标记 trusted/enabled，危险权限提示，当前版本不执行插件代码。
- 导入扫描报告：识别轻量/中型/重型卡、字段完整度、世界书/正则/MVU/脚本/前端/插件线索和建议模式；复杂卡先展示只读扫描报告，用户确认后才转换导入；可提取 extensions 中的变量/MVU 状态并合并到 Variable Lab，正则片段为 Regex Lab 规则、脚本片段为 Script Manager 草案、前端片段为 Frontend Sandbox 草案并挂到角色。
- 质量检查：角色字段空值、first_mes 替用户行动、personality/description 重复、mes_example 格式、OOC/越狱指令混杂和 token 过高风险；世界书检查关键词、预算、顺序、概率和变量条件。
- 安全基础：项目导出清空 API Key 与敏感 headers，项目级不信任/受限信任/完全信任策略会限制脚本、插件和前端 JS 预览，未知脚本/插件默认禁用，前端卡 iframe sandbox、权限白名单和 Worker 预检。
- 错误恢复：自动保存、手动保存、最近数据变更撤销/重做、项目导入结构校验、浏览器存储损坏回退、导入前自动项目备份和快照恢复。
- 响应式布局：桌面多栏工作台，小屏底部核心 Tab；高级模式下额外显示“更多”入口。

## 已知限制

- 当前默认使用浏览器 localStorage 保存项目数据；Chromium localhost 可实验性保存/打开可见项目文件夹，Tauri 真实文件系统适配仍需 Rust 环境。
- V2 PNG metadata 已支持 tEXt / iTXt / zTXt 的 chara / Chara 文本块读取，导出默认写入 tEXt/chara；写入失败时会保留同名 V2 JSON 备份，仍需更多社区样本兼容测试。
- AI 调用依赖用户自定义 Provider；没有内置 API Key。浏览器无法直接使用系统级代理，`proxy / relay URL` 需要填写能接收 `endpoint`、`headers`、`body` 并代发请求的 HTTP 转发端点。图片生成目前支持 OpenAI-compatible images、Stable Diffusion WebUI / A1111 常见返回格式，以及 ComfyUI `/prompt` 队列提交、可选 `/history` 轮询和 `/view` 图片拉取。
- 高级脚本和插件第一版只做静态管理，不执行未知代码。
- Monaco/Tailwind/Tauri 尚未接入，当前使用 textarea 与手写 CSS 完成可运行闭环。

## 后续 TODO

- 接入 Tauri 2 真实文件系统适配。
- 完善 Character Card V3 / CHARX 社区样本和更多 PNG 样本兼容。
- 增加 IndexedDB 或 SQLite 索引用于超大项目搜索。
- 扩展 AI 路由与任务预设编辑器。
- 扩展端到端测试和浏览器截图验收。
