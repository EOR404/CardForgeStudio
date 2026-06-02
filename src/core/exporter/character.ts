import type {
  Asset,
  CardProject,
  ExportRecord,
  InternalCharacter,
  InternalWorldBook,
  WorldBookEntry
} from "../schema/types";
import { uid } from "../schema/defaults";
import { isSensitiveConfigKey, sanitizeSensitiveHeaders } from "../security/sensitive";

export type V1CharacterCard = {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
};

export type V2CharacterCard = {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    character_book: unknown | null;
    tags: string[];
    creator: string;
    character_version: string;
    extensions: Record<string, unknown>;
  };
};

export type V3CharacterCard = {
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: V2CharacterCard["data"] & {
    assets: Array<{
      id: string;
      name: string;
      type: Asset["type"];
      purpose?: Asset["purpose"];
      mimeType?: string;
      tags: string[];
      linkedCharacterIds: string[];
    }>;
    cardforge_project: {
      internal_format: "cardforge";
      exported_at: string;
      compatibility: "experimental-v3";
    };
  };
};

export function toV1Character(character: InternalCharacter): V1CharacterCard {
  return {
    name: character.name,
    description: character.description,
    personality: character.personality ?? "",
    scenario: character.scenario ?? "",
    first_mes: character.firstMessage,
    mes_example: character.exampleMessages ?? ""
  };
}

export function getV1LossWarnings(character: InternalCharacter): string[] {
  const warnings: string[] = [];
  if (character.alternateGreetings.length) warnings.push("alternate_greetings 会丢失");
  if (character.characterBookId || character.linkedWorldBooks.length) warnings.push("character_book / linked worldbooks 会丢失");
  if (character.systemPrompt) warnings.push("system_prompt 会丢失");
  if (character.postHistoryInstructions) warnings.push("post_history_instructions 会丢失");
  if (character.tags.length) warnings.push("tags 会丢失");
  if (character.creator) warnings.push("creator 会丢失");
  if (Object.keys(character.extensions).length) warnings.push("extensions 会丢失");
  if (character.linkedScripts.length || character.linkedRegexRules.length || character.frontendPackageId) {
    warnings.push("脚本、正则、变量和前端卡数据不会进入 V1");
  }
  return warnings;
}

export function toV2Character(character: InternalCharacter, worldBook?: InternalWorldBook): V2CharacterCard {
  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: character.name,
      description: character.description,
      personality: character.personality ?? "",
      scenario: character.scenario ?? "",
      first_mes: character.firstMessage,
      mes_example: character.exampleMessages ?? "",
      creator_notes: character.creatorNotes ?? "",
      system_prompt: character.systemPrompt ?? "",
      post_history_instructions: character.postHistoryInstructions ?? "",
      alternate_greetings: character.alternateGreetings,
      character_book: worldBook ? toSillyTavernWorldBook(worldBook) : null,
      tags: character.tags,
      creator: character.creator ?? "",
      character_version: character.version ?? "",
      extensions: {
        ...character.extensions,
        cardforge: {
          linkedWorldBooks: character.linkedWorldBooks,
          linkedScripts: character.linkedScripts,
          linkedRegexRules: character.linkedRegexRules,
          linkedVariableSystem: character.linkedVariableSystem,
          frontendPackageId: character.frontendPackageId
        }
      }
    }
  };
}

export function toV3Character(
  character: InternalCharacter,
  worldBook?: InternalWorldBook,
  assets: Asset[] = []
): V3CharacterCard {
  const v2 = toV2Character(character, worldBook);
  return {
    spec: "chara_card_v3",
    spec_version: "3.0",
    data: {
      ...v2.data,
      assets: assets
        .filter((asset) => asset.linkedCharacterIds.includes(character.id) || asset.id === character.avatarAssetId)
        .map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          purpose: asset.purpose,
          mimeType: asset.mimeType,
          tags: asset.tags,
          linkedCharacterIds: asset.linkedCharacterIds
        })),
      cardforge_project: {
        internal_format: "cardforge",
        exported_at: new Date().toISOString(),
        compatibility: "experimental-v3"
      },
      extensions: {
        ...v2.data.extensions,
        cardforge_v3_note:
          "Experimental V3 export: CardForge preserves advanced data in extensions and project packages; verify target-platform compatibility before publishing."
      }
    }
  };
}

export function toSillyTavernWorldBook(worldBook: InternalWorldBook): unknown {
  return {
    name: worldBook.name,
    description: worldBook.description ?? "",
    scan_depth: worldBook.scanDepth ?? 2,
    token_budget: worldBook.tokenBudget ?? 1200,
    recursive_scanning: Boolean(worldBook.recursiveScanning),
    entries: Object.fromEntries(worldBook.entries.map((entry, index) => [String(index), toSillyEntry(entry)]))
  };
}

export function toWorldBookJson(worldBook: InternalWorldBook): unknown {
  return {
    name: worldBook.name,
    description: worldBook.description ?? "",
    scan_depth: worldBook.scanDepth ?? 2,
    token_budget: worldBook.tokenBudget ?? 1200,
    recursive_scanning: Boolean(worldBook.recursiveScanning),
    entries: worldBook.entries.map(toSillyEntry)
  };
}

function toSillyEntry(entry: WorldBookEntry): unknown {
  const extensions = {
    ...(entry.extensions ?? {}),
    cardforge: {
      ...((entry.extensions?.cardforge && typeof entry.extensions.cardforge === "object" ? entry.extensions.cardforge : {}) as Record<string, unknown>),
      category: entry.category ?? "other"
    }
  };
  return {
    uid: entry.id,
    key: entry.keys,
    keysecondary: entry.secondaryKeys,
    comment: entry.comment || entry.name || "",
    content: entry.content,
    disable: !entry.enabled,
    constant: entry.constant,
    selective: entry.selective,
    case_sensitive: entry.caseSensitive,
    order: entry.insertionOrder,
    priority: entry.priority,
    position: entry.position,
    depth: entry.depth,
    probability: entry.probability ?? 100,
    extensions
  };
}

export function sanitizeProjectForExport(project: CardProject): CardProject {
  return {
    ...project,
    aiProviders: project.aiProviders.map((provider) => ({
      ...provider,
      apiKey: "",
      headers: sanitizeSensitiveHeaders(provider.headers)
    })),
    versions: project.versions.map((snapshot) => ({
      ...snapshot,
      data: stripSensitiveValues(snapshot.data)
    }))
  };
}

export function createExportRecord(
  partial: Omit<ExportRecord, "id" | "createdAt">
): ExportRecord {
  return {
    ...partial,
    id: uid("export"),
    createdAt: Date.now()
  };
}

export function prettyJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function stripSensitiveValues(value: unknown, depth = 0): unknown {
  if (depth > 16) return value;
  if (Array.isArray(value)) return value.map((item) => stripSensitiveValues(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveConfigKey(key) ? "" : stripSensitiveValues(nestedValue, depth + 1)
    ])
  );
}
