import { create } from "zustand";
import {
  createCharacterDraft,
  createCustomTestCaseDraft,
  createPresetDraft,
  createProjectDraft,
  createProviderDraft,
  createRegexRuleDraft,
  createWorldBookDraft,
  createWorldBookEntryDraft,
  now,
  uid
} from "../core/schema/defaults";
import type {
  AppPage,
  Asset,
  AIInvocationLog,
  AIProviderConfig,
  AIPreset,
  CardProject,
  CompatibilityTarget,
  CustomTestCase,
  ExportRecord,
  InternalCharacter,
  InternalWorldBook,
  ProjectTrustLevel,
  RegexRule,
  TestSession,
  VersionSnapshot,
  WorldBookEntry
} from "../core/schema/types";
import { BrowserStorage } from "../storage/BrowserStorage";
import { importCharacterJson, importWorldBookJson, type ImportCharacterResult } from "../core/importer/character";
import { createProjectDuplicate } from "../core/project/duplicate";
import { normalizeImportedProject } from "../core/project/normalize";
import { diffCharacters, diffWorldBooks } from "../core/version/diff";

const initial = BrowserStorage.load();
const HISTORY_LIMIT = 40;

type PendingAIResult = {
  label: string;
  target: "character" | "field" | "worldbook" | "quality";
  payload: unknown;
  raw: string;
};

type HistorySnapshot = {
  projects: CardProject[];
  currentProjectId?: string;
  activePage: AppPage;
  selectedCharacterId?: string;
  selectedWorldBookId?: string;
  selectedAssetId?: string;
  selectedProviderId?: string;
};

type AppState = {
  projects: CardProject[];
  currentProjectId?: string;
  activePage: AppPage;
  selectedCharacterId?: string;
  selectedWorldBookId?: string;
  selectedAssetId?: string;
  selectedProviderId?: string;
  pendingAIResult?: PendingAIResult;
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  createProject: (name: string, mode: "light" | "advanced", compatibilityTarget?: CompatibilityTarget, trustLevel?: ProjectTrustLevel) => void;
  importProject: (project: unknown) => void;
  openProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  undoLastChange: () => void;
  redoLastChange: () => void;
  setActivePage: (page: AppPage) => void;
  updateProject: (patch: Partial<CardProject>) => void;
  addCharacter: () => void;
  updateCharacter: (id: string, patch: Partial<InternalCharacter>) => void;
  deleteCharacter: (id: string) => void;
  duplicateCharacter: (id: string) => void;
  importCharacter: (data: unknown, fileName?: string) => void;
  importCharacterResult: (result: ImportCharacterResult) => void;
  addWorldBook: () => void;
  updateWorldBook: (id: string, patch: Partial<InternalWorldBook>) => void;
  deleteWorldBook: (id: string) => void;
  importWorldBook: (data: unknown, fileName?: string) => void;
  addWorldBookEntry: (worldBookId: string) => void;
  updateWorldBookEntry: (worldBookId: string, entryId: string, patch: Partial<WorldBookEntry>) => void;
  deleteWorldBookEntry: (worldBookId: string, entryId: string) => void;
  addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => void;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  deleteAsset: (id: string) => void;
  setCharacterAvatar: (characterId: string, assetId: string) => void;
  upsertProvider: (providerId: string | undefined, patch: Record<string, unknown>) => void;
  removeProvider: (providerId: string) => void;
  addPreset: (preset?: Partial<AIPreset>) => void;
  updatePreset: (presetId: string, patch: Partial<AIPreset>) => void;
  duplicatePreset: (presetId: string) => void;
  deletePreset: (presetId: string) => void;
  addAIInvocationLog: (log: AIInvocationLog) => void;
  addTestSession: (session: Omit<TestSession, "id" | "createdAt" | "updatedAt">) => void;
  addTestCase: (testCase?: Partial<CustomTestCase>) => void;
  updateTestCase: (testCaseId: string, patch: Partial<CustomTestCase>) => void;
  deleteTestCase: (testCaseId: string) => void;
  createCharacterSnapshot: (characterId: string, notes?: string) => void;
  restoreCharacterSnapshot: (snapshotId: string) => void;
  createWorldBookSnapshot: (worldBookId: string, notes?: string) => void;
  restoreWorldBookSnapshot: (snapshotId: string) => void;
  createProjectSnapshot: (notes?: string) => void;
  restoreProjectSnapshot: (snapshotId: string) => void;
  addExportRecord: (record: ExportRecord) => void;
  addRegexRule: () => void;
  updateRegexRule: (ruleId: string, patch: Partial<RegexRule>) => void;
  setPendingAIResult: (result?: PendingAIResult) => void;
};

