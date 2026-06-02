import { createWorldBookEntryDraft } from "../schema/defaults";
import type { WorldBookEntry } from "../schema/types";
import { classifyWorldBookEntry, normalizeWorldBookCategory } from "./classify";

export function normalizeWorldBookEntryCandidate(input: unknown, index = 0): WorldBookEntry {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const entry = createWorldBookEntryDraft({
    name: stringField(raw.name ?? raw.comment, `AI 条目 ${index + 1}`),
    comment: stringField(raw.comment ?? raw.name, `AI 条目 ${index + 1}`),
    keys: stringList(raw.keys ?? raw.key),
    secondaryKeys: stringList(raw.secondaryKeys ?? raw.secondary_keys ?? raw.keysecondary),
    content: stringField(raw.content),
    constant: Boolean(raw.constant),
    selective: Boolean(raw.selective),
    insertionOrder: numberField(raw.insertionOrder ?? raw.insertion_order ?? raw.order, (index + 1) * 10),
    priority: numberField(raw.priority, 0),
    category: normalizeWorldBookCategory(raw.category),
    extensions: typeof raw.extensions === "object" && raw.extensions ? (raw.extensions as Record<string, unknown>) : {}
  });
  if (entry.category === "other") entry.category = classifyWorldBookEntry(entry);
  return entry;
}

function stringField(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function numberField(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
