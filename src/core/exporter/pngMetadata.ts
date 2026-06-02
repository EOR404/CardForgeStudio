import { prettyJson, toV2Character } from "./character";
import type { InternalCharacter, InternalWorldBook } from "../schema/types";
import { importCharacterJson } from "../importer/character";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export async function embedV2MetadataInPngDataUrl(
  imageDataUrl: string,
  character: InternalCharacter,
  worldBook?: InternalWorldBook
): Promise<string> {
  const bytes = dataUrlToBytes(imageDataUrl);
  assertPng(bytes);
  const v2 = prettyJson(toV2Character(character, worldBook));
  const encoded = btoa(unescape(encodeURIComponent(v2)));
  const textChunk = createChunk("tEXt", concatBytes(textBytes("chara"), new Uint8Array([0]), textBytes(encoded)));
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
    if (chunk.type !== "tEXt") continue;
    const nul = chunk.data.indexOf(0);
    if (nul < 0) continue;
    const keyword = new TextDecoder().decode(chunk.data.slice(0, nul));
    if (keyword !== "chara" && keyword !== "Chara") continue;
    const base64 = new TextDecoder().decode(chunk.data.slice(nul + 1));
    const json = JSON.parse(decodeURIComponent(escape(atob(base64))));
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
    result.report.notes.unshift("已从 PNG chara / Chara metadata 读取角色卡。");
    result.character.compatibilityReports = [result.report];
    return result;
  }
  throw new Error("未在 PNG 中找到 chara / Chara metadata。");
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
