import { Bot, Copy, FileJson, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { maybeAIInvocationLog } from "../core/ai/logging";
import { checkCharacterWithAI, generateCharacterDraftWithAI, rewriteCharacterFieldWithAI, suggestWorldBookWithAI } from "../core/ai/operations";
import { resolveAIForTask } from "../core/ai/presets";
import { prettyJson, toV2Character } from "../core/exporter/character";
import { extractCharacterFromPngDataUrl } from "../core/exporter/pngMetadata";
import { importCharacterJson, type ImportCharacterResult } from "../core/importer/character";
import type { CompatibilityReport, InternalCharacter, QualityIssue } from "../core/schema/types";
import { buildCharacterTokenBreakdown, checkCharacterQuality } from "../core/quality/checks";
import { diffSnapshotAgainstCurrent, summarizeDiff } from "../core/version/diff";
import { normalizeWorldBookEntryCandidate } from "../core/worldbook/normalize";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { readFileAsDataUrl, readFileAsText } from "../utils/file";

type TextFieldKey =
  | "description"
  | "personality"
  | "scenario"
  | "firstMessage"
  | "exampleMessages"
  | "systemPrompt"
  | "postHistoryInstructions"
  | "creatorNotes";

type FieldOperation = "generate" | "polish" | "shorten" | "expand" | "natural" | "concise" | "immersive";

const textFields: Array<{ key: TextFieldKey; label: string }> = [
  { key: "description", label: "description" },
  { key: "personality", label: "personality" },
  { key: "scenario", label: "scenario" },
  { key: "firstMessage", label: "first_mes" },
  { key: "exampleMessages", label: "mes_example" },
  { key: "systemPrompt", label: "system_prompt" },
  { key: "postHistoryInstructions", label: "post_history_instructions" },
  { key: "creatorNotes", label: "creator_notes" }
];

const fieldOperations: Array<{ id: FieldOperation; label: string }> = [
  { id: "generate", label: "生成字段" },
  { id: "polish", label: "润色" },
  { id: "shorten", label: "缩短" },
  { id: "expand", label: "扩写" },
  { id: "natural", label: "更自然" },
  { id: "concise", label: "更简洁" },
  { id: "immersive", label: "更沉浸" }
];

export function CharacterPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [search, setSearch] = useState("");
  const [idea, setIdea] = useState("一位在雪国边境行医、能听见梦境裂缝的药师");
  const [busy, setBusy] = useState("");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [selectedFieldKey, setSelectedFieldKey] = useState<TextFieldKey>("description");
  const [fieldOperation, setFieldOperation] = useState<FieldOperation>("polish");
  const [aiQualityIssues, setAiQualityIssues] = useState<QualityIssue[]>([]);
  const [aiQualityRaw, setAiQualityRaw] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [pendingImport, setPendingImport] = useState<ImportCharacterResult | undefined>();
  if (!project) return null;
  const activeProject = project;
  const selected = activeProject.characters.find((character) => character.id === state.selectedCharacterId) ?? activeProject.characters[0];
  const linkedWorldBook = activeProject.worldBooks.find((book) => selected?.linkedWorldBooks.includes(book.id));
  const filteredCharacters = activeProject.characters.filter((character) => character.name.toLowerCase().includes(search.toLowerCase()));
  const v2Preview = selected ? prettyJson(toV2Character(selected, linkedWorldBook)) : "";
  const issues = selected ? checkCharacterQuality(selected, linkedWorldBook) : [];
  const tokenBreakdown = selected ? buildCharacterTokenBreakdown(selected, linkedWorldBook) : undefined;
  const snapshots = selected
    ? activeProject.versions.filter((version) => version.targetType === "character" && version.targetId === selected.id)
    : [];
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0];
  const snapshotDiff = selected && selectedSnapshot ? diffSnapshotAgainstCurrent(selectedSnapshot, selected) : [];
  const compatibilityReports = selected?.compatibilityReports ?? [];
  const latestCompatibilityReport = compatibilityReports[0];

  function update(patch: Partial<InternalCharacter>) {
    if (!selected) return;
    state.updateCharacter(selected.id, patch);
  }

  async function importCharacterFile(file: File) {
    try {
      const result = await parseCharacterImportFile(file);
      if (result.report.importedAsReadonly) {
        setPendingImport(result);
        setImportStatus(`只读扫描完成：${file.name}。请确认后再转换导入。`);
        return;
      }
      state.importCharacterResult(result);
      setPendingImport(undefined);
      setImportStatus(`已导入角色：${file.name}`);
    } catch (error) {
      setImportStatus(`角色导入失败：${error instanceof Error ? error.message : String(error)}。现有角色未被修改。`);
    }
  }

  async function parseCharacterImportFile(file: File): Promise<ImportCharacterResult> {
    if (isPngFile(file)) {
      const dataUrl = await readFileAsDataUrl(file);
      return extractCharacterFromPngDataUrl(dataUrl, file.name);
    }
    const text = await readFileAsText(file);
    return importCharacterJson(JSON.parse(text), file.name);
  }

  function confirmPendingImport() {
    if (!pendingImport) return;
    state.importCharacterResult(pendingImport);
    setImportStatus(`已确认并转换导入：${pendingImport.character.name}`);
    setPendingImport(undefined);
  }

  async function generateDraft() {
    const { provider, preset } = resolveTaskAI("generateCharacter");
    if (!provider) return alert("请先在 AI 设置页添加 Provider。");
    setBusy("generate");
    try {
      const result = await generateCharacterDraftWithAI(provider, idea, preset);
      if (result.log) state.addAIInvocationLog(result.log);
      state.setPendingAIResult({ label: "角色草稿", target: "character", payload: result.parsed, raw: result.raw });
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function runFieldOperation(field: TextFieldKey = selectedFieldKey, operation: FieldOperation = fieldOperation) {
    const { provider, preset } = resolveTaskAI("rewriteField");
    if (!provider || !selected) return alert("请先选择角色和 Provider。");
    const fieldMeta = textFields.find((item) => item.key === field) ?? textFields[0];
    setBusy(`${field}:${operation}`);
    try {
      const result = await rewriteCharacterFieldWithAI(
        provider,
        fieldMeta.label,
        operation === "generate" ? characterContext(selected) : String(selected[field] ?? ""),
        fieldOperationInstruction(operation),
        preset
      );
      if (result.log) state.addAIInvocationLog(result.log);
      state.setPendingAIResult({
        label: `${fieldMeta.label} ${fieldOperationLabel(operation)}`,
        target: "field",
        payload: { field, value: result.parsed },
        raw: result.raw
      });
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function splitWorldBook() {
    const { provider, preset } = resolveTaskAI("worldBookSuggest");
    if (!provider || !selected) return alert("请先选择角色和 Provider。");
    setBusy("worldbook");
    try {
      const result = await suggestWorldBookWithAI(provider, selected, preset);
      if (result.log) state.addAIInvocationLog(result.log);
      state.setPendingAIResult({ label: "世界书建议", target: "worldbook", payload: result.parsed, raw: result.raw });
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function runAIQualityCheck() {
    const { provider, preset } = resolveTaskAI("validateCard");
    if (!provider || !selected) return alert("请先选择角色和 Provider。");
    setBusy("validateCard");
    setAiQualityRaw("");
    try {
      const result = await checkCharacterWithAI(provider, selected, preset);
      if (result.log) state.addAIInvocationLog(result.log);
      setAiQualityRaw(result.raw);
      setAiQualityIssues(
        result.parsed ?? [
          {
            id: `ai_quality_${Date.now()}`,
            level: "warning",
            scope: "ai.validateCard",
            message: result.error ?? "AI 输出未能解析为问题列表，已保留原始输出。"
          }
        ]
      );
    } catch (error) {
      recordAIError(error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function resolveTaskAI(taskType: string) {
    return resolveAIForTask({
      providers: activeProject.aiProviders,
      presets: activeProject.aiPresets,
      taskType,
      selectedProviderId: state.selectedProviderId
    });
  }

  function applyAIResult() {
    const pending = state.pendingAIResult;
    if (!pending || !selected) return;
    if (pending.target === "character" && pending.payload && typeof pending.payload === "object") {
      const data = pending.payload as Record<string, unknown>;
      update({
        name: stringValue(data.name, selected.name),
        description: stringValue(data.description, selected.description),
        personality: stringValue(data.personality, selected.personality ?? ""),
        scenario: stringValue(data.scenario, selected.scenario ?? ""),
        firstMessage: stringValue(data.first_mes ?? data.firstMessage, selected.firstMessage),
        exampleMessages: stringValue(data.mes_example ?? data.exampleMessages, selected.exampleMessages ?? ""),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : selected.tags
      });
      state.setPendingAIResult(undefined);
    }
    if (pending.target === "field" && pending.payload && typeof pending.payload === "object") {
      const payload = pending.payload as { field?: TextFieldKey; value?: string };
      if (payload.field && typeof payload.value === "string") update({ [payload.field]: payload.value });
      state.setPendingAIResult(undefined);
    }
    if (pending.target === "worldbook" && Array.isArray(pending.payload)) {
      const targetBook = linkedWorldBook ?? activeProject.worldBooks[0];
      if (!targetBook) {
        alert("请先创建世界书。");
        return;
      }
      for (const [index, item] of (pending.payload as Array<Record<string, unknown>>).entries()) {
        const draft = normalizeWorldBookEntryCandidate(item, index);
        state.addWorldBookEntry(targetBook.id);
        const latest = getCurrentProject(useAppStore.getState())?.worldBooks.find((book) => book.id === targetBook.id)?.entries.at(-1);
        if (latest) state.updateWorldBookEntry(targetBook.id, latest.id, { ...draft, id: latest.id });
      }
      state.setPendingAIResult(undefined);
      state.setActivePage("worldbooks");
    }
  }

  function recordAIError(error: unknown) {
    const log = maybeAIInvocationLog(error);
    if (log) state.addAIInvocationLog(log);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>角色卡</h1>
          <p>编辑内部模型字段，实时预览 Character Card V2 JSON。</p>
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={state.addCharacter}>
            <Plus size={17} /> 新建
          </button>
          <label className="secondary-button">
            <FileJson size={17} /> 导入 JSON/PNG
            <input hidden type="file" accept="application/json,.json,image/png,.png" onChange={(event) => event.target.files?.[0] && importCharacterFile(event.target.files[0])} />
          </label>
        </div>
      </div>
      {importStatus && <div className="callout" style={{ marginBottom: 14 }}><pre>{importStatus}</pre></div>}
      {pendingImport && (
        <section className="panel import-preview">
          <div className="panel-title">
            <FileJson size={18} />
            <span>复杂卡只读扫描</span>
          </div>
          <div className="form-grid">
            <div className="issue warning">
              <b>{pendingImport.report.level}</b>
              <span>
                {pendingImport.report.source} / {compatibilityCardKindLabel(pendingImport.report.cardKind)} / 建议
                {pendingImport.report.suggestedMode === "light" ? "轻量制卡" : "高级工程"}
              </span>
            </div>
            <div className="trigger-meta">
              {compatibilityFeatureLabels(pendingImport.report).map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <p className="muted">
              字段完整度：{Math.round(pendingImport.report.fieldCompleteness.score * 100)}%
              {pendingImport.report.fieldCompleteness.missing.length
                ? ` / 缺失：${pendingImport.report.fieldCompleteness.missing.join(", ")}`
                : ""}
            </p>
            {pendingImport.report.dependencies.length > 0 && (
              <div className="list">
                {pendingImport.report.dependencies.slice(0, 5).map((dependency) => (
                  <div className="list-item" key={`${dependency.type}:${dependency.label}:${dependency.evidence}`}>
                    <strong>{dependency.type} / {dependency.label}</strong>
                    <span className="muted">{dependency.evidence}</span>
                  </div>
                ))}
              </div>
            )}
            <ul className="issue-list">
              {pendingImport.report.readonlyReasons.map((reason) => (
                <li className="issue warning" key={reason}>
                  <b>只读</b>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            <p className="muted">{pendingImport.report.recommendedActions.slice(0, 3).join(" / ")}</p>
            <div className="toolbar">
              <button className="primary-button" onClick={confirmPendingImport}>
                确认转换导入
              </button>
              <button className="secondary-button" onClick={() => {
                setPendingImport(undefined);
                setImportStatus("已取消复杂卡导入，现有角色未被修改。");
              }}>
                放弃导入
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="triple">
        <aside className="panel">
          <label>
            搜索角色
            <input value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="list" style={{ marginTop: 12 }}>
            {filteredCharacters.map((character) => (
              <button
                key={character.id}
                className={selected?.id === character.id ? "list-item active" : "list-item"}
                onClick={() => useAppStore.setState({ selectedCharacterId: character.id })}
              >
                <strong>{character.name || "未命名角色"}</strong>
                <span className="muted">{character.tags.join(", ") || "无标签"}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="panel">
          {!selected ? (
            <p className="muted">请新建或导入角色。</p>
          ) : (
            <div className="form-grid">
              <div className="panel-title">
                <Save size={18} />
                <span>基础信息</span>
              </div>
              <div className="form-row">
                <label>
                  name
                  <input value={selected.name} onChange={(event) => update({ name: event.target.value })} />
                </label>
                <label>
                  nickname
                  <input value={selected.nickname ?? ""} onChange={(event) => update({ nickname: event.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  tags
                  <input value={selected.tags.join(", ")} onChange={(event) => update({ tags: splitList(event.target.value) })} />
                </label>
                <label>
                  creator / version
                  <input
                    value={[selected.creator, selected.version].filter(Boolean).join(" / ")}
                    onChange={(event) => {
                      const [creator, version] = event.target.value.split("/").map((item) => item.trim());
                      update({ creator, version });
                    }}
                  />
                </label>
              </div>

              <EditorArea label="description" value={selected.description} onChange={(value) => update({ description: value })} onAI={() => runFieldOperation("description", "polish")} busy={busy === "description:polish"} />
              <EditorArea label="personality" value={selected.personality ?? ""} onChange={(value) => update({ personality: value })} onAI={() => runFieldOperation("personality", "polish")} busy={busy === "personality:polish"} />
              <EditorArea label="scenario" value={selected.scenario ?? ""} onChange={(value) => update({ scenario: value })} onAI={() => runFieldOperation("scenario", "polish")} busy={busy === "scenario:polish"} />
              <EditorArea label="first_mes" value={selected.firstMessage} onChange={(value) => update({ firstMessage: value })} onAI={() => runFieldOperation("firstMessage", "polish")} busy={busy === "firstMessage:polish"} />
              <EditorArea label="mes_example" value={selected.exampleMessages ?? ""} onChange={(value) => update({ exampleMessages: value })} onAI={() => runFieldOperation("exampleMessages", "polish")} busy={busy === "exampleMessages:polish"} />

              <div className="panel-title">
                <Sparkles size={18} />
                <span>高级字段</span>
              </div>
              <EditorArea label="system_prompt" value={selected.systemPrompt ?? ""} onChange={(value) => update({ systemPrompt: value })} onAI={() => runFieldOperation("systemPrompt", "polish")} busy={busy === "systemPrompt:polish"} />
              <EditorArea label="post_history_instructions" value={selected.postHistoryInstructions ?? ""} onChange={(value) => update({ postHistoryInstructions: value })} onAI={() => runFieldOperation("postHistoryInstructions", "polish")} busy={busy === "postHistoryInstructions:polish"} />
              <EditorArea label="creator_notes" value={selected.creatorNotes ?? ""} onChange={(value) => update({ creatorNotes: value })} onAI={() => runFieldOperation("creatorNotes", "polish")} busy={busy === "creatorNotes:polish"} />
              <label>
                alternate_greetings
                <textarea value={selected.alternateGreetings.join("\n---\n")} onChange={(event) => update({ alternateGreetings: event.target.value.split(/\n---\n/g).filter(Boolean) })} />
              </label>
              <ExtensionsEditor
                characterId={selected.id}
                extensions={selected.extensions}
                onApply={(extensions) => update({ extensions })}
              />
              <label>
                linked worldbooks
                <select
                  value={selected.linkedWorldBooks[0] ?? ""}
                  onChange={(event) => update({ linkedWorldBooks: event.target.value ? [event.target.value] : [] })}
                >
                  <option value="">不绑定</option>
                  {activeProject.worldBooks.map((book) => (
                    <option value={book.id} key={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="toolbar">
                <button className="secondary-button" onClick={() => state.duplicateCharacter(selected.id)}>
                  <Copy size={17} /> 复制
                </button>
                <button className="secondary-button" onClick={() => state.createCharacterSnapshot(selected.id, "手动快照")}>
                  创建快照
                </button>
                <button
                  className="danger-button"
                  onClick={() => window.confirm(`删除角色「${selected.name}」？`) && state.deleteCharacter(selected.id)}
                >
                  <Trash2 size={17} /> 删除
                </button>
              </div>
              <div className="panel-title">
                <FileJson size={18} />
                <span>V2 JSON 预览</span>
              </div>
              <pre className="json-preview">{v2Preview}</pre>
            </div>
          )}
        </main>

        <aside className="panel">
          <div className="panel-title">
            <Bot size={18} />
            <span>AI 制卡</span>
          </div>
          <div className="form-grid">
            <label>
              一句话灵感
              <textarea value={idea} onChange={(event) => setIdea(event.target.value)} />
            </label>
            <button className="primary-button" onClick={generateDraft} disabled={busy === "generate"}>
              生成草稿
            </button>
            <button className="secondary-button" onClick={splitWorldBook} disabled={busy === "worldbook"}>
              拆分世界书建议
            </button>
            {state.pendingAIResult && (
              <div className="callout">
                <strong>{state.pendingAIResult.label}</strong>
                <pre>{state.pendingAIResult.raw}</pre>
                <div className="toolbar">
                  <button className="primary-button" onClick={applyAIResult}>
                    应用
                  </button>
                  <button className="secondary-button" onClick={() => state.setPendingAIResult(undefined)}>
                    放弃
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="panel-title" style={{ marginTop: 16 }}>
            <Sparkles size={18} />
            <span>字段操作</span>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>
                字段
                <select value={selectedFieldKey} onChange={(event) => setSelectedFieldKey(event.target.value as TextFieldKey)}>
                  {textFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                操作
                <select value={fieldOperation} onChange={(event) => setFieldOperation(event.target.value as FieldOperation)}>
                  {fieldOperations.map((operation) => (
                    <option key={operation.id} value={operation.id}>
                      {operation.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="secondary-button" onClick={() => runFieldOperation()} disabled={Boolean(busy)}>
              <Sparkles size={16} /> 执行字段操作
            </button>
            <div className="toolbar">
              {fieldOperations.slice(2).map((operation) => (
                <button
                  className="ghost-button"
                  key={operation.id}
                  onClick={() => runFieldOperation(selectedFieldKey, operation.id)}
                  disabled={Boolean(busy)}
                >
                  {operation.label}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-title" style={{ marginTop: 16 }}>
            <Sparkles size={18} />
            <span>质量检查</span>
          </div>
          {tokenBreakdown && (
            <section className="panel compact">
              <div className="panel-title">Token 估算</div>
              <div className="metric-row">
                <span>总计</span>
                <strong>{tokenBreakdown.total}</strong>
              </div>
              {tokenBreakdown.sections
                .filter((section) => section.tokens > 0)
                .sort((a, b) => b.tokens - a.tokens)
                .slice(0, 8)
                .map((section) => (
                  <div className="metric-row" key={section.id}>
                    <span>{section.label}</span>
                    <strong>{section.tokens}</strong>
                  </div>
                ))}
            </section>
          )}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <button className="secondary-button" onClick={runAIQualityCheck} disabled={busy === "validateCard"}>
              AI 检查问题
            </button>
          </div>
          {issues.length ? (
            <ul className="issue-list">
              {issues.map((issue) => (
                <li className={`issue ${issue.level}`} key={issue.id}>
                  <b>{issue.level}</b>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">当前角色没有明显问题。</p>
          )}
          {aiQualityIssues.length > 0 && (
            <>
              <p className="muted">AI 质检结果</p>
              <ul className="issue-list">
                {aiQualityIssues.map((issue) => (
                  <li className={`issue ${issue.level}`} key={issue.id}>
                    <b>{issue.level}</b>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {aiQualityRaw && <pre className="json-preview" style={{ marginTop: 12 }}>{aiQualityRaw}</pre>}

          <div className="panel-title" style={{ marginTop: 16 }}>
            <FileJson size={18} />
            <span>兼容性提示</span>
          </div>
          {latestCompatibilityReport ? (
            <div className="form-grid">
              <div className={`issue ${latestCompatibilityReport.importedAsReadonly ? "warning" : "info"}`}>
                <b>{latestCompatibilityReport.level}</b>
                <span>
                  {latestCompatibilityReport.source} / {compatibilityCardKindLabel(latestCompatibilityReport.cardKind)} / 建议
                  {latestCompatibilityReport.suggestedMode === "light" ? "轻量制卡" : "高级工程"}
                </span>
              </div>
              {latestCompatibilityReport.suggestedMode !== activeProject.mode && (
                <div className="issue warning">
                  <b>模式</b>
                  <span>
                    当前项目是{activeProject.mode === "light" ? "轻量制卡" : "高级工程"}，该导入报告建议切换到
                    {latestCompatibilityReport.suggestedMode === "light" ? "轻量制卡" : "高级工程"}。
                  </span>
                </div>
              )}
              <div className="trigger-meta">
                {compatibilityFeatureLabels(latestCompatibilityReport).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <p className="muted">
                字段完整度：{Math.round(latestCompatibilityReport.fieldCompleteness.score * 100)}%
                {latestCompatibilityReport.fieldCompleteness.missing.length
                  ? ` / 缺失：${latestCompatibilityReport.fieldCompleteness.missing.join(", ")}`
                  : ""}
              </p>
              {latestCompatibilityReport.dependencies.length > 0 && (
                <div className="list">
                  {latestCompatibilityReport.dependencies.slice(0, 4).map((dependency) => (
                    <div className="list-item" key={`${dependency.type}:${dependency.label}:${dependency.evidence}`}>
                      <strong>{dependency.type} / {dependency.label}</strong>
                      <span className="muted">{dependency.evidence}</span>
                    </div>
                  ))}
                </div>
              )}
              {latestCompatibilityReport.readonlyReasons.length > 0 && (
                <ul className="issue-list">
                  {latestCompatibilityReport.readonlyReasons.slice(0, 3).map((reason) => (
                    <li className="issue warning" key={reason}>
                      <b>只读</b>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              )}
              {latestCompatibilityReport.notes.length > 0 && (
                <p className="muted">{latestCompatibilityReport.notes.slice(0, 2).join(" / ")}</p>
              )}
              <button className="secondary-button" onClick={() => state.setActivePage("advanced")}>
                查看高级报告
              </button>
            </div>
          ) : (
            <p className="muted">
              当前角色没有导入兼容报告。导入 V1/V2/V3 或 V2 PNG 后会在这里显示字段完整度和重型卡依赖线索。
            </p>
          )}

          <div className="panel-title" style={{ marginTop: 16 }}>
            <Save size={18} />
            <span>版本快照</span>
          </div>
          {selected ? (
            <div className="form-grid">
              <label>
                快照备注
                <input value={snapshotNotes} onChange={(event) => setSnapshotNotes(event.target.value)} placeholder="例如：压缩 description 前" />
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  state.createCharacterSnapshot(selected.id, snapshotNotes || "手动快照");
                  setSnapshotNotes("");
                }}
              >
                <Save size={16} /> 创建角色快照
              </button>
              <div className="list">
                {snapshots.map((snapshot) => {
                  const diff = diffSnapshotAgainstCurrent(snapshot, selected);
                  return (
                    <button
                      className={selectedSnapshot?.id === snapshot.id ? "list-item active" : "list-item"}
                      key={snapshot.id}
                      onClick={() => setSelectedSnapshotId(snapshot.id)}
                    >
                      <strong>{snapshot.label}</strong>
                      <span className="muted">{snapshot.notes || "无备注"}</span>
                      <span className="muted">差异：{summarizeDiff(diff)}</span>
                    </button>
                  );
                })}
                {!snapshots.length && <p className="muted">还没有快照。创建快照后可查看字段差异并恢复。</p>}
              </div>
              {selectedSnapshot && (
                <section className="callout">
                  <strong>{selectedSnapshot.label}</strong>
                  <p className="muted">{selectedSnapshot.notes || "无备注"}</p>
                  <div className="list">
                    {snapshotDiff.slice(0, 8).map((diff) => (
                      <div className="issue info" key={diff.field}>
                        <b>{diff.field}</b>
                        <span>
                          {shorten(diff.before)} → {shorten(diff.after)}
                        </span>
                      </div>
                    ))}
                    {!snapshotDiff.length && <p className="muted">当前内容与该快照一致。</p>}
                  </div>
                  <button
                    className="danger-button"
                    onClick={() =>
                      window.confirm(`恢复到快照「${selectedSnapshot.label}」？当前角色字段会被替换。`) &&
                      state.restoreCharacterSnapshot(selectedSnapshot.id)
                    }
                  >
                    从快照恢复
                  </button>
                </section>
              )}
            </div>
          ) : (
            <p className="muted">请先选择角色。</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function EditorArea({
  label,
  value,
  onChange,
  onAI,
  busy
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAI: () => void;
  busy: boolean;
}) {
  return (
    <label>
      <span className="toolbar" style={{ justifyContent: "space-between" }}>
        {label}
        <button type="button" className="ghost-button" onClick={onAI} disabled={busy}>
          <Sparkles size={15} /> 润色
        </button>
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ExtensionsEditor({
  characterId,
  extensions,
  onApply
}: {
  characterId: string;
  extensions: Record<string, unknown>;
  onApply: (extensions: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(() => formatExtensions(extensions));
  const [status, setStatus] = useState("");

  useEffect(() => {
    setDraft(formatExtensions(extensions));
    setStatus("");
  }, [characterId, extensions]);

  function applyDraft() {
    try {
      const parsed = JSON.parse(draft) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setStatus("extensions 必须是 JSON object。");
        return;
      }
      onApply(parsed as Record<string, unknown>);
      setDraft(JSON.stringify(parsed, null, 2));
      setStatus("extensions 已应用。");
    } catch (error) {
      setStatus(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <label>
      <span className="toolbar" style={{ justifyContent: "space-between" }}>
        extensions
        <span className="toolbar">
          <button type="button" className="ghost-button" onClick={() => setDraft(formatExtensions(extensions))}>
            重置
          </button>
          <button type="button" className="secondary-button" onClick={applyDraft}>
            应用 JSON
          </button>
        </span>
      </span>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={applyDraft}
        spellCheck={false}
        style={{ minHeight: 180, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
      />
      {status && <span className={status.includes("失败") || status.includes("必须") ? "field-error" : "muted"}>{status}</span>}
    </label>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function fieldOperationLabel(operation: FieldOperation): string {
  return fieldOperations.find((item) => item.id === operation)?.label ?? operation;
}

function fieldOperationInstruction(operation: FieldOperation): string {
  const instructions: Record<FieldOperation, string> = {
    generate: "根据角色卡上下文生成该字段。只输出字段正文，不输出解释，不替 {{user}} 行动。",
    polish: "润色为更自然、沉浸、简洁的表达。只输出字段正文，不输出解释。",
    shorten: "在保留关键信息和人格稳定性的前提下缩短到约 60%。只输出字段正文。",
    expand: "扩写细节，补足感官、动机或场景信息，但不要堆砌世界观。只输出字段正文。",
    natural: "改为更自然的中文表达，减少模板感和重复句式。只输出字段正文。",
    concise: "改为更简洁、低 token 的版本，保留核心设定。只输出字段正文。",
    immersive: "改为更沉浸、更适合角色扮演的版本，不替 {{user}} 行动。只输出字段正文。"
  };
  return instructions[operation];
}

function characterContext(character: InternalCharacter): string {
  return [
    `name: ${character.name}`,
    `description: ${character.description}`,
    `personality: ${character.personality ?? ""}`,
    `scenario: ${character.scenario ?? ""}`,
    `first_mes: ${character.firstMessage}`,
    `mes_example: ${character.exampleMessages ?? ""}`,
    `system_prompt: ${character.systemPrompt ?? ""}`,
    `post_history_instructions: ${character.postHistoryInstructions ?? ""}`,
    `creator_notes: ${character.creatorNotes ?? ""}`,
    `tags: ${character.tags.join(", ")}`
  ].join("\n");
}

function formatExtensions(extensions: Record<string, unknown>): string {
  return JSON.stringify(extensions ?? {}, null, 2);
}

function shorten(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 80)}...` : compact || "(空)";
}

function compatibilityCardKindLabel(kind: CompatibilityReport["cardKind"]): string {
  const labels: Record<CompatibilityReport["cardKind"], string> = {
    light: "轻量卡",
    medium: "中型卡",
    heavy: "重型卡",
    unknown: "未知类型"
  };
  return labels[kind];
}

function compatibilityFeatureLabels(report: CompatibilityReport): string[] {
  const labels: string[] = [`格式：${report.detected.format}`];
  if (report.detected.embeddedWorldBook) labels.push("内嵌世界书");
  if (report.detected.regex) labels.push("正则");
  if (report.detected.mvu) labels.push("MVU / 变量");
  if (report.detected.scripts) labels.push("脚本");
  if (report.detected.frontend) labels.push("前端 UI");
  if (report.detected.extensions) labels.push("扩展字段");
  return labels.length ? labels : ["未检测到重型依赖"];
}

function isPngFile(file: File): boolean {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}
