import { strict as assert } from "node:assert";
import { unzipSync } from "fflate";
import {
  createCharacterDraft,
  createCustomTestCaseDraft,
  createFrontendPackageDraft,
  createPluginDraft,
  createPresetDraft,
  createProjectDraft,
  createProviderDraft,
  createRegexRuleDraft,
  createScriptDraft,
  createWorldBookDraft,
  createWorldBookEntryDraft
} from "../src/core/schema/defaults";
import { aiProviderSchema } from "../src/core/schema/validators";
import { importCharacterJson, importWorldBookJson } from "../src/core/importer/character";
import { createExportRecord, getV1LossWarnings, toV1Character, toV2Character, toV3Character, toWorldBookJson } from "../src/core/exporter/character";
import { buildExportPreflightReport, formatExportReportMarkdown } from "../src/core/exporter/report";
import { embedV2MetadataInPngDataUrl, extractCharacterFromPngDataUrl } from "../src/core/exporter/pngMetadata";
import { analyzeWorldBookTrigger, triggerWorldBookEntries } from "../src/core/worldbook/trigger";
import { runRegexPipeline, runRegexRule } from "../src/core/regex/regex";
import { createProjectDuplicate } from "../src/core/project/duplicate";
import { exportProjectPackage, importProjectPackage } from "../src/core/project/package";
import { exampleProjects } from "../src/core/examples/exampleProjects";
import { buildProjectDirectoryEntries } from "../src/storage/BrowserFileSystemStorage";
import { buildPresetMessages, findTaskPreset, missingPresetVariables, renderPromptTemplate } from "../src/core/ai/presets";
import { summarizeAILogs } from "../src/core/ai/cost";
import { parseOpenAIStreamText } from "../src/core/ai/client";
import { createAIInvocationLog } from "../src/core/ai/logging";
import { buildFrontendSandboxPreview } from "../src/core/frontend/sandbox";
import { buildTestPrompt } from "../src/core/prompt-builder/buildPrompt";
import { diffCharacters, diffWorldBookSnapshotAgainstCurrent, diffWorldBooks, summarizeDiff } from "../src/core/version/diff";
import { searchProject } from "../src/core/search/search";
import { buildABComparisonReport } from "../src/core/tester/ab";
import { builtInTestCases, evaluateBuiltInTestCase } from "../src/core/tester/cases";
import { isPluginRunnableInCurrentVersion, normalizePluginManifest, pluginSafetyIssues } from "../src/core/plugin-runtime/manifest";
import { isScriptRunnableInCurrentVersion, scriptSafetyIssues } from "../src/core/script-runtime/safety";
import { applyVariableDiffs, diffVariables, getPathValue, parseMvuSetCommands, previewVariableDiffs } from "../src/core/variable-system/mvu";
import { categoryLabel, classifyWorldBookEntry } from "../src/core/worldbook/classify";
import { normalizeWorldBookEntryCandidate } from "../src/core/worldbook/normalize";
import { checkWorldBookQuality } from "../src/core/quality/checks";
import { sanitizeSensitiveHeaders, sensitiveHeaderKeys } from "../src/core/security/sensitive";
import { getCurrentProject, useAppStore } from "../src/stores/useAppStore";
import { BrowserStorage } from "../src/storage/BrowserStorage";
import type { Asset, TestSession } from "../src/core/schema/types";

const character = createCharacterDraft("莉娅");
character.description = "雪国边境的药师，熟悉月草。";
character.personality = "安静、敏锐、克制。";
character.scenario = "旅人来到雪国诊所。";
character.firstMessage = "门铃轻响，莉娅抬起眼。";
character.exampleMessages = "<START>\n{{char}}: 你需要哪种药？";
character.systemPrompt = "保持角色，不替 {{user}} 行动。";
character.tags = ["药师", "雪国"];

const defaultProject = createProjectDraft("默认项目自检", "light");
const defaultCharacter = defaultProject.characters[0];
const defaultWorldBook = defaultProject.worldBooks[0];
assert.ok(defaultCharacter.description.trim());
assert.ok(defaultCharacter.firstMessage.trim());
assert.ok(defaultCharacter.linkedWorldBooks.includes(defaultWorldBook.id));
const defaultProjectExportReport = buildExportPreflightReport({
  project: defaultProject,
  format: "v2_json",
  target: "sillytavern_v2",
  character: defaultCharacter,
  worldBook: defaultWorldBook
});
assert.equal(defaultProjectExportReport.summary.blockers, 0);

