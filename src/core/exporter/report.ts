import { pluginSafetyIssues } from "../plugin-runtime/manifest";
import { checkCharacterQuality, checkRegexRules, checkWorldBookQuality } from "../quality/checks";
import { scriptSafetyIssues } from "../script-runtime/safety";
import { canEnableFrontendScripts, trustLevelLabel } from "../security/trust";
import type { Asset, CardProject, CompatibilityTarget, InternalCharacter, InternalWorldBook, QualityIssue } from "../schema/types";
import { getV1LossWarnings } from "./character";

export type ExportFormat = "v1_json" | "v2_json" | "v3_json" | "v2_png" | "avatar_png" | "worldbook_json";

export type ExportTarget = CompatibilityTarget;

export const exportTargets: ExportTarget[] = [
  "sillytavern_v2",
  "sillytavern_regex",
  "sillytavern_mvu",
  "chub",
  "cardforge_native",
  "local_test"
];

export type ExportCheckLevel = "pass" | "warning" | "blocker" | "info";

export type ExportCheck = {
  id: string;
  level: ExportCheckLevel;
  category: "character" | "worldbook" | "asset" | "format" | "target" | "advanced" | "security";
  message: string;
  evidence?: string;
};

export type ExportDependency = {
  type: "worldbook" | "asset" | "regex" | "variable" | "script" | "frontend" | "plugin";
  label: string;
  status: "included" | "referenced" | "not_exported" | "warning";
  evidence: string;
};

export type ExportPreflightReport = {
  generatedAt: string;
  projectName: string;
  format: ExportFormat;
  target: ExportTarget;
  characterName?: string;
  worldBookName?: string;
  imageName?: string;
  summary: {
    blockers: number;
    warnings: number;
    infos: number;
    dependencies: number;
  };
  checks: ExportCheck[];
  dependencies: ExportDependency[];
};

export function buildExportPreflightReport(input: {
  project: CardProject;
  format: ExportFormat;
  target: ExportTarget;
  character?: InternalCharacter;
  worldBook?: InternalWorldBook;
  imageAsset?: Asset;
}): ExportPreflightReport {
  const checks: ExportCheck[] = [];
  const dependencies: ExportDependency[] = [];
  const { project, format, target, character, worldBook, imageAsset } = input;

  if (format !== "worldbook_json") {
    if (!character) {
      checks.push(check("missing-character", "blocker", "character", "请选择角色后再导出。"));
    } else {
      checks.push(...qualityIssuesToChecks(checkCharacterQuality(character, worldBook), "character"));
      if (format === "v1_json") {
        for (const warning of getV1LossWarnings(character)) {
          checks.push(check(`v1-loss-${warning}`, "warning", "format", `导出 V1 时：${warning}`));
        }
      }
      addCharacterDependencies(dependencies, project, character, worldBook, imageAsset, format, target);
    }
  }

  if (worldBook) {
    checks.push(...qualityIssuesToChecks(checkWorldBookQuality(worldBook), "worldbook"));
  } else if (format === "worldbook_json") {
    checks.push(check("missing-worldbook", "blocker", "worldbook", "请选择世界书后再导出。"));
  }

  if ((format === "v2_png" || format === "avatar_png") && !imageAsset) {
    checks.push(check("missing-png-image", "blocker", "asset", `${format === "avatar_png" ? "头像 PNG" : "V2 PNG"} 需要选择 PNG 图片资源。`, "可先在资源页导入图片，或在导出页临时导入。"));
  }
  if ((format === "v2_png" || format === "avatar_png") && imageAsset && !imageAsset.dataUrl) {
    checks.push(check("image-no-data", "blocker", "asset", format === "avatar_png" ? "所选图片缺少 dataUrl，无法导出头像 PNG。" : "所选图片缺少 dataUrl，无法写入 PNG metadata。"));
  }
  if ((format === "v2_png" || format === "avatar_png") && imageAsset && imageAsset.dataUrl && !isPngAsset(imageAsset)) {
    checks.push(
      check(
        "image-not-png",
        "blocker",
        "asset",
        format === "avatar_png" ? "头像 PNG 导出需要 PNG 图片，请换用 PNG 资源。" : "V2 PNG metadata 只能写入 PNG 图片，请换用 PNG 资源。",
        imageAsset.mimeType || imageAsset.dataUrl.slice(0, 32)
      )
    );
  }
  if (format === "v3_json") {
    checks.push(check("v3-experimental", "warning", "format", "V3 JSON 为实验性兼容导出，发布前请在目标平台验证。"));
  }

  checks.push(...targetCompatibilityChecks(project, target, format, character));
  checks.push(...advancedSafetyChecks(project));

  const blockers = checks.filter((item) => item.level === "blocker").length;
  const warnings = checks.filter((item) => item.level === "warning").length;
  const infos = checks.filter((item) => item.level === "info").length;
  if (!blockers && !warnings) {
    checks.push(check("no-blockers", "pass", "format", "没有发现导出阻塞问题。"));
  }

  return {
    generatedAt: new Date().toISOString(),
    projectName: project.name,
    format,
    target,
    characterName: character?.name,
    worldBookName: worldBook?.name,
    imageName: imageAsset?.name,
    summary: {
      blockers,
      warnings,
      infos,
      dependencies: dependencies.length
    },
    checks,
    dependencies
  };
}

