import { z } from "zod";

const aiCapabilitySchema = z.enum(["chat", "json", "vision", "image-generation", "embeddings", "tools", "streaming"]);
const recordSchema = z.record(z.unknown());
const recordArraySchema = z.array(recordSchema);

export const worldBookEntrySchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  comment: z.string().optional(),
  keys: z.array(z.string()),
  secondaryKeys: z.array(z.string()),
  content: z.string(),
  enabled: z.boolean(),
  constant: z.boolean(),
  selective: z.boolean(),
  caseSensitive: z.boolean(),
  priority: z.number(),
  insertionOrder: z.number(),
  position: z.enum(["before_char", "after_char", "at_depth", "authors_note"]),
  depth: z.number().optional(),
  probability: z.number().optional(),
  extensions: z.record(z.unknown()).optional()
});

export const internalCharacterSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "角色名不能为空"),
  description: z.string(),
  personality: z.string().optional(),
  scenario: z.string().optional(),
  firstMessage: z.string(),
  exampleMessages: z.string().optional(),
  alternateGreetings: z.array(z.string()),
  systemPrompt: z.string().optional(),
  postHistoryInstructions: z.string().optional(),
  creatorNotes: z.string().optional(),
  tags: z.array(z.string()),
  creator: z.string().optional(),
  version: z.string().optional(),
  characterBookId: z.string().optional(),
  avatarAssetId: z.string().optional(),
  extensions: z.record(z.unknown()),
  linkedWorldBooks: z.array(z.string()),
  linkedScripts: z.array(z.string()),
  linkedRegexRules: z.array(z.string()),
  createdAt: z.number(),
  updatedAt: z.number()
});

export const aiProviderSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Provider 名称不能为空"),
  providerType: z.enum([
    "openai-compatible",
    "openai",
    "deepseek",
    "anthropic",
    "gemini",
    "ollama",
    "lm-studio",
    "vllm",
    "comfyui",
    "stable-diffusion-webui",
    "custom"
  ]),
  baseUrl: z.string().min(1, "Base URL 不能为空"),
  proxyUrl: z.string().optional(),
  apiKey: z.string().optional(),
  defaultModel: z.string().min(1, "模型名不能为空"),
  models: z.array(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  defaultTaskTypes: z.array(z.string()).optional(),
  defaultParams: z.object({
    temperature: z.number().optional(),
    topP: z.number().optional(),
    maxTokens: z.number().optional(),
    stream: z.boolean().optional()
  }),
  capabilities: z.array(aiCapabilitySchema),
  enabled: z.boolean()
});

export const v2CardSchema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.string(),
  data: z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    personality: z.string().catch(""),
    scenario: z.string().catch(""),
    first_mes: z.string().catch(""),
    mes_example: z.string().catch(""),
    creator_notes: z.string().optional().catch(""),
    system_prompt: z.string().optional().catch(""),
    post_history_instructions: z.string().optional().catch(""),
    alternate_greetings: z.array(z.string()).optional().catch([]),
    character_book: z.unknown().nullable().optional(),
    tags: z.array(z.string()).optional().catch([]),
    creator: z.string().optional().catch(""),
    character_version: z.string().optional().catch(""),
    extensions: z.record(z.unknown()).optional().catch({})
  })
});

export const v3CardSchema = z.object({
  spec: z.literal("chara_card_v3"),
  spec_version: z.string(),
  data: z.object({
    name: z.string().catch(""),
    description: z.string().catch(""),
    personality: z.string().optional().catch(""),
    scenario: z.string().optional().catch(""),
    first_mes: z.string().optional().catch(""),
    mes_example: z.string().optional().catch(""),
    creator_notes: z.string().optional().catch(""),
    system_prompt: z.string().optional().catch(""),
    post_history_instructions: z.string().optional().catch(""),
    alternate_greetings: z.array(z.string()).optional().catch([]),
    character_book: z.unknown().nullable().optional(),
    tags: z.array(z.string()).optional().catch([]),
    creator: z.string().optional().catch(""),
    character_version: z.string().optional().catch(""),
    assets: z.array(z.unknown()).optional().catch([]),
    extensions: z.record(z.unknown()).optional().catch({})
  })
});

export const cardProjectImportSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "项目名不能为空"),
  description: z.string().optional(),
  mode: z.enum(["light", "advanced"]).optional(),
  characters: recordArraySchema,
  worldBooks: recordArraySchema,
  assets: recordArraySchema.optional(),
  aiProviders: recordArraySchema.optional(),
  aiPresets: recordArraySchema.optional(),
  aiLogs: recordArraySchema.optional(),
  tests: recordArraySchema.optional(),
  testCases: recordArraySchema.optional(),
  versions: recordArraySchema.optional(),
  exports: recordArraySchema.optional(),
  advanced: recordSchema.optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional()
}).passthrough();

export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "project"}：${issue.message}`)
    .join("；");
}
