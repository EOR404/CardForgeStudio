import { Braces, ClipboardCheck, Code2, FileJson, FlaskConical, Package, Plus, Puzzle, ScrollText, ShieldAlert, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildFrontendSandboxPreview, type FrontendSandboxEvent } from "../core/frontend/sandbox";
import { normalizePluginManifest, pluginSafetyIssues, isPluginRunnableInCurrentVersion } from "../core/plugin-runtime/manifest";
import { runRegexPipeline } from "../core/regex/regex";
import { createFrontendPackageDraft, createPluginDraft, createRegexRuleDraft, createScriptDraft, uid } from "../core/schema/defaults";
import { applyVariableDiffs, diffVariables, parseMvuSetCommands, previewVariableDiffs } from "../core/variable-system/mvu";
import type { Asset, CardScript, CompatibilityReport, FrontendCardPackage, InternalWorldBook, PluginManifest, RegexRule, VariableSystem } from "../core/schema/types";
import { scriptSafetyIssues } from "../core/script-runtime/safety";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { readFileAsText } from "../utils/file";

type AdvancedTab = "reports" | "regex" | "variables" | "scripts" | "frontend" | "plugins";

export function AdvancedPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [tab, setTab] = useState<AdvancedTab>("reports");
  if (!project) return null;
  return (
    <section>
      <div className="page-header">
        <div>
          <h1>高级</h1>
          <p>Regex、变量、脚本、前端卡和插件入口。未知脚本与插件默认禁用。</p>
        </div>
      </div>

      <div className="tabs">
        <Tab id="reports" tab={tab} setTab={setTab} icon={<ClipboardCheck size={16} />} label="Import Reports" />
        <Tab id="regex" tab={tab} setTab={setTab} icon={<FlaskConical size={16} />} label="Regex Lab" />
        <Tab id="variables" tab={tab} setTab={setTab} icon={<Braces size={16} />} label="Variable Lab" />
        <Tab id="scripts" tab={tab} setTab={setTab} icon={<ScrollText size={16} />} label="Script Manager" />
        <Tab id="frontend" tab={tab} setTab={setTab} icon={<Code2 size={16} />} label="Frontend Sandbox" />
        <Tab id="plugins" tab={tab} setTab={setTab} icon={<Puzzle size={16} />} label="Plugin Manager" />
      </div>

      {tab === "reports" && <ImportReports />}
      {tab === "regex" && <RegexLab />}
      {tab === "variables" && <VariableLab />}
      {tab === "scripts" && <ScriptManager />}
      {tab === "frontend" && <FrontendSandbox />}
      {tab === "plugins" && <PluginManager />}
    </section>
  );
}

