import type { CardProject } from "../core/schema/types";
import type { StorageAdapter, StorageSnapshot } from "./StorageAdapter";

export const TauriStorage: StorageAdapter = {
  name: "tauri-storage",
  load(): StorageSnapshot {
    return { projects: [] };
  },
  save() {
    throw new Error("TauriStorage 尚未启用：当前环境缺少 Rust/Cargo，已使用浏览器本地版兜底。");
  },
  canUseProjectDirectory() {
    return false;
  },
  async saveProjectDirectory(_project: CardProject) {
    throw new Error("Tauri 文件系统适配预留中。");
  },
  async openProjectDirectory() {
    throw new Error("Tauri 文件系统适配预留中。");
  }
};