export const useAppStore = create<AppState>((set, get) => ({
  projects: initial.projects.length ? initial.projects : [],
  currentProjectId: initial.currentProjectId,
  activePage: initial.currentProjectId ? "dashboard" : "projects",
  selectedCharacterId: initial.projects.find((project) => project.id === initial.currentProjectId)?.characters[0]?.id,
  selectedWorldBookId: initial.projects.find((project) => project.id === initial.currentProjectId)?.worldBooks[0]?.id,
  selectedProviderId: initial.projects.find((project) => project.id === initial.currentProjectId)?.aiProviders[0]?.id,
  undoStack: [],
  redoStack: [],
  createProject(name, mode, compatibilityTarget, trustLevel) {
    const project = createProjectDraft(name, mode, compatibilityTarget, trustLevel);
    commit(set, get, {
      projects: [...get().projects, project],
      currentProjectId: project.id,
      activePage: "dashboard",
      selectedCharacterId: project.characters[0]?.id,
      selectedWorldBookId: project.worldBooks[0]?.id,
      selectedProviderId: project.aiProviders[0]?.id
    });
  },
  importProject(project) {
    const nextProject = normalizeImportedProject(project, "导入项目");
    commit(set, get, {
      projects: [...get().projects, nextProject],
      currentProjectId: nextProject.id,
      activePage: "dashboard",
      selectedCharacterId: nextProject.characters[0]?.id,
      selectedWorldBookId: nextProject.worldBooks[0]?.id,
      selectedProviderId: nextProject.aiProviders[0]?.id
    });
  },
  openProject(id) {
    const project = get().projects.find((item) => item.id === id);
    commit(set, get, {
      currentProjectId: id,
      activePage: "dashboard",
      selectedCharacterId: project?.characters[0]?.id,
      selectedWorldBookId: project?.worldBooks[0]?.id,
      selectedProviderId: project?.aiProviders[0]?.id
    });
  },
  duplicateProject(id) {
    const source = get().projects.find((project) => project.id === id);
    if (!source) return;
    const project = createProjectDuplicate(source, get().projects.map((item) => item.name));
    commit(set, get, {
      projects: [...get().projects, project],
      currentProjectId: project.id,
      activePage: "dashboard",
      selectedCharacterId: project.characters[0]?.id,
      selectedWorldBookId: project.worldBooks[0]?.id,
      selectedProviderId: project.aiProviders[0]?.id
    });
  },
  deleteProject(id) {
    const projects = get().projects.filter((project) => project.id !== id);
    const nextCurrent = get().currentProjectId === id ? projects[0]?.id : get().currentProjectId;
    commit(set, get, {
      projects,
      currentProjectId: nextCurrent,
      activePage: nextCurrent ? get().activePage : "projects"
    });
  },
  undoLastChange() {
    const previous = get().undoStack.at(-1);
    if (!previous) return;
    const current = createHistorySnapshot(get());
    const undoStack = get().undoStack.slice(0, -1);
    const redoStack = [...get().redoStack, current].slice(-HISTORY_LIMIT);
    restoreHistorySnapshot(set, previous, { undoStack, redoStack });
  },
  redoLastChange() {
    const next = get().redoStack.at(-1);
    if (!next) return;
    const current = createHistorySnapshot(get());
    const redoStack = get().redoStack.slice(0, -1);
    const undoStack = [...get().undoStack, current].slice(-HISTORY_LIMIT);
    restoreHistorySnapshot(set, next, { undoStack, redoStack });
  },
  setActivePage(page) {
    set({ activePage: page });
  },
  updateProject(patch) {
    updateCurrentProject(set, get, (project) => ({ ...project, ...patch, updatedAt: now() }));
  },
  addCharacter() {
    const character = createCharacterDraft();
    updateCurrentProject(set, get, (project) => ({ ...project, characters: [...project.characters, character] }));
    set({ selectedCharacterId: character.id, activePage: "characters" });
  },
  updateCharacter(id, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      characters: project.characters.map((character) =>
        character.id === id ? { ...character, ...patch, updatedAt: now() } : character
      )
    }));
  },
  deleteCharacter(id) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      characters: project.characters.filter((character) => character.id !== id)
    }));
    const next = getCurrentProject(get())?.characters.find((character) => character.id !== id)?.id;
    set({ selectedCharacterId: next });
  },
  duplicateCharacter(id) {
    const original = getCurrentProject(get())?.characters.find((character) => character.id === id);
    if (!original) return;
    const copy: InternalCharacter = {
      ...structuredClone(original),
      id: uid("char"),
      name: `${original.name} 副本`,
      createdAt: now(),
      updatedAt: now()
    };
    updateCurrentProject(set, get, (project) => ({ ...project, characters: [...project.characters, copy] }));
    set({ selectedCharacterId: copy.id, activePage: "characters" });
  },
  importCharacter(data, fileName) {
    const result = importCharacterJson(data, fileName);
    get().importCharacterResult(result);
  },
  importCharacterResult(result) {
    updateCurrentProject(set, get, (project) => applyCharacterImport(project, result));
    set({
      selectedCharacterId: result.character.id,
      selectedWorldBookId: result.embeddedWorldBook?.id ?? get().selectedWorldBookId,
      activePage: "characters"
    });
  },
  addWorldBook() {
    const worldBook = createWorldBookDraft();
    updateCurrentProject(set, get, (project) => ({ ...project, worldBooks: [...project.worldBooks, worldBook] }));
    set({ selectedWorldBookId: worldBook.id, activePage: "worldbooks" });
  },
  updateWorldBook(id, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      worldBooks: project.worldBooks.map((worldBook) =>
        worldBook.id === id ? { ...worldBook, ...patch, updatedAt: now() } : worldBook
      )
    }));
  },
  deleteWorldBook(id) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      worldBooks: project.worldBooks.filter((worldBook) => worldBook.id !== id),
      characters: project.characters.map((character) => ({
        ...character,
        linkedWorldBooks: character.linkedWorldBooks.filter((worldBookId) => worldBookId !== id)
      }))
    }));
    set({ selectedWorldBookId: getCurrentProject(get())?.worldBooks.find((book) => book.id !== id)?.id });
  },
  importWorldBook(data, fileName) {
    const worldBook = importWorldBookJson(data, fileName || "导入世界书");
    updateCurrentProject(set, get, (project) => ({
      ...project,
      worldBooks: [...project.worldBooks, worldBook],
      versions: [
        createImportBackupSnapshot(
          project,
          `导入世界书 ${worldBook.name} 前自动备份`,
          fileName ? `导入来源：${fileName}` : "世界书导入前自动备份。"
        ),
        ...project.versions
      ]
    }));
    set({ selectedWorldBookId: worldBook.id, activePage: "worldbooks" });
  },
  addWorldBookEntry(worldBookId) {
    const entry = createWorldBookEntryDraft();
    updateWorldBookEntries(set, get, worldBookId, (entries) => [...entries, entry]);
  },
  updateWorldBookEntry(worldBookId, entryId, patch) {
    updateWorldBookEntries(set, get, worldBookId, (entries) =>
      entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry))
    );
  },
  deleteWorldBookEntry(worldBookId, entryId) {
    updateWorldBookEntries(set, get, worldBookId, (entries) => entries.filter((entry) => entry.id !== entryId));
  },
  addAsset(asset) {
    const nextAsset: Asset = {
      ...asset,
      purpose: asset.purpose ?? (asset.type === "image" ? "reference" : "other"),
      source: asset.source ?? "upload",
      id: uid("asset"),
      createdAt: now(),
      updatedAt: now()
    };
    updateCurrentProject(set, get, (project) => ({ ...project, assets: [...project.assets, nextAsset] }));
    set({ selectedAssetId: nextAsset.id, activePage: "assets" });
  },
  updateAsset(id, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      assets: project.assets.map((asset) => (asset.id === id ? { ...asset, ...patch, updatedAt: now() } : asset))
    }));
  },
  deleteAsset(id) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      assets: project.assets.filter((asset) => asset.id !== id),
      characters: project.characters.map((character) =>
        character.avatarAssetId === id ? { ...character, avatarAssetId: undefined } : character
      )
    }));
  },
  setCharacterAvatar(characterId, assetId) {
    get().updateCharacter(characterId, { avatarAssetId: assetId });
    updateCurrentProject(set, get, (project) => ({
      ...project,
      assets: project.assets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              purpose: asset.purpose === "reference" || asset.purpose === "other" || !asset.purpose ? "avatar" : asset.purpose,
              linkedCharacterIds: [...new Set([...asset.linkedCharacterIds, characterId])],
              updatedAt: now()
            }
          : asset
      )
    }));
  },
  upsertProvider(providerId, patch) {
    updateCurrentProject(set, get, (project) => {
      if (providerId) {
        return {
          ...project,
          aiProviders: project.aiProviders.map((provider) =>
            provider.id === providerId ? { ...provider, ...patch, updatedAt: now() } : provider
          )
        };
      }
      const draft = createProviderDraft();
      const provider: AIProviderConfig = {
        ...draft,
        id: uid("provider"),
        name: String(patch.name ?? draft.name),
        providerType: "openai-compatible",
        baseUrl: String(patch.baseUrl ?? draft.baseUrl),
        proxyUrl: String(patch.proxyUrl ?? draft.proxyUrl ?? ""),
        apiKey: String(patch.apiKey ?? draft.apiKey ?? ""),
        defaultModel: String(patch.defaultModel ?? draft.defaultModel),
        models: Array.isArray(patch.models) ? patch.models.map(String).filter(Boolean) : draft.models,
        headers: isRecord(patch.headers) ? Object.fromEntries(Object.entries(patch.headers).map(([key, value]) => [key, String(value ?? "")])) : draft.headers,
        defaultTaskTypes: Array.isArray(patch.defaultTaskTypes)
          ? patch.defaultTaskTypes.map(String).filter(Boolean)
          : draft.defaultTaskTypes,
        defaultParams: {
          temperature: Number(patch.temperature ?? 0.7),
          topP: 1,
          maxTokens: Number(patch.maxTokens ?? 1200),
          stream: false
        },
        capabilities: draft.capabilities,
        enabled: true,
        createdAt: now(),
        updatedAt: now()
      };
      set({ selectedProviderId: provider.id });
      return { ...project, aiProviders: [...project.aiProviders, provider] };
    });
  },
  removeProvider(providerId) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      aiProviders: project.aiProviders.filter((provider) => provider.id !== providerId)
    }));
  },
  addPreset(preset) {
    const nextPreset = createPresetDraft(preset);
    updateCurrentProject(set, get, (project) => ({ ...project, aiPresets: [...project.aiPresets, nextPreset] }));
  },
  updatePreset(presetId, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      aiPresets: project.aiPresets.map((preset) => (preset.id === presetId ? { ...preset, ...patch } : preset))
    }));
  },
  duplicatePreset(presetId) {
    const preset = getCurrentProject(get())?.aiPresets.find((item) => item.id === presetId);
    if (!preset) return;
    updateCurrentProject(set, get, (project) => ({
      ...project,
      aiPresets: [...project.aiPresets, { ...structuredClone(preset), id: uid("preset"), name: `${preset.name} 副本` }]
    }));
  },
  deletePreset(presetId) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      aiPresets: project.aiPresets.filter((preset) => preset.id !== presetId)
    }));
  },
  addAIInvocationLog(log) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      aiLogs: [log, ...(project.aiLogs ?? [])].slice(0, 200)
    }));
  },
  addTestSession(session) {
    const saved: TestSession = { ...session, id: uid("test"), createdAt: now(), updatedAt: now() };
    updateCurrentProject(set, get, (project) => ({ ...project, tests: [saved, ...project.tests] }));
  },
  addTestCase(testCase) {
    const saved = createCustomTestCaseDraft(testCase);
    updateCurrentProject(set, get, (project) => ({ ...project, testCases: [saved, ...(project.testCases ?? [])] }));
  },
  updateTestCase(testCaseId, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      testCases: (project.testCases ?? []).map((testCase) =>
        testCase.id === testCaseId ? { ...testCase, ...patch, updatedAt: now() } : testCase
      )
    }));
  },
  deleteTestCase(testCaseId) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      testCases: (project.testCases ?? []).filter((testCase) => testCase.id !== testCaseId)
    }));
  },
  createCharacterSnapshot(characterId, notes) {
    const character = getCurrentProject(get())?.characters.find((item) => item.id === characterId);
    if (!character) return;
    const previousSnapshot = getCurrentProject(get())?.versions.find(
      (item) => item.targetType === "character" && item.targetId === characterId
    );
    const previousCharacter = previousSnapshot?.data as InternalCharacter | undefined;
    const snapshot: VersionSnapshot = {
      id: uid("version"),
      label: `${character.name} ${new Date().toLocaleString()}`,
      notes,
      targetType: "character",
      targetId: characterId,
      data: structuredClone(character),
      diffSummary: previousCharacter ? diffCharacters(previousCharacter, character) : [],
      createdAt: now()
    };
    updateCurrentProject(set, get, (project) => ({ ...project, versions: [snapshot, ...project.versions] }));
  },
  restoreCharacterSnapshot(snapshotId) {
    const project = getCurrentProject(get());
    const snapshot = project?.versions.find((item) => item.id === snapshotId && item.targetType === "character");
    if (!snapshot) return;
    const character = snapshot.data as InternalCharacter;
    updateCurrentProject(set, get, (item) => ({
      ...item,
      characters: item.characters.map((current) =>
        current.id === snapshot.targetId ? { ...character, updatedAt: now() } : current
      )
    }));
  },
  createWorldBookSnapshot(worldBookId, notes) {
    const worldBook = getCurrentProject(get())?.worldBooks.find((item) => item.id === worldBookId);
    if (!worldBook) return;
    const previousSnapshot = getCurrentProject(get())?.versions.find(
      (item) => item.targetType === "worldbook" && item.targetId === worldBookId
    );
    const previousWorldBook = previousSnapshot?.data as InternalWorldBook | undefined;
    const snapshot: VersionSnapshot = {
      id: uid("version"),
      label: `${worldBook.name} ${new Date().toLocaleString()}`,
      notes,
      targetType: "worldbook",
      targetId: worldBookId,
      data: structuredClone(worldBook),
      diffSummary: previousWorldBook ? diffWorldBooks(previousWorldBook, worldBook) : [],
      createdAt: now()
    };
    updateCurrentProject(set, get, (project) => ({ ...project, versions: [snapshot, ...project.versions] }));
  },
  restoreWorldBookSnapshot(snapshotId) {
    const project = getCurrentProject(get());
    const snapshot = project?.versions.find((item) => item.id === snapshotId && item.targetType === "worldbook");
    if (!snapshot) return;
    const worldBook = snapshot.data as InternalWorldBook;
    updateCurrentProject(set, get, (item) => ({
      ...item,
      worldBooks: item.worldBooks.map((current) =>
        current.id === snapshot.targetId ? { ...worldBook, updatedAt: now() } : current
      )
    }));
    set({ selectedWorldBookId: snapshot.targetId });
  },
  createProjectSnapshot(notes) {
    const project = getCurrentProject(get());
    if (!project) return;
    const snapshot: VersionSnapshot = {
      id: uid("version"),
      label: `${project.name} ${new Date().toLocaleString()}`,
      notes,
      targetType: "project",
      targetId: project.id,
      data: structuredClone(project),
      diffSummary: [],
      createdAt: now()
    };
    updateCurrentProject(set, get, (current) => ({ ...current, versions: [snapshot, ...current.versions] }));
  },
  restoreProjectSnapshot(snapshotId) {
    const current = getCurrentProject(get());
    const snapshot = current?.versions.find((item) => item.id === snapshotId && item.targetType === "project");
    if (!current || !snapshot) return;
    const restored = snapshot.data as CardProject;
    const updated: CardProject = {
      ...structuredClone(restored),
      id: current.id,
      versions: current.versions,
      updatedAt: now()
    };
    const projects = get().projects.map((project) => (project.id === current.id ? updated : project));
    commit(set, get, {
      projects,
      selectedCharacterId: updated.characters[0]?.id,
      selectedWorldBookId: updated.worldBooks[0]?.id,
      selectedProviderId: updated.aiProviders[0]?.id,
      activePage: "dashboard"
    });
  },
  addExportRecord(record) {
    updateCurrentProject(set, get, (project) => ({ ...project, exports: [record, ...project.exports] }));
  },
  addRegexRule() {
    const rule = createRegexRuleDraft();
    updateCurrentProject(set, get, (project) => ({
      ...project,
      advanced: { ...project.advanced, regexRules: [...project.advanced.regexRules, rule] }
    }));
  },
  updateRegexRule(ruleId, patch) {
    updateCurrentProject(set, get, (project) => ({
      ...project,
      advanced: {
        ...project.advanced,
        regexRules: project.advanced.regexRules.map((rule) =>
          rule.id === ruleId ? { ...rule, ...patch, updatedAt: now() } : rule
        )
      }
    }));
  },
  setPendingAIResult(result) {
    set({ pendingAIResult: result });
  }
}));

