import type { AIProviderConfig, AIPreset, ChatMessage } from "../schema/types";

export function findTaskPreset(presets: AIPreset[], taskType: string): AIPreset | undefined {
  return presets.find((preset) => preset.taskType === taskType);
}

export function resolveAIForTask({
  providers,
  presets,
  taskType,
  selectedProviderId
}: {
  providers: AIProviderConfig[];
  presets: AIPreset[];
  taskType: string;
  selectedProviderId?: string;
}): { provider?: AIProviderConfig; preset?: AIPreset } {
  const preset = findTaskPreset(presets, taskType);
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const providerPool = enabledProviders.length ? enabledProviders : providers;
  const presetProvider = preset?.providerId ? providerPool.find((provider) => provider.id === preset.providerId) : undefined;
  const taskDefaultProvider = providerPool.find((provider) => (provider.defaultTaskTypes ?? []).includes(taskType));
  const selectedProvider = providerPool.find((provider) => provider.id === selectedProviderId);
  const provider = presetProvider ?? taskDefaultProvider ?? selectedProvider ?? providerPool[0];
  if (!provider) return { preset };
  return {
    preset,
    provider: preset?.modelOverride ? { ...provider, defaultModel: preset.modelOverride } : provider
  };
}

export function buildPresetMessages(preset: AIPreset, variables: Record<string, unknown>): ChatMessage[] {
  return [
    { role: "system", content: renderPromptTemplate(preset.systemPrompt, variables) },
    { role: "user", content: renderPromptTemplate(preset.userPromptTemplate, variables) }
  ];
}

export function renderPromptTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => stringifyVariable(variables[key]));
}

export function missingPresetVariables(preset: AIPreset, variables: Record<string, unknown>): string[] {
  return preset.variables
    .filter((variable) => variable.required)
    .map((variable) => variable.key)
    .filter((key) => !String(variables[key] ?? "").trim());
}

function stringifyVariable(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
