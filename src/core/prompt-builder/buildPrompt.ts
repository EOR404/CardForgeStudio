import { runRegexPipeline, type RegexTestResult } from "../regex/regex";
import type {
  CardProject,
  CardScript,
  ChatMessage,
  FrontendCardPackage,
  InternalCharacter,
  InternalWorldBook,
  PromptChainSection,
  RegexRule,
  TriggeredWorldBookEntry,
  VariableSystem
} from "../schema/types";
import { estimateTokens } from "../token/estimate";
import { triggerWorldBookEntries } from "../worldbook/trigger";

export { estimateTokens } from "../token/estimate";

type PromptProjectContext = Pick<CardProject, "advanced" | "mode">;

export type PromptBuildResult = {
  prompt: string;
  promptSections: PromptChainSection[];
  triggeredEntries: TriggeredWorldBookEntry[];
  messages: ChatMessage[];
};

export function buildTestPrompt(
  character: InternalCharacter,
  worldBook: InternalWorldBook | undefined,
  chatHistory: ChatMessage[],
  latestUserInput: string,
  project?: PromptProjectContext
): PromptBuildResult {
  const triggeredEntries = triggerWorldBookEntries(worldBook, latestUserInput, project?.advanced.variableSystem.state);
  const promptSections = buildPromptSections(character, worldBook, triggeredEntries, chatHistory, latestUserInput, project);
  const basePrompt = renderEnabledPrompt(promptSections);
  const regexResults = runPromptRegex(project?.advanced.regexRules ?? [], character, basePrompt);
  if (regexResults.length) promptSections.push(buildRegexSection(regexResults));
  const prompt = regexResults.at(-1)?.after ?? basePrompt;
  return {
    prompt,
    promptSections,
    triggeredEntries,
    messages: [
      { role: "system", content: prompt },
      ...chatHistory,
      { role: "user", content: latestUserInput }
    ]
  };
}

function buildPromptSections(
  character: InternalCharacter,
  worldBook: InternalWorldBook | undefined,
  triggeredEntries: TriggeredWorldBookEntry[],
  chatHistory: ChatMessage[],
  latestUserInput: string,
  project?: PromptProjectContext
): PromptChainSection[] {
  const characterTarget = { page: "characters" as const, selectedCharacterId: character.id };
  const sections: PromptChainSection[] = [
    createSection({
      id: "system-prompt",
      label: "System Prompt",
      source: "character",
      sourceId: character.id,
      content: character.systemPrompt ?? "",
      enabled: Boolean(character.systemPrompt?.trim()),
      position: "system_prompt",
      target: characterTarget
    }),
    createSection({
      id: "character-core",
      label: "Character Core",
      source: "character",
      sourceId: character.id,
      content: [
        `Name: ${character.name}`,
        `Description: ${character.description}`,
        `Personality: ${character.personality || ""}`,
        `Scenario: ${character.scenario || ""}`
      ].join("\n"),
      enabled: true,
      position: "character_prompt",
      target: characterTarget
    })
  ];

  if (triggeredEntries.length) {
    for (const entry of triggeredEntries) {
      sections.push(
        createSection({
          id: `worldbook-${entry.entryId}`,
          label: `World Info: ${entry.entryName || entry.entryId}`,
          source: "worldbook",
          sourceId: entry.entryId,
          content: `[${entry.entryName || entry.entryId}]\n${entry.content}`,
          enabled: true,
          position: `${entry.position} / order ${entry.insertionOrder}`,
          target: { page: "worldbooks", selectedWorldBookId: worldBook?.id ?? entry.worldBookId, selectedWorldBookEntryId: entry.entryId }
        })
      );
    }
  } else {
    sections.push(
      createSection({
        id: "worldbook-empty",
        label: "World Info",
        source: "worldbook",
        sourceId: worldBook?.id,
        content: "(no triggered world info)",
        enabled: false,
        position: "not inserted",
        target: worldBook ? { page: "worldbooks", selectedWorldBookId: worldBook.id } : undefined
      })
    );
  }

  if (project) {
    sections.push(...buildAdvancedSections(character, project));
  }

  sections.push(
    createSection({
      id: "example-messages",
      label: "Example Messages",
      source: "character",
      sourceId: character.id,
      content: character.exampleMessages ?? "",
      enabled: Boolean(character.exampleMessages?.trim()),
      position: "example_messages",
      target: characterTarget
    }),
    createSection({
      id: "post-history",
      label: "Post History Instructions",
      source: "character",
      sourceId: character.id,
      content: character.postHistoryInstructions ?? "",
      enabled: Boolean(character.postHistoryInstructions?.trim()),
      position: "post_history_instructions",
      target: characterTarget
    }),
    createSection({
      id: "chat-history",
      label: "Chat History",
      source: "chat",
      content: chatHistory.map((message) => `${message.role}: ${message.content}`).join("\n"),
      enabled: chatHistory.length > 0,
      position: "chat_history",
      target: { page: "test", selectedCharacterId: character.id }
    }),
    createSection({
      id: "latest-user-message",
      label: "Latest User Message",
      source: "chat",
      content: `user: ${latestUserInput}`,
      enabled: Boolean(latestUserInput.trim()),
      position: "latest_user_message",
      target: { page: "test", selectedCharacterId: character.id }
    })
  );

  return sections;
}

