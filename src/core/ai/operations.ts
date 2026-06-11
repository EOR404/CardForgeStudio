import type {
  AIActionResult,
  AIProviderConfig,
  AIPreset,
  Asset,
  ChatMessage,
  InternalCharacter,
  QualityIssue,
  TriggeredWorldBookEntry
} from "../schema/types";
import { estimateTokens } from "../prompt-builder/buildPrompt";
import { callOpenAICompatibleMessagesDetailed, type OpenAICompatibleMessage } from "./client";
import { callImageGeneration, type GeneratedImage, type ImageGenerationInput } from "./image";
import { runLoggedCompletion } from "./logging";
import { createAIInvocationLog, LoggedAIError } from "./logging";
import { buildPresetMessages } from "./presets";

export type ImagePromptDraft = {
  positivePrompt: string;
  negativePrompt?: string;
  notes?: string;
};

export type ImageUnderstandingDraft = {
  description: string;
  tags: string[];
  purpose?: Asset["purpose"];
  characterHints?: string[];
  promptHints?: string[];
  notes?: string;
};

export type JsonRepairInput = {
  rawText: string;
  error?: string;
  targetFormat?: string;
  notes?: string;
};

export async function generateCharacterDraftWithAI(
  provider: AIProviderConfig,
  idea: string,
  preset?: AIPreset
): Promise<AIActionResult> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { idea })
    : [
        {
          role: "system",
          content:
            "你是 CardForge Studio 的角色卡生成助手。只输出 JSON，不输出 Markdown。字段包括 name, description, personality, scenario, first_mes, mes_example, tags。不要替 {{user}} 行动。默认使用中文。"
        },
        { role: "user", content: `角色灵感：${idea}` }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "generateCharacter", preset?.paramsOverride ?? { maxTokens: 1800 });
  return { ...parseAiJson(raw), log };
}

export async function rewriteCharacterFieldWithAI(
  provider: AIProviderConfig,
  fieldName: string,
  content: string,
  style: string,
  preset?: AIPreset
): Promise<AIActionResult<string>> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { field: fieldName, content, style })
    : [
        { role: "system", content: "你是角色卡字段编辑助手。只输出改写后的字段文本。" },
        { role: "user", content: `请将 ${fieldName} 改写为「${style}」风格，不替 {{user}} 行动：\n${content}` }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "rewriteField", preset?.paramsOverride);
  return { raw, parsed: raw.trim(), log };
}

export async function checkCharacterWithAI(
  provider: AIProviderConfig,
  character: InternalCharacter,
  preset?: AIPreset
): Promise<AIActionResult<QualityIssue[]>> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { character, card: character })
    : [
        {
          role: "system",
          content:
            "你是角色卡质检助手。输出 JSON 数组，每项包含 level(error/warning/info), scope, message。检查空字段、替用户行动、人格矛盾、世界观过多等。"
        },
        { role: "user", content: JSON.stringify(character, null, 2) }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "validateCard", preset?.paramsOverride);
  const parsed = parseAiJson(raw);
  return {
    raw,
    parsed: normalizeDiagnosticIssues(parsed.parsed),
    error: parsed.error,
    log
  };
}

export async function suggestWorldBookWithAI(
  provider: AIProviderConfig,
  character: InternalCharacter,
  preset?: AIPreset
): Promise<AIActionResult> {
  const card = JSON.stringify(character, null, 2);
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { card, source: card })
    : [
        {
          role: "system",
          content:
            "你是世界书拆分助手。只输出 JSON 数组，每项包含 name, keys, content, category, constant, selective。keys 是字符串数组。category 使用 character_core/world_background/location/organization/item/rule/route/variable/initialization/frontend/hidden_control/other。"
        },
        { role: "user", content: card }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "worldBookSuggest", preset?.paramsOverride);
  return { ...parseAiJson(raw), log };
}

export async function extractWorldBookEntriesWithAI(
  provider: AIProviderConfig,
  sourceText: string,
  preset?: AIPreset
): Promise<AIActionResult> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { source: sourceText, card: sourceText })
    : [
        {
          role: "system",
          content:
            "你是世界书结构化助手。只输出 JSON 数组，每项包含 name, keys, content, category, constant, selective。keys 是字符串数组。category 使用 character_core/world_background/location/organization/item/rule/route/variable/initialization/frontend/hidden_control/other。不要输出 Markdown。"
        },
        { role: "user", content: `从以下长设定文本抽取适合进入世界书的条目，并自动生成关键词和分类：\n${sourceText}` }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "worldBookSuggest", preset?.paramsOverride ?? { maxTokens: 1800 });
  return { ...parseAiJson(raw), log };
}

