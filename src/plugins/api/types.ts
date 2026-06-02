import type { CardProject, InternalCharacter, InternalWorldBook, PluginManifest } from "../../core/schema/types";

export type PluginPermission =
  | "project.read"
  | "character.read"
  | "worldbook.read"
  | "asset.read"
  | "ui.panel"
  | "ui.command";

export type PluginPanelContribution = {
  id: string;
  title: string;
  location: "dashboard" | "leftPanel" | "rightPanel" | "advanced";
};

export type PluginCommandContribution = {
  id: string;
  title: string;
  category?: string;
};

export type PluginContributes = {
  panels?: PluginPanelContribution[];
  commands?: PluginCommandContribution[];
};

export type CardForgePluginApi = {
  readonly manifest: PluginManifest;
  getProject(): Readonly<CardProject>;
  listCharacters(): ReadonlyArray<InternalCharacter>;
  listWorldBooks(): ReadonlyArray<InternalWorldBook>;
  log(message: string): void;
};

export type CardForgePluginModule = {
  activate?(api: CardForgePluginApi): void | Promise<void>;
  deactivate?(): void | Promise<void>;
};