export function formatExportReportMarkdown(report: ExportPreflightReport): string {
  return [
    `# CardForge 导出报告`,
    "",
    `- 项目：${report.projectName}`,
    `- 角色：${report.characterName ?? "未选择"}`,
    `- 世界书：${report.worldBookName ?? "未选择"}`,
    `- 图片：${report.imageName ?? "未选择"}`,
    `- 格式：${report.format}`,
    `- 目标：${targetLabel(report.target)}`,
    `- 生成时间：${report.generatedAt}`,
    "",
    "## 发布前检查",
    "",
    ...report.checks.map((item) => `- [${item.level}] ${item.category}: ${item.message}${item.evidence ? ` (${item.evidence})` : ""}`),
    "",
    "## 依赖说明",
    "",
    ...(report.dependencies.length
      ? report.dependencies.map((item) => `- [${item.status}] ${item.type}: ${item.label} - ${item.evidence}`)
      : ["- 无额外依赖。"]),
    "",
    "## 安全说明",
    "",
    "- 项目导出会清空 AI Provider API Key。",
    "- 未知脚本和插件不会自动执行。",
    "- 前端卡仅应在 sandbox 中预览或运行。"
  ].join("\n");
}

export function targetLabel(target: ExportTarget): string {
  const labels: Record<ExportTarget, string> = {
    sillytavern_v2: "SillyTavern 标准 V2",
    sillytavern_regex: "SillyTavern + Regex",
    sillytavern_mvu: "SillyTavern + MVU",
    chub: "Chub 兼容",
    cardforge_native: "CardForge 原生增强卡",
    local_test: "仅本软件测试"
  };
  return labels[target];
}

function addCharacterDependencies(
  dependencies: ExportDependency[],
  project: CardProject,
  character: InternalCharacter,
  worldBook: InternalWorldBook | undefined,
  imageAsset: Asset | undefined,
  format: ExportFormat,
  target: ExportTarget
) {
  if (worldBook) {
    dependencies.push({
      type: "worldbook",
      label: worldBook.name,
      status: format === "v1_json" ? "not_exported" : "included",
      evidence: `${worldBook.entries.length} 条世界书条目`
    });
  }
  if (imageAsset) {
    dependencies.push({
      type: "asset",
      label: imageAsset.name,
      status: format === "v2_png" || format === "avatar_png" || format === "v3_json" ? "included" : "referenced",
      evidence: imageAsset.purpose ? `用途：${imageAsset.purpose}` : "导出图片"
    });
  }
  for (const regexId of character.linkedRegexRules) {
    const regex = project.advanced.regexRules.find((item) => item.id === regexId);
    dependencies.push({
      type: "regex",
      label: regex?.name ?? regexId,
      status: target === "sillytavern_regex" || target === "cardforge_native" ? "referenced" : "warning",
      evidence: regex ? `${regex.target} / order ${regex.order}` : "角色引用的正则不存在"
    });
  }
  if (character.linkedVariableSystem) {
    dependencies.push({
      type: "variable",
      label: project.advanced.variableSystem.name,
      status: target === "sillytavern_mvu" || target === "cardforge_native" ? "referenced" : "warning",
      evidence: `绑定变量系统：${character.linkedVariableSystem}`
    });
  }
  for (const scriptId of character.linkedScripts) {
    const script = project.advanced.scripts.find((item) => item.id === scriptId);
    dependencies.push({
      type: "script",
      label: script?.name ?? scriptId,
      status: target === "cardforge_native" ? "referenced" : "not_exported",
      evidence: script ? `${script.language} / ${script.trigger} / ${script.compatibility}` : "角色引用的脚本不存在"
    });
  }
  if (character.frontendPackageId) {
    const frontend = project.advanced.frontendPackages.find((item) => item.id === character.frontendPackageId);
    dependencies.push({
      type: "frontend",
      label: frontend?.name ?? character.frontendPackageId,
      status: target === "cardforge_native" || target === "local_test" ? "referenced" : "not_exported",
      evidence: frontend ? `allowScripts=${frontend.allowScripts}` : "角色引用的前端包不存在"
    });
  }
}