function ImportReports() {
  const project = getCurrentProject(useAppStore())!;
  const reports = [
    ...project.advanced.compatibilityReports,
    ...project.characters.flatMap((character) => character.compatibilityReports ?? [])
  ].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel-title">
          <ClipboardCheck size={18} />
          <span>导入扫描报告</span>
        </div>
        <div className="list">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
          {!reports.length && <p className="muted">导入 V1/V2/V3 或项目包后，这里会显示扫描结果。</p>}
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">扫描口径</div>
        <div className="list">
          <div className="list-item">
            <strong>轻量卡</strong>
            <span className="muted">核心字段较完整，无明显脚本、MVU、正则或前端依赖。</span>
          </div>
          <div className="list-item">
            <strong>中型卡</strong>
            <span className="muted">有内嵌世界书或少量高级线索，建议进入高级模式复核。</span>
          </div>
          <div className="list-item">
            <strong>重型卡</strong>
            <span className="muted">检测到多类依赖或大量世界书条目，脚本/插件/前端默认只读或沙盒预览。</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportCard({ report }: { report: CompatibilityReport }) {
  const dependencies = report.dependencies ?? [];
  const readonlyReasons = report.readonlyReasons ?? [];
  const recommendedActions = report.recommendedActions ?? report.notes ?? [];
  return (
    <article className="list-item">
      <strong>{report.source}</strong>
      <span className="muted">
        {report.detected.format} / {report.cardKind ?? "unknown"} / {report.level} / 建议：
        {report.suggestedMode === "advanced" ? "高级工程" : "轻量制卡"}
      </span>
      <div className="metric-row">
        <span>字段完整度</span>
        <strong>
          {report.fieldCompleteness?.filled ?? 0}/{report.fieldCompleteness?.total ?? 0}
        </strong>
      </div>
      {report.fieldCompleteness?.missing?.length > 0 && (
        <p className="muted">缺失字段：{report.fieldCompleteness.missing.join(", ")}</p>
      )}
      <div className="toolbar">
        {Object.entries(report.detected)
          .filter(([key, value]) => key !== "format" && Boolean(value))
          .map(([key]) => (
            <span className="tab active" key={key}>
              {key}
            </span>
          ))}
      </div>
      {dependencies.length > 0 && (
        <div className="list">
          {dependencies.map((dependency) => (
            <div className="issue info" key={`${dependency.type}-${dependency.label}`}>
              <b>{dependency.type}</b>
              <span>
                {dependency.label}: {dependency.evidence}
              </span>
            </div>
          ))}
        </div>
      )}
      {readonlyReasons.length > 0 && (
        <ul className="issue-list">
          {readonlyReasons.map((reason) => (
            <li className="issue warning" key={reason}>
              <b>只读</b>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="issue-list">
        {recommendedActions.map((action) => (
          <li className="issue info" key={action}>
            <b>建议</b>
            <span>{action}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Tab({
  id,
  tab,
  setTab,
  icon,
  label
}: {
  id: AdvancedTab;
  tab: AdvancedTab;
  setTab: (tab: AdvancedTab) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={tab === id ? "tab active" : "tab"} onClick={() => setTab(id)}>
      {icon} {label}
    </button>
  );
}

function RegexLab() {
  const state = useAppStore();
  const project = getCurrentProject(state)!;
  const [input, setInput] = useState("{{user}} 决定走向柜台，说：我要找月草。");
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const results = useMemo(() => runRegexPipeline(project.advanced.regexRules, input), [project.advanced.regexRules, input]);
  const selected =
    project.advanced.regexRules.find((rule) => rule.id === selectedRuleId) ??
    project.advanced.regexRules[0];

  function addRule() {
    const next = createRegexRuleDraft({ name: "新正则规则", pattern: "月草", replacement: "月光草" });
    state.updateProject({
      advanced: {
        ...project.advanced,
        regexRules: [...project.advanced.regexRules, next]
      }
    });
    setSelectedRuleId(next.id);
  }

  function updateRule(patch: Partial<RegexRule>) {
    if (!selected) return;
    state.updateRegexRule(selected.id, patch);
  }

  function deleteRule() {
    if (!selected) return;
    if (!window.confirm(`删除正则规则「${selected.name}」？`)) return;
    const remaining = project.advanced.regexRules.filter((rule) => rule.id !== selected.id);
    state.updateProject({
      advanced: {
        ...project.advanced,
        regexRules: remaining
      }
    });
    setSelectedRuleId(remaining[0]?.id ?? "");
  }

  return (
    <div className="split">
      <aside className="panel">
        <div className="toolbar">
          <button className="primary-button" onClick={addRule}>
            <Plus size={17} /> 新增规则
          </button>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {project.advanced.regexRules.map((rule) => (
            <button
              className={selected?.id === rule.id ? "list-item active" : "list-item"}
              key={rule.id}
              onClick={() => setSelectedRuleId(rule.id)}
            >
              <strong>{rule.name}</strong>
              <span className="muted">
                #{rule.order} / {rule.target} / {rule.enabled ? "enabled" : "disabled"}
              </span>
              <span className="muted">{rule.pattern || "未设置 pattern"}</span>
            </button>
          ))}
          {!project.advanced.regexRules.length && <p className="muted">暂无正则规则。</p>}
        </div>
      </aside>
      <main className="panel">
        {selected ? (
          <div className="form-grid">
            <div className="form-row">
              <label>
                name
                <input value={selected.name} onChange={(event) => updateRule({ name: event.target.value })} />
              </label>
              <label>
                flags
                <input value={selected.flags} onChange={(event) => updateRule({ flags: event.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                target
                <select value={selected.target} onChange={(event) => updateRule({ target: event.target.value as RegexRule["target"] })}>
                  <option value="user_input">user_input</option>
                  <option value="ai_output">ai_output</option>
                  <option value="before_prompt">before_prompt</option>
                  <option value="after_prompt">after_prompt</option>
                  <option value="before_display">before_display</option>
                  <option value="variable_extract">variable_extract</option>
                </select>
              </label>
              <label>
                order
                <input type="number" value={selected.order} onChange={(event) => updateRule({ order: Number(event.target.value) })} />
              </label>
            </div>
            <label>
              pattern
              <input value={selected.pattern} onChange={(event) => updateRule({ pattern: event.target.value })} />
            </label>
            <label>
              replacement
              <input value={selected.replacement} onChange={(event) => updateRule({ replacement: event.target.value })} />
            </label>
            <label>
              tags
              <input value={selected.tags.join(", ")} onChange={(event) => updateRule({ tags: splitList(event.target.value) })} />
            </label>
            <label>
              notes
              <textarea value={selected.notes ?? ""} onChange={(event) => updateRule({ notes: event.target.value })} />
            </label>
            <div className="toolbar">
              <label>
                <input type="checkbox" checked={selected.enabled} onChange={(event) => updateRule({ enabled: event.target.checked })} /> enabled
              </label>
              <button className="danger-button" onClick={deleteRule}>
                <Trash2 size={17} /> 删除规则
              </button>
            </div>
            <label>
              测试文本
              <textarea value={input} onChange={(event) => setInput(event.target.value)} />
            </label>
            <section>
              <div className="panel-title">流水线结果</div>
              <div className="list">
                {results.map((result, index) => (
                  <article className="list-item" key={`${result.ruleId}-${index}`}>
                    <strong>
                      {index + 1}. {result.ruleName}
                    </strong>
                    {result.error ? (
                      <span className="muted">错误：{result.error}</span>
                    ) : (
                      <span className="muted">
                        命中 {result.matched.length} 次：{result.matched.join(", ") || "无"}
                      </span>
                    )}
                    <pre>{result.before === result.after ? result.after : `${result.before}\n→\n${result.after}`}</pre>
                  </article>
                ))}
                {!results.length && <p className="muted">启用规则后，这里会按 order 展示每一步替换结果。</p>}
              </div>
            </section>
          </div>
        ) : (
          <p className="muted">请新增正则规则。</p>
        )}
      </main>
    </div>
  );
}

function VariableLab() {
  const state = useAppStore();
  const project = getCurrentProject(state)!;
  const variableSystem = project.advanced.variableSystem;
  const [json, setJson] = useState(JSON.stringify(variableSystem.state, null, 2));
  const [aiOutput, setAiOutput] = useState("_.set('relationships.lia.affection', 24)");
  const commands = parseMvuSetCommands(aiOutput);
  const commandDiffs = previewVariableDiffs(variableSystem.state, commands);
  const manualDiffs = useMemo(() => {
    try {
      return diffVariables(variableSystem.state, JSON.parse(json)).slice(0, 24);
    } catch {
      return [];
    }
  }, [json, variableSystem.state]);

  useEffect(() => {
    setJson(JSON.stringify(variableSystem.state, null, 2));
  }, [variableSystem.updatedAt]);

  function saveVariableState() {
    try {
      const parsed = JSON.parse(json);
      const variableSystem: VariableSystem = {
        ...project.advanced.variableSystem,
        state: parsed,
        history: [createVariableSnapshot("手动保存前", project.advanced.variableSystem.state), ...project.advanced.variableSystem.history].slice(0, 20),
        updatedAt: Date.now()
      };
      state.updateProject({ advanced: { ...project.advanced, variableSystem } });
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  function applyCommands() {
    if (!commands.length) return alert("没有识别到 _.set / _.assign 命令。");
    const result = applyVariableDiffs(variableSystem.state, commands);
    const nextVariableSystem: VariableSystem = {
      ...variableSystem,
      state: result.state,
      history: [createVariableSnapshot("应用 MVU 前", variableSystem.state), ...variableSystem.history].slice(0, 20),
      updatedAt: Date.now()
    };
    state.updateProject({ advanced: { ...project.advanced, variableSystem: nextVariableSystem } });
    setJson(JSON.stringify(result.state, null, 2));
  }

  function restoreSnapshot(snapshotId: string) {
    const snapshot = variableSystem.history.find((item) => item.id === snapshotId);
    if (!snapshot) return;
    if (!window.confirm(`恢复变量快照「${snapshot.label}」？当前变量状态会被替换。`)) return;
    const nextState = cloneRecord(snapshot.state);
    const nextVariableSystem: VariableSystem = {
      ...variableSystem,
      state: nextState,
      history: [createVariableSnapshot("恢复快照前", variableSystem.state), ...variableSystem.history].slice(0, 20),
      updatedAt: Date.now()
    };
    state.updateProject({ advanced: { ...project.advanced, variableSystem: nextVariableSystem } });
    setJson(JSON.stringify(nextState, null, 2));
  }

  return (
    <div className="grid-2">
      <section className="panel">
        <div className="panel-title">变量树 JSON</div>
        <label>
          state
          <textarea style={{ minHeight: 360 }} value={json} onChange={(event) => setJson(event.target.value)} />
        </label>
        {manualDiffs.length > 0 && (
          <div className="list">
            {manualDiffs.map((diff) => (
              <div className="issue info" key={diff.path}>
                <b>{diff.path}</b>
                <span>
                  {shortValue(diff.before)} → {shortValue(diff.after)}
                </span>
              </div>
            ))}
          </div>
        )}
        <button className="primary-button" onClick={saveVariableState}>保存变量状态</button>
      </section>
      <section className="panel">
        <div className="panel-title">MVU 命令识别</div>
        <label>
          AI 输出
          <textarea value={aiOutput} onChange={(event) => setAiOutput(event.target.value)} />
        </label>
        <div className="list">
          {commandDiffs.map((diff) => (
            <div className="list-item" key={diff.path}>
              <strong>{diff.path}</strong>
              <span className="muted">
                {shortValue(diff.before)} → {shortValue(diff.after)}
              </span>
            </div>
          ))}
          {!commandDiffs.length && <p className="muted">粘贴包含 _.set('path', value) 或 _.assign('path', value) 的文本后，这里会显示变量 diff。</p>}
        </div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="primary-button" onClick={applyCommands} disabled={!commands.length}>
            应用命令
          </button>
        </div>
        <div className="panel-title" style={{ marginTop: 16 }}>历史快照</div>
        <div className="list">
          {variableSystem.history.slice(0, 8).map((snapshot) => (
            <button className="list-item" key={snapshot.id} onClick={() => restoreSnapshot(snapshot.id)}>
              <strong>{snapshot.label}</strong>
              <span className="muted">{new Date(snapshot.createdAt).toLocaleString()}</span>
            </button>
          ))}
          {!variableSystem.history.length && <p className="muted">保存或应用变量更新后，会自动保留回滚快照。</p>}
        </div>
      </section>
    </div>
  );
}

function createVariableSnapshot(label: string, state: Record<string, unknown>) {
  return {
    id: uid("varsnap"),
    label,
    state: cloneRecord(state),
    createdAt: Date.now()
  };
}

function cloneRecord(state: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

function shortValue(value: unknown): string {
  const text = value === undefined ? "(未设置)" : typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function ScriptManager() {
  const state = useAppStore();
  const project = getCurrentProject(state)!;
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const script =
    project.advanced.scripts.find((item) => item.id === selectedScriptId) ??
    project.advanced.scripts[0];
  const issues = script ? scriptSafetyIssues(script) : [];

  function updateScript(patch: Partial<CardScript>) {
    if (!script) return;
    state.updateProject({
      advanced: {
        ...project.advanced,
        scripts: project.advanced.scripts.map((item) => (item.id === script.id ? { ...item, ...patch, updatedAt: Date.now() } : item))
      }
    });
  }

  function addScript() {
    const next = createScriptDraft({ name: "新脚本草案", source: "" });
    state.updateProject({
      advanced: {
        ...project.advanced,
        scripts: [...project.advanced.scripts, next]
      }
    });
    setSelectedScriptId(next.id);
  }

  function deleteScript() {
    if (!script) return;
    if (!window.confirm(`删除脚本「${script.name}」？`)) return;
    const remaining = project.advanced.scripts.filter((item) => item.id !== script.id);
    state.updateProject({
      advanced: {
        ...project.advanced,
        scripts: remaining
      }
    });
    setSelectedScriptId(remaining[0]?.id ?? "");
  }

  return (
    <div className="split">
      <aside className="panel">
        <div className="toolbar">
          <button className="primary-button" onClick={addScript}>
            <Plus size={17} /> 新增脚本
          </button>
        </div>
        <div className="list">
          {project.advanced.scripts.map((item) => (
            <button
              className={script?.id === item.id ? "list-item active" : "list-item"}
              key={item.id}
              onClick={() => setSelectedScriptId(item.id)}
            >
              <strong>{item.name}</strong>
              <span className="muted">
                {item.language} / {item.trigger} / {item.enabled ? "enabled" : "disabled"}
              </span>
            </button>
          ))}
          {!project.advanced.scripts.length && <p className="muted">暂无脚本草案。</p>}
        </div>
      </aside>
      <main className="panel">
        {script ? (
          <div className="form-grid">
            <div className="form-row">
              <label>
                name
                <input value={script.name} onChange={(event) => updateScript({ name: event.target.value })} />
              </label>
              <label>
                language
                <select value={script.language} onChange={(event) => updateScript({ language: event.target.value as CardScript["language"] })}>
                  <option value="stscript">stscript</option>
                  <option value="quick-reply">quick-reply</option>
                  <option value="javascript">javascript</option>
                  <option value="mvu">mvu</option>
                  <option value="template">template</option>
                  <option value="custom">custom</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                trigger
                <select value={script.trigger} onChange={(event) => updateScript({ trigger: event.target.value as CardScript["trigger"] })}>
                  <option value="manual">manual</option>
                  <option value="on_project_open">on_project_open</option>
                  <option value="on_card_init">on_card_init</option>
                  <option value="before_prompt_build">before_prompt_build</option>
                  <option value="after_prompt_build">after_prompt_build</option>
                  <option value="before_user_message">before_user_message</option>
                  <option value="after_user_message">after_user_message</option>
                  <option value="before_ai_response">before_ai_response</option>
                  <option value="after_ai_response">after_ai_response</option>
                  <option value="on_regex_match">on_regex_match</option>
                  <option value="on_variable_change">on_variable_change</option>
                  <option value="on_frontend_confirm">on_frontend_confirm</option>
                </select>
              </label>
              <label>
                compatibility
                <select value={script.compatibility} onChange={(event) => updateScript({ compatibility: event.target.value as CardScript["compatibility"] })}>
                  <option value="unknown">unknown</option>
                  <option value="native">native</option>
                  <option value="partial">partial</option>
                  <option value="external">external</option>
                </select>
              </label>
            </div>
            <label>
              permissions
              <input value={script.permissions.join(", ")} onChange={(event) => updateScript({ permissions: splitList(event.target.value) })} />
            </label>
            <label>
              notes
              <textarea value={script.notes ?? ""} onChange={(event) => updateScript({ notes: event.target.value })} />
            </label>
            <label>
              source
              <textarea style={{ minHeight: 320 }} value={script.source} onChange={(event) => updateScript({ source: event.target.value })} />
            </label>
            <div className="toolbar">
              <label>
                <input type="checkbox" checked={script.enabled} onChange={(event) => updateScript({ enabled: event.target.checked })} /> enabled
              </label>
              <button className="danger-button" onClick={deleteScript}>
                <Trash2 size={17} /> 删除脚本
              </button>
            </div>
            <div className="callout">
              当前版本不会执行脚本；这里只保存草案、权限和兼容性标记。
            </div>
            {issues.length > 0 && (
              <ul className="issue-list">
                {issues.map((issue) => (
                  <li className={`issue ${issue.level}`} key={issue.id}>
                    <b>{issue.level}</b>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            )}
            {!issues.length && (
              <div className="issue info">
                <b>
                  <ShieldAlert size={14} />
                </b>
                <span>未发现被禁止的权限；脚本仍不会被自动执行。</span>
              </div>
            )}
          </div>
        ) : (
          <p className="muted">请新增脚本草案。</p>
        )}
      </main>
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function suggestFrontendSandboxInput(worldBook: InternalWorldBook | undefined): string {
  const key = worldBook?.entries.flatMap((entry) => entry.keys).find((item) => item.trim());
  return key ? `我想了解${key}。` : "";
}

function assetTypeLabel(asset: Asset): string {
  return [asset.type, asset.purpose, asset.mimeType].filter(Boolean).join(" / ");
}

function FrontendSandbox() {
  const state = useAppStore();
  const project = getCurrentProject(state)!;
  const fallbackPackage = useMemo(() => createFrontendPackageDraft(), []);
  const hasPackage = project.advanced.frontendPackages.length > 0;
  const pkg = project.advanced.frontendPackages[0] ?? fallbackPackage;
  const character = project.characters.find((item) => item.id === state.selectedCharacterId) ?? project.characters[0];
  const worldBook =
    project.worldBooks.find((item) => item.id === state.selectedWorldBookId) ??
    project.worldBooks.find((item) => character?.linkedWorldBooks.includes(item.id)) ??
    project.worldBooks[0];
  const suggestedInput = useMemo(() => suggestFrontendSandboxInput(worldBook), [worldBook]);
  const [sandboxInput, setSandboxInput] = useState(suggestedInput);
  const [events, setEvents] = useState<FrontendSandboxEvent[]>([]);
  const [workerEvents, setWorkerEvents] = useState<FrontendSandboxEvent[]>([]);
  const [manifestText, setManifestText] = useState(JSON.stringify(pkg.manifest, null, 2));
  const preview = useMemo(
    () =>
      buildFrontendSandboxPreview(pkg, {
        variableState: project.advanced.variableSystem.state,
        worldBook,
        assets: project.assets,
        latestUserInput: sandboxInput
      }),
    [pkg, project.advanced.variableSystem.state, project.assets, sandboxInput, worldBook]
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as Partial<FrontendSandboxEvent> | undefined;
      if (!data || data.source !== "cardforge-frontend-sandbox" || !data.type) return;
      setEvents((items) => [data as FrontendSandboxEvent, ...items].slice(0, 24));
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    setWorkerEvents([]);
    if (!preview.workerScript) return;
    const blob = new Blob([preview.workerScript], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    worker.onmessage = (event: MessageEvent<FrontendSandboxEvent>) => {
      const data = event.data;
      if (!data || data.source !== "cardforge-frontend-worker") return;
      setWorkerEvents((items) => [data, ...items].slice(0, 12));
    };
    worker.onerror = (event) => {
      const workerEvent: FrontendSandboxEvent = {
        source: "cardforge-frontend-worker",
        type: "error",
        payload: { message: event.message || "worker parse error" },
        at: Date.now()
      };
      setWorkerEvents((items) =>
        [
          workerEvent,
          ...items
        ].slice(0, 12)
      );
    };
    return () => {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
  }, [preview.workerScript]);

  useEffect(() => {
    setManifestText(JSON.stringify(pkg.manifest, null, 2));
  }, [pkg.id]);

  useEffect(() => {
    setSandboxInput((current) => current || suggestedInput);
  }, [suggestedInput]);

  function updatePackage(patch: Partial<FrontendCardPackage>) {
    state.updateProject({
      advanced: {
        ...project.advanced,
        frontendPackages: project.advanced.frontendPackages.map((item) =>
          item.id === pkg.id ? { ...item, ...patch, updatedAt: Date.now() } : item
        )
      }
    });
  }

  function createPackage() {
    state.updateProject({
      advanced: {
        ...project.advanced,
        frontendPackages: [createFrontendPackageDraft(), ...project.advanced.frontendPackages]
      }
    });
  }

  function toggleFrontendAsset(assetId: string) {
    const current = pkg.assetIds ?? [];
    updatePackage({
      assetIds: current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]
    });
  }

  return (
    <div className="grid-2">
      <section className="panel">
        {!hasPackage && (
          <div className="list" style={{ marginBottom: 12 }}>
            <div className="list-item">
              <strong>未找到前端卡包</strong>
              <span className="muted">可以先创建一个默认沙盒草案。</span>
              <button className="secondary-button" onClick={createPackage}>
                新建前端卡包
              </button>
            </div>
          </div>
        )}
        <div className="form-grid">
          <div className="form-row">
            <label>
              name
              <input value={pkg.name} onChange={(event) => updatePackage({ name: event.target.value })} />
            </label>
            <label>
              manifest JSON
              <textarea
                value={manifestText}
                onChange={(event) => {
                  setManifestText(event.target.value);
                  try {
                    updatePackage({ manifest: JSON.parse(event.target.value) as Record<string, unknown> });
                  } catch {
                    return;
                  }
                }}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              世界书预览
              <select value={worldBook?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedWorldBookId: event.target.value })}>
                <option value="">未选择世界书</option>
                {project.worldBooks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              触发 / AI 输入
              <textarea value={sandboxInput} onChange={(event) => setSandboxInput(event.target.value)} />
            </label>
          </div>
          <div className="list">
            <div className="list-item">
              <strong>前端资源</strong>
              <span className="muted">绑定后会随前端卡导出到 frontend/assets/。</span>
              {project.assets.length ? (
                <div className="capability-grid">
                  {project.assets.map((asset) => (
                    <label className="check-field" key={asset.id}>
                      <input
                        type="checkbox"
                        checked={(pkg.assetIds ?? []).includes(asset.id)}
                        onChange={() => toggleFrontendAsset(asset.id)}
                      />
                      {asset.name} / {assetTypeLabel(asset)}
                    </label>
                  ))}
                </div>
              ) : (
                <span className="muted">资源库暂无资源。</span>
              )}
            </div>
          </div>
          <label>
            HTML
            <textarea value={pkg.html} onChange={(event) => updatePackage({ html: event.target.value })} />
          </label>
          <label>
            CSS
            <textarea value={pkg.css} onChange={(event) => updatePackage({ css: event.target.value })} />
          </label>
          <label>
            JS
            <textarea value={pkg.js} onChange={(event) => updatePackage({ js: event.target.value })} />
          </label>
          <label><input type="checkbox" checked={pkg.allowScripts} onChange={(event) => updatePackage({ allowScripts: event.target.checked })} /> 允许运行受限 JS</label>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">iframe sandbox 预览</div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div className="metric-row">
            <span>脚本模式</span>
            <strong>{preview.scriptMode === "sandboxed" ? "sandboxed" : "disabled"}</strong>
          </div>
          <div className="metric-row">
            <span>按钮</span>
            <strong>{preview.buttonLabels.length}</strong>
          </div>
          <div className="metric-row">
            <span>世界书命中</span>
            <strong>{preview.worldBookPreview.triggeredCount}</strong>
          </div>
          <div className="metric-row">
            <span>前端资源</span>
            <strong>{preview.assetPreview.linkedCount}</strong>
          </div>
          <div className="metric-row">
            <span>AI 预览 tokens</span>
            <strong>{preview.aiContentTokens}</strong>
          </div>
          <div className="metric-row">
            <span>Worker</span>
            <strong>{preview.workerMode}</strong>
          </div>
        </div>
        <div className="list" style={{ marginBottom: 12 }}>
          {preview.initialMessagePreview && (
            <div className="list-item">
              <strong>初始消息预览</strong>
              <span className="muted">{preview.initialMessagePreview}</span>
            </div>
          )}
          {preview.buttonLabels.length > 0 && (
            <div className="list-item">
              <strong>按钮标签</strong>
              <span className="muted">{preview.buttonLabels.join(", ")}</span>
            </div>
          )}
          {preview.variablePreview && (
            <div className="list-item">
              <strong>变量预览</strong>
              <pre>{preview.variablePreview.slice(0, 800)}</pre>
            </div>
          )}
          <div className="list-item">
            <strong>启用世界书条目预览</strong>
            <span className="muted">
              {preview.worldBookPreview.bookName} / {preview.worldBookPreview.usedTokens} of {preview.worldBookPreview.tokenBudget} tokens
            </span>
            {preview.worldBookPreview.entries.length ? (
              preview.worldBookPreview.entries.map((entry) => (
                <pre key={`${entry.name}-${entry.position}`}>
                  {entry.name}｜{entry.reason}｜{entry.position}｜{entry.tokens} tokens{"\n"}
                  {entry.content.slice(0, 500)}
                </pre>
              ))
            ) : (
              <span className="muted">{preview.worldBookPreview.summary}</span>
            )}
          </div>
          <div className="list-item">
            <strong>发送给 AI 的内容预览</strong>
            <span className="muted">{preview.aiContentTokens} tokens 粗估</span>
            <pre>{preview.aiContentPreview.slice(0, 1200)}</pre>
          </div>
          <div className="list-item">
            <strong>前端资源预览</strong>
            <span className="muted">
              {preview.assetPreview.linkedCount} linked
              {preview.assetPreview.missingIds.length ? ` / missing: ${preview.assetPreview.missingIds.join(", ")}` : ""}
            </span>
            {preview.assetPreview.assets.length ? (
              preview.assetPreview.assets.map((asset) => (
                <div className="list-item" key={asset.id}>
                  <strong>{asset.name}</strong>
                  <span className="muted">
                    {asset.type}
                    {asset.purpose ? ` / ${asset.purpose}` : ""}
                    {asset.mimeType ? ` / ${asset.mimeType}` : ""}
                    {asset.hasData ? " / embedded data" : " / metadata only"}
                  </span>
                  {asset.dataUrl && asset.type === "image" && (
                    <img src={asset.dataUrl} alt={asset.name} style={{ maxWidth: 140, borderRadius: 6, border: "1px solid var(--line)" }} />
                  )}
                </div>
              ))
            ) : (
              <span className="muted">未绑定前端资源。</span>
            )}
          </div>
          <div className="list-item">
            <strong>权限白名单</strong>
            <span className="muted">
              {preview.permissionAudit.declaredPermissions.length
                ? preview.permissionAudit.declaredPermissions.join(", ")
                : "未声明权限"}
            </span>
            {preview.permissionAudit.knownPermissions.length > 0 && (
              <pre>{preview.permissionAudit.knownPermissions.map((item) => `${item.id}: ${item.description}`).join("\n")}</pre>
            )}
            {preview.permissionAudit.detectedCapabilities.length > 0 && (
              <span className="muted">检测能力：{preview.permissionAudit.detectedCapabilities.join(", ")}</span>
            )}
            {preview.permissionAudit.issues.map((issue) => (
              <div key={`${issue.level}-${issue.message}`} className={`issue ${issue.level}`}>
                <strong>{issue.level}</strong>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
          <div className="list-item">
            <strong>Web Worker 预检</strong>
            <span className="muted">{preview.workerMode === "preflight" ? "脚本已在 Worker 中做隔离预检。" : "脚本未启用，Worker 预检关闭。"}</span>
            {workerEvents.map((event) => (
              <pre key={`${event.type}-${event.at}-${JSON.stringify(event.payload).slice(0, 24)}`}>
                {event.type}: {JSON.stringify(event.payload, null, 2)}
              </pre>
            ))}
          </div>
        </div>
        <iframe
          title="frontend-card-sandbox"
          sandbox={pkg.allowScripts ? "allow-scripts" : ""}
          srcDoc={preview.srcDoc}
          style={{ width: "100%", minHeight: 420, border: "1px solid var(--line)", borderRadius: 8 }}
        />
        <div className="panel-title" style={{ marginTop: 16 }}>沙盒日志</div>
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <button className="secondary-button" onClick={() => setEvents([])}>
            清空日志
          </button>
        </div>
        <div className="list">
          {events.map((event) => (
            <div className="list-item" key={`${event.type}-${event.at}-${JSON.stringify(event.payload).slice(0, 20)}`}>
              <strong>{event.type}</strong>
              <span className="muted">{new Date(event.at).toLocaleTimeString()}</span>
              <pre>{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))}
          {!events.length && <p className="muted">启用受限 JS 后，ready、click、state 和 error 会显示在这里。</p>}
        </div>
      </section>
    </div>
  );
}

function PluginManager() {
  const state = useAppStore();
  const project = getCurrentProject(state)!;
  const [selectedPluginId, setSelectedPluginId] = useState("");
  const [contributesText, setContributesText] = useState("{}");
  const plugin =
    project.advanced.plugins.find((item) => item.id === selectedPluginId) ??
    project.advanced.plugins[0];
  const issues = plugin ? pluginSafetyIssues(plugin) : [];
  const runnable = plugin ? isPluginRunnableInCurrentVersion(plugin) : false;

  useEffect(() => {
    if (plugin) {
      setContributesText(JSON.stringify(plugin.contributes ?? {}, null, 2));
    }
  }, [plugin?.id]);

  function updatePlugin(patch: Partial<PluginManifest>) {
    if (!plugin) return;
    state.updateProject({
      advanced: {
        ...project.advanced,
        plugins: project.advanced.plugins.map((item) => (item.id === plugin.id ? { ...item, ...patch } : item))
      }
    });
    if (patch.id) {
      setSelectedPluginId(patch.id);
    }
  }

  function addPlugin() {
    const next = createPluginDraft({
      id: uniquePluginId(project.advanced.plugins),
      name: "新插件草案",
      main: "",
      enabled: false,
      trusted: false,
      permissions: ["project.read"],
      contributes: {}
    });
    state.updateProject({
      advanced: {
        ...project.advanced,
        plugins: [...project.advanced.plugins, next]
      }
    });
    setSelectedPluginId(next.id);
  }

  async function importManifest(file: File) {
    try {
      const manifest = normalizePluginManifest(JSON.parse(await readFileAsText(file)));
      const next = project.advanced.plugins.some((item) => item.id === manifest.id)
        ? { ...manifest, id: uniquePluginId(project.advanced.plugins) }
        : manifest;
      state.updateProject({
        advanced: {
          ...project.advanced,
          plugins: [...project.advanced.plugins, next]
        }
      });
      setSelectedPluginId(next.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  function saveContributes() {
    if (!plugin) return;
    try {
      const parsed = JSON.parse(contributesText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        alert("contributes 必须是 JSON object。");
        return;
      }
      updatePlugin({ contributes: parsed as Record<string, unknown> });
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    }
  }

  function deletePlugin() {
    if (!plugin) return;
    if (!window.confirm(`删除插件「${plugin.name}」？`)) return;
    const remaining = project.advanced.plugins.filter((item) => item.id !== plugin.id);
    state.updateProject({
      advanced: {
        ...project.advanced,
        plugins: remaining
      }
    });
    setSelectedPluginId(remaining[0]?.id ?? "");
  }

  return (
    <div className="split">
      <aside className="panel">
        <div className="toolbar">
          <button className="primary-button" onClick={addPlugin}>
            <Plus size={17} /> 新增插件
          </button>
          <label className="secondary-button">
            <FileJson size={17} /> 导入 manifest
            <input hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && importManifest(event.target.files[0])} />
          </label>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {project.advanced.plugins.map((item) => (
            <button
              className={plugin?.id === item.id ? "list-item active" : "list-item"}
              key={item.id}
              onClick={() => setSelectedPluginId(item.id)}
            >
              <strong>
                {item.name} {item.version}
              </strong>
              <span className="muted">
                {item.enabled ? "enabled" : "disabled"} / {item.trusted ? "trusted" : "untrusted"}
              </span>
              <span className="muted">权限：{item.permissions.join(", ") || "无"}</span>
            </button>
          ))}
          {!project.advanced.plugins.length && <p className="muted">暂无插件 manifest。</p>}
        </div>
      </aside>
      <main className="panel">
        <div className="panel-title">
          <Package size={18} />
          <span>插件 Manifest 草案</span>
        </div>
        {plugin ? (
          <div className="form-grid">
            <div className="form-row">
              <label>
                id
                <input value={plugin.id} onChange={(event) => updatePlugin({ id: event.target.value.trim() || plugin.id })} />
              </label>
              <label>
                version
                <input value={plugin.version} onChange={(event) => updatePlugin({ version: event.target.value })} />
              </label>
            </div>
            <div className="form-row">
              <label>
                name
                <input value={plugin.name} onChange={(event) => updatePlugin({ name: event.target.value })} />
              </label>
              <label>
                main
                <input value={plugin.main ?? ""} onChange={(event) => updatePlugin({ main: event.target.value })} />
              </label>
            </div>
            <label>
              permissions
              <input value={plugin.permissions.join(", ")} onChange={(event) => updatePlugin({ permissions: splitList(event.target.value) })} />
            </label>
            <label>
              notes
              <textarea value={plugin.notes ?? ""} onChange={(event) => updatePlugin({ notes: event.target.value })} />
            </label>
            <label>
              contributes JSON
              <textarea style={{ minHeight: 240 }} value={contributesText} onChange={(event) => setContributesText(event.target.value)} />
            </label>
            <div className="toolbar">
              <button className="secondary-button" onClick={saveContributes}>
                应用 contributes JSON
              </button>
              <label>
                <input type="checkbox" checked={plugin.trusted} onChange={(event) => updatePlugin({ trusted: event.target.checked })} /> trusted
              </label>
              <label>
                <input type="checkbox" checked={plugin.enabled} onChange={(event) => updatePlugin({ enabled: event.target.checked })} /> enabled
              </label>
              <button className="danger-button" onClick={deletePlugin}>
                <Trash2 size={17} /> 删除插件
              </button>
            </div>
            <div className="callout">
              运行状态：{runnable ? "可运行" : "当前版本仅保存 manifest，不执行插件代码"}。禁止默认开放 apiKey.read、fs.fullAccess、shell.execute、network.fullAccess。
            </div>
            {issues.length > 0 ? (
              <ul className="issue-list">
                {issues.map((issue) => (
                  <li className={`issue ${issue.level}`} key={issue.id}>
                    <b>{issue.level}</b>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="issue info">
                <b>
                  <ShieldAlert size={14} />
                </b>
                <span>未发现被禁止的权限；插件仍不会被自动执行。</span>
              </div>
            )}
            <pre>{JSON.stringify(plugin, null, 2)}</pre>
          </div>
        ) : (
          <p className="muted">请新增或导入插件 manifest。</p>
        )}
      </main>
    </div>
  );
}

function uniquePluginId(existing: PluginManifest[]): string {
  let id = uid("plugin");
  while (existing.some((plugin) => plugin.id === id)) {
    id = uid("plugin");
  }
  return id;
}