function buildAdvancedSections(character: InternalCharacter, project: PromptProjectContext): PromptChainSection[] {
  const sections: PromptChainSection[] = [];
  const variablesSection = buildVariableSection(character, project.advanced.variableSystem);
  if (variablesSection) sections.push(variablesSection);
  const frontend = character.frontendPackageId
    ? project.advanced.frontendPackages.find((item) => item.id === character.frontendPackageId)
    : undefined;
  if (frontend) sections.push(buildFrontendSection(character, frontend));
  const linkedScripts = project.advanced.scripts.filter((script) => character.linkedScripts.includes(script.id));
  if (linkedScripts.length) sections.push(...linkedScripts.map((script) => buildScriptSection(script)));
  return sections;
}

function buildVariableSection(character: InternalCharacter, variableSystem: VariableSystem): PromptChainSection | undefined {
  const linked = Boolean(character.linkedVariableSystem && character.linkedVariableSystem === variableSystem.id);
  const hasState = Object.keys(variableSystem.state).length > 0;
  if (!linked && !hasState) return undefined;
  return createSection({
    id: `variables-${variableSystem.id}`,
    label: "Variable State",
    source: "variables",
    sourceId: variableSystem.id,
    content: linked ? JSON.stringify(variableSystem.state, null, 2) : "(variable state exists but is not linked to this character)",
    enabled: linked,
    position: linked ? "variable_state_injection" : "not linked",
    target: { page: "advanced" }
  });
}

function buildFrontendSection(character: InternalCharacter, frontend: FrontendCardPackage): PromptChainSection {
  return createSection({
    id: `frontend-${frontend.id}`,
    label: `Frontend Init: ${frontend.name}`,
    source: "frontend",
    sourceId: frontend.id,
    content: [
      `Package: ${frontend.name}`,
      `Scripts: ${frontend.allowScripts ? "sandboxed scripts allowed" : "scripts disabled"}`,
      `Manifest: ${JSON.stringify(frontend.manifest, null, 2)}`,
      "HTML:",
      frontend.html,
      "CSS:",
      frontend.css
    ].join("\n"),
    enabled: true,
    position: "frontend_initialization_context",
    target: { page: "advanced", selectedCharacterId: character.id }
  });
}

function buildScriptSection(script: CardScript): PromptChainSection {
  return createSection({
    id: `script-${script.id}`,
    label: `Script Reference: ${script.name}`,
    source: "script",
    sourceId: script.id,
    content: [
      `Language: ${script.language}`,
      `Trigger: ${script.trigger}`,
      `Compatibility: ${script.compatibility}`,
      `Enabled: ${script.enabled ? "yes" : "no"}`,
      "Source:",
      script.source
    ].join("\n"),
    enabled: false,
    position: "static_reference_not_executed",
    target: { page: "advanced" }
  });
}

function runPromptRegex(rules: RegexRule[], character: InternalCharacter, prompt: string): RegexTestResult[] {
  const allowedTargets = new Set(["before_prompt", "after_prompt"]);
  const scopedRules = character.linkedRegexRules.length
    ? rules.filter((rule) => character.linkedRegexRules.includes(rule.id))
    : rules;
  return runRegexPipeline(scopedRules.filter((rule) => allowedTargets.has(rule.target)), prompt);
}

function buildRegexSection(results: RegexTestResult[]): PromptChainSection {
  return createSection({
    id: "regex-prompt-pipeline",
    label: "Regex Prompt Pipeline",
    source: "regex",
    content: results
      .map((result, index) =>
        [
          `${index + 1}. ${result.ruleName}`,
          result.error ? `Error: ${result.error}` : `Matched: ${result.matched.length ? result.matched.join(", ") : "none"}`,
          "After:",
          result.after
        ].join("\n")
      )
      .join("\n\n"),
    enabled: false,
    position: "preview_only_applied_to_final_prompt",
    target: { page: "advanced" }
  });
}

function createSection(input: Omit<PromptChainSection, "tokens">): PromptChainSection {
  return {
    ...input,
    tokens: estimateTokens(input.content)
  };
}

function formatPromptSection(section: PromptChainSection): string {
  return `${section.label}:\n${section.content || "(empty)"}`;
}

function renderEnabledPrompt(sections: PromptChainSection[]): string {
  return sections.filter((section) => section.enabled).map(formatPromptSection).join("\n\n");
}

export function characterTokenBreakdown(character: InternalCharacter) {
  return [
    { label: "description", tokens: estimateTokens(character.description) },
    { label: "personality", tokens: estimateTokens(character.personality ?? "") },
    { label: "scenario", tokens: estimateTokens(character.scenario ?? "") },
    { label: "first_mes", tokens: estimateTokens(character.firstMessage) },
    { label: "mes_example", tokens: estimateTokens(character.exampleMessages ?? "") },
    { label: "system_prompt", tokens: estimateTokens(character.systemPrompt ?? "") },
    { label: "post_history", tokens: estimateTokens(character.postHistoryInstructions ?? "") }
  ];
}