export async function repairJsonWithAI(
  provider: AIProviderConfig,
  input: JsonRepairInput,
  preset?: AIPreset
): Promise<AIActionResult> {
  const variables = {
    rawText: input.rawText,
    raw: input.rawText,
    error: input.error ?? "",
    targetFormat: input.targetFormat ?? "valid JSON",
    notes: input.notes ?? ""
  };
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, variables)
    : [
        {
          role: "system",
          content:
            "你是 CardForge Studio 的 JSON 修复助手。只输出可被 JSON.parse 解析的 JSON，不输出 Markdown、解释或代码围栏。尽量保留原始字段和值，不要编造缺失正文。"
        },
        {
          role: "user",
          content: [
            `目标格式：${variables.targetFormat}`,
            variables.error ? `解析错误：${variables.error}` : "",
            variables.notes ? `补充说明：${variables.notes}` : "",
            "请修复以下内容为合法 JSON：",
            variables.rawText
          ].filter(Boolean).join("\n")
        }
      ];
  const { content: raw, log } = await runLoggedCompletion(
    provider,
    messages,
    "jsonRepair",
    { ...(preset?.paramsOverride ?? { temperature: 0.1, maxTokens: 2400 }), stream: false }
  );
  return { ...parseAiJson(raw), log };
}

export async function diagnoseTestWithAI(
  provider: AIProviderConfig,
  input: {
    character: InternalCharacter;
    prompt: string;
    messages: ChatMessage[];
    triggeredEntries: TriggeredWorldBookEntry[];
  },
  preset?: AIPreset
): Promise<AIActionResult<QualityIssue[]>> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, {
        character: input.character,
        prompt: input.prompt,
        messages: input.messages,
        triggered: input.triggeredEntries
      })
    : [
        {
          role: "system",
          content:
            "你是角色卡测试诊断助手。输出 JSON 数组，每项包含 level(error/warning/info), scope, message。"
        },
        {
          role: "user",
          content: JSON.stringify(input, null, 2)
        }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "diagnoseTest", preset?.paramsOverride);
  const parsed = parseAiJson(raw);
  return {
    raw,
    parsed: normalizeDiagnosticIssues(parsed.parsed),
    error: parsed.error,
    log
  };
}

export async function generateImagePromptWithAI(
  provider: AIProviderConfig,
  input: {
    character: InternalCharacter;
    purpose: string;
    style: string;
  },
  preset?: AIPreset
): Promise<AIActionResult<ImagePromptDraft>> {
  const messages: ChatMessage[] = preset
    ? buildPresetMessages(preset, { character: input.character, purpose: input.purpose, style: input.style })
    : [
        {
          role: "system",
          content:
            "你是角色卡图片提示词助手。只输出 JSON，不输出 Markdown。字段为 positivePrompt, negativePrompt, notes。positivePrompt 使用英文逗号分隔，适合文生图；negativePrompt 放低质量和不需要的元素。"
        },
        {
          role: "user",
          content: `请根据角色卡生成 ${input.purpose} 图片提示词，风格：${input.style}。\n${JSON.stringify(input.character, null, 2)}`
        }
      ];
  const { content: raw, log } = await runLoggedCompletion(provider, messages, "imagePrompt", preset?.paramsOverride ?? { maxTokens: 900 });
  const parsed = parseAiJson(raw);
  return {
    raw,
    parsed: normalizeImagePromptDraft(parsed.parsed, raw),
    error: parsed.error,
    log
  };
}

export async function generateImagesWithAI(
  provider: AIProviderConfig,
  input: ImageGenerationInput
): Promise<AIActionResult<GeneratedImage[]>> {
  const startedAt = performance.now();
  try {
    const images = await callImageGeneration(provider, input);
    const raw = JSON.stringify(images.map((image) => ({
      hasDataUrl: Boolean(image.dataUrl),
      url: image.url,
      revisedPrompt: image.revisedPrompt
    })), null, 2);
    const log = createAIInvocationLog({
      provider,
      taskType: "imageGeneration",
      inputTokens: estimateTokens([input.prompt, input.negativePrompt ?? ""].join("\n")),
      outputTokens: images.length,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      success: true,
      rawOutput: raw
    });
    return { raw, parsed: images, log };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const log = createAIInvocationLog({
      provider,
      taskType: "imageGeneration",
      inputTokens: estimateTokens([input.prompt, input.negativePrompt ?? ""].join("\n")),
      outputTokens: 0,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      success: false,
      errorMessage: message
    });
    throw new LoggedAIError(message, log);
  }
}

