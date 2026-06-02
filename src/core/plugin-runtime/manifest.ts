import { uid } from "../schema/defaults";
import type { PluginManifest, QualityIssue } from "../schema/types";

const BLOCKED_PERMISSIONS = new Set(["apiKey.read", "fs.fullAccess", "shell.execute", "network.fullAccess"]);

export function normalizePluginManifest(input: unknown): PluginManifest {
  const raw = isRecord(input) ? input : {};
  const permissions = Array.isArray(raw.permissions) ? raw.permissions.map(String).filter(Boolean) : [];
  return {
    id: stringValue(raw.id, uid("plugin")),
    name: stringValue(raw.name, "未命名插件"),
    version: stringValue(raw.version, "0.1.0"),
    main: typeof raw.main === "string" ? raw.main : "",
    enabled: Boolean(raw.enabled),
    permissions,
    contributes: isRecord(raw.contributes) ? raw.contributes : {},
    trusted: Boolean(raw.trusted),
    notes: typeof raw.notes === "string" ? raw.notes : "导入的插件默认不受信任，当前版本不会执行。"
  };
}

export function pluginSafetyIssues(plugin: PluginManifest): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const permission of plugin.permissions) {
    if (BLOCKED_PERMISSIONS.has(permission)) {
      issues.push(issue("error", "plugin.permission", `高风险权限被禁止：${permission}`));
    }
  }
  if (plugin.enabled && !plugin.trusted) {
    issues.push(issue("warning", "plugin.trust", "未受信任插件不应启用。"));
  }
  if (!plugin.main?.trim()) {
    issues.push(issue("info", "plugin.main", "未设置 main 入口；当前仅作为 manifest 草案保存。"));
  }
  return issues;
}

export function isPluginRunnableInCurrentVersion(_plugin: PluginManifest): false {
  return false;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(level: QualityIssue["level"], scope: string, message: string): QualityIssue {
  return {
    id: `${scope}.${message}`,
    level,
    scope,
    message
  };
}
