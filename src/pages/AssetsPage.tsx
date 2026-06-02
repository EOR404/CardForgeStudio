import { Image, Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Asset } from "../core/schema/types";
import { getCurrentProject, useAppStore } from "../stores/useAppStore";
import { readFileAsDataUrl } from "../utils/file";

const ASSET_PURPOSES: Array<{ value: NonNullable<Asset["purpose"]>; label: string }> = [
  { value: "avatar", label: "头像" },
  { value: "cover", label: "封面" },
  { value: "export-cover", label: "导出封面" },
  { value: "halfbody", label: "半身图" },
  { value: "fullbody", label: "全身图" },
  { value: "background", label: "背景" },
  { value: "expression", label: "表情差分" },
  { value: "map", label: "地图" },
  { value: "icon", label: "图标" },
  { value: "reference", label: "参考图" },
  { value: "other", label: "其他" }
];

type AssetUsageItem = {
  id: string;
  title: string;
  detail: string;
  remove?: () => void;
};

export function AssetsPage() {
  const state = useAppStore();
  const project = getCurrentProject(state);
  const [search, setSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("");
  if (!project) return null;
  const selectedAsset = project.assets.find((asset) => asset.id === state.selectedAssetId) ?? project.assets[0];
  const selectedCharacter = project.characters.find((character) => character.id === state.selectedCharacterId) ?? project.characters[0];
  const selectedWorldBook = project.worldBooks.find((book) => book.id === state.selectedWorldBookId) ?? project.worldBooks[0];
  const assets = project.assets.filter((asset) => {
    const q = search.toLowerCase();
    const characterNames = asset.linkedCharacterIds.map((id) => project.characters.find((character) => character.id === id)?.name ?? id);
    const worldBookNames = asset.linkedWorldBookIds.map((id) => project.worldBooks.find((book) => book.id === id)?.name ?? id);
    const haystack = [
      asset.name,
      asset.type,
      asset.purpose,
      asset.source,
      asset.mimeType,
      asset.tags.join(","),
      asset.notes,
      characterNames.join(","),
      worldBookNames.join(",")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!purposeFilter || asset.purpose === purposeFilter) && (!q || haystack.includes(q));
  });

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const dataUrl = await readFileAsDataUrl(file);
      const type = inferAssetType(file);
      const purpose = type === "image" ? inferImagePurpose(file.name) : "other";
      state.addAsset({
        name: file.name,
        type,
        purpose,
        source: "upload",
        mimeType: file.type,
        dataUrl,
        thumbnailUrl: type === "image" ? dataUrl : undefined,
        tags: defaultTags(file, type, purpose),
        linkedCharacterIds: [],
        linkedWorldBookIds: []
      });
    }
  }

  function updateSelectedAsset(patch: Partial<Asset>) {
    if (!selectedAsset) return;
    state.updateAsset(selectedAsset.id, patch);
  }

  function linkCharacter() {
    if (!selectedAsset || !selectedCharacter) return;
    state.updateAsset(selectedAsset.id, {
      linkedCharacterIds: [...new Set([...selectedAsset.linkedCharacterIds, selectedCharacter.id])]
    });
  }

  function unlinkCharacter(characterId: string) {
    if (!selectedAsset) return;
    state.updateAsset(selectedAsset.id, {
      linkedCharacterIds: selectedAsset.linkedCharacterIds.filter((id) => id !== characterId)
    });
  }

  function linkWorldBook() {
    if (!selectedAsset || !selectedWorldBook) return;
    state.updateAsset(selectedAsset.id, {
      linkedWorldBookIds: [...new Set([...selectedAsset.linkedWorldBookIds, selectedWorldBook.id])]
    });
  }

  function unlinkWorldBook(worldBookId: string) {
    if (!selectedAsset) return;
    state.updateAsset(selectedAsset.id, {
      linkedWorldBookIds: selectedAsset.linkedWorldBookIds.filter((id) => id !== worldBookId)
    });
  }

  const usage = selectedAsset ? getAssetUsage(project, selectedAsset) : [];

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>资源</h1>
          <p>导入图片、JSON、文本和脚本资源，维护用途、标签、关联与导出使用记录。</p>
        </div>
        <label className="primary-button">
          <Plus size={17} /> 添加资源
          <input
            hidden
            multiple
            type="file"
            accept="image/*,application/json,text/*,.json,.txt,.md,.js,.css,.html"
            onChange={(event) => event.target.files && addFiles(event.target.files)}
          />
        </label>
      </div>

      <div className="split">
        <main
          className="panel"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
        >
          <div className="form-row">
            <label>
              搜索
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="文件名、标签、用途或关联对象" />
            </label>
            <label>
              用途筛选
              <select value={purposeFilter} onChange={(event) => setPurposeFilter(event.target.value)}>
                <option value="">全部用途</option>
                {ASSET_PURPOSES.map((purpose) => (
                  <option key={purpose.value} value={purpose.value}>
                    {purpose.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="callout" style={{ marginTop: 12 }}>
            可直接拖拽图片、JSON、Markdown、脚本或前端文件到资源库。图片可标记为头像、导出封面、背景、表情差分等用途。
          </div>
          <div className="asset-grid" style={{ marginTop: 14 }}>
            {assets.map((asset) => (
              <button
                key={asset.id}
                className={selectedAsset?.id === asset.id ? "asset-tile active" : "asset-tile"}
                onClick={() => useAppStore.setState({ selectedAssetId: asset.id })}
              >
                {asset.type === "image" && asset.thumbnailUrl ? <img src={asset.thumbnailUrl} alt={asset.name} /> : <div className="muted">非图片资源</div>}
                <div>
                  <strong>{asset.name}</strong>
                  <span className="muted">{purposeLabel(asset.purpose)} / {asset.type}</span>
                  <span className="muted">{asset.tags.join(", ") || "无标签"}</span>
                </div>
              </button>
            ))}
            {!assets.length && <p className="muted">拖入资源或使用添加按钮导入。</p>}
          </div>
        </main>

        <aside className="panel">
          <div className="panel-title">
            <Image size={18} />
            <span>资源详情</span>
          </div>
          {selectedAsset ? (
            <div className="form-grid">
              {selectedAsset.dataUrl && selectedAsset.type === "image" && (
                <img
                  src={selectedAsset.dataUrl}
                  alt={selectedAsset.name}
                  style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8, background: "#eef2f7" }}
                />
              )}
              <div className="form-row">
                <label>
                  name
                  <input value={selectedAsset.name} onChange={(event) => updateSelectedAsset({ name: event.target.value })} />
                </label>
                <label>
                  purpose
                  <select value={selectedAsset.purpose ?? "other"} onChange={(event) => updateSelectedAsset({ purpose: event.target.value as Asset["purpose"] })}>
                    {ASSET_PURPOSES.map((purpose) => (
                      <option key={purpose.value} value={purpose.value}>
                        {purpose.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                tags
                <input value={selectedAsset.tags.join(", ")} onChange={(event) => updateSelectedAsset({ tags: splitList(event.target.value) })} />
              </label>
              <label>
                notes
                <textarea value={selectedAsset.notes ?? ""} onChange={(event) => updateSelectedAsset({ notes: event.target.value })} />
              </label>
              <div className="toolbar">
                <button
                  className="secondary-button"
                  onClick={() => updateSelectedAsset({ purpose: "export-cover", tags: [...new Set([...selectedAsset.tags, "导出封面"])] })}
                  disabled={selectedAsset.type !== "image"}
                >
                  标记为导出封面
                </button>
                <button
                  className="primary-button"
                  disabled={!selectedCharacter || selectedAsset.type !== "image"}
                  onClick={() => selectedCharacter && state.setCharacterAvatar(selectedCharacter.id, selectedAsset.id)}
                >
                  <Link2 size={17} /> 设为角色头像
                </button>
              </div>
              <div className="form-row">
                <label>
                  关联角色
                  <select value={selectedCharacter?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedCharacterId: event.target.value })}>
                    {project.characters.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  关联世界书
                  <select value={selectedWorldBook?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedWorldBookId: event.target.value })}>
                    {project.worldBooks.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="toolbar">
                <button className="secondary-button" disabled={!selectedCharacter} onClick={linkCharacter}>
                  关联角色
                </button>
                <button className="secondary-button" disabled={!selectedWorldBook} onClick={linkWorldBook}>
                  关联世界书
                </button>
                <button className="danger-button" onClick={() => window.confirm("删除该资源？") && state.deleteAsset(selectedAsset.id)}>
                  <Trash2 size={17} /> 删除资源
                </button>
              </div>

              <div className="panel-title">使用记录</div>
              <div className="list">
                {usage.map((item) => (
                  <div className="list-item" key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="muted">{item.detail}</span>
                    {item.remove && (
                      <button className="ghost-button" onClick={item.remove}>
                        解除关联
                      </button>
                    )}
                  </div>
                ))}
                {!usage.length && <p className="muted">暂无角色、世界书或导出记录使用该资源。</p>}
              </div>
              <div className="callout">
                当前资源：{selectedAsset.source ?? "upload"} / {selectedAsset.mimeType || "unknown"} / {purposeLabel(selectedAsset.purpose)}
              </div>
            </div>
          ) : (
            <p className="muted">请选择资源。</p>
          )}
        </aside>
      </div>
    </section>
  );

  function getAssetUsage(currentProject: NonNullable<typeof project>, asset: Asset): AssetUsageItem[] {
    const characterLinks = currentProject.characters
      .filter((character) => asset.linkedCharacterIds.includes(character.id) || character.avatarAssetId === asset.id)
      .map((character) => ({
        id: `character-${character.id}`,
        title: character.name || "未命名角色",
        detail: character.avatarAssetId === asset.id ? "角色头像" : "角色关联资源",
        remove: character.avatarAssetId === asset.id ? undefined : () => unlinkCharacter(character.id)
      }));
    const worldBookLinks = currentProject.worldBooks
      .filter((book) => asset.linkedWorldBookIds.includes(book.id))
      .map((book) => ({
        id: `worldbook-${book.id}`,
        title: book.name || "未命名世界书",
        detail: "世界书关联资源",
        remove: () => unlinkWorldBook(book.id)
      }));
    const exportLinks = currentProject.exports
      .filter((record) => record.assetIds.includes(asset.id))
      .map((record) => ({
        id: `export-${record.id}`,
        title: record.outputPath,
        detail: `${record.format} / ${new Date(record.createdAt).toLocaleString()}`
      }));
    const frontendLinks = currentProject.advanced.frontendPackages
      .filter((frontendPackage) => (frontendPackage.assetIds ?? []).includes(asset.id))
      .map((frontendPackage) => ({
        id: `frontend-${frontendPackage.id}`,
        title: frontendPackage.name || "未命名前端卡",
        detail: "前端卡资源"
      }));
    return [...characterLinks, ...worldBookLinks, ...frontendLinks, ...exportLinks];
  }
}

function inferAssetType(file: File): Asset["type"] {
  const lower = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "image";
  if (lower.endsWith(".worldbook.json")) return "worldbook";
  if (lower.endsWith(".character.json") || lower.endsWith(".card.json")) return "character_card";
  if (file.type.includes("json") || lower.endsWith(".json")) return "json";
  if (lower.endsWith(".js") || lower.endsWith(".stscript")) return "script";
  if (file.type.startsWith("text/") || /\.(txt|md|html|css)$/i.test(lower)) return "text";
  return "other";
}

function inferImagePurpose(name: string): NonNullable<Asset["purpose"]> {
  const lower = name.toLowerCase();
  if (/avatar|头像|icon/.test(lower)) return "avatar";
  if (/cover|封面|card/.test(lower)) return "export-cover";
  if (/bg|background|背景/.test(lower)) return "background";
  if (/expression|表情/.test(lower)) return "expression";
  if (/map|地图/.test(lower)) return "map";
  return "reference";
}

function defaultTags(file: File, type: Asset["type"], purpose?: Asset["purpose"]): string[] {
  const tags = new Set<string>([type]);
  if (purpose) tags.add(purposeLabel(purpose));
  const extension = file.name.split(".").pop();
  if (extension) tags.add(extension.toLowerCase());
  return [...tags];
}

function purposeLabel(purpose?: Asset["purpose"]): string {
  return ASSET_PURPOSES.find((item) => item.value === purpose)?.label ?? "未分类";
}

function splitList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
