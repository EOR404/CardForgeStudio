import type { CardProject } from "../core/schema/types";
import { normalizeImportedProject } from "../core/project/normalize";
import type { StorageAdapter, StorageSnapshot } from "./StorageAdapter";

const STORAGE_KEY = "cardforge.projects.v1";
const CURRENT_KEY = "cardforge.currentProjectId.v1";
const BACKUP_STORAGE_KEY = "cardforge.projects.v1.backup";
const BACKUP_CURRENT_KEY = "cardforge.currentProjectId.v1.backup";

export const BrowserStorage: StorageAdapter = {
  name: "browser-local-storage",
  load(): StorageSnapshot {
    if (typeof localStorage === "undefined") return { projects: [] };
    const primary = loadSnapshot(STORAGE_KEY, CURRENT_KEY);
    if (primary) return primary;
    const backup = loadSnapshot(BACKUP_STORAGE_KEY, BACKUP_CURRENT_KEY);
    if (backup) {
      writeSnapshot(STORAGE_KEY, CURRENT_KEY, backup.projects, backup.currentProjectId);
      return backup;
    }
    return { projects: [] };
  },
  save(projects: CardProject[], currentProjectId?: string) {
    if (typeof localStorage === "undefined") return;
    const previousProjects = localStorage.getItem(STORAGE_KEY);
    if (previousProjects !== null) localStorage.setItem(BACKUP_STORAGE_KEY, previousProjects);
    const previousCurrent = localStorage.getItem(CURRENT_KEY);
    if (previousCurrent !== null) localStorage.setItem(BACKUP_CURRENT_KEY, previousCurrent);
    writeSnapshot(STORAGE_KEY, CURRENT_KEY, projects, currentProjectId);
  },
  clear() {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(BACKUP_STORAGE_KEY);
    localStorage.removeItem(BACKUP_CURRENT_KEY);
  }
};

function loadSnapshot(projectsKey: string, currentKey: string): StorageSnapshot | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(projectsKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("项目存储必须是数组。");
    const projects = parsed.map((project) => normalizeImportedProject(project, "浏览器存储", { stripSecrets: false }));
    const storedCurrent = localStorage.getItem(currentKey) || undefined;
    const currentProjectId = storedCurrent && projects.some((project) => project.id === storedCurrent) ? storedCurrent : undefined;
    return { projects, currentProjectId };
  } catch {
    return undefined;
  }
}

function writeSnapshot(projectsKey: string, currentKey: string, projects: CardProject[], currentProjectId?: string) {
  localStorage.setItem(projectsKey, JSON.stringify(projects));
  if (currentProjectId) {
    localStorage.setItem(currentKey, currentProjectId);
  } else {
    localStorage.removeItem(currentKey);
  }
}
