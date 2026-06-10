import type { ProjectTrustLevel } from "../schema/types";

export const projectTrustLevels: ProjectTrustLevel[] = ["untrusted", "restricted", "trusted"];

export function trustLevelLabel(level: ProjectTrustLevel): string {
  const labels: Record<ProjectTrustLevel, string> = {
    untrusted: "不信任",
    restricted: "受限信任",
    trusted: "完全信任"
  };
  return labels[level];
}

export function trustLevelDescription(level: ProjectTrustLevel): string {
  const descriptions: Record<ProjectTrustLevel, string> = {
    untrusted: "只读查看高级依赖，禁止开启脚本、插件和前端 JS 预览。",
    restricted: "允许前端卡在 iframe sandbox 中预览受限 JS，但脚本和插件仍不能启用。",
    trusted: "允许在管理界面标记脚本、插件和前端 JS 预览；当前版本仍不会执行未知脚本或插件代码。"
  };
  return descriptions[level];
}

export function canEnableFrontendScripts(level: ProjectTrustLevel): boolean {
  return level === "restricted" || level === "trusted";
}

export function canEnableManagedRuntime(level: ProjectTrustLevel): boolean {
  return level === "trusted";
}