const localStorageMemory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => localStorageMemory.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageMemory.set(key, value),
    removeItem: (key: string) => localStorageMemory.delete(key),
    clear: () => localStorageMemory.clear()
  }
});
BrowserStorage.save([defaultProject], defaultProject.id);
assert.equal(BrowserStorage.load().currentProjectId, defaultProject.id);
BrowserStorage.save([], undefined);
assert.equal(BrowserStorage.load().currentProjectId, undefined);
const storageRecoveryProject = createProjectDraft("浏览器存储恢复自检", "light");
storageRecoveryProject.aiProviders[0].apiKey = "sk-local-storage-keep";
BrowserStorage.save([storageRecoveryProject], storageRecoveryProject.id);
BrowserStorage.save([{ ...storageRecoveryProject, name: "浏览器存储恢复自检 当前" }], storageRecoveryProject.id);
localStorageMemory.set("cardforge.projects.v1", "{bad json");
const recoveredStorage = BrowserStorage.load();
assert.equal(recoveredStorage.projects[0].name, "浏览器存储恢复自检");
assert.equal(recoveredStorage.projects[0].aiProviders[0].apiKey, "sk-local-storage-keep");
assert.equal(recoveredStorage.currentProjectId, storageRecoveryProject.id);
BrowserStorage.clear();
useAppStore.setState({
  projects: [],
  currentProjectId: undefined,
  activePage: "projects",
  undoStack: [],
  redoStack: []
});
useAppStore.getState().createProject("撤销重做自检", "light");
const undoProject = getCurrentProject(useAppStore.getState())!;
const undoCharacterId = undoProject.characters[0].id;
const undoOriginalName = undoProject.characters[0].name;
useAppStore.getState().updateCharacter(undoCharacterId, { name: "撤销重做后的角色名" });
assert.equal(getCurrentProject(useAppStore.getState())!.characters[0].name, "撤销重做后的角色名");
useAppStore.getState().undoLastChange();
assert.equal(getCurrentProject(useAppStore.getState())!.characters[0].name, undoOriginalName);
assert.equal(useAppStore.getState().redoStack.length, 1);
useAppStore.getState().redoLastChange();
assert.equal(getCurrentProject(useAppStore.getState())!.characters[0].name, "撤销重做后的角色名");
assert.equal(BrowserStorage.load().projects[0].characters[0].name, "撤销重做后的角色名");

const v1 = toV1Character(character);
assert.equal(v1.name, "莉娅");
assert.equal(v1.first_mes, character.firstMessage);
assert.ok(getV1LossWarnings(character).some((warning) => warning.includes("system_prompt")));

const worldBook = createWorldBookDraft("雪国世界书");
worldBook.entries = [
  createWorldBookEntryDraft({
    name: "月草",
    category: "item",
    keys: ["月草"],
    content: "月草会在梦境裂缝附近发光。",
    insertionOrder: 10
  }),
  createWorldBookEntryDraft({
    name: "常驻规则",
    category: "rule",
    constant: true,
    content: "雪国夜晚寒冷。",
    insertionOrder: 1
  })
];
const v2 = toV2Character(character, worldBook);
assert.equal(v2.spec, "chara_card_v2");
assert.equal(v2.data.character_book !== null, true);

const importedV2 = importCharacterJson(v2);
assert.equal(importedV2.character.name, "莉娅");
assert.equal(importedV2.embeddedWorldBook?.entries.length, 2);
const onePixelPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const pngWithMetadata = await embedV2MetadataInPngDataUrl(onePixelPng, character, worldBook);
const importedPng = extractCharacterFromPngDataUrl(pngWithMetadata, "lia.v2.png");
assert.equal(importedPng.character.name, "莉娅");
assert.equal(importedPng.character.originalSource?.format, "v2_png");
assert.equal(importedPng.report.detected.format, "V2 PNG");
assert.equal(importedPng.embeddedWorldBook?.entries.length, 2);
useAppStore.setState({ projects: [], currentProjectId: undefined, activePage: "projects" });
useAppStore.getState().createProject("导入保护自检", "advanced");
const importBackupInitial = getCurrentProject(useAppStore.getState())!;
const beforeInvalidProjectImportCount = useAppStore.getState().projects.length;
assert.throws(() => useAppStore.getState().importProject({ name: "坏项目", characters: [] }), /不是有效的 CardForge 项目/);
assert.equal(useAppStore.getState().projects.length, beforeInvalidProjectImportCount);
assert.equal(importBackupInitial.mode, "advanced");
useAppStore.getState().updateProject({ mode: "light" });
assert.equal(getCurrentProject(useAppStore.getState())!.mode, "light");
useAppStore.getState().updateProject({ mode: "advanced" });
assert.equal(getCurrentProject(useAppStore.getState())!.mode, "advanced");
useAppStore.getState().importCharacter(v2, "lia.v2.json");
const afterCharacterStoreImport = getCurrentProject(useAppStore.getState())!;
assert.equal(afterCharacterStoreImport.versions.length, importBackupInitial.versions.length + 1);
assert.equal(afterCharacterStoreImport.versions[0].targetType, "project");
assert.ok(afterCharacterStoreImport.versions[0].label.includes("导入角色 莉娅 前自动备份"));
assert.equal((afterCharacterStoreImport.versions[0].data as { characters: unknown[] }).characters.length, importBackupInitial.characters.length);
useAppStore.getState().importWorldBook(toWorldBookJson(worldBook), "snow.worldbook.json");
const afterWorldBookStoreImport = getCurrentProject(useAppStore.getState())!;
assert.equal(afterWorldBookStoreImport.versions.length, afterCharacterStoreImport.versions.length + 1);
assert.ok(afterWorldBookStoreImport.versions[0].label.includes("导入世界书 雪国世界书 前自动备份"));
assert.equal((afterWorldBookStoreImport.versions[0].data as { worldBooks: unknown[] }).worldBooks.length, afterCharacterStoreImport.worldBooks.length);

const v3 = toV3Character(character, worldBook, []);
assert.equal(v3.spec, "chara_card_v3");
const importedV3 = importCharacterJson(v3);
assert.equal(importedV3.character.originalSource?.format, "v3");
assert.equal(importedV3.report.detected.format, "Character Card V3");

