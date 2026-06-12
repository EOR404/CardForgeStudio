import { prettyJson, sanitizeProjectForExport, toV2Character, toV3Character, toWorldBookJson } from "../core/exporter/character";
import { buildAssetReferenceManifest, serializeAssetForExternalFile } from "../core/project/assetFiles";
import { normalizeImportedProject } from "../core/project/normalize";
import type { Asset, CardProject, FrontendCardPackage, VersionSnapshot } from "../core/schema/types";
import { safeFileName } from "../utils/file";
import type { ProjectDirectoryEntry, ProjectDirectoryResult } from "./StorageAdapter";

type DirectoryHandle = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
};

type FileHandleLike = {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
};

type WritableLike = {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
};

type FileSystemWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryHandle>;
};

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof (window as FileSystemWindow).showDirectoryPicker === "function";
}

export function buildProjectDirectoryEntries(project: CardProject): ProjectDirectoryEntry[] {
  const sanitized = sanitizeProjectForExport(project);
  const entries: ProjectDirectoryEntry[] = [
    entry("project.json", sanitized),
    entry(".cardforge/manifest.json", {
      format: "cardforge-folder-v1",
      app: "CardForge Studio",
      projectId: sanitized.id,
      projectName: sanitized.name,
      savedAt: new Date().toISOString(),
      containsApiKeys: false
    }),
    textEntry(
      "README.txt",
      [
        "CardForge Studio visible project folder",
        `Project: ${sanitized.name}`,
        "API keys are intentionally removed.",
        "Open this folder from the CardForge Studio project page."
      ].join("\n")
    ),
    entry("presets/ai-presets.json", sanitized.aiPresets),
    entry("tests/sessions.json", sanitized.tests),
    entry("tests/failure-cases.json", sanitized.tests.filter((session) => session.status === "failed")),
    entry("versions/snapshots.json", sanitized.versions),
    entry("exports/history.json", sanitized.exports),
    entry("assets/references.json", buildAssetReferenceManifest(sanitized.assets)),
    entry("regex/rules.json", sanitized.advanced.regexRules),
    entry("variables/state.json", sanitized.advanced.variableSystem),
    entry("scripts/scripts.json", sanitized.advanced.scripts),
    entry("plugins/manifests.json", sanitized.advanced.plugins),
    entry("compatibility/reports.json", sanitized.advanced.compatibilityReports),
    entry("logs/ai-calls.json", sanitized.aiLogs),
    textEntry("logs/README.txt", "AI call logs are exported as ai-calls.json. Browser runtime console logs are not included.\n")
  ];

  for (const character of sanitized.characters) {
    const name = safeFileName(character.name || character.id);
    const linkedBook = sanitized.worldBooks.find((book) => character.linkedWorldBooks.includes(book.id));
    entries.push(entry(`characters/${name}.character.json`, character));
    entries.push(entry(`exports/v2/${name}.v2.json`, toV2Character(character, linkedBook)));
    entries.push(entry(`exports/v3/${name}.v3.json`, toV3Character(character, linkedBook, sanitized.assets)));
  }

  for (const worldBook of sanitized.worldBooks) {
    const name = safeFileName(worldBook.name || worldBook.id);
    entries.push(entry(`worldbooks/${name}.worldbook.json`, toWorldBookJson(worldBook)));
    entries.push(entry(`worldbooks/internal/${name}.internal.worldbook.json`, worldBook));
  }

  entries.push(entry("tests/test-cases.json", sanitized.testCases ?? []));
  for (const asset of sanitized.assets) addAssetEntries(entries, asset);
  for (const session of sanitized.tests.filter((item) => item.status === "failed")) {
    entries.push(entry(`tests/failure-cases/${safeFileName(session.name || session.id)}.test.json`, session));
  }
  for (const snapshot of sanitized.versions) addVersionSnapshotEntry(entries, snapshot);
  for (const frontendPackage of sanitized.advanced.frontendPackages) addFrontendEntries(entries, frontendPackage, sanitized.assets);

  return entries;
}

export async function saveProjectToPickedDirectory(project: CardProject): Promise<ProjectDirectoryResult> {
  const picker = (window as FileSystemWindow).showDirectoryPicker;
  if (!picker) throw new Error("当前浏览器不支持选择项目文件夹。请使用 Chrome/Edge 的 localhost 页面，或导出 .cardforge.zip。");
  const root = await picker({ mode: "readwrite" });
  const entries = buildProjectDirectoryEntries(project);
  for (const item of entries) {
    await writeEntry(root, item);
  }
  return { projectName: project.name, fileCount: entries.length };
}

