import { Bot, Plus, Trash2, Wifi } from "lucide-react";
import { useState } from "react";
import { summarizeAILogs } from "../core/ai/cost";
import { maybeAIInvocationLog, runLoggedCompletion } from "../core/ai/logging";
import { sanitizeSensitiveHeaders, sensitiveHeaderKeys } from "../core/security/sensitive";
import type { AICapability, AIProviderConfig, AIPreset } from "../core/schema/types";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";

const CAPABILITY_OPTIONS: Array<{ id: AICapability; label: string }> = [
  { id: "chat", label: "chat" },
  { id: "json", label: "json" },
  { id: "vision", label: "vision" },
  { id: "image-generation", label: "image-generation" },
  { id: "embeddings", label: "embeddings" },
  { id: "tools", label: "tools" },
  { id: "streaming", label: "streaming" }
];

export function AISettingsPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [status, setStatus] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  if (!project) return null;
  const activeProject = project;
  const provider = activeProject.aiProviders.find((item) => item.id === state.selectedProviderId) ?? activeProject.aiProviders[0];
  const selectedPreset =
    activeProject.aiPresets.find((preset) => preset.id === selectedPresetId) ?? activeProject.aiPresets[0];
  const aiLogs = activeProject.aiLogs ?? [];
  const aiLogSummary = summarizeAILogs(aiLogs);
  const sensitiveHeaders = sensitiveHeaderKeys(provider?.headers);

  function updateProvider(patch: Partial<AIProviderConfig>) {
    if (!provider) return;
    state.upsertProvider(provider.id, patch as Record<string, unknown>);
  }

  function updateDefaultParams(patch: Partial<AIProviderConfig["defaultParams"]>) {
    if (!provider) return;
    updateProvider({ defaultParams: { ...provider.defaultParams, ...patch } });
  }

  function toggleCapability(capability: AICapability, enabled: boolean) {
    if (!provider) return;
    const capabilities = new Set(provider.capabilities);
    if (enabled) capabilities.add(capability);
    else capabilities.delete(capability);
    updateProvider({ capabilities: [...capabilities] });
  }

  function updatePreset(patch: Partial<AIPreset>) {
    if (!selectedPreset) return;
    state.updatePreset(selectedPreset.id, patch);
  }

  function updatePresetParams(patch: NonNullable<AIPreset["paramsOverride"]>) {
    if (!selectedPreset) return;
    updatePreset({ paramsOverride: { ...(selectedPreset.paramsOverride ?? {}), ...patch } });
  }

  async function test() {
    if (!provider) return;
    setStatus("测试中...");
    try {
      const { content: text, log } = await runLoggedCompletion(
        provider,
        [
          { role: "system", content: "You are a connectivity test. Reply with OK." },
          { role: "user", content: "Return OK only." }
        ],
        "providerTest",
        { maxTokens: 32, temperature: 0 }
      );
      state.addAIInvocationLog(log);
      setStatus(`连接成功：${text.slice(0, 120)}`);
    } catch (error) {
      const log = maybeAIInvocationLog(error);
      if (log) state.addAIInvocationLog(log);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function clearProviderSecrets() {
    if (!provider) return;
    const nextHeaders = sanitizeSensitiveHeaders(provider.headers);
    updateProvider({ apiKey: "", headers: nextHeaders });
    const clearedHeaders = sensitiveHeaderKeys(provider.headers);
    setStatus(
      clearedHeaders.length
        ? `已清除 API Key，并清空敏感 headers：${clearedHeaders.join(", ")}`
        : "已清除 API Key。"
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>AI 设置</h1>
          <p>配置 OpenAI-compatible Provider；Key 只保存在本地，不会进入项目导出。</p>
        </div>
        <button
          className="primary-button"
          onClick={() =>
            state.upsertProvider(undefined, {
              name: "New Provider",
              baseUrl: "https://api.openai.com/v1",
              defaultModel: "gpt-4o-mini",
              maxTokens: 1200,
              temperature: 0.7
            })
          }
        >
          <Plus size={17} /> 新增 Provider
        </button>
      </div>

      <div className="split">
        <aside className="panel">
          <div className="list">
            {activeProject.aiProviders.map((item) => (
              <button
                key={item.id}
                className={provider?.id === item.id ? "list-item active" : "list-item"}
                onClick={() => useAppStore.setState({ selectedProviderId: item.id })}
              >
                <strong>{item.name}</strong>
                <span className="muted">{item.defaultModel}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="panel">
          {provider ? (
            <div className="form-grid">
              <div className="panel-title">
                <Bot size={18} />
                <span>Provider</span>
              </div>
              <div className="form-row">
                <label>
                  name
                  <input value={provider.name} onChange={(event) => updateProvider({ name: event.target.value })} />
                </label>
                <label>
                  type
                  <select value={provider.providerType} onChange={(event) => updateProvider({ providerType: event.target.value as AIProviderConfig["providerType"] })}>
                    <option value="openai-compatible">OpenAI-compatible</option>
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                    <option value="ollama">Ollama</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
              </div>
              <label>
                baseUrl
                <input value={provider.baseUrl} onChange={(event) => updateProvider({ baseUrl: event.target.value })} />
              </label>
              <div className="form-row">
                <label>
                  apiKey
                  <input type="password" value={provider.apiKey ?? ""} onChange={(event) => updateProvider({ apiKey: event.target.value })} />
                </label>
                <label>
                  model
                  <input value={provider.defaultModel} onChange={(event) => updateProvider({ defaultModel: event.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label>
                  temperature
                  <input
                    type="number"
                    step="0.1"
                    value={provider.defaultParams.temperature ?? 0.7}
                    onChange={(event) =>
                      updateDefaultParams({ temperature: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  maxTokens
                  <input
                    type="number"
                    value={provider.defaultParams.maxTokens ?? 1200}
                    onChange={(event) =>
                      updateDefaultParams({ maxTokens: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  topP
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    value={provider.defaultParams.topP ?? 1}
                    onChange={(event) => updateDefaultParams({ topP: Number(event.target.value) })}
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={provider.defaultParams.stream ?? false}
                    onChange={(event) => updateDefaultParams({ stream: event.target.checked })}
                  />
                  <span>stream</span>
                </label>
              </div>
              <label>
                models
                <textarea
                  value={listToText(provider.models ?? [])}
                  onChange={(event) => updateProvider({ models: parseList(event.target.value) })}
                  placeholder="gpt-4o-mini&#10;gpt-4o"
                />
              </label>
              <label>
                headers
                <textarea
                  key={`${provider.id}-headers-${headersToText(provider.headers ?? {})}`}
                  defaultValue={headersToText(provider.headers ?? {})}
                  onBlur={(event) => updateProvider({ headers: parseHeaders(event.target.value) })}
                  placeholder="X-Provider-Feature: enabled&#10;HTTP-Referer: https://example.local"
                />
              </label>
              {sensitiveHeaders.length > 0 && (
                <div className="issue warning">
                  <b>敏感 header</b>
                  <span>
                    检测到 {sensitiveHeaders.join(", ")}。项目导出会清空这些字段，也可以点击“清除 Key/敏感 headers”立即清除。
                  </span>
                </div>
              )}
              <div className="capability-grid">
                {CAPABILITY_OPTIONS.map((capability) => (
                  <label className="check-field" key={capability.id}>
                    <input
                      type="checkbox"
                      checked={provider.capabilities.includes(capability.id)}
                      onChange={(event) => toggleCapability(capability.id, event.target.checked)}
                    />
                    <span>{capability.label}</span>
                  </label>
                ))}
              </div>
              <div className="toolbar">
                <button className="primary-button" onClick={test}>
                  <Wifi size={17} /> 测试连接
                </button>
                <button className="secondary-button" onClick={clearProviderSecrets}>
                  清除 Key/敏感 headers
                </button>
                <button
                  className="danger-button"
                  onClick={() => window.confirm(`删除 Provider「${provider.name}」？`) && state.removeProvider(provider.id)}
                >
                  <Trash2 size={17} /> 删除
                </button>
              </div>
              {status && <div className="callout"><pre>{status}</pre></div>}
              <section className="panel">
                <div className="panel-title">AI 调用日志</div>
                <div className="grid-4">
                  <div className="metric-row">
                    <span>总调用</span>
                    <strong>{aiLogSummary.totalCalls}</strong>
                  </div>
                  <div className="metric-row">
                    <span>成功率</span>
                    <strong>{aiLogSummary.successRate}%</strong>
                  </div>
                  <div className="metric-row">
                    <span>今日费用</span>
                    <strong>${aiLogSummary.todayCostUsd.toFixed(6)}</strong>
                  </div>
                  <div className="metric-row">
                    <span>粗估费用</span>
                    <strong>${aiLogSummary.totalCostUsd.toFixed(6)}</strong>
                  </div>
                </div>
                {aiLogSummary.byProvider.length > 0 && (
                  <>
                    <div className="panel-title" style={{ marginTop: 12 }}>Provider 成本对比</div>
                    <div className="list">
                      {aiLogSummary.byProvider.map((item) => (
                        <div className="list-item" key={item.providerId}>
                          <strong>{item.providerName}</strong>
                          <span className="muted">
                            {item.calls} 次 / 成功 {item.calls ? Math.round((item.successes / item.calls) * 100) : 0}% / {item.totalTokens} tokens / 平均 {item.averageDurationMs}ms
                          </span>
                          <span className="muted">粗估费用 ${item.totalCostUsd.toFixed(6)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="list" style={{ marginTop: 12 }}>
                  {aiLogs.slice(0, 12).map((log) => (
                    <div className="list-item" key={log.id}>
                      <strong>
                        {log.taskType} / {log.model}
                      </strong>
                      <span className="muted">
                        {log.success ? "success" : "error"} / {log.totalTokens} tokens / {log.durationMs}ms / ${log.estimatedCostUsd.toFixed(6)}
                      </span>
                      <span className="muted">
                        {new Date(log.createdAt).toLocaleString()} / {log.providerName}
                      </span>
                      {log.errorMessage && <span className="muted">错误：{log.errorMessage}</span>}
                      {log.rawOutput && <pre>{log.rawOutput.slice(0, 600)}</pre>}
                    </div>
                  ))}
                  {!aiLogs.length && <p className="muted">调用 Provider 后，这里会显示任务、模型、token、耗时和原始输出摘要。</p>}
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">AI 预设</div>
                <div className="split">
                  <aside>
                    <div className="toolbar" style={{ marginBottom: 10 }}>
                      <button className="secondary-button" onClick={() => state.addPreset()}>
                        <Plus size={16} /> 新增
                      </button>
                      {selectedPreset && (
                        <button className="secondary-button" onClick={() => state.duplicatePreset(selectedPreset.id)}>
                          复制
                        </button>
                      )}
                    </div>
                    <div className="list">
                      {activeProject.aiPresets.map((preset) => (
                        <button
                          className={selectedPreset?.id === preset.id ? "list-item active" : "list-item"}
                          key={preset.id}
                          onClick={() => setSelectedPresetId(preset.id)}
                        >
                          <strong>{preset.name}</strong>
                          <span className="muted">{preset.taskType} / {preset.outputMode}</span>
                        </button>
                      ))}
                    </div>
                  </aside>
                  <main>
                    {selectedPreset ? (
                      <div className="form-grid">
                        <div className="form-row">
                          <label>
                            name
                            <input value={selectedPreset.name} onChange={(event) => updatePreset({ name: event.target.value })} />
                          </label>
                          <label>
                            taskType
                            <select value={selectedPreset.taskType} onChange={(event) => updatePreset({ taskType: event.target.value })}>
                              <option value="generateCharacter">generateCharacter</option>
                              <option value="rewriteField">rewriteField</option>
                              <option value="worldBookSuggest">worldBookSuggest</option>
                              <option value="validateCard">validateCard</option>
                              <option value="testChat">testChat</option>
                              <option value="diagnoseTest">diagnoseTest</option>
                              <option value="custom">custom</option>
                            </select>
                          </label>
                        </div>
                        <label>
                          description
                          <input value={selectedPreset.description ?? ""} onChange={(event) => updatePreset({ description: event.target.value })} />
                        </label>
                        <div className="form-row">
                          <label>
                            provider route
                            <select value={selectedPreset.providerId ?? ""} onChange={(event) => updatePreset({ providerId: event.target.value })}>
                              <option value="">使用当前 Provider</option>
                              {activeProject.aiProviders.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            model override
                            <input value={selectedPreset.modelOverride ?? ""} onChange={(event) => updatePreset({ modelOverride: event.target.value })} />
                          </label>
                        </div>
                        <div className="form-row">
                          <label>
                            outputMode
                            <select value={selectedPreset.outputMode} onChange={(event) => updatePreset({ outputMode: event.target.value as AIPreset["outputMode"] })}>
                              <option value="json">json</option>
                              <option value="plain_text">plain_text</option>
                              <option value="markdown">markdown</option>
                              <option value="yaml">yaml</option>
                              <option value="custom">custom</option>
                            </select>
                          </label>
                          <label>
                            temperature override
                            <input
                              type="number"
                              step="0.1"
                              value={selectedPreset.paramsOverride?.temperature ?? 0.7}
                              onChange={(event) => updatePresetParams({ temperature: Number(event.target.value) })}
                            />
                          </label>
                        </div>
                        <div className="form-row">
                          <label>
                            topP override
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.05"
                              value={selectedPreset.paramsOverride?.topP ?? 1}
                              onChange={(event) => updatePresetParams({ topP: Number(event.target.value) })}
                            />
                          </label>
                          <label>
                            maxTokens
                            <input
                              type="number"
                              value={selectedPreset.paramsOverride?.maxTokens ?? 1200}
                              onChange={(event) => updatePresetParams({ maxTokens: Number(event.target.value) })}
                            />
                          </label>
                        </div>
                        <label>
                          systemPrompt
                          <textarea value={selectedPreset.systemPrompt} onChange={(event) => updatePreset({ systemPrompt: event.target.value })} />
                        </label>
                        <label>
                          userPromptTemplate
                          <textarea value={selectedPreset.userPromptTemplate} onChange={(event) => updatePreset({ userPromptTemplate: event.target.value })} />
                        </label>
                        <label>
                          variables
                          <textarea
                            value={variablesToText(selectedPreset)}
                            onChange={(event) => updatePreset({ variables: parseVariables(event.target.value) })}
                          />
                        </label>
                        <div className="toolbar">
                          <button
                            className="danger-button"
                            disabled={activeProject.aiPresets.length <= 1}
                            onClick={() => {
                              state.deletePreset(selectedPreset.id);
                              setSelectedPresetId("");
                            }}
                          >
                            <Trash2 size={16} /> 删除预设
                          </button>
                        </div>
                        <p className="muted">
                          制卡页会按 taskType 自动使用这些预设；provider route 可让不同任务走不同 Provider。
                        </p>
                      </div>
                    ) : (
                      <p className="muted">还没有 AI 预设。</p>
                    )}
                  </main>
                </div>
              </section>
            </div>
          ) : (
            <p className="muted">请新增 Provider。</p>
          )}
        </main>
      </div>
    </section>
  );
}

function variablesToText(preset: AIPreset): string {
  return preset.variables
    .map((variable) => `${variable.key}=${variable.label}${variable.required ? " *" : ""}`)
    .join("\n");
}

function parseVariables(text: string): AIPreset["variables"] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const required = /\*$/.test(line);
      const clean = line.replace(/\*$/, "").trim();
      const [key, label] = clean.split("=").map((item) => item.trim());
      return {
        key,
        label: label || key,
        required
      };
    })
    .filter((variable) => variable.key);
}

function listToText(items: string[]): string {
  return items.join("\n");
}

function parseList(text: string): string[] {
  return text
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function headersToText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function parseHeaders(text: string): Record<string, string> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return headers;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && value) headers[key] = value;
      return headers;
    }, {});
}
