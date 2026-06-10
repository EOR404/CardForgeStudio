import { FileDown, FileJson, ImageDown, Import } from "lucide-react";
import { useState } from "react";
import {
  createExportRecord,
  prettyJson,
  toV1Character,
  toV2Character,
  toV3Character,
  toWorldBookJson
} from "../core/exporter/character";
import { exportCharacterCharx, importCharacterCharx } from "../core/exporter/charx";
import { buildExportPreflightReport, exportTargets, formatExportReportMarkdown, targetLabel } from "../core/exporter/report";
import { embedV2MetadataInPngDataUrl, extractCharacterFromPngDataUrl } from "../core/exporter/pngMetadata";
import { importCharacterJson, type ImportCharacterResult } from "../core/importer/character";
import type { Asset, CompatibilityReport, CompatibilityTarget, InternalCharacter, VersionSnapshot } from "../core/schema/types";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { downloadBytesFile, downloadDataUrl, downloadTextFile, readFileAsArrayBuffer, readFileAsDataUrl, readFileAsText, safeFileName } from "../utils/file";

type Format = "v1_json" | "v2_json" | "v3_json" | "charx" | "v2_png" | "avatar_png" | "worldbook_json";

export function ExportPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [format, setFormat] = useState<Format>("v2_json");
  const [selectedVersionId, setSelectedVersionId] = useState("current");
  const [selectedBatchImageIds, setSelectedBatchImageIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<ImportCharacterResult | undefined>();
  if (!project) return null;
  const activeProject = project;
  const target = activeProject.compatibilityTarget;
  const character = activeProject.characters.find((item) => item.id === state.selectedCharacterId) ?? activeProject.characters[0];
  const characterSnapshots = character
    ? activeProject.versions
        .filter((item) => item.targetType === "character" && item.targetId === character.id)
        .map((snapshot) => ({ snapshot, character: snapshotCharacter(snapshot) }))
        .filter((item): item is { snapshot: VersionSnapshot; character: InternalCharacter } => Boolean(item.character))
    : [];
  const selectedSnapshot = characterSnapshots.find((item) => item.snapshot.id === selectedVersionId);
  const exportCharacter = selectedSnapshot?.character ?? character;
  const selectedVersionValue = selectedSnapshot?.snapshot.id ?? "current";
  const versionSuffix = selectedSnapshot ? `.${safeFileName(selectedSnapshot.snapshot.label)}` : "";
  const explicitlyNoWorldBook = state.selectedWorldBookId === "";
  const worldBook = explicitlyNoWorldBook
    ? undefined
    : activeProject.worldBooks.find((item) => item.id === state.selectedWorldBookId) ??
      activeProject.worldBooks.find((item) => exportCharacter?.linkedWorldBooks.includes(item.id));
  const imageAssets = activeProject.assets
    .filter((item) => item.type === "image")
    .sort((a, b) => rankExportImage(b, exportCharacter) - rankExportImage(a, exportCharacter) || a.name.localeCompare(b.name));
  const imageAsset = imageAssets.find((item) => item.id === state.selectedAssetId) ?? imageAssets[0];
  const batchImageAssets =
    format === "v2_png" && selectedBatchImageIds.length
      ? imageAssets.filter((asset) => selectedBatchImageIds.includes(asset.id))
      : imageAsset
        ? [imageAsset]
        : [];
  const preflight = buildExportPreflightReport({
    project: activeProject,
    format,
    target,
    character: exportCharacter,
    worldBook,
    imageAsset: format === "v2_png" ? batchImageAssets[0] ?? imageAsset : imageAsset,
    imageAssets: format === "v2_png" ? batchImageAssets : undefined
  });
  const warnings = preflight.checks
    .filter((item) => item.level === "warning" || item.level === "blocker")
    .map((item) => item.message);

  async function exportNow() {
    if (!exportCharacter && format !== "worldbook_json") {
      setMessage("请先选择角色。");
      return;
    }
    if (format === "worldbook_json" && !worldBook) {
      setMessage("请先选择世界书。");
      return;
    }
    const confirmation = buildExportConfirmation();
    if (confirmation && !window.confirm(confirmation)) return;
    try {
      if (format === "v1_json" && exportCharacter) {
        const fileName = `${safeFileName(exportCharacter.name)}${versionSuffix}.v1.json`;
        downloadTextFile(fileName, prettyJson(toV1Character(exportCharacter)));
        state.addExportRecord(
          createExportRecord({
            characterId: exportCharacter.id,
            characterVersionId: selectedSnapshot?.snapshot.id,
            worldBookIds: [],
            assetIds: [],
            format,
            outputPath: fileName,
            warnings
          })
        );
      }
      if (format === "v2_json" && exportCharacter) {
        const fileName = `${safeFileName(exportCharacter.name)}${versionSuffix}.v2.json`;
        downloadTextFile(fileName, prettyJson(toV2Character(exportCharacter, worldBook)));
        state.addExportRecord(
          createExportRecord({
            characterId: exportCharacter.id,
            characterVersionId: selectedSnapshot?.snapshot.id,
            worldBookIds: worldBook ? [worldBook.id] : [],
            assetIds: [],
            format,
            outputPath: fileName,
            warnings
          })
        );
      }
      if (format === "v3_json" && exportCharacter) {
        const fileName = `${safeFileName(exportCharacter.name)}${versionSuffix}.v3.json`;
        const assetIds = activeProject.assets
          .filter((asset) => asset.linkedCharacterIds.includes(exportCharacter.id) || asset.id === exportCharacter.avatarAssetId)
          .map((asset) => asset.id);
        downloadTextFile(fileName, prettyJson(toV3Character(exportCharacter, worldBook, activeProject.assets)));
        state.addExportRecord(
          createExportRecord({
            characterId: exportCharacter.id,
            characterVersionId: selectedSnapshot?.snapshot.id,
            worldBookIds: worldBook ? [worldBook.id] : [],
            assetIds,
            format,
            outputPath: fileName,
            warnings
          })
        );
      }
      if (format === "charx" && exportCharacter) {
        const fileName = `${safeFileName(exportCharacter.name)}${versionSuffix}.charx`;
        const assetIds = activeProject.assets
          .filter((asset) => asset.linkedCharacterIds.includes(exportCharacter.id) || asset.id === exportCharacter.avatarAssetId)
          .map((asset) => asset.id);
        downloadBytesFile(
          fileName,
          exportCharacterCharx({
            character: exportCharacter,
            worldBook,
            assets: activeProject.assets
          }),
          "application/zip"
        );
        state.addExportRecord(
          createExportRecord({
            characterId: exportCharacter.id,
            characterVersionId: selectedSnapshot?.snapshot.id,
            worldBookIds: worldBook ? [worldBook.id] : [],
            assetIds,
            format,
            outputPath: fileName,
            warnings
          })
        );
      }
      if (format === "worldbook_json" && worldBook) {
        const fileName = `${safeFileName(worldBook.name)}.worldbook.json`;
        downloadTextFile(fileName, prettyJson(toWorldBookJson(worldBook)));
        state.addExportRecord(createExportRecord({ worldBookIds: [worldBook.id], assetIds: [], format, outputPath: fileName, warnings }));
      }
      if (format === "v2_png" && exportCharacter) {
        if (!batchImageAssets.length) throw new Error("请选择 PNG 图片资源。");
        for (const [index, image] of batchImageAssets.entries()) {
          if (!image.dataUrl) throw new Error(`图片「${image.name}」缺少 dataUrl。`);
          const dataUrl = await embedV2MetadataInPngDataUrl(image.dataUrl, exportCharacter, worldBook);
          const imageSuffix = batchImageAssets.length > 1 ? `.${index + 1}-${safeFileName(image.name.replace(/\.[^.]+$/, ""))}` : "";
          const fileName = `${safeFileName(exportCharacter.name)}${versionSuffix}${imageSuffix}.v2.png`;
          downloadDataUrl(fileName, dataUrl);
          downloadTextFile(`${safeFileName(exportCharacter.name)}${versionSuffix}${imageSuffix}.v2.backup.json`, prettyJson(toV2Character(exportCharacter, worldBook)));
          state.addExportRecord(
            createExportRecord({
              characterId: exportCharacter.id,
              characterVersionId: selectedSnapshot?.snapshot.id,
              worldBookIds: worldBook ? [worldBook.id] : [],
              assetIds: [image.id],
              format,
              outputPath: fileName,
              warnings
            })
          );
        }
      }
      if (format === "avatar_png" && exportCharacter) {
        if (!imageAsset?.dataUrl) throw new Error("请选择可导出的 PNG 图片资源。");
        const fileName = `${safeFileName(exportCharacter.name)}.avatar.png`;
        downloadDataUrl(fileName, imageAsset.dataUrl);
        state.addExportRecord(
          createExportRecord({
            characterId: exportCharacter.id,
            characterVersionId: selectedSnapshot?.snapshot.id,
            worldBookIds: worldBook ? [worldBook.id] : [],
            assetIds: [imageAsset.id],
            format,
            outputPath: fileName,
            warnings
          })
        );
      }
      downloadExportReport(false);
      setMessage(format === "v2_png" && batchImageAssets.length > 1 ? `已触发 ${batchImageAssets.length} 张 V2 PNG 下载。` : "导出已触发浏览器下载。");
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}。源数据未被修改。`);
    }
  }

  function buildExportConfirmation(): string {
    const blockers = preflight.checks.filter((item) => item.level === "blocker");
    const warningChecks = preflight.checks.filter((item) => item.level === "warning");
    const lines: string[] = [];
    if (blockers.length) {
      lines.push(`发布前检查有 ${blockers.length} 个阻塞项：`);
      lines.push(...blockers.slice(0, 5).map((item) => `- ${item.message}`));
    }
    if (warningChecks.length) {
      if (lines.length) lines.push("");
      lines.push(`导出前需要确认 ${warningChecks.length} 个警告 / 数据损失提示：`);
      lines.push(...warningChecks.slice(0, 8).map((item) => `- ${item.message}`));
    }
    if (format === "v2_png" && batchImageAssets.length > 1) {
      if (lines.length) lines.push("");
      lines.push(`批量 V2 PNG：将使用 ${batchImageAssets.length} 张图片分别导出角色卡。`);
      lines.push(...batchImageAssets.slice(0, 8).map((item) => `- ${item.name}`));
    }
    if (!lines.length) return "";
    lines.push("");
    lines.push("确认后将继续导出，并把这些提示写入导出历史。");
    return lines.join("\n");
  }

  function downloadExportReport(showMessage = true) {
    const subject = format === "worldbook_json" ? worldBook?.name ?? "worldbook" : exportCharacter?.name ?? "character";
    const fileName = `${safeFileName(subject)}.${format}.${target}.export-report.md`;
    downloadTextFile(fileName, formatExportReportMarkdown(preflight), "text/markdown");
    if (showMessage) setMessage(`导出报告已生成：${fileName}`);
  }

  async function importJson(file: File) {
    try {
      if (isCharxFile(file)) {
        const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
        handleCharacterImportResult(importCharacterCharx(bytes, file.name), file.name);
        return;
      }
      const text = await readFileAsText(file);
      handleCharacterImportResult(importCharacterJson(JSON.parse(text), file.name), file.name);
    } catch (error) {
      setMessage(`角色 JSON/CHARX 导入失败：${error instanceof Error ? error.message : String(error)}。现有角色未被修改。`);
    }
  }

  async function importPng(file: File) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = extractCharacterFromPngDataUrl(dataUrl, file.name);
      handleCharacterImportResult(result, file.name);
    } catch (error) {
      setMessage(`PNG 导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function handleCharacterImportResult(result: ImportCharacterResult, fileName: string) {
    if (result.report.importedAsReadonly) {
      setPendingImport(result);
      setMessage(`只读扫描完成：${fileName}。请确认后再转换导入。`);
      return;
    }
    state.importCharacterResult(result);
    setPendingImport(undefined);
    setMessage(`角色已导入：${fileName}`);
  }

  function confirmPendingImport() {
    if (!pendingImport) return;
    state.importCharacterResult(pendingImport);
    setMessage(`已确认并转换导入：${pendingImport.character.name}`);
    setPendingImport(undefined);
  }

  async function importExportImage(file: File) {
    const dataUrl = await readFileAsDataUrl(file);
    state.addAsset({
      name: file.name,
      type: "image",
      purpose: "export-cover",
      source: "upload",
      mimeType: file.type || "image/png",
      dataUrl,
      thumbnailUrl: dataUrl,
      tags: ["image", "导出封面"],
      linkedCharacterIds: exportCharacter ? [exportCharacter.id] : [],
      linkedWorldBookIds: []
    });
    state.setActivePage("export");
    setMessage(`已加入导出图片：${file.name}`);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>导出</h1>
          <p>选择角色、世界书、图片与目标格式。V1 导出会显示数据损失提示。</p>
        </div>
      </div>

      <div className="split">
        <main className="panel">
          <div className="form-grid">
            <label>
              1. 选择角色
              <select value={character?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedCharacterId: event.target.value })}>
                {activeProject.characters.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              2. 选择版本
              <select
                value={selectedVersionValue}
                disabled={!character || format === "worldbook_json"}
                onChange={(event) => setSelectedVersionId(event.target.value)}
              >
                <option value="current">当前编辑状态</option>
                {characterSnapshots.map(({ snapshot }) => (
                  <option key={snapshot.id} value={snapshot.id}>
                    {snapshot.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedSnapshot && <p className="muted">将从快照导出：{selectedSnapshot.snapshot.notes || selectedSnapshot.snapshot.label}</p>}
            <label>
              3. 选择世界书
              <select value={worldBook?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedWorldBookId: event.target.value })}>
                <option value="">不嵌入世界书</option>
                {activeProject.worldBooks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              4. 选择图片
              <select value={imageAsset?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedAssetId: event.target.value })}>
                <option value="">不选择图片</option>
                {imageAssets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} / {purposeLabel(item.purpose)}
                  </option>
                ))}
              </select>
            </label>
            {format === "v2_png" && imageAssets.length > 0 && (
              <section className="panel compact">
                <div className="panel-title">批量 V2 PNG 图片</div>
                <p className="muted">勾选多张图片时，会为当前角色分别生成多张 V2 PNG；不勾选则使用上方单张图片。</p>
                <div className="asset-grid compact">
                  {imageAssets.map((asset) => (
                    <label className="asset-tile selectable" key={asset.id}>
                      <input
                        type="checkbox"
                        checked={selectedBatchImageIds.includes(asset.id)}
                        onChange={(event) => {
                          setSelectedBatchImageIds((current) =>
                            event.target.checked ? [...new Set([...current, asset.id])] : current.filter((id) => id !== asset.id)
                          );
                        }}
                      />
                      {asset.thumbnailUrl || asset.dataUrl ? <img src={asset.thumbnailUrl ?? asset.dataUrl} alt={asset.name} /> : <div className="muted">无预览</div>}
                      <span>
                        <strong>{asset.name}</strong>
                        <span className="muted">{purposeLabel(asset.purpose)}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {selectedBatchImageIds.length > 0 && (
                  <button className="ghost-button" type="button" onClick={() => setSelectedBatchImageIds([])}>
                    清空批量选择
                  </button>
                )}
              </section>
            )}
            <label className="secondary-button">
              <ImageDown size={17} /> 临时导入导出图片
              <input hidden type="file" accept="image/png,image/*" onChange={(event) => event.target.files?.[0] && importExportImage(event.target.files[0])} />
            </label>
            <label>
              5. 选择格式
              <select value={format} onChange={(event) => setFormat(event.target.value as Format)}>
                <option value="v2_json">Character Card V2 JSON</option>
                <option value="v3_json">Character Card V3 JSON（实验）</option>
                <option value="charx">CHARX 角色资源包（基础）</option>
                <option value="v1_json">Character Card V1 JSON</option>
                <option value="v2_png">Character Card V2 PNG</option>
                <option value="avatar_png">角色头像 PNG</option>
                <option value="worldbook_json">世界书 JSON</option>
              </select>
            </label>
            <label>
              6. 目标平台
              <select
                value={target}
                onChange={(event) => state.updateProject({ compatibilityTarget: event.target.value as CompatibilityTarget })}
              >
                {exportTargets.map((item) => (
                  <option key={item} value={item}>
                    {targetLabel(item)}
                  </option>
                ))}
              </select>
            </label>

            <section className="panel">
              <div className="panel-title">
                <FileDown size={18} />
                <span>7. 发布前检查</span>
              </div>
              <div className="grid-3">
                <div className="metric-row">
                  <span>阻塞</span>
                  <strong>{preflight.summary.blockers}</strong>
                </div>
                <div className="metric-row">
                  <span>警告</span>
                  <strong>{preflight.summary.warnings}</strong>
                </div>
                <div className="metric-row">
                  <span>依赖</span>
                  <strong>{preflight.summary.dependencies}</strong>
                </div>
              </div>
              {preflight.checks.length ? (
                <ul className="issue-list">
                  {preflight.checks.map((item) => (
                    <li className={`issue ${item.level === "blocker" ? "error" : item.level === "pass" ? "info" : item.level}`} key={item.id}>
                      <b>{item.level}</b>
                      <span>{item.message}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">没有发现导出阻塞问题。</p>
              )}
            </section>

            <section className="panel">
              <div className="panel-title">8. 依赖说明</div>
              <div className="list">
                {preflight.dependencies.map((dependency) => (
                  <div className="list-item" key={`${dependency.type}-${dependency.label}`}>
                    <strong>{dependency.type}: {dependency.label}</strong>
                    <span className="muted">{dependency.status} / {dependency.evidence}</span>
                  </div>
                ))}
                {!preflight.dependencies.length && <p className="muted">没有额外依赖。</p>}
              </div>
              <div className="toolbar" style={{ marginTop: 12 }}>
                <button className="secondary-button" onClick={() => downloadExportReport()}>
                  下载导出报告
                </button>
              </div>
            </section>

            <button className="primary-button" onClick={exportNow}>
              <ImageDown size={17} /> 9. 导出
            </button>
            {message && <div className="callout"><pre>{message}</pre></div>}
          </div>
        </main>

        <aside className="panel">
          <div className="panel-title">
            <Import size={18} />
            <span>导入</span>
          </div>
          <div className="form-grid">
            <label className="secondary-button">
              <FileJson size={17} /> 导入 JSON/CHARX
              <input hidden type="file" accept="application/json,.json,.charx,application/zip" onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} />
            </label>
            <label className="secondary-button">
              <ImageDown size={17} /> 导入 V2 PNG
              <input hidden type="file" accept="image/png,.png" onChange={(event) => event.target.files?.[0] && importPng(event.target.files[0])} />
            </label>
            {pendingImport && (
              <section className="callout">
                <strong>复杂卡只读扫描</strong>
                <div className={`issue ${pendingImport.report.importedAsReadonly ? "warning" : "info"}`} style={{ marginTop: 8 }}>
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
                <ul className="issue-list" style={{ marginTop: 8 }}>
                  {pendingImport.report.readonlyReasons.slice(0, 3).map((reason) => (
                    <li className="issue warning" key={reason}>
                      <b>只读</b>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
                <div className="toolbar" style={{ marginTop: 10 }}>
                  <button className="primary-button" onClick={confirmPendingImport}>
                    确认转换导入
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setPendingImport(undefined);
                      setMessage("已取消复杂卡导入，现有角色未被修改。");
                    }}
                  >
                    放弃导入
                  </button>
                </div>
              </section>
            )}
            <p className="muted">导入复杂卡时会生成兼容性报告，脚本与前端内容默认只读。</p>
          </div>

          <div className="panel-title" style={{ marginTop: 16 }}>
            <span>导出历史</span>
          </div>
          <div className="list">
            {activeProject.exports.map((record) => (
              <div className="list-item" key={record.id}>
                <strong>{record.format}</strong>
                <span className="muted">{record.outputPath}</span>
                {record.characterVersionId && (
                  <span className="muted">
                    版本：{activeProject.versions.find((version) => version.id === record.characterVersionId)?.label ?? record.characterVersionId}
                  </span>
                )}
              </div>
            ))}
            {!activeProject.exports.length && <p className="muted">暂无导出记录。</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function snapshotCharacter(snapshot: VersionSnapshot): InternalCharacter | undefined {
  const data = snapshot.data;
  if (!data || typeof data !== "object") return undefined;
  const character = data as Partial<InternalCharacter>;
  if (
    typeof character.id !== "string" ||
    typeof character.name !== "string" ||
    typeof character.description !== "string" ||
    typeof character.firstMessage !== "string" ||
    !Array.isArray(character.alternateGreetings) ||
    !Array.isArray(character.tags)
  ) {
    return undefined;
  }
  return character as InternalCharacter;
}

function rankExportImage(asset: Asset, character?: InternalCharacter): number {
  let score = 0;
  if (asset.id === character?.avatarAssetId) score += 40;
  if (character && asset.linkedCharacterIds.includes(character.id)) score += 20;
  if (asset.purpose === "export-cover") score += 16;
  if (asset.purpose === "cover") score += 12;
  if (asset.purpose === "avatar") score += 8;
  return score;
}

function purposeLabel(purpose?: Asset["purpose"]): string {
  const labels: Record<NonNullable<Asset["purpose"]>, string> = {
    avatar: "头像",
    cover: "封面",
    "export-cover": "导出封面",
    halfbody: "半身图",
    fullbody: "全身图",
    background: "背景",
    expression: "表情差分",
    map: "地图",
    icon: "图标",
    reference: "参考图",
    other: "其他"
  };
  return purpose ? labels[purpose] : "未分类";
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

function isCharxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".charx");
}
