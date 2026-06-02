import type { AIPreset, ChatMessage } from "../schema/types";

export function findTaskPreset(presets: AIPreset[], taskType: string): AIPreset | undefined {
  return presets.find((preset) => preset.taskType === taskType);
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

