import { Bot, Copy, ExternalLink, Flag, GitCompare, ListChecks, Play, Save, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";
import { maybeAIInvocationLog, runLoggedCompletion } from "../core/ai/logging";
import { diagnoseTestWithAI } from "../core/ai/operations";
import { buildPresetMessages, findTaskPreset } from "../core/ai/presets";
import { buildTestPrompt } from "../core/prompt-builder/buildPrompt";
import type { AIProviderConfig, AIPreset, ChatMessage, PromptChainSection, QualityIssue, TestSessionStatus } from "../core/schema/types";
import { checkCharacterQuality } from "../core/quality/checks";
import { buildABComparisonReport } from "../core/tester/ab";
import { builtInTestCases, evaluateBuiltInTestCase, renderBuiltInTestCasePrompt } from "../core/tester/cases";
import { snapshotCharacterData } from "../core/version/diff";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";

const FREEFORM_TEST_CASE_ID = "freeform";
const BUILT_IN_CASE_PREFIX = "builtin:";
const CUSTOM_CASE_PREFIX = "custom:";
const TEST_STATUS_LABELS: Record<TestSessionStatus, string> = {
  untagged: "未标记",
  passed: "通过",
  failed: "失败样本",
  needs_review: "待复核"
};

export function TestSandboxPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("你好，我在找一种叫月草的药。");
  const [promptPreview, setPromptPreview] = useState("");
  const [diagnostics, setDiagnostics] = useState<QualityIssue[]>([]);
  const [diagnosticRaw, setDiagnosticRaw] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState(
    builtInTestCases[0] ? `${BUILT_IN_CASE_PREFIX}${builtInTestCases[0].id}` : FREEFORM_TEST_CASE_ID
  );
  const [selectedCompareSnapshotId, setSelectedCompareSnapshotId] = useState("");
  const [customCaseName, setCustomCaseName] = useState("自定义测试用例");
  const [customCasePrompt, setCustomCasePrompt] = useState("请保持当前角色回应这个场景。");
  const [customCaseExpected, setCustomCaseExpected] = useState("记录你希望观察的行为、语气或设定召回点。");
  const [customCaseTags, setCustomCaseTags] = useState("custom");
  const [failureNotes, setFailureNotes] = useState("");
  const [copiedSectionId, setCopiedSectionId] = useState("");
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const activeProject = project;
  const character = activeProject.characters.find((item) => item.id === state.selectedCharacterId) ?? activeProject.characters[0];
  const worldBook = activeProject.worldBooks.find((item) => item.id === state.selectedWorldBookId) ?? activeProject.worldBooks.find((item) => character?.linkedWorldBooks.includes(item.id));
  const customTestCases = activeProject.testCases ?? [];
  const selectedBuiltInCase = selectedCaseId.startsWith(BUILT_IN_CASE_PREFIX)
    ? builtInTestCases.find((item) => `${BUILT_IN_CASE_PREFIX}${item.id}` === selectedCaseId)
    : undefined;
  const selectedCustomCase = selectedCaseId.startsWith(CUSTOM_CASE_PREFIX)
    ? customTestCases.find((item) => `${CUSTOM_CASE_PREFIX}${item.id}` === selectedCaseId)
    : undefined;
  const selectedCaseName = selectedBuiltInCase?.name ?? selectedCustomCase?.name;
  const selectedCaseDescription = selectedBuiltInCase?.description ?? (selectedCustomCase ? "项目自定义测试用例。" : "");
  const selectedCaseExpected = selectedBuiltInCase?.expected ?? selectedCustomCase?.expected;
  const characterSnapshots = character
    ? activeProject.versions.filter((snapshot) => snapshot.targetType === "character" && snapshot.targetId === character.id)
    : [];
  const selectedCompareSnapshot =
    characterSnapshots.find((snapshot) => snapshot.id === selectedCompareSnapshotId) ?? characterSnapshots[0];
  const built = useMemo(
    () => (character ? buildTestPrompt(character, worldBook, messages, input, activeProject) : undefined),
    [activeProject, character, worldBook, messages, input]
  );
  const comparisonReport = useMemo(() => {
    const baselineCharacter = selectedCompareSnapshot ? snapshotCharacterData(selectedCompareSnapshot) : undefined;
    if (!character || !baselineCharacter) return undefined;
    return buildABComparisonReport({
      project: activeProject,
      baselineCharacter,
      candidateCharacter: character,
      baselineLabel: selectedCompareSnapshot.label,
      candidateLabel: "当前编辑",
      worldBook,
      userInput: input
    });
  }, [activeProject, character, input, selectedCompareSnapshot, worldBook]);

  async function send() {
    if (!character || !built) return;
    const { provider, preset } = resolveTaskAI("testChat");
    if (!provider) return alert("请先选择 AI Provider。");
    setBusy(true);
    setPromptPreview(built.prompt);
    try {
      const routedMessages = preset ? buildPresetMessages(preset, { prompt: built.prompt, character, messages, userMessage: input }) : built.messages;
      const { content: reply, log } = await runLoggedCompletion(provider, routedMessages, "testChat", preset?.paramsOverride);
      state.addAIInvocationLog(log);
      const nextMessages: ChatMessage[] = [...messages, { role: "user", content: input }, { role: "assistant", content: reply }];
      const localDiagnostics = buildLocalDiagnostics(reply, built.triggeredEntries);
      setMessages(nextMessages);
      setDiagnostics(localDiagnostics);
      state.addTestSession({
        name: `${character.name} 测试 ${new Date().toLocaleString()}`,
        characterId: character.id,
        worldBookId: worldBook?.id,
        providerId: provider.id,
        messages: nextMessages,
        triggeredEntries: built.triggeredEntries,
        promptPreview: built.prompt,
        promptSections: built.promptSections,
        diagnostics: localDiagnostics,
        ...testCaseSessionMeta(localDiagnostics)
      });
      setInput("");
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function saveSessionOnly() {
    if (!character || !built) return;
    const localDiagnostics = diagnostics.length ? diagnostics : buildLocalDiagnostics(lastAssistantReply(), built.triggeredEntries);
    state.addTestSession({
      name: `${character.name} 手动保存 ${new Date().toLocaleString()}`,
      characterId: character.id,
      worldBookId: worldBook?.id,
      providerId: provider?.id,
      messages,
      triggeredEntries: built.triggeredEntries,
      promptPreview: built.prompt,
      promptSections: built.promptSections,
      diagnostics: localDiagnostics,
      ...testCaseSessionMeta(localDiagnostics)
    });
  }

  function markFailureSample() {
    if (!character || !built || !messages.length) return;
    const localDiagnostics = buildLocalDiagnostics(lastAssistantReply(), built.triggeredEntries);
    state.addTestSession({
      name: `${character.name} 失败样本 ${new Date().toLocaleString()}`,
      characterId: character.id,
      worldBookId: worldBook?.id,
      providerId: provider?.id,
      messages,
      triggeredEntries: built.triggeredEntries,
      promptPreview: built.prompt,
      promptSections: built.promptSections,
      diagnostics: localDiagnostics,
      ...testCaseSessionMeta(localDiagnostics, "failed", failureNotes.trim() || "人工标记为失败样本。")
    });
  }

  async function diagnose() {
    if (!character || !built) return;
    const { provider, preset } = resolveTaskAI("diagnoseTest");
    if (!provider) return alert("请先选择 AI Provider。");
    setBusy(true);
    setPromptPreview(built.prompt);
    try {
      const result = await diagnoseTestWithAI(
        provider,
        {
          character,
          prompt: built.prompt,
          messages,
          triggeredEntries: built.triggeredEntries
        },
        preset
      );
      if (result.log) state.addAIInvocationLog(result.log);
      setDiagnosticRaw(result.raw);
      const merged = [...checkCharacterQuality(character, worldBook), ...(result.parsed ?? [])];
      setDiagnostics(merged);
      state.addTestSession({
        name: `${character.name} 诊断 ${new Date().toLocaleString()}`,
        characterId: character.id,
        worldBookId: worldBook?.id,
        providerId: provider.id,
        messages,
        triggeredEntries: built.triggeredEntries,
        promptPreview: built.prompt,
        promptSections: built.promptSections,
        diagnostics: merged,
        ...testCaseSessionMeta(merged, selectedCaseName ? "needs_review" : "untagged")
      });
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function loadSelectedCase() {
    if (selectedBuiltInCase) {
      setInput(renderBuiltInTestCasePrompt(selectedBuiltInCase, { character, worldBook }));
      return;
    }
    if (selectedCustomCase) setInput(selectedCustomCase.prompt);
  }

  function buildLocalDiagnostics(reply: string, triggeredEntries = built?.triggeredEntries ?? []): QualityIssue[] {
    const base = character ? checkCharacterQuality(character, worldBook) : [];
    if (!reply.trim()) return base;
    if (selectedBuiltInCase) return [...base, ...evaluateBuiltInTestCase(selectedBuiltInCase, reply, triggeredEntries)];
    if (selectedCustomCase) {
      return [
        ...base,
        {
          id: `custom_${selectedCustomCase.id}_review`,
          level: "info",
          scope: `test:${selectedCustomCase.id}`,
          message: `自定义用例「${selectedCustomCase.name}」已运行，请对照期望人工复核。`
        }
      ];
    }
    return base;
  }

  function lastAssistantReply(): string {
    return [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  }

  function testCaseSessionMeta(
    localDiagnostics: QualityIssue[],
    forcedStatus?: TestSessionStatus,
    forcedNotes?: string
  ): { testCaseId?: string; testCaseName?: string; status: TestSessionStatus; failureNotes?: string } {
    const status = forcedStatus ?? inferSessionStatus(localDiagnostics);
    const notes = forcedNotes ?? failureNotes.trim();
    return {
      testCaseId: selectedBuiltInCase?.id ?? selectedCustomCase?.id,
      testCaseName: selectedCaseName,
      status,
      failureNotes: notes || undefined
    };
  }

  function inferSessionStatus(localDiagnostics: QualityIssue[]): TestSessionStatus {
    if (failureNotes.trim()) return "failed";
    if (!selectedBuiltInCase && !selectedCustomCase) return "untagged";
    if (selectedCustomCase) return "needs_review";
    const builtInCaseId = selectedBuiltInCase?.id;
    return builtInCaseId && localDiagnostics.some((issue) => issue.scope === `test:${builtInCaseId}` && issue.level !== "info")
      ? "needs_review"
      : "passed";
  }

  function selectCase(value: string) {
    setSelectedCaseId(value);
    const custom = customTestCases.find((item) => `${CUSTOM_CASE_PREFIX}${item.id}` === value);
    if (!custom) return;
    setCustomCaseName(custom.name);
    setCustomCasePrompt(custom.prompt);
    setCustomCaseExpected(custom.expected ?? "");
    setCustomCaseTags(custom.tags.join(", "));
  }

  function addCustomCase() {
    state.addTestCase({
      name: customCaseName.trim() || "自定义测试用例",
      prompt: customCasePrompt.trim() || "请保持当前角色回应这个场景。",
      expected: customCaseExpected.trim(),
      tags: parseTags(customCaseTags),
      enabled: true
    });
  }

  function updateSelectedCustomCase() {
    if (!selectedCustomCase) return;
    state.updateTestCase(selectedCustomCase.id, {
      name: customCaseName.trim() || "自定义测试用例",
      prompt: customCasePrompt.trim() || "请保持当前角色回应这个场景。",
      expected: customCaseExpected.trim(),
      tags: parseTags(customCaseTags)
    });
  }

  function deleteSelectedCustomCase() {
    if (!selectedCustomCase) return;
    if (!window.confirm(`删除自定义测试用例「${selectedCustomCase.name}」？`)) return;
    state.deleteTestCase(selectedCustomCase.id);
    setSelectedCaseId(FREEFORM_TEST_CASE_ID);
  }

  function resolveTaskAI(taskType: string): { provider?: AIProviderConfig; preset?: AIPreset } {
    const preset = findTaskPreset(activeProject.aiPresets, taskType);
    const provider =
      activeProject.aiProviders.find((item) => item.id === preset?.providerId) ??
      activeProject.aiProviders.find((item) => item.id === state.selectedProviderId) ??
      activeProject.aiProviders[0];
    if (!provider) return { preset };
    return { preset, provider: preset?.modelOverride ? { ...provider, defaultModel: preset.modelOverride } : provider };
  }

  const provider = resolveTaskAI("testChat").provider ?? activeProject.aiProviders.find((item) => item.id === state.selectedProviderId);

  function recordAIError(error: unknown) {
    const log = maybeAIInvocationLog(error);
    if (log) state.addAIInvocationLog(log);
  }

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSectionId(id);
      window.setTimeout(() => setCopiedSectionId(""), 1400);
    } catch {
      alert("当前浏览器不允许写入剪贴板。");
    }
  }

  function openPromptSource(section: PromptChainSection) {
    if (!section.target) return;
    useAppStore.setState({
      activePage: section.target.page,
      ...(section.target.selectedCharacterId ? { selectedCharacterId: section.target.selectedCharacterId } : {}),
      ...(section.target.selectedWorldBookId ? { selectedWorldBookId: section.target.selectedWorldBookId } : {}),
      ...(section.target.selectedAssetId ? { selectedAssetId: section.target.selectedAssetId } : {}),
      ...(section.target.selectedProviderId ? { selectedProviderId: section.target.selectedProviderId } : {})
    });
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>测试沙盒</h1>
          <p>使用当前角色卡、世界书和 Provider 构建 Prompt，运行内置测试用例并保存失败样本。</p>
        </div>
        <div className="toolbar">
          <select value={character?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedCharacterId: event.target.value })}>
            {activeProject.characters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select value={worldBook?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedWorldBookId: event.target.value })}>
            <option value="">不使用世界书</option>
            {activeProject.worldBooks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="triple">
        <aside className="panel">
          <div className="panel-title">
            <Save size={18} />
            <span>测试记录</span>
          </div>
          <div className="list">
            {activeProject.tests.slice(0, 10).map((session) => (
              <div className="list-item" key={session.id}>
                <strong>{session.name}</strong>
                <span className="muted">{session.messages.length} 消息 / {session.triggeredEntries.length} 触发</span>
                <div className="trigger-meta">
                  <span className={`status-chip ${session.status ?? "untagged"}`}>
                    {TEST_STATUS_LABELS[session.status ?? "untagged"]}
                  </span>
                  {session.testCaseName && <span>{session.testCaseName}</span>}
                </div>
                {session.failureNotes && <span className="muted">备注：{session.failureNotes}</span>}
              </div>
            ))}
            {!activeProject.tests.length && <p className="muted">还没有测试记录。</p>}
          </div>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <ListChecks size={18} />
            <span>测试用例</span>
          </div>
          <div className="form-grid">
            <label>
              内置用例
              <select value={selectedCaseId} onChange={(event) => selectCase(event.target.value)}>
                <option value={FREEFORM_TEST_CASE_ID}>自由测试</option>
                <optgroup label="内置用例">
                {builtInTestCases.map((testCase) => (
                  <option key={testCase.id} value={`${BUILT_IN_CASE_PREFIX}${testCase.id}`}>
                    {testCase.name}
                  </option>
                ))}
                </optgroup>
                <optgroup label="自定义用例">
                  {customTestCases.map((testCase) => (
                    <option key={testCase.id} value={`${CUSTOM_CASE_PREFIX}${testCase.id}`}>
                      {testCase.enabled ? testCase.name : `${testCase.name}（禁用）`}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {selectedCaseName && (
              <div className="callout">
                <strong>{selectedCaseName}</strong>
                <p className="muted" style={{ margin: "6px 0" }}>{selectedCaseDescription}</p>
                {selectedCaseExpected && <span className="muted">期望：{selectedCaseExpected}</span>}
              </div>
            )}
            <button className="secondary-button" onClick={loadSelectedCase} disabled={!selectedCaseName}>
              <ListChecks size={17} /> 载入用例
            </button>
            <div className="panel-title" style={{ marginTop: 6 }}>
              <span>自定义用例</span>
            </div>
            <label>
              名称
              <input value={customCaseName} onChange={(event) => setCustomCaseName(event.target.value)} />
            </label>
            <label>
              Prompt
              <textarea value={customCasePrompt} onChange={(event) => setCustomCasePrompt(event.target.value)} />
            </label>
            <label>
              期望
              <textarea value={customCaseExpected} onChange={(event) => setCustomCaseExpected(event.target.value)} />
            </label>
            <label>
              标签
              <input value={customCaseTags} onChange={(event) => setCustomCaseTags(event.target.value)} placeholder="custom, 回归测试" />
            </label>
            <div className="toolbar">
              <button className="secondary-button" onClick={addCustomCase}>
                新增用例
              </button>
              <button className="secondary-button" onClick={updateSelectedCustomCase} disabled={!selectedCustomCase}>
                更新
              </button>
              <button className="ghost-button" onClick={deleteSelectedCustomCase} disabled={!selectedCustomCase}>
                删除
              </button>
            </div>
            <label>
              失败样本备注
              <textarea value={failureNotes} onChange={(event) => setFailureNotes(event.target.value)} placeholder="记录失败现象、复现条件或修复方向。" />
            </label>
            <button className="secondary-button" onClick={markFailureSample} disabled={!messages.length}>
              <Flag size={17} /> 标记失败样本
            </button>
          </div>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <GitCompare size={18} />
            <span>A/B 对比</span>
          </div>
          <div className="form-grid">
            <label>
              基准快照 A
              <select
                value={selectedCompareSnapshot?.id ?? ""}
                onChange={(event) => setSelectedCompareSnapshotId(event.target.value)}
                disabled={!characterSnapshots.length}
              >
                {!characterSnapshots.length && <option value="">暂无角色快照</option>}
                {characterSnapshots.map((snapshot) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">B 会使用当前编辑状态，并基于当前用户消息、世界书触发和历史失败样本生成本地对比报告。</p>
          </div>
        </aside>

        <main className="panel">
          <div className="chat-window">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`message ${message.role}`}>
                {message.content}
              </div>
            ))}
            {!messages.length && <div className="message system">开始一次轻量试卡。Prompt 预览会显示在右侧。</div>}
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label>
              用户消息
              <textarea value={input} onChange={(event) => setInput(event.target.value)} />
            </label>
            <div className="toolbar">
              <button className="primary-button" onClick={send} disabled={busy || !input.trim()}>
                <Play size={17} /> 发送
              </button>
              <button className="secondary-button" onClick={saveSessionOnly}>
                <Save size={17} /> 保存记录
              </button>
              <button className="secondary-button" onClick={diagnose} disabled={busy}>
                <Stethoscope size={17} /> 诊断
              </button>
              <button className="secondary-button" onClick={() => setMessages([])}>
                清空
              </button>
            </div>
          </div>
        </main>

        <aside className="panel">
          <div className="panel-title">
            <Bot size={18} />
            <span>Prompt 链路</span>
          </div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <button className="secondary-button" disabled={!built} onClick={() => built && copyText("full-prompt", built.prompt)}>
              <Copy size={16} /> 复制完整 Prompt
            </button>
          </div>
          <div className="list">
            {built?.promptSections.map((section, index) => (
              <div className={section.enabled ? "list-item" : "list-item"} key={section.id}>
                <strong>
                  {index + 1}. {section.label}
                </strong>
                <span className="muted">
                  {section.source} / {section.position} / {section.tokens} tokens / {section.enabled ? "enabled" : "disabled"}
                </span>
                <pre style={{ maxHeight: 120, overflow: "auto", margin: "4px 0", fontSize: 12 }}>{section.content || "(empty)"}</pre>
                <div className="toolbar">
                  <button className="ghost-button" onClick={() => copyText(section.id, section.content || "")}>
                    <Copy size={14} /> {copiedSectionId === section.id ? "已复制" : "复制"}
                  </button>
                  <button className="ghost-button" disabled={!section.target} onClick={() => openPromptSource(section)}>
                    <ExternalLink size={14} /> 来源
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>完整 Prompt</span>
          </div>
          <pre className="json-preview">{promptPreview || built?.prompt}</pre>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>世界书触发</span>
          </div>
          <div className="list">
            {built?.triggeredEntries.map((entry) => (
              <div className="list-item" key={entry.entryId}>
                <strong>{entry.entryName || entry.entryId}</strong>
                <span className="muted">
                  {entry.reason} / {entry.position} / order {entry.insertionOrder}
                </span>
                <span className="muted">
                  命中：{entry.matchedKeys.join(", ")} / {entry.tokens} tokens
                </span>
              </div>
            ))}
            {!built?.triggeredEntries.length && <p className="muted">当前输入未触发世界书。</p>}
          </div>
          <div className="panel-title" style={{ marginTop: 16 }}>
            <Stethoscope size={18} />
            <span>诊断报告</span>
          </div>
          {diagnostics.length ? (
            <ul className="issue-list">
              {diagnostics.map((issue) => (
                <li className={`issue ${issue.level}`} key={issue.id}>
                  <b>{issue.level}</b>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">点击诊断后会保存本轮 Prompt、触发日志和 AI 诊断建议。</p>
          )}
          {diagnosticRaw && <pre className="json-preview" style={{ marginTop: 12 }}>{diagnosticRaw}</pre>}
          <div className="panel-title" style={{ marginTop: 16 }}>
            <GitCompare size={18} />
            <span>A/B 对比报告</span>
          </div>
          {comparisonReport ? (
            <div className="list">
              <div className="list-item">
                <strong>{comparisonReport.baseline.label} → {comparisonReport.candidate.label}</strong>
                <span className="muted">
                  评分差：{comparisonReport.scoreDelta >= 0 ? "+" : ""}{comparisonReport.scoreDelta} / token 差：{comparisonReport.tokenDelta >= 0 ? "+" : ""}{comparisonReport.tokenDelta}
                </span>
                <div className="metric-row">
                  <span>A 综合 / 稳定 / 召回</span>
                  <strong>
                    {comparisonReport.baseline.totalScore} / {comparisonReport.baseline.stabilityScore} / {comparisonReport.baseline.recallScore}
                  </strong>
                </div>
                <div className="metric-row">
                  <span>B 综合 / 稳定 / 召回</span>
                  <strong>
                    {comparisonReport.candidate.totalScore} / {comparisonReport.candidate.stabilityScore} / {comparisonReport.candidate.recallScore}
                  </strong>
                </div>
                <div className="metric-row">
                  <span>世界书触发</span>
                  <strong>{comparisonReport.baseline.triggeredEntries} → {comparisonReport.candidate.triggeredEntries}</strong>
                </div>
              </div>
              <div className="callout">
                <strong>推荐</strong>
                <p className="muted" style={{ margin: "6px 0 0" }}>{comparisonReport.recommendation}</p>
              </div>
              <div className="list-item">
                <strong>修复建议</strong>
                {comparisonReport.repairHints.map((hint) => (
                  <span className="muted" key={hint}>{hint}</span>
                ))}
              </div>
              <div className="list-item">
                <strong>字段差异</strong>
                {comparisonReport.fieldDiffs.slice(0, 6).map((diff) => (
                  <span className="muted" key={diff.field}>{diff.field}: {diff.before.slice(0, 42) || "(空)"} → {diff.after.slice(0, 42) || "(空)"}</span>
                ))}
                {!comparisonReport.fieldDiffs.length && <span className="muted">没有字段差异。</span>}
              </div>
              {comparisonReport.failureSamples.length > 0 && (
                <div className="list-item">
                  <strong>关联失败样本</strong>
                  {comparisonReport.failureSamples.map((session) => (
                    <span className="muted" key={session.id}>{session.testCaseName ?? "自由测试"}：{session.failureNotes ?? session.name}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="muted">创建角色快照后，可在左侧选择基准快照，对比当前编辑版本的稳定性、召回和 token 消耗。</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function parseTags(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, tags) => tags.indexOf(item) === index);
}
