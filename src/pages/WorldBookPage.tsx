import { Bot, BookOpen, Copy, FileJson, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { extractWorldBookEntriesWithAI } from "../core/ai/operations";
import { maybeAIInvocationLog } from "../core/ai/logging";
import { resolveAIForTask } from "../core/ai/presets";
import { toWorldBookJson, prettyJson } from "../core/exporter/character";
import { checkWorldBookQuality } from "../core/quality/checks";
import { diffWorldBookSnapshotAgainstCurrent, summarizeDiff } from "../core/version/diff";
import { analyzeWorldBookTrigger } from "../core/worldbook/trigger";
import { categoryLabel, classifyWorldBookEntry, worldBookCategories } from "../core/worldbook/classify";
import { normalizeWorldBookEntryCandidate } from "../core/worldbook/normalize";
import { extractWorldBookEntriesFromText } from "../core/worldbook/textImport";
import type {
  WorldBookEntry,
  WorldBookEntryCategory,
  WorldBookEntryCondition,
  WorldBookTriggerReview,
  WorldBookTriggerStatus
} from "../core/schema/types";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { downloadTextFile, readFileAsText, safeFileName } from "../utils/file";

export function WorldBookPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [testInput, setTestInput] = useState("我在雪地里寻找月草，请药师帮忙。");
  const [categoryFilter, setCategoryFilter] = useState<WorldBookEntryCategory | "all">("all");
  const [sourceText, setSourceText] = useState("雾城被灰雾包围，钟塔每日三次敲响净雾钟。失灯者会避开钟声。巡夜人不能在没有证据时伤害平民。");
  const [extractionRaw, setExtractionRaw] = useState("");
  const [extractionError, setExtractionError] = useState("");
  const [extractedEntries, setExtractedEntries] = useState<WorldBookEntry[]>([]);
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [busy, setBusy] = useState(false);
  if (!project) return null;
  const activeProject = project;
  const worldBook = activeProject.worldBooks.find((book) => book.id === state.selectedWorldBookId) ?? activeProject.worldBooks[0];
  const selectedEntry = worldBook?.entries.find((entry) => entry.id === state.selectedWorldBookEntryId) ?? worldBook?.entries[0];
  const visibleEntries = worldBook?.entries.filter((entry) => categoryFilter === "all" || (entry.category ?? "other") === categoryFilter) ?? [];
  const categoryCounts = useMemo(() => summarizeCategories(worldBook?.entries ?? []), [worldBook?.entries]);
  const triggerAnalysis = useMemo(
    () => analyzeWorldBookTrigger(worldBook, testInput, activeProject.advanced.variableSystem.state),
    [activeProject.advanced.variableSystem.state, worldBook, testInput]
  );
  const triggered = triggerAnalysis.triggeredEntries;
  const budgetExcluded = triggerAnalysis.reviewedEntries.filter((entry) => entry.status === "excluded_by_budget");
  const skippedReviews = triggerAnalysis.reviewedEntries.filter((entry) => entry.status !== "triggered");
  const issues = worldBook ? checkWorldBookQuality(worldBook) : [];
  const snapshots = worldBook
    ? activeProject.versions.filter((version) => version.targetType === "worldbook" && version.targetId === worldBook.id)
    : [];
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0];
  const snapshotDiff = worldBook && selectedSnapshot ? diffWorldBookSnapshotAgainstCurrent(selectedSnapshot, worldBook) : [];

  async function importBook(file: File) {
    try {
      const text = await readFileAsText(file);
      state.importWorldBook(JSON.parse(text), file.name);
      setImportStatus(`已导入世界书 JSON：${file.name}`);
    } catch (error) {
      setImportStatus(`世界书导入失败：${error instanceof Error ? error.message : String(error)}。现有世界书未被修改。`);
    }
  }

  async function importSourceText(file: File) {
    try {
      const text = await readFileAsText(file);
      setSourceText(text);
      splitSourceText(text, file.name);
      setImportStatus(`已读取长设定文本：${file.name}。请检查右侧条目草案后应用。`);
    } catch (error) {
      setImportStatus(`文本导入失败：${error instanceof Error ? error.message : String(error)}。现有世界书未被修改。`);
    }
  }

  function updateEntry(patch: Partial<WorldBookEntry>) {
    if (!worldBook || !selectedEntry) return;
    state.updateWorldBookEntry(worldBook.id, selectedEntry.id, patch);
  }

  function resolveTaskAI(taskType: string) {
    return resolveAIForTask({
      providers: activeProject.aiProviders,
      presets: activeProject.aiPresets,
      taskType,
      selectedProviderId: state.selectedProviderId
    });
  }

  async function extractEntries() {
    const { provider, preset } = resolveTaskAI("worldBookSuggest");
    if (!provider) return alert("请先在 AI 设置页添加 Provider。");
    if (!sourceText.trim()) return alert("请先粘贴角色卡或长设定文本。");
    setBusy(true);
    setExtractionRaw("");
    setExtractionError("");
    setExtractedEntries([]);
    try {
      const result = await extractWorldBookEntriesWithAI(provider, sourceText, preset);
      if (result.log) state.addAIInvocationLog(result.log);
      setExtractionRaw(result.raw);
      if (result.error || !Array.isArray(result.parsed)) {
        setExtractionError(result.error ?? "AI 输出不是数组，未写入世界书。");
        return;
      }
      setExtractedEntries(result.parsed.map((item, index) => normalizeWorldBookEntryCandidate(item, index)));
    } catch (error) {
      const log = maybeAIInvocationLog(error);
      if (log) state.addAIInvocationLog(log);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function splitSourceText(text = sourceText, sourceName = "粘贴文本") {
    if (!text.trim()) return alert("请先粘贴或导入长设定文本。");
    const entries = extractWorldBookEntriesFromText(text, { sourceName });
    if (!entries.length) {
      setExtractionError("本地拆分没有得到可用条目，请补充分段、标题或更完整的设定文本。");
      setExtractedEntries([]);
      return;
    }
    setExtractedEntries(entries);
    setExtractionError("");
    setExtractionRaw(`本地拆分 ${entries.length} 条；不会调用 AI，也不会自动写入世界书。`);
  }

  function applyExtractedEntries() {
    if (!worldBook || !extractedEntries.length) return;
    for (const entry of extractedEntries) {
      state.addWorldBookEntry(worldBook.id);
      const latest = getCurrentProject(useAppStore.getState())?.worldBooks.find((book) => book.id === worldBook.id)?.entries.at(-1);
      if (latest) {
        state.updateWorldBookEntry(worldBook.id, latest.id, {
          ...entry,
          id: latest.id,
          category: entry.category ?? classifyWorldBookEntry(entry)
        });
        useAppStore.setState({ selectedWorldBookEntryId: latest.id });
      }
    }
    setExtractedEntries([]);
    setExtractionRaw("");
    setExtractionError("");
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>世界书</h1>
          <p>编辑 lorebook 条目，模拟关键词触发和插入顺序。</p>
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={state.addWorldBook}>
            <Plus size={17} /> 新建世界书
          </button>
          <label className="secondary-button">
            <FileJson size={17} /> 导入
            <input hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importBook(event.target.files[0])} />
          </label>
          <label className="secondary-button">
            <FileJson size={17} /> 导入文本设定
            <input hidden type="file" accept="text/plain,text/markdown,.txt,.md" onChange={(event) => event.target.files?.[0] && importSourceText(event.target.files[0])} />
          </label>
          {worldBook && (
            <button
              className="secondary-button"
              onClick={() => downloadTextFile(`${safeFileName(worldBook.name)}.worldbook.json`, prettyJson(toWorldBookJson(worldBook)))}
            >
              导出
            </button>
          )}
        </div>
      </div>
      {importStatus && <div className="callout" style={{ marginBottom: 14 }}><pre>{importStatus}</pre></div>}

      <div className="triple">
        <aside className="panel">
          <div className="list">
            {project.worldBooks.map((book) => (
              <button
                key={book.id}
                className={worldBook?.id === book.id ? "list-item active" : "list-item"}
                onClick={() => useAppStore.setState({ selectedWorldBookId: book.id, selectedWorldBookEntryId: book.entries[0]?.id })}
              >
                <strong>{book.name}</strong>
                <span className="muted">{book.entries.length} 条目</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="panel">
          {!worldBook ? (
            <p className="muted">请新建世界书。</p>
          ) : (
            <div className="form-grid">
              <div className="panel-title">
                <BookOpen size={18} />
                <span>世界书信息</span>
              </div>
              <div className="form-row">
                <label>
                  name
                  <input value={worldBook.name} onChange={(event) => state.updateWorldBook(worldBook.id, { name: event.target.value })} />
                </label>
                <label>
                  token budget
                  <input
                    type="number"
                    value={worldBook.tokenBudget ?? 1200}
                    onChange={(event) => state.updateWorldBook(worldBook.id, { tokenBudget: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label>
                description
                <textarea value={worldBook.description ?? ""} onChange={(event) => state.updateWorldBook(worldBook.id, { description: event.target.value })} />
              </label>

              <div className="toolbar">
                <button className="primary-button" onClick={() => state.addWorldBookEntry(worldBook.id)}>
                  <Plus size={17} /> 新建条目
                </button>
                <button
                  className="danger-button"
                  onClick={() => window.confirm(`删除世界书「${worldBook.name}」？`) && state.deleteWorldBook(worldBook.id)}
                >
                  <Trash2 size={17} /> 删除世界书
                </button>
              </div>

              <div className="panel-title">
                <span>分类视图</span>
              </div>
              <div className="toolbar">
                <button className={categoryFilter === "all" ? "tab active" : "tab"} onClick={() => setCategoryFilter("all")}>
                  全部 {worldBook.entries.length}
                </button>
                {worldBookCategories.map((category) => (
                  <button
                    className={categoryFilter === category.id ? "tab active" : "tab"}
                    key={category.id}
                    onClick={() => setCategoryFilter(category.id)}
                  >
                    {category.label} {categoryCounts[category.id] ?? 0}
                  </button>
                ))}
              </div>

              <div className="split">
                <div className="list">
                  {visibleEntries.map((entry) => (
                    <button
                      key={entry.id}
                      className={selectedEntry?.id === entry.id ? "list-item active" : "list-item"}
                      onClick={() => useAppStore.setState({ selectedWorldBookEntryId: entry.id })}
                    >
                      <strong>{entry.name || entry.comment || "未命名条目"}</strong>
                      <span className="muted">{categoryLabel(entry.category)}</span>
                      <span className="muted">{entry.keys.join(", ") || "无关键词"}</span>
                    </button>
                  ))}
                  {!visibleEntries.length && <p className="muted">该分类下暂无条目。</p>}
                </div>
                {selectedEntry && (
                  <div className="form-grid">
                    <div className="form-row">
                      <label>
                        name/comment
                        <input value={selectedEntry.name ?? ""} onChange={(event) => updateEntry({ name: event.target.value, comment: event.target.value })} />
                      </label>
                      <label>
                        position
                        <select value={selectedEntry.position} onChange={(event) => updateEntry({ position: event.target.value as WorldBookEntry["position"] })}>
                          <option value="before_char">before_char</option>
                          <option value="after_char">after_char</option>
                          <option value="at_depth">at_depth</option>
                          <option value="authors_note">authors_note</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      category
                      <select value={selectedEntry.category ?? "other"} onChange={(event) => updateEntry({ category: event.target.value as WorldBookEntryCategory })}>
                        {worldBookCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="form-row">
                      <label>
                        keys
                        <input value={selectedEntry.keys.join(", ")} onChange={(event) => updateEntry({ keys: splitList(event.target.value) })} />
                      </label>
                      <label>
                        secondary_keys
                        <input value={selectedEntry.secondaryKeys.join(", ")} onChange={(event) => updateEntry({ secondaryKeys: splitList(event.target.value) })} />
                      </label>
                    </div>
                    <label>
                      content
                      <textarea value={selectedEntry.content} onChange={(event) => updateEntry({ content: event.target.value })} />
                    </label>
                    <label>
                      变量条件
                      <textarea
                        value={formatConditionLines(selectedEntry.conditions ?? [])}
                        onChange={(event) => updateEntry({ conditions: parseConditionLines(event.target.value) })}
                        placeholder={"quests.lostLamp.state == 进行中\nplayer.hp >= 1"}
                      />
                    </label>
                    <div className="form-row">
                      <label>
                        insertion_order
                        <input type="number" value={selectedEntry.insertionOrder} onChange={(event) => updateEntry({ insertionOrder: Number(event.target.value) })} />
                      </label>
                      <label>
                        priority
                        <input type="number" value={selectedEntry.priority} onChange={(event) => updateEntry({ priority: Number(event.target.value) })} />
                      </label>
                    </div>
                    <div className="toolbar">
                      <label><input type="checkbox" checked={selectedEntry.enabled} onChange={(event) => updateEntry({ enabled: event.target.checked })} /> enabled</label>
                      <label><input type="checkbox" checked={selectedEntry.constant} onChange={(event) => updateEntry({ constant: event.target.checked })} /> constant</label>
                      <label><input type="checkbox" checked={selectedEntry.selective} onChange={(event) => updateEntry({ selective: event.target.checked })} /> selective</label>
                      <label><input type="checkbox" checked={selectedEntry.caseSensitive} onChange={(event) => updateEntry({ caseSensitive: event.target.checked })} /> case</label>
                    </div>
                    <button className="danger-button" onClick={() => state.deleteWorldBookEntry(worldBook.id, selectedEntry.id)}>
                      删除条目
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <aside className="panel">
          <div className="panel-title">
            <Bot size={18} />
            <span>AI 抽取条目</span>
          </div>
          <label>
            角色卡或长设定文本
            <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
          </label>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="secondary-button" onClick={() => splitSourceText()}>
              本地拆分条目
            </button>
            <button className="primary-button" onClick={extractEntries} disabled={busy}>
              抽取世界书条目
            </button>
            {extractedEntries.length > 0 && (
              <button className="secondary-button" onClick={applyExtractedEntries}>
                应用 {extractedEntries.length} 条
              </button>
            )}
            {(extractedEntries.length > 0 || extractionRaw) && (
              <button
                className="ghost-button"
                onClick={() => {
                  setExtractedEntries([]);
                  setExtractionRaw("");
                  setExtractionError("");
                }}
              >
                放弃
              </button>
            )}
          </div>
          {extractionError && <div className="issue warning" style={{ marginTop: 10 }}><b>解析</b><span>{extractionError}</span></div>}
          {extractedEntries.length > 0 && (
            <div className="list" style={{ marginTop: 12 }}>
              {extractedEntries.map((entry) => (
                <div className="list-item" key={entry.id}>
                  <strong>{entry.name || "AI 条目"}</strong>
                  <span className="muted">{categoryLabel(entry.category)} / keys: {entry.keys.join(", ") || "无"}</span>
                  <span className="muted">{entry.content.slice(0, 100) || "空内容"}</span>
                </div>
              ))}
            </div>
          )}
          {extractionRaw && <pre className="json-preview" style={{ marginTop: 12 }}>{extractionRaw}</pre>}

          <div className="panel-title" style={{ marginTop: 16 }}>
            <BookOpen size={18} />
            <span>触发测试</span>
          </div>
          <label>
            用户输入
            <textarea value={testInput} onChange={(event) => setTestInput(event.target.value)} />
          </label>

          <div className="trigger-metrics">
            <div className="metric-row">
              <span>Token 预算</span>
              <b>{triggerAnalysis.usedTokens} / {triggerAnalysis.tokenBudget}</b>
            </div>
            <div className="metric-row">
              <span>已插入</span>
              <b>{triggered.length}</b>
            </div>
            <div className="metric-row">
              <span>预算排除</span>
              <b>{budgetExcluded.length}</b>
            </div>
          </div>

          <div className="list" style={{ marginTop: 12 }}>
            {triggered.map((entry) => (
              <div className="list-item" key={entry.entryId}>
                <div className="trigger-card-head">
                  <strong>{entry.entryName || entry.entryId}</strong>
                  <span className="status-chip triggered">已插入</span>
                </div>
                <span className="muted">{entry.reason}: {entry.matchedKeys.join(", ")}</span>
                <div className="trigger-meta">
                  <span>{positionLabel(entry.position)}</span>
                  <span>order {entry.insertionOrder}</span>
                  <span>{entry.tokens} tokens</span>
                </div>
              </div>
            ))}
            {!triggered.length && <p className="muted">没有命中条目。</p>}
          </div>

          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>未插入 / 排除</span>
          </div>
          <div className="list">
            {skippedReviews.map((review) => (
              <TriggerReviewCard key={review.entryId} review={review} />
            ))}
            {!skippedReviews.length && <p className="muted">没有被跳过的条目。</p>}
          </div>

          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>问题检查</span>
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
            <p className="muted">世界书条目看起来可用。</p>
          )}

          <div className="panel-title" style={{ marginTop: 16 }}>
            <Save size={18} />
            <span>世界书快照</span>
          </div>
          {worldBook ? (
            <div className="form-grid">
              <label>
                快照备注
                <input value={snapshotNotes} onChange={(event) => setSnapshotNotes(event.target.value)} placeholder="例如：合并 AI 条目前" />
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  state.createWorldBookSnapshot(worldBook.id, snapshotNotes || "手动快照");
                  setSnapshotNotes("");
                }}
              >
                <Save size={16} /> 创建世界书快照
              </button>
              <div className="list">
                {snapshots.map((snapshot) => {
                  const diff = diffWorldBookSnapshotAgainstCurrent(snapshot, worldBook);
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
                {!snapshots.length && <p className="muted">还没有世界书快照。创建后可查看条目差异并恢复。</p>}
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
                    {!snapshotDiff.length && <p className="muted">当前世界书与该快照一致。</p>}
                  </div>
                  <button
                    className="danger-button"
                    onClick={() =>
                      window.confirm(`恢复到世界书快照「${selectedSnapshot.label}」？当前世界书会被替换。`) &&
                      state.restoreWorldBookSnapshot(selectedSnapshot.id)
                    }
                  >
                    从快照恢复
                  </button>
                  <button className="secondary-button" onClick={() => state.copyWorldBookSnapshotToNewWorldBook(selectedSnapshot.id)}>
                    <Copy size={16} /> 复制为新分支
                  </button>
                </section>
              )}
            </div>
          ) : (
            <p className="muted">请先选择世界书。</p>
          )}
        </aside>
      </div>
    </section>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function TriggerReviewCard({ review }: { review: WorldBookTriggerReview }) {
  return (
    <div className="list-item">
      <div className="trigger-card-head">
        <strong>{review.entryName || review.entryId}</strong>
        <span className={`status-chip ${review.status}`}>{statusLabel(review.status)}</span>
      </div>
      <span className="muted">{review.reason}</span>
      {review.matchedKeys.length > 0 && <span className="muted">命中：{review.matchedKeys.join(", ")}</span>}
      {review.missingKeys.length > 0 && <span className="muted">缺少：{review.missingKeys.join(", ")}</span>}
      <div className="trigger-meta">
        <span>{positionLabel(review.position)}</span>
        <span>order {review.insertionOrder}</span>
        <span>{review.tokens} tokens</span>
      </div>
    </div>
  );
}

function statusLabel(status: WorldBookTriggerStatus): string {
  const labels: Record<WorldBookTriggerStatus, string> = {
    triggered: "已插入",
    excluded_by_budget: "预算排除",
    disabled: "禁用",
    missed_condition: "条件未满足",
    missed_primary: "未命中",
    missed_secondary: "缺二级",
    empty_content: "空内容"
  };
  return labels[status];
}

function positionLabel(position: WorldBookEntry["position"]): string {
  const labels: Record<WorldBookEntry["position"], string> = {
    before_char: "before_char",
    after_char: "after_char",
    at_depth: "at_depth",
    authors_note: "authors_note"
  };
  return labels[position];
}

function summarizeCategories(entries: WorldBookEntry[]): Record<WorldBookEntryCategory, number> {
  const counts = Object.fromEntries(worldBookCategories.map((category) => [category.id, 0])) as Record<WorldBookEntryCategory, number>;
  for (const entry of entries) {
    counts[entry.category ?? "other"] += 1;
  }
  return counts;
}

function formatConditionLines(conditions: WorldBookEntryCondition[]): string {
  return conditions.map((condition) => `${condition.path} ${condition.operator} ${String(condition.value)}`).join("\n");
}

function parseConditionLines(text: string): WorldBookEntryCondition[] {
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseConditionLine)
    .filter((condition): condition is WorldBookEntryCondition => Boolean(condition));
}

function parseConditionLine(line: string): WorldBookEntryCondition | undefined {
  const match = line.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/);
  if (!match) return undefined;
  return {
    path: match[1].trim(),
    operator: match[2] as WorldBookEntryCondition["operator"],
    value: parseConditionValue(match[3].trim())
  };
}

function parseConditionValue(value: string): string | number | boolean {
  const trimmed = value.replace(/^['"]|['"]$/g, "");
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
}

function shorten(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 80)}...` : compact || "(空)";
}
