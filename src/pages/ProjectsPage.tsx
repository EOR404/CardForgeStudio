import { Copy, FolderOpen, Import, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { exampleProjects } from "../core/examples/exampleProjects";
import { sanitizeProjectForExport, prettyJson } from "../core/exporter/character";
import { exportProjectPackage, importProjectPackage } from "../core/project/package";
import type { CardProject } from "../core/schema/types";
import {
  isFileSystemAccessSupported,
  openProjectFromPickedDirectory,
  saveProjectToPickedDirectory
} from "../storage/BrowserFileSystemStorage";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { downloadBytesFile, downloadTextFile, readFileAsArrayBuffer, readFileAsText, safeFileName } from "../utils/file";

export function ProjectsPage() {
  const state = useAppStore();
  const current = getCurrentProject(state);
  const [name, setName] = useState("新 CardForge 项目");
  const [mode, setMode] = useState<"light" | "advanced">("light");
  const [storageStatus, setStorageStatus] = useState("");

  async function importProjectFile(file: File) {
    try {
      if (file.name.endsWith(".zip") || file.name.endsWith(".cardforge.zip")) {
        const buffer = await readFileAsArrayBuffer(file);
        state.importProject(importProjectPackage(new Uint8Array(buffer)));
        setStorageStatus(`已导入项目包：${file.name}`);
        return;
      }
      const text = await readFileAsText(file);
      state.importProject(JSON.parse(text) as CardProject);
      setStorageStatus(`已导入项目 JSON：${file.name}`);
    } catch (error) {
      setStorageStatus(`导入失败：${error instanceof Error ? error.message : String(error)}。现有项目未被修改。`);
    }
  }

  function exportPackage(project: CardProject) {
    const bytes = exportProjectPackage(project);
    downloadBytesFile(`${safeFileName(project.name)}.cardforge.zip`, bytes, "application/zip");
  }

  async function saveFolder(project: CardProject) {
    try {
      const result = await saveProjectToPickedDirectory(project);
      setStorageStatus(`已保存「${result.projectName}」到项目文件夹，共 ${result.fileCount} 个文件。`);
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function openFolder() {
    try {
      const project = await openProjectFromPickedDirectory();
      state.importProject(project);
      setStorageStatus(`已从项目文件夹打开：${project.name}`);
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>项目</h1>
          <p>本地优先的角色卡工程；第一版使用浏览器存储，并支持项目 JSON 备份迁移。</p>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-title">
            <Plus size={18} />
            <span>新建项目</span>
          </div>
          <div className="form-grid">
            <label>
              项目名称
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              模式
              <select value={mode} onChange={(event) => setMode(event.target.value as "light" | "advanced")}>
                <option value="light">轻量制卡</option>
                <option value="advanced">高级工程</option>
              </select>
            </label>
            <button className="primary-button" onClick={() => state.createProject(name, mode)}>
              <Plus size={17} /> 新建
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">
            <Import size={18} />
            <span>导入 / 备份</span>
          </div>
          <div className="form-grid">
            <label>
              导入项目 JSON
              <input type="file" accept="application/json,.json,.zip,.cardforge.zip,application/zip" onChange={(event) => event.target.files?.[0] && importProjectFile(event.target.files[0])} />
            </label>
            <div className="form-row">
              <button
                className="secondary-button"
                disabled={!current || !isFileSystemAccessSupported()}
                onClick={() => current && saveFolder(current)}
              >
                保存到项目文件夹
              </button>
              <button
                className="secondary-button"
                disabled={!isFileSystemAccessSupported()}
                onClick={openFolder}
              >
                打开项目文件夹
              </button>
            </div>
            <button
              className="secondary-button"
              disabled={!current}
              onClick={() =>
                current &&
                downloadTextFile(`${safeFileName(current.name)}.cardforge.project.json`, prettyJson(sanitizeProjectForExport(current)))
              }
            >
              导出当前项目备份
            </button>
            <button
              className="primary-button"
              disabled={!current}
              onClick={() => current && exportPackage(current)}
            >
              导出 .cardforge.zip 项目包
            </button>
            <p className="muted">项目 JSON 和 .cardforge.zip 导出都会清空 Provider API Key。</p>
            {!isFileSystemAccessSupported() && (
              <p className="muted">当前浏览器未开放文件夹读写 API，请使用项目包或 JSON 备份。</p>
            )}
            {storageStatus && <div className="callout"><pre>{storageStatus}</pre></div>}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">
          <Plus size={18} />
          <span>内置示例项目</span>
        </div>
        <div className="grid-2">
          {exampleProjects.map((example) => (
            <div className="list-item" key={example.id}>
              <strong>{example.name}</strong>
              <span className="muted">{example.description}</span>
              <button className="secondary-button" onClick={() => state.importProject(example.create())}>
                从示例创建
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-title">
          <FolderOpen size={18} />
          <span>项目列表</span>
        </div>
        <div className="list">
          {state.projects.length === 0 && <p className="muted">还没有项目。创建一个项目即可进入工作台。</p>}
          {state.projects.map((project) => (
            <div key={project.id} className={state.currentProjectId === project.id ? "list-item active" : "list-item"}>
              <strong>{project.name}</strong>
              <span className="muted">
                {project.characters.length} 角色 / {project.worldBooks.length} 世界书 / {project.assets.length} 资源
              </span>
              <div className="toolbar">
                <button className="secondary-button" onClick={() => state.openProject(project.id)}>
                  打开
                </button>
                <button
                  className="ghost-button"
                  onClick={() => downloadTextFile(`${safeFileName(project.name)}.cardforge.project.json`, prettyJson(sanitizeProjectForExport(project)))}
                >
                  备份
                </button>
                <button className="ghost-button" onClick={() => state.duplicateProject(project.id)}>
                  <Copy size={16} /> 复制
                </button>
                <button className="ghost-button" onClick={() => exportPackage(project)}>
                  项目包
                </button>
                <button
                  className="danger-button"
                  onClick={() => window.confirm(`删除项目索引「${project.name}」？浏览器存储中的数据会移除。`) && state.deleteProject(project.id)}
                >
                  <Trash2 size={16} /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
