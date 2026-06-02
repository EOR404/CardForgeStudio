import type { Asset, FrontendCardPackage, InternalWorldBook, TriggeredWorldBookEntry } from "../schema/types";
import { estimateTokens } from "../token/estimate";
import { analyzeWorldBookTrigger, summarizeTriggered } from "../worldbook/trigger";

export type FrontendSandboxEvent = {
  source: "cardforge-frontend-sandbox" | "cardforge-frontend-worker";
  type: "ready" | "click" | "state" | "error";
  payload: Record<string, unknown>;
  at: number;
};

export type FrontendSandboxPreview = {
  srcDoc: string;
  initialMessagePreview: string;
  variablePreview: string;
  buttonLabels: string[];
  worldBookPreview: FrontendWorldBookPreview;
  aiContentPreview: string;
  aiContentTokens: number;
  assetPreview: FrontendAssetPreview;
  permissionAudit: FrontendPermissionAudit;
  workerScript: string;
  workerMode: "disabled" | "preflight";
  scriptMode: "disabled" | "sandboxed";
};

export type FrontendSandboxContext = {
  variableState: Record<string, unknown>;
  worldBook?: InternalWorldBook;
  assets?: Asset[];
  latestUserInput?: string;
};

export type FrontendWorldBookPreview = {
  input: string;
  bookName: string;
  tokenBudget: number;
  usedTokens: number;
  triggeredCount: number;
  excludedCount: number;
  summary: string;
  entries: Array<{
    name: string;
    reason: string;
    matchedKeys: string[];
    position: TriggeredWorldBookEntry["position"];
    tokens: number;
    content: string;
  }>;
};

export type FrontendAssetPreview = {
  linkedCount: number;
  missingIds: string[];
  assets: Array<{
    id: string;
    name: string;
    type: Asset["type"];
    purpose?: Asset["purpose"];
    mimeType?: string;
    hasData: boolean;
    dataUrl?: string;
  }>;
};

export type FrontendPermissionIssue = {
  level: "error" | "warning" | "info";
  message: string;
};

export type FrontendPermissionAudit = {
  declaredPermissions: string[];
  knownPermissions: Array<{ id: string; label: string; description: string }>;
  unknownPermissions: string[];
  detectedCapabilities: string[];
  issues: FrontendPermissionIssue[];
};

const frontendPermissionCatalog = [
  { id: "ui.render", label: "渲染 UI", description: "允许 HTML/CSS 在 iframe 中静态呈现。" },
  { id: "ui.interact", label: "交互事件", description: "允许按钮、链接和 data-cfs-action 触发沙盒日志。" },
  { id: "dom.read", label: "读取 DOM", description: "允许脚本读取当前 iframe 内文本和节点。" },
  { id: "dom.write", label: "修改 DOM", description: "允许脚本修改 iframe 内节点状态。" },
  { id: "worldbook.preview", label: "世界书预览", description: "允许沙盒构建世界书触发预览。" },
  { id: "variables.preview", label: "变量预览", description: "允许沙盒读取变量预览或 manifest 变量补丁。" },
  { id: "ai.preview", label: "AI 内容预览", description: "允许沙盒生成发送给 AI 的内容预览。" },
  { id: "network.fetch", label: "网络请求", description: "声明前端卡可能发起 fetch / XHR / WebSocket。" },
  { id: "storage.local", label: "本地存储", description: "声明前端卡可能访问 localStorage / IndexedDB 等浏览器存储。" },
  { id: "file.read", label: "文件读取", description: "声明前端卡可能请求浏览器文件读取能力。" }
] as const;

