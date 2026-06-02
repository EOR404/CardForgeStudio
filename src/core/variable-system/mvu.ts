export type VariableDiff = {
  path: string;
  before: unknown;
  after: unknown;
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
    setPathValue(next, command.path, command.after);
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

function splitPath(path: string): string[] {
  return path
    .replace(/\[(\w+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
