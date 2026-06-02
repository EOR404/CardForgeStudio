import { checkCharacterQuality } from "../quality/checks";
import type { CardProject, FieldDiff, InternalCharacter, InternalWorldBook, TestSession } from "../schema/types";
import { estimateTokens } from "../token/estimate";
import { diffCharacters } from "../version/diff";
import { triggerWorldBookEntries } from "../worldbook/trigger";
import { buildTestPrompt } from "../prompt-builder/buildPrompt";

export type ABComparisonSide = {
  label: string;
  promptTokens: number;
  characterTokens: number;
  qualityErrors: number;
  qualityWarnings: number;
  triggeredEntries: number;
  triggeredNames: string[];
  failedSamples: number;
  stabilityScore: number;
  recallScore: number;
  tokenScore: number;
  totalScore: number;
};

export type ABComparisonReport = {
  baseline: ABComparisonSide;
  candidate: ABComparisonSide;
  fieldDiffs: FieldDiff[];
  tokenDelta: number;
  scoreDelta: number;
  failureSamples: TestSession[];
  recommendation: string;
  repairHints: string[];
};

export type ABComparisonInput = {
  project: CardProject;
  baselineCharacter: InternalCharacter;
  candidateCharacter: InternalCharacter;
  baselineLabel: string;
  candidateLabel?: string;
  worldBook?: InternalWorldBook;
  userInput: string;
};

export function buildABComparisonReport(input: ABComparisonInput): ABComparisonReport {
  const testInput = input.userInput.trim() || "请保持角色，简单回应当前场景。";
  const baseline = buildSide(
    input.baselineLabel,
    input.baselineCharacter,
    input.worldBook,
    testInput,
    input.project
  );
  const candidate = buildSide(
    input.candidateLabel ?? "当前编辑",
    input.candidateCharacter,
    input.worldBook,
    testInput,
    input.project
  );
  const fieldDiffs = diffCharacters(input.baselineCharacter, input.candidateCharacter);
  const tokenDelta = candidate.promptTokens - baseline.promptTokens;
  const scoreDelta = candidate.totalScore - baseline.totalScore;
  const failureSamples = input.project.tests
    .filter((session) => session.characterId === input.candidateCharacter.id && session.status === "failed")
    .slice(0, 5);

  return {
    baseline,
    candidate,
    fieldDiffs,
    tokenDelta,
    scoreDelta,
    failureSamples,
    recommendation: recommendSide(baseline, candidate, tokenDelta, fieldDiffs.length),
    repairHints: buildRepairHints(baseline, candidate, tokenDelta, fieldDiffs, failureSamples)
  };
}

function buildSide(
  label: string,
  character: InternalCharacter,
  worldBook: InternalWorldBook | undefined,
  userInput: string,
  project: CardProject
): ABComparisonSide {
  const quality = checkCharacterQuality(character, worldBook);
  const prompt = buildTestPrompt(character, worldBook, [], userInput, { advanced: project.advanced, mode: project.mode });
  const triggered = triggerWorldBookEntries(worldBook, userInput, project.advanced.variableSystem.state);
  const sessions = project.tests;
  const characterTokens = [
    character.description,
    character.personality,
    character.scenario,
    character.firstMessage,
    character.exampleMessages,
    character.systemPrompt,
    character.postHistoryInstructions
  ].reduce((sum, value) => sum + estimateTokens(value ?? ""), 0);
  const qualityErrors = quality.filter((issue) => issue.level === "error").length;
  const qualityWarnings = quality.filter((issue) => issue.level === "warning").length;
  const failedSamples = sessions.filter((session) => session.characterId === character.id && session.status === "failed").length;
  const stabilityScore = clampScore(100 - qualityErrors * 28 - qualityWarnings * 12 - failedSamples * 8);
  const recallScore = worldBook?.entries.length ? clampScore(triggered.length ? 100 : 55) : 100;
  const tokenScore = clampScore(100 - Math.max(0, prompt.prompt.length ? prompt.promptSections.reduce((sum, section) => sum + section.tokens, 0) - 3200 : 0) / 35);
  const totalScore = Math.round(stabilityScore * 0.45 + recallScore * 0.35 + tokenScore * 0.2);

  return {
    label,
    promptTokens: prompt.promptSections.reduce((sum, section) => sum + section.tokens, 0),
    characterTokens,
    qualityErrors,
    qualityWarnings,
    triggeredEntries: triggered.length,
    triggeredNames: triggered.map((entry) => entry.entryName || entry.entryId),
    failedSamples,
    stabilityScore,
    recallScore,
    tokenScore,
    totalScore
  };
}

function recommendSide(
  baseline: ABComparisonSide,
  candidate: ABComparisonSide,
  tokenDelta: number,
  diffCount: number
): string {
  if (!diffCount) return "两个版本没有字段差异，可保留当前编辑作为工作版本。";
  if (candidate.totalScore >= baseline.totalScore + 6 && tokenDelta <= 400) return "当前编辑综合评分更好，建议继续打磨当前版本。";
  if (baseline.totalScore > candidate.totalScore + 6) return "基准版本更稳，建议从快照恢复关键字段或逐项合并。";
  if (tokenDelta > 600) return "当前编辑 token 增长明显，建议压缩长字段或拆入世界书。";
  return "两个版本接近，建议人工阅读差异字段并结合失败样本决定保留内容。";
}

function buildRepairHints(
  baseline: ABComparisonSide,
  candidate: ABComparisonSide,
  tokenDelta: number,
  fieldDiffs: FieldDiff[],
  failureSamples: TestSession[]
): string[] {
  const hints: string[] = [];
  if (candidate.qualityErrors > baseline.qualityErrors) hints.push("当前版本新增 error 级质量问题，优先修复空 name / first_mes 等阻塞字段。");
  if (candidate.qualityWarnings > baseline.qualityWarnings) hints.push("当前版本 warning 增多，检查是否替用户行动、description 过长或缺少世界书兜底。");
  if (candidate.triggeredEntries < baseline.triggeredEntries) hints.push("当前版本触发的世界书条目更少，检查关键词、扫描文本或绑定世界书。");
  if (tokenDelta > 600) hints.push("当前版本 Prompt token 增长超过 600，建议压缩 description / mes_example，或拆分到非触发世界书。");
  if (failureSamples.length) hints.push(`已有 ${failureSamples.length} 条失败样本可作为回归测试，修复后重新运行同一用例。`);
  if (fieldDiffs.some((diff) => diff.field === "system_prompt")) hints.push("system_prompt 发生变化，复查是否影响抗 OOC 与不替用户行动规则。");
  if (!hints.length) hints.push("未发现明显自动修复点，可从语气、设定召回和回复节奏做人工精修。");
  return hints;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