export function buildFrontendSandboxPreview(
  frontendPackage: FrontendCardPackage,
  contextOrVariableState: FrontendSandboxContext | Record<string, unknown>
): FrontendSandboxPreview {
  const context = normalizeContext(contextOrVariableState);
  const buttonLabels = extractButtonLabels(frontendPackage.html);
  const initialMessagePreview = readInitialMessage(frontendPackage.manifest);
  const variablePreview = readVariablePreview(frontendPackage.manifest, context.variableState);
  const latestUserInput = context.latestUserInput ?? readSandboxInput(frontendPackage.manifest, initialMessagePreview);
  const triggerAnalysis = analyzeWorldBookTrigger(context.worldBook, latestUserInput, context.variableState);
  const worldBookPreview = buildWorldBookPreview(context.worldBook, triggerAnalysis);
  const assetPreview = buildAssetPreview(frontendPackage, context.assets ?? []);
  const aiContentPreview = buildAIContentPreview(frontendPackage, {
    buttonLabels,
    initialMessagePreview,
    variablePreview,
    assetPreview,
    worldBookEntries: triggerAnalysis.triggeredEntries
  });
  const permissionAudit = auditFrontendPermissions(frontendPackage);
  const srcDoc = [
    frontendPackage.html,
    `<style>${frontendPackage.css}</style>`,
    frontendPackage.allowScripts ? buildInstrumentedScript(frontendPackage.js) : ""
  ].join("\n");

  return {
    srcDoc,
    initialMessagePreview,
    variablePreview,
    buttonLabels,
    worldBookPreview,
    aiContentPreview,
    aiContentTokens: estimateTokens(aiContentPreview),
    assetPreview,
    permissionAudit,
    workerScript: frontendPackage.allowScripts ? buildWorkerPreflightScript(frontendPackage, permissionAudit) : "",
    workerMode: frontendPackage.allowScripts ? "preflight" : "disabled",
    scriptMode: frontendPackage.allowScripts ? "sandboxed" : "disabled"
  };
}

function normalizeContext(contextOrVariableState: FrontendSandboxContext | Record<string, unknown>): FrontendSandboxContext {
  if (
    "variableState" in contextOrVariableState &&
    typeof contextOrVariableState.variableState === "object" &&
    contextOrVariableState.variableState !== null &&
    !Array.isArray(contextOrVariableState.variableState)
  ) {
    return contextOrVariableState as FrontendSandboxContext;
  }
  return { variableState: contextOrVariableState };
}

function buildInstrumentedScript(userScript: string): string {
  const safeUserScript = escapeScriptContent(userScript);
  return `<script>
(() => {
  const send = (type, payload) => {
    parent.postMessage({ source: "cardforge-frontend-sandbox", type, payload, at: Date.now() }, "*");
  };
  const textState = () => (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 1200);
  let lastState = "";
  window.addEventListener("error", (event) => send("error", { message: event.message || "script error" }));
  window.addEventListener("unhandledrejection", (event) => send("error", { message: String(event.reason || "unhandled rejection") }));
  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("button,[data-cfs-action],a");
    if (!target) return;
    send("click", {
      tag: target.tagName?.toLowerCase?.() || "unknown",
      text: (target.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 120),
      action: target.getAttribute?.("data-cfs-action") || ""
    });
  }, true);
  const observer = new MutationObserver(() => {
    const nextState = textState();
    if (nextState && nextState !== lastState) {
      lastState = nextState;
      send("state", { text: nextState });
    }
  });
  if (document.body) observer.observe(document.body, { attributes: true, childList: true, characterData: true, subtree: true });
  try {
${safeUserScript}
  } catch (error) {
    send("error", { message: error instanceof Error ? error.message : String(error) });
  }
  lastState = textState();
  send("ready", {
    text: lastState,
    buttons: Array.from(document.querySelectorAll("button")).map((button) => (button.textContent || "").trim()).filter(Boolean)
  });
})();
</script>`;
}

function buildWorkerPreflightScript(frontendPackage: FrontendCardPackage, permissionAudit: FrontendPermissionAudit): string {
  return `
const send = (type, payload) => {
  self.postMessage({ source: "cardforge-frontend-worker", type, payload, at: Date.now() });
};
const blocked = (name) => () => {
  throw new Error(name + " is blocked in CardForge worker preflight");
};
self.fetch = blocked("fetch");
self.XMLHttpRequest = blocked("XMLHttpRequest");
self.WebSocket = blocked("WebSocket");
self.importScripts = blocked("importScripts");
send("ready", {
  packageName: ${JSON.stringify(frontendPackage.name)},
  declaredPermissions: ${JSON.stringify(permissionAudit.declaredPermissions)},
  detectedCapabilities: ${JSON.stringify(permissionAudit.detectedCapabilities)}
});
try {
${frontendPackage.js}
  send("state", { message: "worker preflight completed without synchronous errors" });
} catch (error) {
  send("error", {
    message: error instanceof Error ? error.message : String(error),
    note: "DOM-focused scripts can fail in Worker preflight; iframe sandbox remains the visual runtime."
  });
}
`;
}

