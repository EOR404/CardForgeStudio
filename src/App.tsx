import { AdvancedPage } from "./pages/AdvancedPage";
import { AISettingsPage } from "./pages/AISettingsPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CharacterPage } from "./pages/CharacterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExportPage } from "./pages/ExportPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { TestSandboxPage } from "./pages/TestSandboxPage";
import { WorldBookPage } from "./pages/WorldBookPage";
import { DesktopLayout } from "./layouts/DesktopLayout";
import { getCurrentProject, useAppStore } from "./stores/useAppStore";

export function App() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const page = !project && state.activePage !== "projects" ? "projects" : state.activePage;
  return (
    <DesktopLayout>
      {page === "projects" && <ProjectsPage />}
      {page === "dashboard" && <DashboardPage />}
      {page === "characters" && <CharacterPage />}
      {page === "worldbooks" && <WorldBookPage />}
      {page === "assets" && <AssetsPage />}
      {page === "ai" && <AISettingsPage />}
      {page === "test" && <TestSandboxPage />}
      {page === "export" && <ExportPage />}
      {page === "advanced" && <AdvancedPage />}
    </DesktopLayout>
  );
}

