import type {
  AIActionResult,
  AIProviderConfig,
  AIPreset,
  ChatMessage,
  InternalCharacter,
  QualityIssue,
  TriggeredWorldBookEntry
} from "../schema/types";
import { runLoggedCompletion } from "./logging";
import { buildPresetMessages } from "./presets";

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
