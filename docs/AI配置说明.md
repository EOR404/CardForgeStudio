# AI 配置说明

Provider 字段：

- `name`：显示名称。
- `providerType`：第一版主要支持 OpenAI-compatible。
- `baseUrl`：例如 `https://api.openai.com/v1`，系统会自动拼接 `/chat/completions`。
- `apiKey`：只保存在本地浏览器存储，项目导出时默认清空。
- `defaultModel`：模型名。
- `models`：可维护常用模型列表，便于记录当前 Provider 可用模型。
- `headers`：自定义请求头，每行 `Header-Name: value`，适合部分网关、代理或 OpenRouter 类服务。导出项目 JSON、项目文件夹和 `.cardforge.zip` 时，`Authorization`、`X-API-Key`、token、secret、password 等敏感 header 会被清空，普通 header 会保留。
- “清除 Key/敏感 headers”会同时清空 Provider `apiKey` 和上述敏感 header；普通 header 不会被移除。
- `temperature`、`topP`、`maxTokens`、`stream`：默认生成参数。开启 `stream` 时会读取 OpenAI-compatible SSE 响应并合并文本，但 UI 仍按完整结果落入日志和待应用区。
- `capabilities`：记录当前 Provider 支持的能力，例如 `chat`、`json`、`vision`、`streaming`。

连接测试会发送一个极短 chat completions 请求。常见错误：

- 401：Key 无效或权限不足。
- 404：Base URL 可能缺少 `/v1`。
- 429：额度不足或请求过频。
- 网络错误：检查 CORS、代理、自定义 headers 或本地模型服务是否运行。

## AI 预设

预设字段：

- `taskType`：任务类型，例如 `generateCharacter`、`rewriteField`、`validateCard`、`worldBookSuggest`。
- `providerId`：可选。设置后该任务优先使用指定 Provider。
- `modelOverride`：可选。仅覆盖当前预设调用的模型名。
- `systemPrompt`：系统提示词。
- `userPromptTemplate`：用户提示词模板，支持 `{{idea}}`、`{{field}}`、`{{content}}`、`{{style}}`、`{{card}}` 等变量。
- `outputMode`：`json`、`plain_text`、`markdown`、`yaml` 或 `custom`。
- `paramsOverride`：可覆盖 `temperature`、`topP`、`maxTokens` 等参数。

角色卡页面的 AI 生成、字段生成/润色/缩短/扩写/风格化、角色质检、世界书拆分，以及世界书页的长文本条目抽取，都会按 `taskType` 自动选择预设。测试沙盒会使用 `testChat` 预设生成回复，并用 `diagnoseTest` 预设生成诊断报告。AI 输出仍会进入待应用区或诊断区，用户确认前不会覆盖原数据。

## AI 调用日志

每次连接测试、角色生成、字段操作、角色质检、世界书建议、测试聊天和诊断调用都会写入当前项目的 `aiLogs`。

日志包含：

- 任务类型、Provider、模型名。
- 输入/输出/总 token。若 Provider 没有返回 usage，会使用本地估算。
- 耗时、成功/失败、错误信息。
- 原始输出摘要，便于排查解析失败。
- 粗估费用、今日费用和按 Provider 汇总的调用次数、成功率、token、平均耗时与费用。当前只对常见 OpenAI 模型内置粗略价格，未知模型费用显示为 0，后续可改为用户自定义价格表。
