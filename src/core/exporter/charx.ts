import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { importCharacterJson, type ImportCharacterResult } from "../importer/character";
import { uid } from "../schema/defaults";
import type { Asset, InternalCharacter, InternalWorldBook } from "../schema/types";
import { prettyJson, toV2Character, toV3Character } from "./character";

const CHARX_FORMAT = "cardforge-charx-basic-v1";

type ZipTree = Record<string, Uint8Array>;

type CharxAssetManifestEntry = {
  originalId: string;
  path?: string;
  name: string;
  type: Asset["type"];
  purpose?: Asset["purpose"];
  mimeType?: string;
  tags: string[];
  isAvatar?: boolean;
};

export function exportCharacterCharx(input: {
  character: InternalCharacter;
  worldBook?: InternalWorldBook;
  assets?: Asset[];
}): Uint8Array {
  const includedAssets = (input.assets ?? []).filter((asset) => isCharacterAsset(asset, input.character));
  const assetEntries: CharxAssetManifestEntry[] = [];
  const files: ZipTree = {
    "manifest.json": jsonFile({
      format: CHARX_FORMAT,
      app: "CardForge Studio",
      characterName: input.character.name,
      exportedAt: new Date().toISOString(),
      cardPath: "card.json",
      v2BackupPath: "card.v2.json",
      assetManifestPath: "assets/manifest.json"
    }),
    "card.json": jsonFile(toV3Character(input.character, input.worldBook, includedAssets)),
    "card.v2.json": jsonFile(toV2Character(input.character, input.worldBook)),
    "README.txt": strToU8(
      [
        "CardForge Studio basic CHARX package",
        "card.json contains experimental Character Card V3 JSON.",
        "card.v2.json is included as a compatibility backup.",
        "assets/manifest.json describes bundled resources."
      ].join("\n")
    )
  };

  includedAssets.forEach((asset, index) => {
    const entry: CharxAssetManifestEntry = {
      originalId: asset.id,
      name: asset.name,
      type: asset.type,
      purpose: asset.purpose,
      mimeType: asset.mimeType,
      tags: asset.tags,
      isAvatar: asset.id === input.character.avatarAssetId
    };
    if (asset.dataUrl) {
      const parsed = dataUrlToBytes(asset.dataUrl);
      const extension = extensionFromMime(asset.mimeType ?? parsed.mimeType);
      entry.path = `assets/files/${String(index + 1).padStart(2, "0")}-${assetBinaryName(asset.name || asset.id, extension)}`;
      files[entry.path] = parsed.bytes;
    }
    assetEntries.push(entry);
  });
  files["assets/manifest.json"] = jsonFile(assetEntries);
  return zipSync(files, { level: 6 });
}

export function importCharacterCharx(bytes: Uint8Array, fileName = "CHARX package"): ImportCharacterResult {
  const files = unzipSync(bytes);
  const manifest = readOptionalJson(files["manifest.json"]);
  const { path: cardPath, json: cardJson } = findCharacterJson(files, manifest);
  const result = importCharacterJson(cardJson, fileName);
  const importedAt = Date.now();
  const importedAssets = importCharxAssets(files, result.character.id, result.character.avatarAssetId);
  const avatarAsset = importedAssets.find((asset) => asset.notes?.includes("CHARX avatar asset"));
  result.importedAssets = importedAssets;
  result.character.originalSource = {
    format: "charx",
    fileName,
    raw: {
      manifest,
      cardPath,
      card: cardJson,
      files: Object.keys(files)
    },
    importedAt
  };
  if (avatarAsset) result.character.avatarAssetId = avatarAsset.id;
  result.report.source = "CHARX";
  result.report.detected.format = "CHARX";
  result.report.level = result.report.level === "full" ? "partial" : result.report.level;
  result.report.notes.unshift(
    importedAssets.length
      ? `已从 CHARX 资源包读取角色卡，并导入 ${importedAssets.length} 个关联资源。`
      : "已从 CHARX 资源包读取角色卡；未发现可导入的资源文件。"
  );
  result.character.compatibilityReports = [result.report];
  return result;
}

function findCharacterJson(files: ZipTree, manifest: unknown): { path: string; json: unknown } {
  const manifestRecord = isRecord(manifest) ? manifest : {};
  const cardPath = typeof manifestRecord.cardPath === "string" ? manifestRecord.cardPath : undefined;
  const candidates = [
    cardPath,
    "card.json",
    "character.json",
    "chara_card_v3.json",
    "chara_card_v2.json",
    "character.v3.json",
    "character.v2.json",
    "cardforge/card.json",
    "cardforge/character.json",
    ...Object.keys(files).filter((path) => path.toLowerCase().endsWith(".json"))
  ].filter((path): path is string => Boolean(path));
  for (const path of [...new Set(candidates)]) {
    const json = readOptionalJson(files[path]);
    if (isCharacterJson(json)) return { path, json };
  }
  throw new Error("CHARX 包中未找到可识别的 Character Card V2/V3 JSON。");
}