const heavyCard = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "重型测试卡",
    description: "短描述",
    first_mes: "系统初始化。",
    personality: "",
    scenario: "",
    mes_example: "",
    character_book: {
      entries: Array.from({ length: 12 }, (_, index) => ({
        key: [`entry-${index}`],
        content: `设定 ${index}: 包含 _.set('state.value', ${index})、regex replace、Quick Reply 和 <button>frontend</button>`
      }))
    },
    extensions: {
      regex: [{ name: "导入 Foo 正则", pattern: "foo", replace: "bar", flags: "gi", target: "after_prompt", order: 12 }],
      mvu: "_.set('state.value', 1)",
      scripts: [
        { name: "初始化 STscript", language: "stscript", trigger: "on_card_init", source: "/setvar key=state.value 1" },
        { name: "确认 Quick Reply", type: "quick-reply", command: "/echo 已确认" }
      ],
      frontend: "<html><button>Start</button></html>",
      plugin: "sillytavern-extension"
    }
  }
};
const importedHeavy = importCharacterJson(heavyCard);
assert.equal(importedHeavy.report.cardKind, "heavy");
assert.equal(importedHeavy.report.suggestedMode, "advanced");
assert.equal(importedHeavy.report.detected.regex, true);
assert.equal(importedHeavy.report.detected.mvu, true);
assert.equal(importedHeavy.report.detected.scripts, true);
assert.equal(importedHeavy.report.detected.frontend, true);
assert.ok(importedHeavy.report.readonlyReasons.length > 0);
assert.equal(importedHeavy.importedRegexRules?.length, 1);
assert.equal(importedHeavy.importedRegexRules?.[0].pattern, "foo");
assert.equal(importedHeavy.importedRegexRules?.[0].replacement, "bar");
assert.equal(importedHeavy.importedRegexRules?.[0].target, "after_prompt");
assert.ok(importedHeavy.character.linkedRegexRules.includes(importedHeavy.importedRegexRules![0].id));
assert.ok(importedHeavy.report.notes.some((note) => note.includes("Regex Lab")));
assert.equal(getPathValue(importedHeavy.importedVariableState, "state.value"), 1);
assert.ok(importedHeavy.report.notes.some((note) => note.includes("Variable Lab")));
assert.equal(importedHeavy.importedScripts?.length, 2);
assert.equal(importedHeavy.importedScripts?.[0].enabled, false);
assert.equal(importedHeavy.importedScripts?.[0].language, "stscript");
assert.ok(importedHeavy.character.linkedScripts.includes(importedHeavy.importedScripts![0].id));
assert.ok(importedHeavy.report.notes.some((note) => note.includes("Script Manager")));
assert.ok(importedHeavy.frontendPackage);
assert.equal(importedHeavy.character.frontendPackageId, importedHeavy.frontendPackage?.id);
assert.ok(importedHeavy.frontendPackage?.html.includes("Start"));
assert.ok(importedHeavy.report.notes.some((note) => note.includes("Frontend Sandbox")));

const importedV1 = importCharacterJson(v1);
assert.equal(importedV1.character.firstMessage, character.firstMessage);

