import type { CardProject } from "../core/schema/types";

export type StorageSnapshot = {
  projects: CardProject[];
  currentProjectId?: string;
};

export type ProjectDirectoryEntry = {
  path: string;
  bytes: Uint8Array;
};

export type ProjectDirectoryResult = {
  projectName: string;
  fileCount: number;
};

export type StorageAdapter = {
  name: string;
  load(): StorageSnapshot;
  save(projects: CardProject[], currentProjectId?: string): void;
  clear?(): void;
  canUseProjectDirectory?(): boolean;
  saveProjectDirectory?(project: CardProject): Promise<ProjectDirectoryResult>;
  openProjectDirectory?(): Promise<CardProject>;
};

