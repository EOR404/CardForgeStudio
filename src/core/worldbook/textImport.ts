import { createWorldBookEntryDraft } from "../schema/defaults";
import type { WorldBookEntry } from "../schema/types";
import { classifyWorldBookEntry } from "./classify";

type TextChunk = {
  title?: string;
  content: string;
};

export function extractWorldBookEntriesFromText(
  sourceText: string,
  options: { sourceName?: string; maxEntries?: number } = {}
): WorldBookEntry[] {
  const chunks = splitWorldBookText(sourceText).slice(0, options.maxEntries ?? 24);
  return chunks.map((chunk, index) => {
    const title = chunk.title || summarizeTitle(chunk.content, index);
    const entry = createWorldBookEntryDraft({
      name: title,
      comment: title,
      keys: deriveKeys(title, chunk.content),
      content: chunk.content,
      insertionOrder: (index + 1) * 10,
      extensions: {
        cardforge: {
          source: "local-text-import",
          sourceName: options.sourceName,
          extraction: "deterministic"
        }
      }
    });
    entry.category = classifyWorldBookEntry(entry);
    return entry;
  });
}

export function splitWorldBookText(sourceText: string): TextChunk[] {
  const text = normalizeText(sourceText);
  if (!text) return [];
  const headingChunks = splitMarkdownSections(text);
  const chunks = headingChunks.length > 1 ? headingChunks : splitParagraphs(text);
  return chunks
    .flatMap((chunk) => splitOversizedChunk(chunk))
    .map((chunk) => ({ ...chunk, content: chunk.content.trim() }))
    .filter((chunk) => chunk.content.length >= 8);
}

function splitMarkdownSections(text: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  let title: string | undefined;
  let lines: string[] = [];

  for (const line of text.split("\n")) {
    const heading = parseHeading(line);
    if (heading) {
      pushChunk(chunks, title, lines.join("\n"));
      title = heading;
      lines = [];
      continue;
    }
    lines.push(line);
  }
  pushChunk(chunks, title, lines.join("\n"));
  return chunks;
}

function splitParagraphs(text: string): TextChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) {
    return paragraphs.map((paragraph) => ({ title: parseInlineTitle(paragraph), content: stripInlineTitle(paragraph) }));
  }
  return splitSentences(text).map((content) => ({ title: parseInlineTitle(content), content: stripInlineTitle(content) }));
}

function splitOversizedChunk(chunk: TextChunk): TextChunk[] {
  if (chunk.content.length <= 900) return [chunk];
  return splitSentences(chunk.content, 520).map((content, index) => ({
    title: index === 0 ? chunk.title : `${chunk.title || "设定片段"} ${index + 1}`,
    content
  }));
}

function splitSentences(text: string, targetLength = 420): string[] {
  const sentences = text
    .split(/(?<=[。！？!?；;])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (!sentences.length) return [text.trim()].filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > targetLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current}${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function deriveKeys(title: string, content: string): string[] {
  const candidates = [
    title,
    ...matchAllTerms(title, /[《「『【\[]([^》」』】\]]{2,16})[》」』】\]]/g),
    ...matchAllTerms(content, /[《「『【\[]([^》」』】\]]{2,16})[》」』】\]]/g),
    ...matchAllTerms(content, /([\u4e00-\u9fffA-Za-z0-9_]{2,16})(?:是|为|会|被|能|不能|可以|属于|位于|拥有|负责|需要|必须|每日|通常)/g),
    ...matchAllTerms(content, /(?:名为|称为|被称作|叫作)([\u4e00-\u9fffA-Za-z0-9_]{2,16})/g)
  ];
  return uniqueStrings(candidates.map(cleanKey).filter((key) => key.length >= 2)).slice(0, 5);
}

function parseHeading(line: string): string | undefined {
  const markdown = line.match(/^#{1,6}\s+(.+)$/)?.[1];
  if (markdown) return cleanTitle(markdown);
  const bracket = line.match(/^【(.{2,40})】\s*$/)?.[1] ?? line.match(/^\[(.{2,40})]\s*$/)?.[1];
  if (bracket) return cleanTitle(bracket);
  return undefined;
}

function parseInlineTitle(text: string): string | undefined {
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const colon = firstLine.match(/^(.{2,30})[：:]\s*(.+)$/);
  if (colon) return cleanTitle(colon[1]);
  return undefined;
}

function stripInlineTitle(text: string): string {
  return text.replace(/^(.{2,30})[：:]\s*/, "").trim();
}

function summarizeTitle(content: string, index: number): string {
  const firstSentence = content.split(/[。！？!?；;\n]/)[0]?.trim() ?? "";
  const title = cleanTitle(firstSentence).slice(0, 24);
  return title || `设定片段 ${index + 1}`;
}

function cleanTitle(value: string): string {
  return value.replace(/^[-*\s]+/, "").replace(/\s+/g, " ").trim();
}

function cleanKey(value: string): string {
  return cleanTitle(value)
    .replace(/[，。！？、；;:：,.!?()[\]{}"'“”‘’<>《》]/g, "")
    .trim();
}

function matchAllTerms(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1]).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(value);
  }
  return unique;
}

function pushChunk(chunks: TextChunk[], title: string | undefined, content: string) {
  const trimmed = content.trim();
  if (trimmed) chunks.push({ title, content: trimmed });
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\uFEFF/g, "").trim();
}