export async function analyzeImageWithAI(
  provider: AIProviderConfig,
  input: {
    assetName: string;
    mimeType?: string;
    dataUrl: string;
    currentPurpose?: Asset["purpose"];
    currentTags?: string[];
    notes?: string;
  },
  preset?: AIPreset
): Promise<AIActionResult<ImageUnderstandingDraft>> {
  if (!input.dataUrl.startsWith("data:image/")) throw new Error("图片理解需要 image dataUrl。");
  const prompt = preset
    ? buildPresetMessages(preset, {
        assetName: input.assetName,
        mimeType: input.mimeType ?? "",
        currentPurpose: input.currentPurpose ?? "",
        tags: input.currentTags ?? [],
        notes: input.notes ?? ""
      }).at(-1)?.content ?? ""
    : [
        `请分析这张 CardForge 资源图片：${input.assetName}`,
        `当前用途：${input.currentPurpose ?? "未分类"}`,
        `现有标签：${(input.currentTags ?? []).join(", ") || "无"}`,
        input.notes ? `现有 notes：${input.notes}` : "",
        "只输出 JSON，不输出 Markdown。字段：description, tags, purpose, characterHints, promptHints, notes。",
        "purpose 只能是 avatar/cover/export-cover/halfbody/fullbody/background/expression/map/icon/reference/other。tags 使用简短中文标签。"
      ].filter(Boolean).join("\n");
  const systemPrompt = preset?.systemPrompt
    ? buildPresetMessages(preset, { assetName: input.assetName, image: input.assetName }).at(0)?.content ?? ""
    : "你是 CardForge Studio 的图片理解助手，帮助角色卡作者给资源图写描述、标签、用途和文生图提示词线索。";
  const messages: OpenAICompatibleMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: input.dataUrl, detail: "auto" } }
      ]
    }
  ];
  const startedAt = performance.now();
  try {
    const result = await callOpenAICompatibleMessagesDetailed(provider, messages, {
      ...(preset?.paramsOverride ?? { maxTokens: 900 }),
      stream: false
    });
    const parsed = parseAiJson(result.content);
    const draft = normalizeImageUnderstandingDraft(parsed.parsed, result.content);
    const log = createAIInvocationLog({
      provider,
      taskType: "imageUnderstanding",
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: result.durationMs,
      success: true,
      rawOutput: result.content
    });
    return {
      raw: result.content,
      parsed: draft,
      error: parsed.error,
      log
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const log = createAIInvocationLog({
      provider,
      taskType: "imageUnderstanding",
      inputTokens: estimateTokens([input.assetName, input.notes ?? "", (input.currentTags ?? []).join(", ")].join("\n")) + 85,
      outputTokens: 0,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      success: false,
      errorMessage: message
    });
    throw new LoggedAIError(message, log);
  }
}

export function parseAiJson(raw: string): AIActionResult {
  const trimmed = raw.trim();
  const candidates = [trimmed, extractJsonBlock(trimmed)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return { raw, parsed: JSON.parse(candidate) };
    } catch {
      continue;
    }
  }
  return { raw, error: "AI 输出不是有效 JSON，未覆盖任何数据。" };
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();
  const firstObject = text.indexOf("{");
  const firstArray = text.indexOf("[");
  const startCandidates = [firstObject, firstArray].filter((index) => index >= 0);
  if (!startCandidates.length) return null;
  const start = Math.min(...startCandidates);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1) : null;
}

function normalizeDiagnosticIssues(value: unknown): QualityIssue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item, index) => {
    const record = typeof item === "object" && item ? (item as Record<string, unknown>) : {};
    const level = record.level === "error" || record.level === "warning" || record.level === "info" ? record.level : "info";
    return {
      id: `ai_diag_${Date.now()}_${index}`,
      level,
      scope: typeof record.scope === "string" ? record.scope : "test",
      message: typeof record.message === "string" ? record.message : JSON.stringify(item)
    };
  });
}

function normalizeImagePromptDraft(value: unknown, raw: string): ImagePromptDraft {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const positive =
      stringValue(record.positivePrompt) ??
      stringValue(record.positive_prompt) ??
      stringValue(record.prompt) ??
      raw.trim();
    return {
      positivePrompt: positive,
      negativePrompt: stringValue(record.negativePrompt) ?? stringValue(record.negative_prompt),
      notes: stringValue(record.notes)
    };
  }
  return { positivePrompt: raw.trim() };
}

function normalizeImageUnderstandingDraft(value: unknown, raw: string): ImageUnderstandingDraft {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      description: stringValue(record.description) ?? stringValue(record.summary) ?? raw.trim(),
      tags: stringList(record.tags).slice(0, 12),
      purpose: normalizeAssetPurpose(record.purpose),
      characterHints: stringList(record.characterHints ?? record.character_hints).slice(0, 8),
      promptHints: stringList(record.promptHints ?? record.prompt_hints).slice(0, 12),
      notes: stringValue(record.notes)
    };
  }
  return {
    description: raw.trim(),
    tags: []
  };
}

function normalizeAssetPurpose(value: unknown): Asset["purpose"] | undefined {
  const purposes: NonNullable<Asset["purpose"]>[] = [
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
  return purposes.includes(value as NonNullable<Asset["purpose"]>) ? (value as Asset["purpose"]) : undefined;
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