export async function openProjectFromPickedDirectory(): Promise<CardProject> {
  const picker = (window as FileSystemWindow).showDirectoryPicker;
  if (!picker) throw new Error("当前浏览器不支持打开项目文件夹。请改用项目 JSON 或 .cardforge.zip 导入。");
  const root = await picker({ mode: "read" });
  const file = await (await root.getFileHandle("project.json")).getFile();
  const project = JSON.parse(await file.text()) as CardProject;
  return normalizeImportedProject(project, "项目文件夹 project.json");
}

async function writeEntry(root: DirectoryHandle, item: ProjectDirectoryEntry) {
  const parts = item.path.split("/");
  const fileName = parts.pop();
  if (!fileName) return;
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  const file = await current.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(item.bytes);
  await writable.close();
}

function addAssetEntries(entries: ProjectDirectoryEntry[], asset: Asset) {
  const base = asset.type === "image" ? "assets/images" : `assets/${asset.type}s`;
  const name = safeFileName(asset.name || asset.id);
  entries.push(entry(`${base}/${name}.asset.json`, serializeAssetForExternalFile(asset)));
  if (asset.dataUrl) {
    const parsed = dataUrlToBytes(asset.dataUrl);
    entries.push({ path: `${base}/${assetBinaryName(asset.name || asset.id, extensionFromMime(asset.mimeType ?? parsed.mimeType))}`, bytes: parsed.bytes });
  }
}

function addFrontendEntries(entries: ProjectDirectoryEntry[], frontendPackage: FrontendCardPackage, assets: Asset[]) {
  const base = `frontend/${safeFileName(frontendPackage.name || frontendPackage.id)}`;
  entries.push(textEntry(`${base}/index.html`, frontendPackage.html));
  entries.push(textEntry(`${base}/style.css`, frontendPackage.css));
  entries.push(textEntry(`${base}/main.js`, frontendPackage.js));
  entries.push(
    entry(`${base}/manifest.json`, {
      ...frontendPackage.manifest,
      cardforge: {
        ...(typeof frontendPackage.manifest.cardforge === "object" && frontendPackage.manifest.cardforge !== null
          ? frontendPackage.manifest.cardforge
          : {}),
        assetIds: frontendPackage.assetIds ?? []
      }
    })
  );
  entries.push(
    entry(
      `${base}/assets/assets.json`,
      (frontendPackage.assetIds ?? []).map((assetId) => assets.find((asset) => asset.id === assetId) ?? { id: assetId, missing: true })
    )
  );
  entries.push(
    entry(
      `${base}/assets/references.json`,
      buildAssetReferenceManifest(assets.filter((asset) => (frontendPackage.assetIds ?? []).includes(asset.id)))
    )
  );
  for (const asset of assets.filter((item) => (frontendPackage.assetIds ?? []).includes(item.id))) {
    const name = safeFileName(asset.name || asset.id);
    entries.push(entry(`${base}/assets/${name}.asset.json`, serializeAssetForExternalFile(asset)));
    if (asset.dataUrl) {
      const parsed = dataUrlToBytes(asset.dataUrl);
      entries.push({ path: `${base}/assets/${assetBinaryName(asset.name || asset.id, extensionFromMime(asset.mimeType ?? parsed.mimeType))}`, bytes: parsed.bytes });
    }
  }
}

function addVersionSnapshotEntry(entries: ProjectDirectoryEntry[], snapshot: VersionSnapshot) {
  entries.push(entry(`versions/${snapshotFolder(snapshot.targetType)}/${safeFileName(snapshot.label || snapshot.id)}.version.json`, snapshot));
}

function entry(path: string, value: unknown): ProjectDirectoryEntry {
  return textEntry(path, prettyJson(value));
}

function textEntry(path: string, value: string): ProjectDirectoryEntry {
  return { path, bytes: new TextEncoder().encode(value) };
}

function dataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("资源 dataUrl 无法写入项目文件夹。");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1], bytes };
}

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("json")) return "json";
  if (mimeType.includes("text")) return "txt";
  return "bin";
}

function assetBinaryName(name: string, extension: string): string {
  const safe = safeFileName(name);
  return safe.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? safe : `${safe}.${extension}`;
}

function snapshotFolder(targetType: VersionSnapshot["targetType"]): string {
  const folders: Record<VersionSnapshot["targetType"], string> = {
    character: "characters",
    worldbook: "worldbooks",
    project: "project-snapshots",
    advanced: "advanced"
  };
  return folders[targetType];
}