function importCharxAssets(files: ZipTree, characterId: string, avatarAssetId?: string): Asset[] {
  const manifest = readOptionalJson(files["assets/manifest.json"]);
  const entries = Array.isArray(manifest) ? manifest.filter(isRecord) : [];
  if (entries.length) {
    return entries
      .map((entry) => assetFromManifestEntry(files, entry, characterId, avatarAssetId))
      .filter((asset): asset is Asset => Boolean(asset));
  }
  return Object.entries(files)
    .filter(([path]) => path.startsWith("assets/") && isImagePath(path))
    .map(([path, bytes]) => assetFromBytes(path.split("/").at(-1) ?? path, bytes, mimeFromPath(path), characterId));
}

function assetFromManifestEntry(
  files: ZipTree,
  entry: Record<string, unknown>,
  characterId: string,
  avatarAssetId?: string
): Asset | undefined {
  const path = typeof entry.path === "string" ? entry.path : undefined;
  if (!path || !files[path]) return undefined;
  const name = stringValue(entry.name) ?? path.split("/").at(-1) ?? "charx-asset";
  const mimeType = stringValue(entry.mimeType) ?? mimeFromPath(path);
  const asset = assetFromBytes(name, files[path], mimeType, characterId);
  asset.type = asset.mimeType?.startsWith("image/") ? "image" : normalizeAssetType(entry.type);
  asset.purpose = normalizeAssetPurpose(entry.purpose) ?? (asset.type === "image" ? "reference" : "other");
  asset.tags = [
    "CHARX",
    ...stringArray(entry.tags),
    ...(asset.purpose ? [assetPurposeLabel(asset.purpose)] : [])
  ];
  asset.notes = [
    `CHARX original asset: ${stringValue(entry.originalId) ?? name}`,
    entry.isAvatar || entry.originalId === avatarAssetId ? "CHARX avatar asset" : ""
  ].filter(Boolean).join("\n");
  return asset;
}

function assetFromBytes(name: string, bytes: Uint8Array, mimeType: string, characterId: string): Asset {
  const dataUrl = bytesToDataUrl(bytes, mimeType);
  const isImage = mimeType.startsWith("image/");
  const timestamp = Date.now();
  return {
    id: uid("asset"),
    name,
    type: isImage ? "image" : "other",
    purpose: isImage ? "reference" : "other",
    source: "imported",
    mimeType,
    dataUrl,
    thumbnailUrl: isImage ? dataUrl : undefined,
    tags: ["CHARX"],
    linkedCharacterIds: [characterId],
    linkedWorldBookIds: [],
    notes: "Imported from CHARX package.",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function isCharacterAsset(asset: Asset, character: InternalCharacter): boolean {
  return asset.id === character.avatarAssetId || asset.linkedCharacterIds.includes(character.id);
}

function isCharacterJson(value: unknown): boolean {
  return isRecord(value) && (value.spec === "chara_card_v2" || value.spec === "chara_card_v3");
}

function jsonFile(value: unknown): Uint8Array {
  return strToU8(prettyJson(value));
}

function readOptionalJson(bytes: Uint8Array | undefined): unknown | undefined {
  if (!bytes) return undefined;
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    return undefined;
  }
}

function dataUrlToBytes(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error("CHARX 资源 dataUrl 无法打包。");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1], bytes };
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
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

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return "application/octet-stream";
}

function isImagePath(path: string): boolean {
  return mimeFromPath(path).startsWith("image/");
}

function assetBinaryName(name: string, extension: string): string {
  const safe = safeName(name);
  return safe.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? safe : `${safe}.${extension}`;
}

function safeName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "cardforge";
}

function normalizeAssetType(value: unknown): Asset["type"] {
  const types: Asset["type"][] = ["image", "text", "json", "character_card", "worldbook", "script", "other"];
  return types.includes(value as Asset["type"]) ? (value as Asset["type"]) : "other";
}

function normalizeAssetPurpose(value: unknown): Asset["purpose"] | undefined {
  const purposes: NonNullable<Asset["purpose"]>[] = [
    "avatar",
    "cover",
    "export-cover",
    "halfbody",
    "fullbody",
    "background",
    "expression",
    "map",
    "icon",
    "reference",
    "other"
  ];
  return purposes.includes(value as NonNullable<Asset["purpose"]>) ? (value as Asset["purpose"]) : undefined;
}

function assetPurposeLabel(purpose: NonNullable<Asset["purpose"]>): string {
  const labels: Record<NonNullable<Asset["purpose"]>, string> = {
    avatar: "头像",
    cover: "封面",
    "export-cover": "导出封面",
    halfbody: "半身图",
    fullbody: "全身图",
    background: "背景",
    expression: "表情差分",
    map: "地图",
    icon: "图标",
    reference: "参考图",
    other: "其他"
  };
  return labels[purpose];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
