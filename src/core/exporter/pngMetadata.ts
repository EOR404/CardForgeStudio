import { unzlibSync, zlibSync } from "fflate";
import { prettyJson, toV2Character } from "./character";
import type { InternalCharacter, InternalWorldBook } from "../schema/types";
import { importCharacterJson } from "../importer/character";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
type PngMetadataChunkType = "tEXt" | "iTXt" | "zTXt";

export async function embedV2MetadataInPngDataUrl(
  imageDataUrl: string,
  character: InternalCharacter,
  worldBook?: InternalWorldBook,
  options: { chunkType?: PngMetadataChunkType } = {}
): Promise<string> {
  const bytes = dataUrlToBytes(imageDataUrl);
  assertPng(bytes);
  const v2 = prettyJson(toV2Character(character, worldBook));
  const encoded = encodeBase64Utf8(v2);
  const textChunk = createMetadataChunk(options.chunkType ?? "tEXt", "chara", encoded);
  const chunks = splitPngChunks(bytes);
  const output: Uint8Array[] = [bytes.slice(0, 8)];
  for (const chunk of chunks) {
    if (chunk.type === "IEND") output.push(textChunk);
    output.push(chunk.full);
  }
  return bytesToDataUrl(concatBytes(...output), "image/png");
}

export function extractCharacterFromPngDataUrl(imageDataUrl: string, fileName = "V2 PNG metadata") {
  const bytes = dataUrlToBytes(imageDataUrl);
  assertPng(bytes);
  for (const chunk of splitPngChunks(bytes)) {
    const payload = readCharacterMetadataPayload(chunk);
    if (!payload) continue;
    const json = parseCharacterMetadataPayload(payload);
    const result = importCharacterJson(json, fileName);
    const importedAt = result.character.originalSource?.importedAt ?? Date.now();
    result.character.originalSource = {
      format: "v2_png",
      fileName,
      raw: json,
      importedAt
    };
    result.report.source = "V2 PNG";
    result.report.detected.format = "V2 PNG";
    result.report.notes.unshift(`已从 PNG ${chunk.type} / chara metadata 读取角色卡。`);
    result.character.compatibilityReports = [result.report];
    return result;
  }
  throw new Error("未在 PNG tEXt / iTXt / zTXt 中找到 chara / Chara metadata。");
}

function assertPng(bytes: Uint8Array) {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error("所选图片不是 PNG 文件。");
  }
}

type PngChunk = {
  type: string;
  data: Uint8Array;
  full: Uint8Array;
};

function splitPngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = readU32(bytes, offset);
    const type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const fullEnd = dataEnd + 4;
    chunks.push({
      type,
      data: bytes.slice(dataStart, dataEnd),
      full: bytes.slice(offset, fullEnd)
    });
    offset = fullEnd;
    if (type === "IEND") break;
  }
  return chunks;
}

function createMetadataChunk(type: PngMetadataChunkType, keyword: string, value: string): Uint8Array {
  if (type === "tEXt") return createChunk(type, concatBytes(latin1Bytes(keyword), new Uint8Array([0]), latin1Bytes(value)));
  if (type === "zTXt") {
    return createChunk(type, concatBytes(latin1Bytes(keyword), new Uint8Array([0, 0]), zlibSync(textBytes(value))));
  }
  return createChunk(
    type,
    concatBytes(
      latin1Bytes(keyword),
      new Uint8Array([0, 0, 0, 0, 0]),
      textBytes(value)
    )
  );
}

function readCharacterMetadataPayload(chunk: PngChunk): string | undefined {
  if (chunk.type === "tEXt") return readTextPayload(chunk.data);
  if (chunk.type === "zTXt") return readCompressedTextPayload(chunk.data);
  if (chunk.type === "iTXt") return readInternationalTextPayload(chunk.data);
  return undefined;
}

function readTextPayload(data: Uint8Array): string | undefined {
  const nul = data.indexOf(0);
  if (nul < 0) return undefined;
  const keyword = decodeLatin1(data.slice(0, nul));
  if (!isCharacterKeyword(keyword)) return undefined;
  return decodeLatin1(data.slice(nul + 1));
}

function readCompressedTextPayload(data: Uint8Array): string | undefined {
  const nul = data.indexOf(0);
  if (nul < 0 || data[nul + 1] !== 0) return undefined;
  const keyword = decodeLatin1(data.slice(0, nul));
  if (!isCharacterKeyword(keyword)) return undefined;
  try {
    return utf8Decode(unzlibSync(data.slice(nul + 2)));
  } catch {
    return undefined;
  }
}

function readInternationalTextPayload(data: Uint8Array): string | undefined {
  const keywordEnd = data.indexOf(0);
  if (keywordEnd < 0 || keywordEnd + 2 >= data.length) return undefined;
  const keyword = decodeLatin1(data.slice(0, keywordEnd));
  if (!isCharacterKeyword(keyword)) return undefined;
  const compressionFlag = data[keywordEnd + 1];
  const compressionMethod = data[keywordEnd + 2];
  if (compressionFlag !== 0 && compressionFlag !== 1) return undefined;
  if (compressionFlag === 1 && compressionMethod !== 0) return undefined;
  let cursor = keywordEnd + 3;
  const languageEnd = data.indexOf(0, cursor);
  if (languageEnd < 0) return undefined;
  cursor = languageEnd + 1;
  const translatedEnd = data.indexOf(0, cursor);
  if (translatedEnd < 0) return undefined;
  const payload = data.slice(translatedEnd + 1);
  try {
    return compressionFlag === 1 ? utf8Decode(unzlibSync(payload)) : utf8Decode(payload);
  } catch {
    return undefined;
  }
}

function parseCharacterMetadataPayload(payload: string): unknown {
  const trimmed = payload.trim();
  const candidates = [decodeBase64Utf8(trimmed), trimmed].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("PNG chara metadata 不是有效 JSON 或 base64 JSON。");
}

function isCharacterKeyword(keyword: string): boolean {
  return keyword === "chara" || keyword === "Chara";
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = textBytes(type);
  const length = new Uint8Array(4);
  writeU32(length, 0, data.length);
  const crcInput = concatBytes(typeBytes, data);
  const crc = new Uint8Array(4);
  writeU32(crc, 0, crc32(crcInput));
  return concatBytes(length, typeBytes, data, crc);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function latin1Bytes(text: string): Uint8Array {
  return new Uint8Array([...text].map((char) => char.charCodeAt(0) & 255));
}

function decodeLatin1(bytes: Uint8Array): string {
  return [...bytes].map((byte) => String.fromCharCode(byte)).join("");
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const [, meta, body] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) ?? [];
  if (!meta || !body) throw new Error("图片数据不是有效 data URL。");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function encodeBase64Utf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64Utf8(base64: string): string | undefined {
  try {
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return undefined;
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
