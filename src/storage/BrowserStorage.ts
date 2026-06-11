import type { Asset, CardProject } from "../core/schema/types";
import { normalizeAsset, normalizeImportedProject } from "../core/project/normalize";
import type { StorageAdapter, StorageSnapshot } from "./StorageAdapter";

const STORAGE_KEY = "cardforge.projects.v1";
const CURRENT_KEY = "cardforge.currentProjectId.v1";
const GLOBAL_ASSETS_KEY = "cardforge.globalAssets.v1";
const BACKUP_STORAGE_KEY = "cardforge.projects.v1.backup";
const BACKUP_CURRENT_KEY = "cardforge.currentProjectId.v1.backup";
const BACKUP_GLOBAL_ASSETS_KEY = "cardforge.globalAssets.v1.backup";

export const BrowserStorage: StorageAdapter = {
  name: "browser-local-storage",
  load(): StorageSnapshot {
    if (typeof localStorage === "undefined") return { projects: [] };
    const primary = loadSnapshot(STORAGE_KEY, CURRENT_KEY);
    if (primary) return primary;
    const backup = loadSnapshot(BACKUP_STORAGE_KEY, BACKUP_CURRENT_KEY);
    if (backup) {
      writeSnapshot(STORAGE_KEY, CURRENT_KEY, backup.projects, backup.currentProjectId, backup.globalAssets);
      return backup;
    }
    return { projects: [] };
  },
  save(projects: CardProject[], currentProjectId?: string, globalAssets?: Asset[]) {
    if (typeof localStorage === "undefined") return;
    const previousProjects = localStorage.getItem(STORAGE_KEY);
    if (previousProjects !== null) localStorage.setItem(BACKUP_STORAGE_KEY, previousProjects);
    const previousCurrent = localStorage.getItem(CURRENT_KEY);
    if (previousCurrent !== null) localStorage.setItem(BACKUP_CURRENT_KEY, previousCurrent);
    if (globalAssets) {
      const previousGlobalAssets = localStorage.getItem(GLOBAL_ASSETS_KEY);
      if (previousGlobalAssets !== null) localStorage.setItem(BACKUP_GLOBAL_ASSETS_KEY, previousGlobalAssets);
    }
    writeSnapshot(STORAGE_KEY, CURRENT_KEY, projects, currentProjectId, globalAssets);
  },
  clear() {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(GLOBAL_ASSETS_KEY);
    localStorage.removeItem(BACKUP_STORAGE_KEY);
    localStorage.removeItem(BACKUP_CURRENT_KEY);
    localStorage.removeItem(BACKUP_GLOBAL_ASSETS_KEY);
  }
};

function loadSnapshot(projectsKey: string, currentKey: string): StorageSnapshot | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(projectsKey) || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("项目存储必须是数组。");
    const projects = parsed.map((project) => normalizeImportedProject(project, "浏览器存储", { stripSecrets: false }));
    const storedCurrent = localStorage.getItem(currentKey) || undefined;
    const currentProjectId = storedCurrent && projects.some((project) => project.id === storedCurrent) ? storedCurrent : undefined;
    return { projects, currentProjectId, globalAssets: loadGlobalAssets() };
  } catch {
    return undefined;
  }
}

function loadGlobalAssets(): Asset[] {
  const primary = readAssetArray(GLOBAL_ASSETS_KEY);
  if (primary) return primary;
  const backup = readAssetArray(BACKUP_GLOBAL_ASSETS_KEY);
  if (backup) {
    localStorage.setItem(GLOBAL_ASSETS_KEY, JSON.stringify(backup));
    return backup;
  }
  return [];
}

function readAssetArray(key: string): Asset[] | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(parsed)) throw new Error("全局资源库必须是数组。");
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
      .map((asset) => normalizeAsset(asset));
  } catch {
    return undefined;
  }
}

function writeSnapshot(projectsKey: string, currentKey: string, projects: CardProject[], currentProjectId?: string, globalAssets?: Asset[]) {
  localStorage.setItem(projectsKey, JSON.stringify(projects));
  if (currentProjectId) {
    localStorage.setItem(currentKey, currentProjectId);
  } else {
    localStorage.removeItem(currentKey);
  }
  if (globalAssets) localStorage.setItem(GLOBAL_ASSETS_KEY, JSON.stringify(globalAssets));
}
