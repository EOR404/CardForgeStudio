import { Boxes, Clock, PackageCheck, Save, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { exportTargets, targetLabel } from "../core/exporter/report";
import { projectDashboardIssues } from "../core/quality/checks";
import { searchProject, type ProjectSearchResult } from "../core/search/search";
import type { CompatibilityTarget, ProjectTrustLevel } from "../core/schema/types";
import { projectTrustLevels, trustLevelDescription, trustLevelLabel } from "../core/security/trust";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";

export function DashboardPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [query, setQuery] = useState("");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const searchResults = useMemo(() => (project ? searchProject(project, query) : []), [project, query]);
  if (!project) return null;
  const issues = projectDashboardIssues(project);
  const projectSnapshots = project.versions.filter((version) => version.targetType === "project");
  const stats = [
    ["角色卡", project.characters.length],
    ["世界书", project.worldBooks.length],
    ["图片资源", project.assets.filter((asset) => asset.type === "image").length],
    ["测试记录", project.tests.length],
    ["AI 调用", (project.aiLogs ?? []).length],
    ["版本快照", project.versions.length],
    ["导出记录", project.exports.length],
    ["正则", project.advanced.regexRules.length],
    ["脚本", project.advanced.scripts.length]
  ];

  function openSearchResult(result: ProjectSearchResult) {
    useAppStore.setState({
      activePage: result.target.page,
      ...(result.target.selectedCharacterId ? { selectedCharacterId: result.target.selectedCharacterId } : {}),
      ...(result.target.selectedWorldBookId ? { selectedWorldBookId: result.target.selectedWorldBookId } : {}),
      ...(result.target.selectedWorldBookEntryId ? { selectedWorldBookEntryId: result.target.selectedWorldBookEntryId } : {}),
      ...(result.target.selectedAssetId ? { selectedAssetId: result.target.selectedAssetId } : {}),
      ...(result.target.selectedProviderId ? { selectedProviderId: result.target.selectedProviderId } : {})
    });
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p>{project.description || "项目仪表盘会集中显示当前工程的资产、问题和最近活动。"}</p>
        </div>
        <div className="toolbar">
          <button className="primary-button" onClick={() => state.setActivePage("characters")}>
            进入制卡
          </button>
          <button className="secondary-button" onClick={() => state.setActivePage("export")}>
            导出
          </button>
        </div>
      </div>

      <div className="grid-3">
        {stats.map(([label, value]) => (
          <section className="panel" key={label}>
            <div className="panel-title">
              <Boxes size={18} />
              <span>{label}</span>
            </div>
            <strong style={{ fontSize: 28 }}>{value}</strong>
          </section>
        ))}
      </div>

      <section className="panel search-panel" style={{ marginTop: 14 }}>
        <div className="panel-title">
          <ShieldCheck size={18} />
          <span>项目安全与兼容</span>
        </div>
        <div className="form-row">
          <label>
            默认目标平台
            <select
              value={project.compatibilityTarget}
              onChange={(event) => state.updateProject({ compatibilityTarget: event.target.value as CompatibilityTarget })}
            >
              {exportTargets.map((target) => (
                <option key={target} value={target}>
                  {targetLabel(target)}
                </option>
              ))}
            </select>
          </label>
          <label>
            信任等级
            <select
              value={project.trustLevel}
              onChange={(event) => state.updateProject({ trustLevel: event.target.value as ProjectTrustLevel })}
            >
              {projectTrustLevels.map((level) => (
                <option key={level} value={level}>
                  {trustLevelLabel(level)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="list" style={{ marginTop: 10 }}>
          <div className="issue info">
            <b>兼容</b>
            <span>
              当前默认：{targetLabel(project.compatibilityTarget)}。导出页会用它生成发布前检查、依赖说明和数据损失提示。
            </span>
          </div>
          <div className={project.trustLevel === "untrusted" ? "issue warning" : "issue info"}>
            <b>信任</b>
            <span>{trustLevelDescription(project.trustLevel)}</span>
          </div>
        </div>
      </section>

      <section className="panel search-panel" style={{ marginTop: 14 }}>
        <div className="panel-title">
          <Search size={18} />
          <span>全项目搜索</span>
        </div>
        <label>
          关键词
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索角色、世界书、资源、AI 预设、脚本、测试记录..."
          />
        </label>
        <div className="list search-results">
          {query.trim() ? (
            searchResults.length ? (
              searchResults.map((result) => (
                <button className="list-item search-result" key={result.id} onClick={() => openSearchResult(result)}>
                  <div className="search-result-head">
                    <strong>{result.title}</strong>
                    <span className="source-pill">{result.sourceLabel}</span>
                  </div>
                  {result.subtitle && <span className="muted">{result.subtitle}</span>}
                  <span className="muted">{result.excerpt}</span>
                  {result.matchedFields.length > 0 && (
                    <span className="muted">命中：{result.matchedFields.join(", ")}</span>
                  )}
                </button>
              ))
            ) : (
              <p className="muted">没有找到匹配结果。</p>
            )
          ) : (
            <p className="muted">输入关键词后，可直接跳转到角色、世界书、资源、AI、测试、导出或高级模块。</p>
          )}
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <section className="panel">
          <div className="panel-title">
            <ShieldCheck size={18} />
            <span>待处理问题</span>
          </div>
          {issues.length ? (
            <ul className="issue-list">
              {issues.map((issue) => (
                <li key={issue.id} className={`issue ${issue.level}`}>
                  <b>{issue.level}</b>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">没有发现明显问题。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-title">
            <Clock size={18} />
            <span>最近记录</span>
          </div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label>
              项目快照备注
              <input value={snapshotNotes} onChange={(event) => setSnapshotNotes(event.target.value)} placeholder="例如：导入重型卡前" />
            </label>
            <button
              className="secondary-button"
              onClick={() => {
                state.createProjectSnapshot(snapshotNotes || "手动项目快照");
                setSnapshotNotes("");
              }}
            >
              <Save size={16} /> 创建项目快照
            </button>
          </div>
          <div className="list">
            {projectSnapshots.slice(0, 3).map((snapshot) => (
              <div className="list-item" key={snapshot.id}>
                <strong>{snapshot.label}</strong>
                <span className="muted">{snapshot.notes || "无备注"}</span>
                <button
                  className="danger-button"
                  onClick={() =>
                    window.confirm(`恢复到项目快照「${snapshot.label}」？当前项目内容会被替换，但快照历史会保留。`) &&
                    state.restoreProjectSnapshot(snapshot.id)
                  }
                >
                  恢复项目
                </button>
              </div>
            ))}
            {project.exports.slice(0, 4).map((record) => (
              <div className="list-item" key={record.id}>
                <strong>{record.format}</strong>
                <span className="muted">{new Date(record.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {project.versions.slice(0, 4).map((version) => (
              <div className="list-item" key={version.id}>
                <strong>{version.label}</strong>
                <span className="muted">{version.notes || "无备注"}</span>
              </div>
            ))}
            {!project.exports.length && !project.versions.length && (
              <div className="callout">
                <PackageCheck size={18} />
                <p>创建快照或导出文件后，这里会显示历史。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
