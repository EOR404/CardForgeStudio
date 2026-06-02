import type { FieldDiff, InternalCharacter, InternalWorldBook, VersionSnapshot } from "../schema/types";

const characterDiffFields: Array<{ key: keyof InternalCharacter; label: string }> = [
  { key: "name", label: "name" },
  { key: "description", label: "description" },
  { key: "personality", label: "personality" },
  { key: "scenario", label: "scenario" },
  { key: "firstMessage", label: "first_mes" },
  { key: "exampleMessages", label: "mes_example" },
  { key: "systemPrompt", label: "system_prompt" },
  { key: "postHistoryInstructions", label: "post_history_instructions" },
  { key: "creatorNotes", label: "creator_notes" },
  { key: "tags", label: "tags" },
  { key: "alternateGreetings", label: "alternate_greetings" },
  { key: "linkedWorldBooks", label: "linked_worldbooks" },
  { key: "avatarAssetId", label: "avatar" },
  { key: "extensions", label: "extensions" }
];

const worldBookDiffFields: Array<{ key: keyof InternalWorldBook; label: string }> = [
  { key: "name", label: "name" },
  { key: "description", label: "description" },
  { key: "scanDepth", label: "scan_depth" },
  { key: "tokenBudget", label: "token_budget" },
  { key: "recursiveScanning", label: "recursive_scanning" },
  { key: "entries", label: "entries" }
];

export function diffCharacters(before: InternalCharacter, after: InternalCharacter): FieldDiff[] {
  return characterDiffFields
    .map(({ key, label }) => {
      const previous = stringifyForDiff(before[key]);
      const next = stringifyForDiff(after[key]);
      return previous === next ? undefined : { field: label, before: previous, after: next };
    })
    .filter((item): item is FieldDiff => Boolean(item));
}

export function diffWorldBooks(before: InternalWorldBook, after: InternalWorldBook): FieldDiff[] {
  return worldBookDiffFields
    .map(({ key, label }) => {
      const previous = stringifyForDiff(before[key]);
      const next = stringifyForDiff(after[key]);
      return previous === next ? undefined : { field: label, before: previous, after: next };
    })
    .filter((item): item is FieldDiff => Boolean(item));
}

export function snapshotCharacterData(snapshot: VersionSnapshot): InternalCharacter | undefined {
  if (snapshot.targetType !== "character") return undefined;
  const data = snapshot.data;
  if (!data || typeof data !== "object") return undefined;
  return data as InternalCharacter;
}

export function snapshotWorldBookData(snapshot: VersionSnapshot): InternalWorldBook | undefined {
  if (snapshot.targetType !== "worldbook") return undefined;
  const data = snapshot.data;
  if (!data || typeof data !== "object") return undefined;
  return data as InternalWorldBook;
}

export function diffSnapshotAgainstCurrent(snapshot: VersionSnapshot, current: InternalCharacter): FieldDiff[] {
  const snapshotCharacter = snapshotCharacterData(snapshot);
  if (!snapshotCharacter) return [];
  return diffCharacters(snapshotCharacter, current);
}

export function diffWorldBookSnapshotAgainstCurrent(snapshot: VersionSnapshot, current: InternalWorldBook): FieldDiff[] {
  const snapshotWorldBook = snapshotWorldBookData(snapshot);
  if (!snapshotWorldBook) return [];
  return diffWorldBooks(snapshotWorldBook, current);
}

export function summarizeDiff(diff: FieldDiff[], limit = 4): string {
  if (!diff.length) return "无字段差异";
  const shown = diff.slice(0, limit).map((item) => item.field).join(", ");
  return diff.length > limit ? `${shown} 等 ${diff.length} 项` : shown;
}

function stringifyForDiff(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