export function getCurrentProject(state: Pick<AppState, "projects" | "currentProjectId">): CardProject | undefined {
  return state.projects.find((project) => project.id === state.currentProjectId);
}

function applyCharacterImport(project: CardProject, result: ImportCharacterResult): CardProject {
  const backup = createImportBackupSnapshot(
    project,
    `导入角色 ${result.character.name} 前自动备份`,
    result.character.originalSource?.fileName
      ? `导入来源：${result.character.originalSource.fileName} / ${result.character.originalSource.format}`
      : `导入来源：${result.report.source}`
  );
  return {
    ...project,
    characters: [
      ...project.characters,
      result.importedVariableState
        ? { ...result.character, linkedVariableSystem: project.advanced.variableSystem.id }
        : result.character
    ],
    worldBooks: result.embeddedWorldBook ? [...project.worldBooks, result.embeddedWorldBook] : project.worldBooks,
    advanced: {
      ...project.advanced,
      variableSystem: result.importedVariableState
        ? {
            ...project.advanced.variableSystem,
            state: deepMergeRecords(project.advanced.variableSystem.state, result.importedVariableState),
            history: [
              {
                id: uid("varsnap"),
                label: `导入 ${result.character.name} 前`,
                state: cloneRecord(project.advanced.variableSystem.state),
                createdAt: now()
              },
              ...project.advanced.variableSystem.history
            ].slice(0, 20),
            updatedAt: now()
          }
        : project.advanced.variableSystem,
      regexRules: result.importedRegexRules?.length ? [...result.importedRegexRules, ...project.advanced.regexRules] : project.advanced.regexRules,
      scripts: result.importedScripts?.length ? [...result.importedScripts, ...project.advanced.scripts] : project.advanced.scripts,
      frontendPackages: result.frontendPackage ? [result.frontendPackage, ...project.advanced.frontendPackages] : project.advanced.frontendPackages,
      compatibilityReports: [result.report, ...project.advanced.compatibilityReports]
    },
    versions: [backup, ...project.versions]
  };
}

