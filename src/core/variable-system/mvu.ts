export type VariableDiff = {
  path: string;
  before: unknown;
  after: unknown;
  operation?: "set" | "remove";
};

export type ApplyVariableDiffResult = {
  state: Record<string, unknown>;
  diffs: VariableDiff[];
};

export function parseMvuSetCommands(text: string): VariableDiff[] {
  const diffs: VariableDiff[] = [];
  const regex = /_\.(?:set|assign)\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g;
  for (const match of text.matchAll(regex)) {
    diffs.push({
      path: match[1],
      before: undefined,
      after: parseLiteral(match[2].trim())
    });
  }
  return diffs;
}

export function parseVariableUpdateCommands(text: string, currentState: Record<string, unknown> = {}): VariableDiff[] {
  const mvuDiffs = parseMvuSetCommands(text);
  const patchDiffs = parseJsonPatchCommands(text);
  if (mvuDiffs.length || patchDiffs.length) return [...mvuDiffs, ...patchDiffs];
  const stateBlock = parseStateBlock(text);
  return stateBlock ? diffVariables(currentState, stateBlock) : [];
}

export function parseJsonPatchCommands(text: string): VariableDiff[] {
  const parsed = parseJsonCandidate(text);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((operation): VariableDiff | undefined => {
      if (!isObject(operation)) return undefined;
      const op = typeof operation.op === "string" ? operation.op.toLowerCase() : "";
      const path = typeof operation.path === "string" ? jsonPointerToPath(operation.path) : "";
      if (!path) return undefined;
      if (op === "remove") {
        return { path, before: undefined, after: undefined, operation: "remove" };
      }
      if (op === "add" || op === "replace") {
        return { path, before: undefined, after: operation.value, operation: "set" };
      }
      return undefined;
    })
    .filter((diff): diff is VariableDiff => Boolean(diff));
}

export function parseStateBlock(text: string): Record<string, unknown> | undefined {
  const json = parseJsonCandidate(text);
  if (isObject(json)) return json;
  const yamlText = extractFencedBlock(text, "ya?ml") ?? text;
  return parseSimpleYamlObject(yamlText);
}

export function previewVariableDiffs(state: Record<string, unknown>, commands: VariableDiff[]): VariableDiff[] {
  return commands.map((command) => ({
    ...command,
    before: getPathValue(state, command.path)
  }));
}

export function applyVariableDiffs(state: Record<string, unknown>, commands: VariableDiff[]): ApplyVariableDiffResult {
  const next = cloneJson(state);
  const diffs: VariableDiff[] = [];
  for (const command of commands) {
    const before = getPathValue(next, command.path);
    if (command.operation === "remove") {
      deletePathValue(next, command.path);
    } else {
      setPathValue(next, command.path, command.after);
    }
    diffs.push({ ...command, before });
  }
  return { state: next, diffs };
}

export function diffVariables(before: unknown, after: unknown, basePath = ""): VariableDiff[] {
  if (Object.is(before, after)) return [];
  if (!isObject(before) || !isObject(after)) return [{ path: basePath || "$", before, after }];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].flatMap((key) => diffVariables(before[key], after[key], basePath ? `${basePath}.${key}` : key));
}

export function getPathValue(state: unknown, path: string): unknown {
  return splitPath(path).reduce<unknown>((cursor, key) => {
    if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, state);
}

function setPathValue(state: Record<string, unknown>, path: string, value: unknown) {
  const parts = splitPath(path);
  if (!parts.length) return;
  let cursor: Record<string, unknown> = state;
  for (const part of parts.slice(0, -1)) {
    if (!isObject(cursor[part])) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function deletePathValue(state: Record<string, unknown>, path: string) {
  const parts = splitPath(path);
  if (!parts.length) return;
  let cursor: Record<string, unknown> = state;
  for (const part of parts.slice(0, -1)) {
    if (!isObject(cursor[part])) return;
    cursor = cursor[part] as Record<string, unknown>;
  }
  delete cursor[parts[parts.length - 1]];
}

function splitPath(path: string): string[] {
  return path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
}

function jsonPointerToPath(pointer: string): string {
  return pointer
    .replace(/^\//, "")
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~").trim())
    .filter(Boolean)
    .join(".");
}

function parseLiteral(value: string): unknown {
  try {
    return JSON.parse(value.replace(/'/g, '"'));
  } catch {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    if (value === "true") return true;
    if (value === "false") return false;
    return value.replace(/^['"]|['"]$/g, "");
  }
}

function parseJsonCandidate(text: string): unknown {
  const candidates = [
    text.trim(),
    extractFencedBlock(text, "json"),
    extractFirstJsonStructure(text)
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return undefined;
}

function extractFencedBlock(text: string, languagePattern: string): string | undefined {
  return text.match(new RegExp("```(?:" + languagePattern + ")?\\s*([\\s\\S]*?)```", "i"))?.[1]?.trim();
}

function extractFirstJsonStructure(text: string): string | undefined {
  const trimmed = text.trim();
  const firstObject = trimmed.indexOf("{");
  const firstArray = trimmed.indexOf("[");
  const starts = [firstObject, firstArray].filter((index) => index >= 0);
  if (!starts.length) return undefined;
  const start = Math.min(...starts);
  const open = trimmed[start];
  const close = open === "{" ? "}" : "]";
  const end = trimmed.lastIndexOf(close);
  return end > start ? trimmed.slice(start, end + 1) : undefined;
}

function parseSimpleYamlObject(text: string): Record<string, unknown> | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  "))
    .filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!lines.some((line) => /^[\s\w.-]+:\s*/.test(line))) return undefined;
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [{ indent: -1, value: root }];
  for (const line of lines) {
    const match = line.match(/^(\s*)([\w.-]+):\s*(.*)$/);
    if (!match) return undefined;
    const indent = match[1].length;
    const key = match[2];
    const rawValue = match[3].trim();
    while (stack.length > 1 && indent <= stack.at(-1)!.indent) stack.pop();
    const parent = stack.at(-1)!.value;
    if (!rawValue) {
      const child: Record<string, unknown> = {};
      parent[key] = child;
      stack.push({ indent, value: child });
    } else {
      parent[key] = parseLiteral(rawValue);
    }
  }
  return Object.keys(root).length ? root : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