function extractButtonLabels(html: string): string[] {
  return [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)]
    .map((match) => stripTags(match[1]).trim())
    .filter(Boolean);
}

function readInitialMessage(manifest: Record<string, unknown>): string {
  const value = manifest.initialMessage ?? manifest.initial_message ?? manifest.initMessage ?? manifest.prompt;
  return typeof value === "string" ? value : "";
}

function readSandboxInput(manifest: Record<string, unknown>, fallback: string): string {
  const value =
    manifest.triggerInput ??
    manifest.trigger_input ??
    manifest.testInput ??
    manifest.userInput ??
    manifest.aiInput ??
    manifest.latestUserInput;
  return typeof value === "string" ? value : fallback;
}

function readVariablePreview(manifest: Record<string, unknown>, variableState: Record<string, unknown>): string {
  const explicit = manifest.variablePatch ?? manifest.variables ?? manifest.variable_preview;
  if (explicit !== undefined) return stringifyPreview(explicit);
  return stringifyPreview(variableState);
}

function buildAssetPreview(frontendPackage: FrontendCardPackage, assets: Asset[]): FrontendAssetPreview {
  const assetIds = frontendPackage.assetIds ?? [];
  const linkedAssets = assetIds
    .map((id) => assets.find((asset) => asset.id === id))
    .filter((asset): asset is Asset => Boolean(asset));
  return {
    linkedCount: linkedAssets.length,
    missingIds: assetIds.filter((id) => !assets.some((asset) => asset.id === id)),
    assets: linkedAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      purpose: asset.purpose,
      mimeType: asset.mimeType,
      hasData: Boolean(asset.dataUrl),
      dataUrl: asset.dataUrl
    }))
  };
}

function auditFrontendPermissions(frontendPackage: FrontendCardPackage): FrontendPermissionAudit {
  const declaredPermissions = readPermissionList(frontendPackage.manifest);
  const permissionIds = new Set<string>(frontendPermissionCatalog.map((item) => item.id));
  const knownPermissions = frontendPermissionCatalog.filter((item) => declaredPermissions.includes(item.id));
  const unknownPermissions = declaredPermissions.filter((item) => !permissionIds.has(item));
  const detectedCapabilities = detectFrontendCapabilities(frontendPackage);
  const issues: FrontendPermissionIssue[] = [];

  if (frontendPackage.allowScripts && !declaredPermissions.length) {
    issues.push({
      level: "warning",
      message: "已允许脚本运行，但 manifest.permissions 为空；建议声明最小权限。"
    });
  }

  for (const unknown of unknownPermissions) {
    issues.push({ level: "warning", message: `未知前端权限：${unknown}` });
  }

  pushMissingPermissionIssue(issues, detectedCapabilities, declaredPermissions, "network", "network.fetch", "检测到网络 API，但未声明 network.fetch。");
  pushMissingPermissionIssue(issues, detectedCapabilities, declaredPermissions, "storage", "storage.local", "检测到浏览器存储 API，但未声明 storage.local。");
  pushMissingPermissionIssue(issues, detectedCapabilities, declaredPermissions, "file", "file.read", "检测到文件读取 API，但未声明 file.read。");
  pushMissingPermissionIssue(issues, detectedCapabilities, declaredPermissions, "dom.write", "dom.write", "检测到 DOM 修改行为，但未声明 dom.write。");

  if (detectedCapabilities.includes("dynamic-code")) {
    issues.push({
      level: "error",
      message: "检测到 eval / new Function 等动态代码执行，当前安全策略不允许。"
    });
  }

  if (!issues.length) {
    issues.push({ level: "info", message: "未发现超出白名单的明显风险。" });
  }

  return {
    declaredPermissions,
    knownPermissions,
    unknownPermissions,
    detectedCapabilities,
    issues
  };
}