const changedCharacter = { ...character, description: `${character.description}\n补充：她害怕雪盲。`, tags: [...character.tags, "版本测试"] };
const versionDiff = diffCharacters(character, changedCharacter);
assert.ok(versionDiff.some((item) => item.field === "description"));
assert.ok(summarizeDiff(versionDiff).includes("description"));
const comparisonReport = buildABComparisonReport({
  project: {
    id: "project_compare_self_check",
    name: "Compare Self Check",
    mode: "advanced",
    characters: [changedCharacter],
    worldBooks: [worldBook],
    assets: [],
    aiProviders: [],
    aiPresets: [],
    aiLogs: [],
    tests: [],
    versions: [],
    exports: [],
    advanced: {
      regexRules: [],
      variableSystem: { id: "vars_compare", name: "vars", state: {}, history: [], updatedAt: Date.now() },
      scripts: [],
      frontendPackages: [],
      plugins: [],
      compatibilityReports: []
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  baselineCharacter: character,
  candidateCharacter: changedCharacter,
  baselineLabel: "基准",
  worldBook,
  userInput: "我想寻找月草。"
});
assert.ok(comparisonReport.fieldDiffs.some((item) => item.field === "description"));
assert.equal(comparisonReport.candidate.triggeredEntries >= 1, true);
assert.ok(comparisonReport.repairHints.length > 0);
const snapshotV2 = toV2Character(changedCharacter, worldBook);
assert.ok(snapshotV2.data.description.includes("害怕雪盲"));
const versionedExportRecord = createExportRecord({
  characterId: changedCharacter.id,
  characterVersionId: "version_self_check",
  worldBookIds: [worldBook.id],
  assetIds: [],
  format: "v2_json",
  outputPath: "lia.version_self_check.v2.json",
  warnings: []
});
assert.equal(versionedExportRecord.characterVersionId, "version_self_check");

const exportedWorldBook = toWorldBookJson(worldBook);
const exportedWorldBookEntries = (exportedWorldBook as { entries: Array<{ extensions?: { cardforge?: { category?: string } } }> }).entries;
assert.equal(exportedWorldBookEntries[0].extensions?.cardforge?.category, "item");
const importedWorldBook = importWorldBookJson(exportedWorldBook);
assert.equal(importedWorldBook.entries.length, 2);
assert.equal(importedWorldBook.entries[0].category, "item");
assert.equal(categoryLabel(importedWorldBook.entries[1].category), "规则");
const changedWorldBook = {
  ...worldBook,
  tokenBudget: 800,
  entries: [...worldBook.entries, createWorldBookEntryDraft({ name: "灰巷", keys: ["灰巷"], content: "灰巷靠近钟塔。" })]
};
const worldBookDiff = diffWorldBooks(worldBook, changedWorldBook);
assert.ok(worldBookDiff.some((item) => item.field === "token_budget"));
assert.ok(worldBookDiff.some((item) => item.field === "entries"));
assert.ok(
  diffWorldBookSnapshotAgainstCurrent(
    {
      id: "version_worldbook_self_check",
      label: "世界书快照",
      targetType: "worldbook",
      targetId: worldBook.id,
      data: worldBook,
      createdAt: Date.now()
    },
    changedWorldBook
  ).some((item) => item.field === "entries")
);
assert.equal(classifyWorldBookEntry(createWorldBookEntryDraft({ name: "雾城钟塔", keys: ["雾城"], content: "钟塔是雾城中心地点。" })), "location");
const normalizedWorldBookEntry = normalizeWorldBookEntryCandidate({
  name: "灰巷",
  keys: ["灰巷"],
  content: "灰巷是巡夜人的常见巡逻地点。",
  category: "location"
});
assert.equal(normalizedWorldBookEntry.category, "location");

const triggers = triggerWorldBookEntries(worldBook, "我想寻找月草。");
assert.equal(triggers.length, 2);
assert.equal(triggers[0].entryName, "常驻规则");
assert.ok(triggers.every((entry) => entry.tokens > 0));
const budgetAnalysis = analyzeWorldBookTrigger({ ...worldBook, tokenBudget: 5 }, "我想寻找月草。");
assert.equal(budgetAnalysis.usedTokens <= budgetAnalysis.tokenBudget, true);
assert.ok(budgetAnalysis.reviewedEntries.some((entry) => entry.status === "excluded_by_budget"));
const selectiveAnalysis = analyzeWorldBookTrigger(
  {
    ...worldBook,
    entries: [
      createWorldBookEntryDraft({
        name: "选择性条目",
        keys: ["月草"],
        secondaryKeys: ["梦境"],
        selective: true,
        content: "只有同时提到月草和梦境时才插入。"
      })
    ]
  },
  "我想寻找月草。"
);
assert.equal(selectiveAnalysis.reviewedEntries[0].status, "missed_secondary");
const conditionedAnalysis = analyzeWorldBookTrigger(
  {
    ...worldBook,
    entries: [
      createWorldBookEntryDraft({
        name: "任务中月草",
        keys: ["月草"],
        content: "只有任务进行中时，莉娅才会提到月草的采集路线。",
        conditions: [{ path: "quests.moonHerb.state", operator: "==", value: "进行中" }]
      })
    ]
  },
  "我想寻找月草。",
  { quests: { moonHerb: { state: "未开始" } } }
);
assert.equal(conditionedAnalysis.reviewedEntries[0].status, "missed_condition");
const conditionedTriggered = analyzeWorldBookTrigger(
  {
    ...worldBook,
    entries: [
      createWorldBookEntryDraft({
        name: "任务中月草",
        keys: ["月草"],
        content: "只有任务进行中时，莉娅才会提到月草的采集路线。",
        conditions: [{ path: "quests.moonHerb.state", operator: "==", value: "进行中" }]
      })
    ]
  },
  "我想寻找月草。",
  { quests: { moonHerb: { state: "进行中" } } }
);
assert.equal(conditionedTriggered.triggeredEntries.length, 1);
const problematicWorldBook = createWorldBookDraft("问题世界书");
problematicWorldBook.tokenBudget = 20;
problematicWorldBook.entries = [
  createWorldBookEntryDraft({
    name: "过宽关键词",
    keys: ["你"],
    content: "这一条会被太宽的关键词频繁触发。",
    insertionOrder: 5,
    position: "at_depth"
  }),
  createWorldBookEntryDraft({
    name: "重复关键词",
    keys: ["你"],
    constant: true,
    content: "这是一段较长的常驻内容，会消耗预算，并与其他条目共用插入顺序。",
    insertionOrder: 5,
    probability: 120,
    conditions: [{ path: "flags.ready", operator: "contains", value: true }]
  })
];
const worldBookIssues = checkWorldBookQuality(problematicWorldBook);
assert.ok(worldBookIssues.some((item) => item.message.includes("过宽")));
assert.ok(worldBookIssues.some((item) => item.message.includes("重复")));
assert.ok(worldBookIssues.some((item) => item.message.includes("insertion_order")));
assert.ok(worldBookIssues.some((item) => item.message.includes("probability")));
const promptBuild = buildTestPrompt(character, worldBook, [{ role: "assistant", content: "你需要哪种药？" }], "我想寻找月草。");
assert.ok(promptBuild.prompt.includes("World Info:"));
assert.ok(promptBuild.promptSections.some((section) => section.source === "worldbook" && section.enabled && section.tokens > 0));
assert.ok(promptBuild.promptSections.some((section) => section.target?.page === "worldbooks"));
const promptVariableSystem = {
  id: "vars_prompt_self_check",
  name: "Prompt Vars",
  state: { player: { hp: 90 }, quests: { moonHerb: "active" } },
  history: [],
  updatedAt: Date.now()
};
const promptFrontend = createFrontendPackageDraft({
  name: "Prompt 面板",
  html: "<main>初始化状态面板</main>",
  css: "main{padding:8px}",
  allowScripts: false
});
const frontendPreviewAsset: Asset = {
  id: "asset_frontend_preview",
  name: "frontend-preview.png",
  type: "image",
  purpose: "icon",
  source: "upload",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  tags: ["frontend"],
  linkedCharacterIds: [],
  linkedWorldBookIds: [],
  createdAt: Date.now(),
  updatedAt: Date.now()
};
const frontendPreview = buildFrontendSandboxPreview(
  createFrontendPackageDraft({
    name: "前端沙盒自检",
    html: "<main><p id=\"status\">等待</p><button data-cfs-action=\"confirm\">确认</button></main>",
    css: "button{color:white}",
    js: "document.querySelector('button')?.addEventListener('click',()=>{document.querySelector('#status').textContent='完成';});",
    assetIds: [frontendPreviewAsset.id],
    allowScripts: true,
    manifest: { initialMessage: "初始化完成后先显示状态。", variablePatch: { ui: { confirmed: true } } }
  }),
  {
    variableState: { player: { hp: 100 } },
    worldBook,
    assets: [frontendPreviewAsset],
    latestUserInput: "我想寻找月草。"
  }
);
assert.equal(frontendPreview.scriptMode, "sandboxed");
assert.deepEqual(frontendPreview.buttonLabels, ["确认"]);
assert.ok(frontendPreview.initialMessagePreview.includes("初始化完成"));
assert.ok(frontendPreview.variablePreview.includes("confirmed"));
assert.ok(frontendPreview.srcDoc.includes("cardforge-frontend-sandbox"));
assert.equal(frontendPreview.worldBookPreview.triggeredCount > 0, true);
assert.ok(frontendPreview.worldBookPreview.summary.includes("月草") || frontendPreview.worldBookPreview.entries.some((entry) => entry.content.includes("月草")));
assert.ok(frontendPreview.aiContentPreview.includes("Triggered Worldbook Entries"));
assert.ok(frontendPreview.aiContentTokens > 0);
assert.equal(frontendPreview.assetPreview.linkedCount, 1);
assert.ok(frontendPreview.aiContentPreview.includes("Linked Frontend Assets"));
assert.equal(frontendPreview.workerMode, "preflight");
assert.ok(frontendPreview.workerScript.includes("cardforge-frontend-worker"));
assert.ok(frontendPreview.permissionAudit.detectedCapabilities.includes("dom.write"));
assert.ok(frontendPreview.permissionAudit.issues.some((issue) => issue.message.includes("manifest.permissions")));
const frontendNetworkPreview = buildFrontendSandboxPreview(
  createFrontendPackageDraft({
    name: "前端权限自检",
    js: "fetch('/api/test')",
    allowScripts: true,
    manifest: { permissions: ["ui.render", "unknown.power"] }
  }),
  { variableState: {} }
);
assert.ok(frontendNetworkPreview.permissionAudit.knownPermissions.some((item) => item.id === "ui.render"));
assert.ok(frontendNetworkPreview.permissionAudit.unknownPermissions.includes("unknown.power"));
assert.ok(frontendNetworkPreview.permissionAudit.issues.some((issue) => issue.message.includes("network.fetch")));
const promptScript = createScriptDraft({
  name: "Prompt 静态脚本",
  source: "/setvar key=moonHerb active",
  trigger: "before_prompt_build",
  enabled: true,
  compatibility: "partial"
});
const promptRegex = createRegexRuleDraft({
  name: "Prompt 月草替换",
  pattern: "月草",
  replacement: "月光草",
  flags: "g",
  target: "after_prompt"
});
const heavyPromptCharacter = {
  ...character,
  linkedVariableSystem: promptVariableSystem.id,
  frontendPackageId: promptFrontend.id,
  linkedScripts: [promptScript.id],
  linkedRegexRules: [promptRegex.id]
};
const advancedPromptBuild = buildTestPrompt(heavyPromptCharacter, worldBook, [], "我想寻找月草。", {
  mode: "advanced",
  advanced: {
    regexRules: [promptRegex],
    variableSystem: promptVariableSystem,
    scripts: [promptScript],
    frontendPackages: [promptFrontend],
    plugins: [],
    compatibilityReports: []
  }
});
assert.ok(advancedPromptBuild.prompt.includes("月光草"));
assert.ok(advancedPromptBuild.promptSections.some((section) => section.source === "variables" && section.enabled));
assert.ok(advancedPromptBuild.promptSections.some((section) => section.source === "frontend" && section.enabled));
assert.ok(advancedPromptBuild.promptSections.some((section) => section.source === "script" && !section.enabled));
assert.ok(advancedPromptBuild.promptSections.some((section) => section.source === "regex"));
assert.equal(advancedPromptBuild.prompt.includes("/setvar key=moonHerb active"), false);
const userActionCase = builtInTestCases.find((item) => item.id === "no-user-action");
const worldBookCase = builtInTestCases.find((item) => item.id === "worldbook-recall");
assert.ok(userActionCase);
assert.ok(worldBookCase);
assert.ok(evaluateBuiltInTestCase(userActionCase!, "{{user}}决定打开门。", []).some((issue) => issue.id.includes("user_agency")));
assert.ok(evaluateBuiltInTestCase(worldBookCase!, "我没有想起相关设定。", []).some((issue) => issue.id.includes("no_worldbook_trigger")));

const provider = createProviderDraft();
provider.apiKey = "sk-self-check-secret";
provider.headers = {
  "X-Self-Check": "ok",
  Authorization: "Bearer sk-header-secret",
  "X-API-Key": "sk-header-api-secret",
  "X-Secret-Token": "sk-header-token-secret"
};
assert.deepEqual(sensitiveHeaderKeys(provider.headers).sort(), ["Authorization", "X-API-Key", "X-Secret-Token"].sort());
const sanitizedProviderHeaders = sanitizeSensitiveHeaders(provider.headers);
assert.equal(sanitizedProviderHeaders.Authorization, "");
assert.equal(sanitizedProviderHeaders["X-API-Key"], "");
assert.equal(sanitizedProviderHeaders["X-Secret-Token"], "");
assert.equal(sanitizedProviderHeaders["X-Self-Check"], "ok");
provider.models = ["gpt-4o-mini", "gpt-4o"];
provider.defaultParams.topP = 0.8;
provider.defaultParams.stream = true;
provider.capabilities = ["chat", "json", "streaming"];
assert.doesNotThrow(() => aiProviderSchema.parse(provider));
assert.equal(
  parseOpenAIStreamText(
    'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n'
  ),
  "你好"
);
const aiLog = createAIInvocationLog({
  provider,
  taskType: "selfCheck",
  inputTokens: 12,
  outputTokens: 8,
  durationMs: 34,
  success: true,
  rawOutput: "OK"
});
assert.equal(aiLog.totalTokens, 20);
assert.equal(aiLog.providerId, provider.id);
assert.ok(aiLog.estimatedCostUsd >= 0);
const aiLogSummary = summarizeAILogs(
  [
    aiLog,
    {
      ...aiLog,
      id: "ailog_old_provider",
      providerId: "provider_old",
      providerName: "Old Provider",
      success: false,
      totalTokens: 4,
      estimatedCostUsd: 0.25,
      createdAt: Date.now() - 48 * 60 * 60 * 1000
    }
  ],
  Date.now()
);
assert.equal(aiLogSummary.totalCalls, 2);
assert.equal(aiLogSummary.todayCalls, 1);
assert.ok(aiLogSummary.byProvider.some((item) => item.providerName === "Old Provider" && item.calls === 1));
const coverAsset: Asset = {
  id: "asset_self_check_cover",
  name: "lia-cover.png",
  type: "image",
  purpose: "export-cover",
  source: "upload",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  tags: ["image", "导出封面"],
  linkedCharacterIds: [character.id],
  linkedWorldBookIds: [worldBook.id],
  notes: "self-check cover asset",
  createdAt: Date.now(),
  updatedAt: Date.now()
};
const failedTestSession: TestSession = {
  id: "test_self_check_failure",
  name: "莉娅 失败样本",
  characterId: character.id,
  worldBookId: worldBook.id,
  providerId: provider.id,
  testCaseId: userActionCase!.id,
  testCaseName: userActionCase!.name,
  status: "failed",
  failureNotes: "助手替用户决定打开门。",
  messages: [
    { role: "user", content: "我站在门口沉默。" },
    { role: "assistant", content: "{{user}}决定打开门。" }
  ],
  triggeredEntries: promptBuild.triggeredEntries,
  promptPreview: promptBuild.prompt,
  promptSections: promptBuild.promptSections,
  diagnostics: evaluateBuiltInTestCase(userActionCase!, "{{user}}决定打开门。", promptBuild.triggeredEntries),
  createdAt: Date.now(),
  updatedAt: Date.now()
};
const customTestCase = createCustomTestCaseDraft({
  name: "月草召回回归",
  prompt: "我提到月草，请只用角色知道的方式回应。",
  expected: "应召回月草设定，且不要替用户行动。",
  tags: ["回归测试", "世界书"]
});

const regex = runRegexRule(
  {
    id: "regex_test",
    name: "行动提示",
    pattern: "(你|{{user}})(决定|走向)",
    replacement: "[替用户行动]$&",
    flags: "g",
    enabled: true,
    target: "ai_output",
    order: 1,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  "{{user}}决定打开门。"
);
assert.equal(regex.matched.length, 1);
assert.ok(regex.after.includes("[替用户行动]"));
const nonGlobalRegex = runRegexRule(
  {
    id: "regex_non_global",
    name: "非全局匹配",
    pattern: "月草",
    replacement: "月光草",
    flags: "i",
    enabled: true,
    target: "ai_output",
    order: 1,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  "月草与月草"
);
assert.equal(nonGlobalRegex.matched.length, 2);
assert.equal(nonGlobalRegex.after, "月光草与月草");
const emptyRegex = runRegexRule(
  {
    id: "regex_empty",
    name: "空规则",
    pattern: "",
    replacement: "",
    flags: "g",
    enabled: true,
    target: "ai_output",
    order: 1,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  "text"
);
assert.ok(emptyRegex.error?.includes("pattern"));
const pipeline = runRegexPipeline(
  [
    { ...nonGlobalRegexRule("first", 2), pattern: "月光草", replacement: "星草" },
    { ...nonGlobalRegexRule("second", 1), pattern: "月草", replacement: "月光草" }
  ],
  "月草"
);
assert.equal(pipeline.at(-1)?.after, "星草");

const defaultScript = createScriptDraft();
assert.equal(defaultScript.enabled, false);
assert.equal(isScriptRunnableInCurrentVersion(defaultScript), false);
const unsafeScript = createScriptDraft({
  enabled: true,
  permissions: ["project.read", "shell.execute", "apiKey.read"]
});
const unsafeIssues = scriptSafetyIssues(unsafeScript);
assert.ok(unsafeIssues.some((issue) => issue.message.includes("shell.execute")));
assert.ok(unsafeIssues.some((issue) => issue.message.includes("apiKey.read")));

const defaultPlugin = createPluginDraft();
assert.equal(defaultPlugin.enabled, false);
assert.equal(isPluginRunnableInCurrentVersion(defaultPlugin), false);
const importedPlugin = normalizePluginManifest({
  id: "example.imported",
  name: "Imported Plugin",
  enabled: true,
  permissions: ["project.read", "apiKey.read", "network.fullAccess"],
  contributes: { panels: [{ id: "panel", title: "Panel", location: "advanced" }] }
});
assert.equal(importedPlugin.version, "0.1.0");
const pluginIssues = pluginSafetyIssues(importedPlugin);
assert.ok(pluginIssues.some((issue) => issue.message.includes("apiKey.read")));
assert.ok(pluginIssues.some((issue) => issue.message.includes("network.fullAccess")));
assert.ok(pluginIssues.some((issue) => issue.message.includes("未受信任")));

const variableState = { relationships: { lia: { affection: 20 } }, player: { hp: 100 } };
const variableCommands = parseMvuSetCommands("_.set('relationships.lia.affection', 24); _.assign('player.hp', 92)");
const previewDiffs = previewVariableDiffs(variableState, variableCommands);
assert.equal(previewDiffs[0].before, 20);
const appliedVariables = applyVariableDiffs(variableState, variableCommands);
assert.equal(getPathValue(appliedVariables.state, "relationships.lia.affection"), 24);
assert.equal(getPathValue(appliedVariables.state, "player.hp"), 92);
assert.ok(diffVariables(variableState, appliedVariables.state).some((diff) => diff.path === "relationships.lia.affection"));
const packagedVersions = [
  {
    id: "version_packaged_character",
    label: "莉娅角色快照",
    targetType: "character" as const,
    targetId: character.id,
    data: character,
    createdAt: Date.now()
  },
  {
    id: "version_packaged_worldbook",
    label: "雪国世界书快照",
    targetType: "worldbook" as const,
    targetId: worldBook.id,
    data: worldBook,
    createdAt: Date.now()
  },
  {
    id: "version_packaged_project",
    label: "项目快照",
    targetType: "project" as const,
    targetId: "project_self_check",
    data: {
      id: "project_self_check",
      name: "Project Snapshot With Key",
      aiProviders: [
        {
          ...provider,
          apiKey: "sk-snapshot-secret",
          headers: {
            ...provider.headers,
            Authorization: "Bearer sk-snapshot-header-secret"
          }
        }
      ]
    },
    createdAt: Date.now()
  }
];
const packagedFrontend = createFrontendPackageDraft({
  name: "前端资源包",
  html: "<main><img src=\"assets/lia-cover.png\" alt=\"cover\"><button>确认</button></main>",
  css: "img{max-width:100%}",
  js: "",
  assetIds: [coverAsset.id],
  manifest: { permissions: ["ui.render"], entry: "index.html" }
});

const packaged = exportProjectPackage({
  id: "project_self_check",
  name: "Self Check Project",
  mode: "light",
  characters: [character],
  worldBooks: [worldBook],
  assets: [coverAsset],
  aiProviders: [provider],
  aiPresets: [],
  aiLogs: [aiLog],
  tests: [failedTestSession],
  testCases: [customTestCase],
  versions: packagedVersions,
  exports: [],
  advanced: {
    regexRules: [],
    variableSystem: { id: "vars", name: "vars", state: {}, history: [], updatedAt: Date.now() },
    scripts: [],
    frontendPackages: [packagedFrontend],
    plugins: [],
    compatibilityReports: []
  },
  createdAt: Date.now(),
  updatedAt: Date.now()
});
const packagedFiles = unzipSync(packaged);
assert.ok(packagedFiles["logs/ai-calls.json"]);
assert.ok(Object.keys(packagedFiles).some((path) => path.startsWith("versions/characters/")));
assert.ok(Object.keys(packagedFiles).some((path) => path.startsWith("versions/worldbooks/")));
assert.ok(Object.keys(packagedFiles).some((path) => path.startsWith("versions/project-snapshots/")));
assert.ok(Object.keys(packagedFiles).some((path) => path.endsWith("/assets/assets.json") && path.startsWith("frontend/")));
assert.ok(Object.keys(packagedFiles).some((path) => path.endsWith("/assets/lia-cover.png")));
const packagedProjectJson = new TextDecoder().decode(packagedFiles["project.json"]);
const packagedProjectData = JSON.parse(packagedProjectJson) as { mode?: string };
assert.equal(packagedProjectData.mode, "light");
assert.ok(!packagedProjectJson.includes("sk-self-check-secret"));
assert.ok(!packagedProjectJson.includes("sk-header-secret"));
assert.ok(!packagedProjectJson.includes("sk-header-api-secret"));
assert.ok(!packagedProjectJson.includes("sk-header-token-secret"));
assert.ok(!packagedProjectJson.includes("sk-snapshot-secret"));
assert.ok(!packagedProjectJson.includes("sk-snapshot-header-secret"));
assert.ok(packagedProjectJson.includes("X-Self-Check"));
const unpacked = importProjectPackage(packaged);
assert.equal(unpacked.name, "Self Check Project");
assert.equal(unpacked.aiProviders[0].apiKey, "");
assert.equal(unpacked.aiProviders[0].headers?.["X-Self-Check"], "ok");
assert.equal(unpacked.aiProviders[0].headers?.Authorization, "");
assert.equal(unpacked.aiProviders[0].headers?.["X-API-Key"], "");
assert.equal(unpacked.aiLogs.length, 1);
assert.equal(unpacked.assets[0].purpose, "export-cover");
assert.equal(unpacked.characters.length, 1);
assert.equal(unpacked.tests[0].status, "failed");
assert.equal(unpacked.testCases?.[0].name, "月草召回回归");
const duplicatedProject = createProjectDuplicate(unpacked, [unpacked.name, `${unpacked.name} 副本`]);
assert.notEqual(duplicatedProject.id, unpacked.id);
assert.equal(duplicatedProject.name, "Self Check Project 副本 2");
assert.equal(duplicatedProject.characters[0].name, unpacked.characters[0].name);
const exportReport = buildExportPreflightReport({
  project: unpacked,
  format: "v2_png",
  target: "sillytavern_v2",
  character,
  worldBook,
  imageAsset: coverAsset
});
assert.equal(exportReport.summary.dependencies >= 2, true);
assert.ok(formatExportReportMarkdown(exportReport).includes("依赖说明"));
const v1PreflightReport = buildExportPreflightReport({
  project: unpacked,
  format: "v1_json",
  target: "sillytavern_v2",
  character,
  worldBook
});
assert.ok(v1PreflightReport.summary.warnings > 0);
assert.ok(v1PreflightReport.checks.some((item) => item.message.includes("导出 V1")));
const missingWorldBookExportReport = buildExportPreflightReport({
  project: unpacked,
  format: "worldbook_json",
  target: "sillytavern_v2"
});
assert.ok(missingWorldBookExportReport.checks.some((item) => item.id === "missing-worldbook" && item.level === "blocker"));
const jpegCoverAsset: Asset = {
  ...coverAsset,
  id: "asset_self_check_jpeg_cover",
  name: "lia-cover.jpg",
  mimeType: "image/jpeg",
  dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==",
  thumbnailUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w=="
};
const jpegPngReport = buildExportPreflightReport({
  project: unpacked,
  format: "v2_png",
  target: "sillytavern_v2",
  character,
  worldBook,
  imageAsset: jpegCoverAsset
});
assert.ok(jpegPngReport.checks.some((item) => item.id === "image-not-png" && item.level === "blocker"));

const searchResults = searchProject(unpacked, "月草");
assert.ok(searchResults.some((result) => result.sourceType === "character" && result.target.page === "characters"));
assert.ok(searchResults.some((result) => result.sourceType === "worldbook-entry" && result.target.page === "worldbooks"));
assert.ok(searchProject(unpacked, "selfCheck").some((result) => result.sourceType === "ai-log" && result.target.page === "ai"));
assert.ok(searchProject(unpacked, "导出封面").some((result) => result.sourceType === "asset" && result.target.page === "assets"));
assert.ok(searchProject(unpacked, "失败样本").some((result) => result.sourceType === "test-session" && result.target.page === "test"));
assert.ok(searchProject(unpacked, "月草召回回归").some((result) => result.sourceType === "test-case" && result.target.page === "test"));
assert.equal(searchProject(unpacked, "sk-self-check-secret").length, 0);

const folderEntries = buildProjectDirectoryEntries(unpacked);
assert.ok(folderEntries.some((entry) => entry.path === "project.json"));
assert.ok(folderEntries.some((entry) => entry.path === ".cardforge/manifest.json"));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("characters/")));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("worldbooks/")));
assert.ok(folderEntries.some((entry) => entry.path === "tests/test-cases.json"));
assert.ok(folderEntries.some((entry) => entry.path === "tests/failure-cases.json"));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("tests/failure-cases/")));
assert.ok(folderEntries.some((entry) => entry.path === "logs/ai-calls.json"));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("versions/characters/")));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("versions/worldbooks/")));
assert.ok(folderEntries.some((entry) => entry.path.startsWith("versions/project-snapshots/")));
assert.ok(folderEntries.some((entry) => entry.path.endsWith("/assets/assets.json") && entry.path.startsWith("frontend/")));
assert.ok(folderEntries.some((entry) => entry.path.endsWith("/assets/lia-cover.png")));
const folderProjectJson = new TextDecoder().decode(folderEntries.find((entry) => entry.path === "project.json")!.bytes);
assert.ok(!folderProjectJson.includes("sk-self-check-secret"));
assert.ok(!folderProjectJson.includes("sk-header-secret"));
assert.ok(!folderProjectJson.includes("sk-header-api-secret"));
assert.ok(!folderProjectJson.includes("sk-header-token-secret"));
assert.ok(!folderProjectJson.includes("sk-snapshot-secret"));
assert.ok(!folderProjectJson.includes("sk-snapshot-header-secret"));
assert.ok(folderProjectJson.includes("X-Self-Check"));

