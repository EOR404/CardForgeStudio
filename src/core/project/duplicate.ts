import type { CardProject } from "../schema/types";
import { now, uid } from "../schema/defaults";

export function createProjectDuplicate(project: CardProject, existingNames: string[] = []): CardProject {
  const copy = JSON.parse(JSON.stringify(project)) as CardProject;
  const time = now();
  return {
    ...copy,
    id: uid("project"),
    name: nextCopyName(project.name, existingNames),
    createdAt: time,
    updatedAt: time
  };
}

function nextCopyName(name: string, existingNames: string[]): string {
  const names = new Set(existingNames);
  const first = `${name} 副本`;
  if (!names.has(first)) return first;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${first} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${first} ${Date.now().toString(36)}`;
}