function readPermissionList(manifest: Record<string, unknown>): string[] {
  const raw = manifest.permissions;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function detectFrontendCapabilities(frontendPackage: FrontendCardPackage): string[] {
  const source = [frontendPackage.html, frontendPackage.css, frontendPackage.js].join("\n");
  const checks: Array<[string, RegExp]> = [
    ["network", /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/],
    ["storage", /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/],
    ["file", /\b(FileReader|showOpenFilePicker|showDirectoryPicker|webkitRequestFileSystem)\b/],
    ["dom.read", /\b(querySelector|getElementById|getElementsBy|innerText|textContent)\b/],
    ["dom.write", /\b(innerHTML|textContent\s*=|innerText\s*=|appendChild|removeChild|classList\.|setAttribute)/],
    ["dynamic-code", /\b(eval|Function)\s*\(/]
  ];
  return checks.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
}

function pushMissingPermissionIssue(
  issues: FrontendPermissionIssue[],
  detectedCapabilities: string[],
  declaredPermissions: string[],
  capability: string,
  permission: string,
  message: string
) {
  if (detectedCapabilities.includes(capability) && !declaredPermissions.includes(permission)) {
    issues.push({ level: "warning", message });
  }
}

function buildWorldBookPreview(
  worldBook: InternalWorldBook | undefined,
  analysis: ReturnType<typeof analyzeWorldBookTrigger>
): FrontendWorldBookPreview {
  return {
    input: analysis.input,
    bookName: worldBook?.name ?? "未选择世界书",
    tokenBudget: analysis.tokenBudget,
    usedTokens: analysis.usedTokens,
    triggeredCount: analysis.triggeredEntries.length,
    excludedCount: analysis.excludedEntries.length,
    summary: summarizeTriggered(analysis.triggeredEntries),
    entries: analysis.triggeredEntries.map((entry) => ({
      name: entry.entryName || entry.entryId,
      reason: entry.reason,
      matchedKeys: entry.matchedKeys,
      position: entry.position,
      tokens: entry.tokens,
      content: entry.content
    }))
  };
}

function buildAIContentPreview(
  frontendPackage: FrontendCardPackage,
  input: {
    buttonLabels: string[];
    initialMessagePreview: string;
    variablePreview: string;
    assetPreview: FrontendAssetPreview;
    worldBookEntries: TriggeredWorldBookEntry[];
  }
): string {
  const worldBookContent = input.worldBookEntries.length
    ? input.worldBookEntries.map((entry) => `[${entry.entryName || entry.entryId}]\n${entry.content}`).join("\n\n")
    : "(未触发世界书条目)";
  const buttonContent = input.buttonLabels.length ? input.buttonLabels.map((label) => `- ${label}`).join("\n") : "(未识别按钮)";
  const assetContent = input.assetPreview.assets.length
    ? input.assetPreview.assets
        .map((asset) => `- ${asset.name} (${asset.type}${asset.purpose ? ` / ${asset.purpose}` : ""}${asset.mimeType ? ` / ${asset.mimeType}` : ""})`)
        .join("\n")
    : "(未绑定前端资源)";
  const htmlText = stripTags(frontendPackage.html).replace(/\s+/g, " ").trim();
  return [
    `Frontend Package: ${frontendPackage.name}`,
    "Initial Message Preview:",
    input.initialMessagePreview || "(empty)",
    "Variable Preview:",
    input.variablePreview || "(empty)",
    "Triggered Worldbook Entries:",
    worldBookContent,
    "Linked Frontend Assets:",
    assetContent,
    "Available UI Actions:",
    buttonContent,
    "Frontend Text Snapshot:",
    htmlText || "(empty)"
  ].join("\n");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function stringifyPreview(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function escapeScriptContent(value: string): string {
  return value.replace(/<\/script>/gi, "<\\/script>");
}
