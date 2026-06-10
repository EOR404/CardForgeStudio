import type { VariableUpdateLog } from "../schema/types";
import { parseVariableUpdateCommands, previewVariableDiffs, type VariableDiff } from "../variable-system/mvu";

export function buildVariableUpdateLogFromText(
  text: string,
  currentState: Record<string, unknown>,
  options: { source?: VariableUpdateLog["source"]; messageIndex?: number; createdAt?: number } = {}
): VariableUpdateLog | undefined {
  const commands = parseVariableUpdateCommands(text, currentState);
  if (!commands.length) return undefined;
  return {
    source: options.source ?? "assistant",
    messageIndex: options.messageIndex,
    diffs: previewVariableDiffs(currentState, commands).map(toSerializableDiff),
    applied: false,
    createdAt: options.createdAt ?? Date.now()
  };
}

function toSerializableDiff(diff: VariableDiff): VariableUpdateLog["diffs"][number] {
  return {
    path: diff.path,
    before: diff.before,
    after: diff.after,
    operation: diff.operation
  };
}
