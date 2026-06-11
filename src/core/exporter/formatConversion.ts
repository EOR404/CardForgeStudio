import { importCharacterJson, importWorldBookJson } from "../importer/character";
import type { CompatibilityReport, InternalWorldBook } from "../schema/types";
import { getV1LossWarnings, prettyJson, toV1Character, toV2Character, toV3Character, toWorldBookJson } from "./character";

export type FormatConversionTarget = "v1_json" | "v2_json" | "v3_json" | "worldbook_json";

export type FormatConversionResult = {
  target: FormatConversionTarget;
  kind: "character" | "worldbook";
  title: string;
  fileName: string;
  outputText: string;
  warnings: string[];
  report?: CompatibilityReport;
};

export function convertJsonFormat(input: unknown, target: FormatConversionTarget, sourceName = "格式转换输入"): FormatConversionResult {
  if (target === "worldbook_json") return convertWorldBookFormat(input, target, sourceName);
  const result = importCharacterJson(input, sourceName);
  const worldBook = result.embeddedWorldBook;
  const warnings = [
    ...(target === "v1_json" ? getV1LossWarnings(result.character) : []),
    ...(result.report.importedAsReadonly ? result.report.readonlyReasons : []),
    ...result.report.recommendedActions.slice(0, 3)
  ].filter(Boolean);
  const output =
    target === "v1_json"
      ? toV1Character(result.character)
      : target === "v3_json"
        ? toV3Character(result.character, worldBook)
        : toV2Character(result.character, worldBook);
  return {
    target,
    kind: "character",
    title: result.character.name || "未命名角色",
    fileName: `${safeName(result.character.name || "character")}.${targetSuffix(target)}`,
    outputText: prettyJson(output),
    warnings: [...new Set(warnings)],
    report: result.report
  };
}

function convertWorldBookFormat(input: unknown, target: FormatConversionTarget, sourceName: string): FormatConversionResult {
  const worldBook = extractEmbeddedWorldBook(input, sourceName) ?? importWorldBookJson(input, sourceName);
  const warnings = worldBook.entries.length ? [] : ["世界书没有条目，请确认源文件是否为有效 World Info / Lorebook。"];
  return {
    target,
    kind: "worldbook",
    title: worldBook.name || "导入世界书",
    fileName: `${safeName(worldBook.name || "worldbook")}.worldbook.json`,
    outputText: prettyJson(toWorldBookJson(worldBook)),
    warnings
  };
}

function extractEmbeddedWorldBook(input: unknown, sourceName: string): InternalWorldBook | undefined {
  try {
    return importCharacterJson(input, sourceName).embeddedWorldBook;
  } catch {
    return undefined;
  }
}

function targetSuffix(target: FormatConversionTarget): string {
  const suffixes: Record<FormatConversionTarget, string> = {
    v1_json: "v1.json",
    v2_json: "v2.json",
    v3_json: "v3.json",
    worldbook_json: "worldbook.json"
  };
  return suffixes[target];
}

function safeName(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_") || "cardforge";
}