function createImportBackupSnapshot(project: CardProject, label: string, notes: string): VersionSnapshot {
  return {
    id: uid("version"),
    label,
    notes,
    targetType: "project",
    targetId: project.id,
    data: structuredClone(project),
    diffSummary: [],
    createdAt: now()
  };
}

function commit(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  partial: Partial<AppState>,
  options: { recordHistory?: boolean } = {}
) {
  const current = get();
  const next = { ...current, ...partial };
  const historyPatch =
    partial.projects && options.recordHistory !== false
      ? {
          undoStack: [...current.undoStack, createHistorySnapshot(current)].slice(-HISTORY_LIMIT),
          redoStack: []
        }
      : {};
  set({ ...partial, ...historyPatch });
  BrowserStorage.save(partial.projects ?? next.projects, partial.currentProjectId ?? next.currentProjectId);
}

function updateCurrentProject(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  updater: (project: CardProject) => CardProject
) {
  const current = getCurrentProject(get());
  if (!current) return;
  const updated = { ...updater(current), updatedAt: now() };
  const projects = get().projects.map((project) => (project.id === current.id ? updated : project));
  commit(set, get, { projects });
}

function createHistorySnapshot(state: AppState): HistorySnapshot {
  return {
    projects: structuredClone(state.projects),
    currentProjectId: state.currentProjectId,
    activePage: state.activePage,
    selectedCharacterId: state.selectedCharacterId,
    selectedWorldBookId: state.selectedWorldBookId,
    selectedAssetId: state.selectedAssetId,
    selectedProviderId: state.selectedProviderId
  };
}

function restoreHistorySnapshot(
  set: (partial: Partial<AppState>) => void,
  snapshot: HistorySnapshot,
  stacks: Pick<AppState, "undoStack" | "redoStack">
) {
  set({
    ...snapshot,
    projects: structuredClone(snapshot.projects),
    pendingAIResult: undefined,
    ...stacks
  });
  BrowserStorage.save(snapshot.projects, snapshot.currentProjectId);
}

function deepMergeRecords(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = cloneRecord(base);
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(next[key]) && isRecord(value)) {
      next[key] = deepMergeRecords(next[key] as Record<string, unknown>, value);
    } else {
      next[key] = cloneUnknown(value);
    }
  }
  return next;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneUnknown(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function updateWorldBookEntries(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  worldBookId: string,
  updater: (entries: WorldBookEntry[]) => WorldBookEntry[]
) {
  updateCurrentProject(set, get, (project) => ({
    ...project,
    worldBooks: project.worldBooks.map((worldBook) =>
      worldBook.id === worldBookId ? { ...worldBook, entries: updater(worldBook.entries), updatedAt: now() } : worldBook
    )
  }));
}