const generatePreset = findTaskPreset(exampleProjects[0].create().aiPresets, "generateCharacter");
const validatePreset = findTaskPreset(exampleProjects[0].create().aiPresets, "validateCard");
const worldBookPreset = findTaskPreset(exampleProjects[0].create().aiPresets, "worldBookSuggest");
const testChatPreset = findTaskPreset(exampleProjects[0].create().aiPresets, "testChat");
const diagnosePreset = findTaskPreset(exampleProjects[0].create().aiPresets, "diagnoseTest");
assert.ok(generatePreset);
assert.ok(validatePreset);
assert.ok(worldBookPreset);
assert.ok(testChatPreset);
assert.ok(diagnosePreset);
const routedPreset = createPresetDraft({ paramsOverride: { temperature: 0.3, topP: 0.9, maxTokens: 500 } });
assert.equal(routedPreset.paramsOverride?.topP, 0.9);
assert.equal(renderPromptTemplate("角色：{{ idea }}", { idea: "月下药师" }), "角色：月下药师");
assert.equal(buildPresetMessages(generatePreset!, { idea: "月下药师" }).length, 2);
assert.ok(buildPresetMessages(validatePreset!, { character }).some((message) => message.content.includes("莉娅")));
assert.ok(buildPresetMessages(worldBookPreset!, { source: "雾城与钟塔" }).some((message) => message.content.includes("雾城")));
assert.deepEqual(missingPresetVariables(generatePreset!, { idea: "" }), ["idea"]);
assert.deepEqual(missingPresetVariables(worldBookPreset!, { source: "" }), ["source"]);

assert.equal(exampleProjects.length, 8);
for (const example of exampleProjects) {
  const project = example.create();
  assert.ok(project.name.length > 0);
  assert.ok(project.characters.length + project.worldBooks.length + project.advanced.plugins.length > 0);
}

console.log("CardForge Studio self-check passed.");

function nonGlobalRegexRule(name: string, order: number) {
  return {
    id: `regex_${name}`,
    name,
    pattern: "x",
    replacement: "y",
    flags: "g",
    enabled: true,
    target: "ai_output" as const,
    order,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}
