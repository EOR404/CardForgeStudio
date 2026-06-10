# AI 配置说明

CardForge Studio 不内置 API Key，也不绑定单一模型平台。所有 AI 服务都在“AI 设置”页由用户自行配置。

## Provider 字段

- `name`：Provider 显示名称。
- `type`：API 类型，支持 OpenAI-compatible、OpenAI、DeepSeek、Anthropic、Gemini、Ollama、LM Studio、vLLM、ComfyUI、Stable Diffusion WebUI 和自定义 HTTP API。
- `baseUrl`：模型服务地址。OpenAI-compatible 会自动补 `/chat/completions`，如果已经以 `/chat/completions` 结尾则直接使用。
- `proxy / relay URL`：可选 HTTP 转发端点。浏览器不能直接使用系统级代理，该字段需要填写能接收 `endpoint`、`headers`、`body`、`providerType` 并代发请求的 relay。
- `apiKey`：本地保存的密钥。项目导出和项目包导出会清空。
- `model`：默认模型名。
- `models`：可选模型列表，按行填写。
- `headers`：自定义请求头，格式为 `Header-Name: value`。
- `temperature`、`topP`、`maxTokens`、`stream`：默认生成参数。
- `capabilities`：声明该 Provider 支持 chat、json、vision、image-generation、embeddings、tools、streaming 等能力。
- `defaultTaskTypes`：该 Provider 默认承接的任务类型。

## 任务路由

任务调用时按以下顺序选择 Provider：

1. AI 预设中显式绑定的 Provider。
2. `defaultTaskTypes` 包含当前任务的 Provider。
3. 当前选中的 Provider。
4. 项目中的首个可用 Provider。

常用任务类型：

- `generateCharacter`
- `rewriteField`
- `worldBookSuggest`
- `validateCard`
- `testChat`
- `diagnoseTest`
- `jsonRepair`
- `formatConversion`
- `imagePrompt`
- `imageGeneration`
- `imageUnderstanding`
- `variableUpdate`

图片生成建议：

- `imagePrompt` 使用文本模型，负责把角色卡转换成 positive / negative prompt。
- `imageGeneration` 使用图片 Provider。OpenAI-compatible images 会请求 `/images/generations`；Stable Diffusion WebUI 会请求 `/sdapi/v1/txt2img`。
- `imageUnderstanding` 使用支持 vision 的 OpenAI-compatible chat Provider，把资源图片作为 `image_url` 发送，并要求返回 description、tags、purpose、characterHints、promptHints 和 notes。资源页只会在用户点击“应用分析到资源”后写入结果。
- ComfyUI 会请求 `/prompt`。需要在 Provider headers 中添加 `X-CardForge-ComfyUI-Workflow`，值为 ComfyUI API-format workflow JSON，可使用 `{{prompt}}`、`{{negativePrompt}}`、`{{width}}`、`{{height}}`、`{{steps}}`、`{{seed}}` 占位符。
- ComfyUI 可选轮询：在 headers 中添加 `X-CardForge-ComfyUI-Poll-Attempts: 20` 和 `X-CardForge-ComfyUI-Poll-Interval-Ms: 1000` 后，会在拿到 `prompt_id` 后请求 `/history/{prompt_id}`，发现输出图片时再请求 `/view` 拉取候选图。未配置轮询或超时未完成时，会保存 `prompt_id` 任务记录，最终图片仍可在 ComfyUI 侧查看或另行导入资源库。
- 如果 Provider 有 CORS 限制，可使用 `proxy / relay URL` 代发请求。

## Preset 字段

Preset 决定提示词和输出规则：

- `taskType`：任务类型。
- `provider route`：可选显式 Provider。
- `model override`：可选模型覆盖。
- `outputMode`：JSON、纯文本、Markdown、YAML 或自定义。
- `systemPrompt`：系统提示词模板。
- `userPromptTemplate`：用户提示词模板。
- `variables`：模板变量，格式为 `key=显示名`，末尾加 `*` 表示必填。

## 安全说明

- API Key 不会写死在代码中。
- 导出项目 JSON、项目包和可见文件夹时会清空 API Key 和敏感 headers。
- 调用日志不会保存完整 API Key。
- 插件和脚本当前不能读取 Provider Key。