function targetCompatibilityChecks(
  project: CardProject,
  target: ExportTarget,
  format: ExportFormat,
  character: InternalCharacter | undefined
): ExportCheck[] {
  const checks: ExportCheck[] = [];
  if (!character || format === "worldbook_json") return checks;
  const hasRegex = character.linkedRegexRules.length > 0 || project.advanced.regexRules.length > 0;
  const hasVariable = Boolean(character.linkedVariableSystem) || Object.keys(project.advanced.variableSystem.state).length > 0;
  const hasScript = character.linkedScripts.length > 0 || project.advanced.scripts.some((item) => item.enabled);
  const hasFrontend = Boolean(character.frontendPackageId);
  if (target === "sillytavern_v2") {
    if (hasRegex) checks.push(check("target-regex-loss", "warning", "target", "标准 V2 目标不会自动启用 CardForge 正则规则。"));
    if (hasVariable) checks.push(check("target-variable-loss", "warning", "target", "标准 V2 目标不会自动运行 CardForge 变量系统。"));
    if (hasScript || hasFrontend) checks.push(check("target-script-frontend-loss", "warning", "target", "脚本和前端卡不会在标准 V2 目标中运行。"));
  }
  if (target === "sillytavern_regex" && (hasVariable || hasScript || hasFrontend)) {
    checks.push(check("target-regex-partial", "warning", "target", "Regex 目标仍需另行适配变量、脚本或前端卡依赖。"));
  }
  if (target === "sillytavern_mvu" && (hasScript || hasFrontend)) {
    checks.push(check("target-mvu-partial", "warning", "target", "MVU 目标仍需另行适配脚本或前端卡依赖。"));
  }
  if (target === "chub" && (hasRegex || hasVariable || hasScript || hasFrontend)) {
    checks.push(check("target-chub-advanced", "warning", "target", "Chub 兼容导出可能无法保留高级运行时依赖。"));
  }
  if (target === "cardforge_native") {
    checks.push(check("target-native", "info", "target", "CardForge 原生增强卡会尽量保留项目内依赖；目标平台外发布前仍需导出报告。"));
  }
  return checks;
}

function advancedSafetyChecks(project: CardProject): ExportCheck[] {
  const checks: ExportCheck[] = [];
  checks.push(...checkRegexRules(project.advanced.regexRules).map((issue) => qualityIssueToCheck(issue, "advanced")));
  for (const script of project.advanced.scripts) {
    for (const issue of scriptSafetyIssues(script, project.trustLevel)) {
      checks.push(check(`script-${script.id}-${issue.id}`, issue.level === "error" ? "blocker" : "warning", "security", `${script.name}: ${issue.message}`));
    }
  }
  for (const frontend of project.advanced.frontendPackages) {
    if (frontend.allowScripts && !canEnableFrontendScripts(project.trustLevel)) {
      checks.push(
        check(
          `frontend-${frontend.id}-trust`,
          "warning",
          "security",
          `${frontend.name}: ${trustLevelLabel(project.trustLevel)}项目不会运行前端卡 JS 预览。`
        )
      );
    }
  }
  for (const plugin of project.advanced.plugins) {
    for (const issue of pluginSafetyIssues(plugin, project.trustLevel)) {
      checks.push(check(`plugin-${plugin.id}-${issue.id}`, issue.level === "error" ? "blocker" : "warning", "security", `${plugin.name}: ${issue.message}`));
    }
  }
  return checks;
}

function qualityIssuesToChecks(issues: QualityIssue[], category: ExportCheck["category"]): ExportCheck[] {
  return issues.map((issue) => qualityIssueToCheck(issue, category));
}

function qualityIssueToCheck(issue: QualityIssue, category: ExportCheck["category"]): ExportCheck {
  return check(issue.id, issue.level === "error" ? "blocker" : issue.level, category, issue.message, issue.scope);
}

function check(
  id: string,
  level: ExportCheckLevel,
  category: ExportCheck["category"],
  message: string,
  evidence?: string
): ExportCheck {
  return { id, level, category, message, evidence };
}

function isPngAsset(asset: Asset): boolean {
  const mimeType = asset.mimeType?.toLowerCase() ?? "";
  if (mimeType === "image/png") return true;
  return Boolean(asset.dataUrl?.startsWith("data:image/png;base64,"));
}
