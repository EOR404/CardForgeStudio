import type { CardScript, QualityIssue } from "../schema/types";

const BLOCKED_PERMISSIONS = new Set(["apiKey.read", "fs.fullAccess", "shell.execute", "network.fullAccess"]);

export function scriptSafetyIssues(script: CardScript): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const permission of script.permissions) {
    if (BLOCKED_PERMISSIONS.has(permission)) {
      issues.push(issue("error", "script.permission", `高风险权限被禁止：${permission}`));
    }
  }
  if (script.enabled && script.compatibility === "unknown") {
    issues.push(issue("warning", "script.compatibility", "未知兼容性的脚本不应启用。"));
  }
  if (script.enabled && script.language === "javascript" && script.compatibility !== "native") {
    issues.push(issue("warning", "script.javascript", "JavaScript 脚本只能作为受限草案管理，不会在当前版本执行。"));
  }
  return issues;
}

export function isScriptRunnableInCurrentVersion(_script: CardScript): false {
  return false;
}

function issue(level: QualityIssue["level"], scope: string, message: string): QualityIssue {
  return {
    id: `${scope}.${message}`,
    level,
    scope,
    message
  };
}
