import {
  Bot,
  Boxes,
  BookOpen,
  Braces,
  FlaskConical,
  Home,
  Image,
  Menu,
  PackageOpen,
  Save,
  Settings,
  Sparkles,
  TestTube2,
  Redo2,
  Undo2
} from "lucide-react";
import type { PropsWithChildren } from "react";
import { useState } from "react";
import type { AppPage, ProjectMode } from "../core/schema/types";
import { characterTokenBreakdown } from "../core/prompt-builder/buildPrompt";
import { checkCharacterQuality } from "../core/quality/checks";
import { BrowserStorage } from "../storage/BrowserStorage";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";

type NavigationItem = { page: AppPage; label: string; icon: typeof Home; advancedOnly?: boolean };

const navItems: NavigationItem[] = [
  { page: "projects", label: "项目", icon: Home },
  { page: "dashboard", label: "仪表盘", icon: Boxes },
  { page: "characters", label: "角色卡", icon: Braces },
  { page: "worldbooks", label: "世界书", icon: BookOpen },
  { page: "assets", label: "资源", icon: Image },
  { page: "ai", label: "AI", icon: Bot },
  { page: "test", label: "测试", icon: TestTube2 },
  { page: "export", label: "导出", icon: PackageOpen },
  { page: "advanced", label: "高级", icon: FlaskConical, advancedOnly: true }
];

const mobileNavItems: NavigationItem[] = [
  { page: "projects", label: "项目", icon: Home },
  { page: "characters", label: "制卡", icon: Braces },
  { page: "assets", label: "资源", icon: Image },
  { page: "test", label: "测试", icon: TestTube2 },
  { page: "export", label: "导出", icon: PackageOpen },
  { page: "advanced", label: "更多", icon: Menu, advancedOnly: true }
];

export function DesktopLayout({ children }: PropsWithChildren) {
  const state = useAppStore();
  const [saveStatus, setSaveStatus] = useState("");
  const project = getCurrentProject(state);
  const selectedCharacter = project?.characters.find((character) => character.id === state.selectedCharacterId);
  const selectedWorldBook = project?.worldBooks.find((book) => selectedCharacter?.linkedWorldBooks.includes(book.id));
  const issues = selectedCharacter ? checkCharacterQuality(selectedCharacter, selectedWorldBook) : [];
  const tokens = selectedCharacter ? characterTokenBreakdown(selectedCharacter) : [];
  const activeProvider = project?.aiProviders.find((provider) => provider.id === state.selectedProviderId);
  const visibleNavItems = navItems.filter((item) => !item.advancedOnly || project?.mode === "advanced");
  const visibleMobileNavItems = mobileNavItems.filter((item) => !item.advancedOnly || project?.mode === "advanced");

  function setProjectMode(mode: ProjectMode) {
    if (!project || project.mode === mode) return;
    state.updateProject({ mode });
    if (mode === "light" && state.activePage === "advanced") {
      state.setActivePage("dashboard");
    }
  }

  function saveToLocalStorage() {
    try {
      BrowserStorage.save(state.projects, state.currentProjectId);
      setSaveStatus(project ? `已保存：${project.name}` : "已保存本地数据");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaveStatus(`保存失败：${message}`);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">CFS</div>
          <div>
            <strong>CardForge Studio</strong>
            <span>卡铸工坊</span>
          </div>
        </div>
        <div className="topbar-project">
          <span>{project?.name ?? "未打开项目"}</span>
          {project && <em>{project.mode === "light" ? "轻量制卡" : "高级工程"}</em>}
        </div>
        <div className="topbar-actions">
          {saveStatus && <span className="save-status">{saveStatus}</span>}
          {project && (
            <div className="mode-switch" role="group" aria-label="项目模式切换">
              <button
                className={project.mode === "light" ? "active" : ""}
                aria-pressed={project.mode === "light"}
                onClick={() => setProjectMode("light")}
              >
                轻量
              </button>
              <button
                className={project.mode === "advanced" ? "active" : ""}
                aria-pressed={project.mode === "advanced"}
                onClick={() => setProjectMode("advanced")}
              >
                高级
              </button>
            </div>
          )}
          <button className="icon-button" title="保存到本地存储" onClick={saveToLocalStorage}>
            <Save size={17} />
          </button>
          <button
            className="icon-button"
            title="撤销最近数据变更"
            disabled={!state.undoStack.length}
            onClick={state.undoLastChange}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            title="重做最近撤销"
            disabled={!state.redoStack.length}
            onClick={state.redoLastChange}
          >
            <Redo2 size={17} />
          </button>
          <button className="icon-button" title="切换设置" onClick={() => state.setActivePage("ai")}>
            <Settings size={17} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <nav>
          {visibleNavItems.map(({ page, label, icon: Icon }) => (
            <button
              key={page}
              className={state.activePage === page ? "nav-item active" : "nav-item"}
              onClick={() => state.setActivePage(page)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">{children}</main>

      <aside className="inspector">
        <section className="panel compact">
          <div className="panel-title">
            <Sparkles size={17} />
            <span>AI 助手</span>
          </div>
          <p className="muted">{activeProvider ? `${activeProvider.name} / ${activeProvider.defaultModel}` : "未选择 Provider"}</p>
          {state.pendingAIResult ? (
            <div className="callout">
              <strong>{state.pendingAIResult.label}</strong>
              <pre>{String(state.pendingAIResult.raw).slice(0, 600)}</pre>
            </div>
          ) : (
            <p className="muted">AI 输出会先进入待应用区，不会直接覆盖字段。</p>
          )}
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <Menu size={17} />
            <span>质量检查</span>
          </div>
          {issues.length ? (
            <ul className="issue-list">
              {issues.slice(0, 6).map((issue) => (
                <li key={issue.id} className={`issue ${issue.level}`}>
                  <b>{issue.level}</b>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">当前没有阻塞问题。</p>
          )}
        </section>

        <section className="panel compact">
          <div className="panel-title">
            <Braces size={17} />
            <span>Token / 字数</span>
          </div>
          {tokens.map((item) => (
            <div className="metric-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.tokens}</strong>
            </div>
          ))}
        </section>
      </aside>

      <nav className={project?.mode === "advanced" ? "mobile-tabs advanced" : "mobile-tabs"}>
        {visibleMobileNavItems.map(({ page, label, icon: Icon }) => (
          <button
            key={page}
            className={state.activePage === page ? "active" : ""}
            onClick={() => state.setActivePage(page)}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
