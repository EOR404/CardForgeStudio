import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { prettyJson, sanitizeProjectForExport, toV2Character, toV3Character, toWorldBookJson } from "../exporter/character";
import type { Asset, CardProject, FrontendCardPackage, VersionSnapshot } from "../schema/types";
import { buildAssetReferenceManifest, serializeAssetForExternalFile } from "./assetFiles";
import { normalizeImportedProject } from "./normalize";

const PACKAGE_VERSION = "cardforge-package-v1";

type ZipTree = Record<string, Uint8Array>;

export function exportProjectPackage(project: CardProject): Uint8Array {
  const sanitized = sanitizeProjectForExport(project);
  const files: ZipTree = {
    "project.json": jsonFile(sanitized),
    ".cardforge/manifest.json": jsonFile({
      format: PACKAGE_VERSION,
      app: "CardForge Studio",
      projectId: sanitized.id,
      projectName: sanitized.name,
      exportedAt: new Date().toISOString(),
      containsApiKeys: false
    }),
    "README.txt": strToU8(
      [
        "CardForge Studio project package",
        `Project: ${sanitized.name}`,
        "API keys are intentionally removed.",
        "This package can be imported from the CardForge Studio project page."
      ].join("\n")
    ),
    "presets/ai-presets.json": jsonFile(sanitized.aiPresets),
    "tests/test-cases.json": jsonFile(sanitized.testCases ?? []),
    "tests/sessions.json": jsonFile(sanitized.tests),
    "tests/failure-cases.json": jsonFile(sanitized.tests.filter((session) => session.status === "failed")),
    "versions/snapshots.json": jsonFile(sanitized.versions),
    "exports/history.json": jsonFile(sanitized.exports),
    "assets/references.json": jsonFile(buildAssetReferenceManifest(sanitized.assets)),
    "regex/rules.json": jsonFile(sanitized.advanced.regexRules),
    "variables/state.json": jsonFile(sanitized.advanced.variableSystem),
    "scripts/scripts.json": jsonFile(sanitized.advanced.scripts),
    "plugins/manifests.json": jsonFile(sanitized.advanced.plugins),
    "compatibility/reports.json": jsonFile(sanitized.advanced.compatibilityReports),
    "logs/ai-calls.json": jsonFile(sanitized.aiLogs),
    "logs/README.txt": strToU8("AI call logs are exported as ai-calls.json. Browser runtime console logs are not included.\n")
  };

  for (const character of sanitized.characters) {
    const linkedBook = sanitized.worldBooks.find((book) => character.linkedWorldBooks.includes(book.id));
    files[`characters/${safeName(character.name || character.id)}.character.json`] = jsonFile(character);
    files[`exports/v2/${safeName(character.name || character.id)}.v2.json`] = jsonFile(toV2Character(character, linkedBook));
    files[`exports/v3/${safeName(character.name || character.id)}.v3.json`] = jsonFile(
      toV3Character(character, linkedBook, sanitized.assets)
    );
  }

  for (const worldBook of sanitized.worldBooks) {
    files[`worldbooks/${safeName(worldBook.name || worldBook.id)}.worldbook.json`] = jsonFile(toWorldBookJson(worldBook));
    files[`worldbooks/internal/${safeName(worldBook.name || worldBook.id)}.internal.worldbook.json`] = jsonFile(worldBook);
  }

  for (const asset of sanitized.assets) {
    addAssetFiles(files, asset);
  }

  for (const session of sanitized.tests.filter((item) => item.status === "failed")) {
    files[`tests/failure-cases/${safeName(session.name || session.id)}.test.json`] = jsonFile(session);
  }

  for (const snapshot of sanitized.versions) {
    addVersionSnapshotFile(files, snapshot);
  }

  for (const frontendPackage of sanitized.advanced.frontendPackages) {
    addFrontendPackageFiles(files, frontendPackage, sanitized.assets);
  }

  return zipSync(files, { level: 6 });
}

export function importProjectPackage(bytes: Uint8Array): CardProject {
  const files = unzipSync(bytes);
  const manifest = readOptionalJson(files[".cardforge/manifest.json"]) as { format?: string } | undefined;
  if (manifest?.format && manifest.format !== PACKAGE_VERSION) {
    throw new Error(`不支持的 CardForge 包版本：${manifest.format}`);
  }
  const project = readOptionalJson(files["project.json"]) as CardProject | undefined;
  if (!project) throw new Error("项目包缺少 project.json。");
  return normalizeImportedProject(project, "项目包 project.json");
}

function addAssetFiles(files: ZipTree, asset: Asset) {
  const base = asset.type === "image" ? "assets/images" : `assets/${asset.type}s`;
  files[`${base}/${safeName(asset.name || asset.id)}.asset.json`] = jsonFile(serializeAssetForExternalFile(asset));
  if (asset.dataUrl) {
    const parsed = dataUrlToBytes(asset.dataUrl);
    const extension = extensionFromMime(asset.mimeType ?? parsed.mimeType);
    files[`${base}/${assetBinaryName(asset.name || asset.id, extension)}`] = parsed.bytes;
  }
}

function addFrontendPackageFiles(files: ZipTree, frontendPackage: FrontendCardPackage, assets: Asset[]) {
  const base = `frontend/${safeName(frontendPackage.name || frontendPackage.id)}`;
  files[`${base}/index.html`] = strToU8(frontendPackage.html);
  files[`${base}/style.css`] = strToU8(frontendPackage.css);
  files[`${base}/main.js`] = strToU8(frontendPackage.js);
  files[`${base}/manifest.json`] = jsonFile({
    ...frontendPackage.manifest,
    cardforge: {
      ...(typeof frontendPackage.manifest.cardforge === "object" && frontendPackage.manifest.cardforge !== null
        ? frontendPackage.manifest.cardforge
        : {}),
      assetIds: frontendPackage.assetIds ?? []
    }
  });
  files[`${base}/assets/assets.json`] = jsonFile(
    (frontendPackage.assetIds ?? []).map((assetId) => assets.find((asset) => asset.id === assetId) ?? { id: assetId, missing: true })
  );
  files[`${base}/assets/references.json`] = jsonFile(
    buildAssetReferenceManifest(assets.filter((asset) => (frontendPackage.assetIds ?? []).includes(asset.id)))
  );
  for (const asset of assets.filter((item) => (frontendPackage.assetIds ?? []).includes(item.id))) {
    const name = safeName(asset.name || asset.id);
    files[`${base}/assets/${name}.asset.json`] = jsonFile(serializeAssetForExternalFile(asset));
    if (asset.dataUrl) {
      const parsed = dataUrlToBytes(asset.dataUrl);
      files[`${base}/assets/${assetBinaryName(asset.name || asset.id, extensionFromMime(asset.mimeType ?? parsed.mimeType))}`] = parsed.bytes;
    }
  }
}

function addVersionSnapshotFile(files: ZipTree, snapshot: VersionSnapshot) {
  const base = `versions/${snapshotFolder(snapshot.targetType)}`;
  files[`${base}/${safeName(snapshot.label || snapshot.id)}.version.json`] = jsonFile(snapshot);
}

function jsonFile(value: unknown): Uint8Array {
  return strToU8(prettyJson(value));
}

function readOptionalJson(bytes: Uint8Array | undefined): unknown | undefined {
  if (!bytes) return undefined;
  return JSON.parse(strFromU8(bytes));
}

function dataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("资源 dataUrl 无法打包。");
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

function safeName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "cardforge";
}

function assetBinaryName(name: string, extension: string): string {
  const safe = safeName(name);
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
