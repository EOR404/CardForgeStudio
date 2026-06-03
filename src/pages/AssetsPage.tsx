import { Image, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { maybeAIInvocationLog } from "../core/ai/logging";
import { generateImagePromptWithAI, generateImagesWithAI } from "../core/ai/operations";
import { resolveAIForTask } from "../core/ai/presets";
import type { GeneratedImage } from "../core/ai/image";
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
  const [imagePurpose, setImagePurpose] = useState<NonNullable<Asset["purpose"]>>("avatar");
  const [imageStyle, setImageStyle] = useState("anime character portrait, clean lighting, high detail");
  const [positivePrompt, setPositivePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("low quality, blurry, extra fingers, watermark, text");
  const [imageWidth, setImageWidth] = useState(768);
  const [imageHeight, setImageHeight] = useState(768);
  const [imageSteps, setImageSteps] = useState(24);
  const [imageCount, setImageCount] = useState(1);
  const [imageBusy, setImageBusy] = useState("");
  const [imageStatus, setImageStatus] = useState("");
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  if (!project) return null;
  const activeProject = project;
  const selectedAsset = activeProject.assets.find((asset) => asset.id === state.selectedAssetId) ?? activeProject.assets[0];
  const selectedCharacter = activeProject.characters.find((character) => character.id === state.selectedCharacterId) ?? activeProject.characters[0];
  const selectedWorldBook = activeProject.worldBooks.find((book) => book.id === state.selectedWorldBookId) ?? activeProject.worldBooks[0];
  const assets = activeProject.assets.filter((asset) => {
    const q = search.toLowerCase();
    const characterNames = asset.linkedCharacterIds.map((id) => activeProject.characters.find((character) => character.id === id)?.name ?? id);
    const worldBookNames = asset.linkedWorldBookIds.map((id) => activeProject.worldBooks.find((book) => book.id === id)?.name ?? id);
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

  function resolveTaskAI(taskType: string) {
    return resolveAIForTask({
      providers: activeProject.aiProviders,
      presets: activeProject.aiPresets,
      taskType,
      selectedProviderId: state.selectedProviderId
    });
  }

  async function generateImagePrompt() {
    if (!selectedCharacter) return alert("请先选择一个角色。");
    const { provider, preset } = resolveTaskAI("imagePrompt");
    if (!provider) return alert("请先在 AI 设置页添加可用于 imagePrompt 的 Provider。");
    setImageBusy("prompt");
    setImageStatus("正在生成图片提示词...");
    try {
      const result = await generateImagePromptWithAI(
        provider,
        {
          character: selectedCharacter,
          purpose: purposeLabel(imagePurpose),
          style: imageStyle
        },
        preset
      );
      if (result.log) state.addAIInvocationLog(result.log);
      setPositivePrompt(result.parsed?.positivePrompt ?? result.raw.trim());
      setNegativePrompt(result.parsed?.negativePrompt ?? negativePrompt);
      setImageStatus(result.error ? `提示词已生成，但输出不是标准 JSON：${result.error}` : "提示词已生成，可编辑后继续生成图片。");
    } catch (error) {
      recordAIError(error);
      setImageStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setImageBusy("");
    }
  }

  async function generateImages() {
    const { provider } = resolveTaskAI("imageGeneration");
    if (!provider) return alert("请先在 AI 设置页添加可用于 imageGeneration 的图片 Provider。");
    if (!positivePrompt.trim()) return alert("请先填写 positive prompt。");
    setImageBusy("image");
    setImageStatus("正在生成图片...");
    setGeneratedImages([]);
    try {
      const result = await generateImagesWithAI(provider, {
        prompt: positivePrompt,
        negativePrompt,
        width: imageWidth,
        height: imageHeight,
        steps: imageSteps,
        count: imageCount
      });
      if (result.log) state.addAIInvocationLog(result.log);
      setGeneratedImages(result.parsed ?? []);
      setImageStatus(`生成完成：${result.parsed?.length ?? 0} 张候选图。点击保存后才会写入资源库。`);
    } catch (error) {
      recordAIError(error);
      setImageStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setImageBusy("");
    }
  }

  function saveGeneratedImage(image: GeneratedImage, index: number) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${selectedCharacter?.name || "cardforge"}-${imagePurpose}-${timestamp}-${index + 1}.png`;
    state.addAsset({
      name,
      type: "image",
      purpose: imagePurpose,
      source: "generated",
      mimeType: dataUrlMimeType(image.dataUrl) ?? "image/png",
      dataUrl: image.dataUrl,
      path: image.url,
      thumbnailUrl: image.dataUrl ?? image.url,
      tags: [
        "AI生成",
        purposeLabel(imagePurpose),
        ...(selectedCharacter ? [selectedCharacter.name] : [])
      ],
      linkedCharacterIds: selectedCharacter ? [selectedCharacter.id] : [],
      linkedWorldBookIds: [],
      notes: [
        `positive: ${positivePrompt}`,
        negativePrompt ? `negative: ${negativePrompt}` : "",
        image.revisedPrompt ? `revised: ${image.revisedPrompt}` : ""
      ].filter(Boolean).join("\n")
    });
    setImageStatus(`已保存候选图：${name}`);
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

  function recordAIError(error: unknown) {
    const log = maybeAIInvocationLog(error);
    if (log) state.addAIInvocationLog(log);
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
          <div className="panel-title" style={{ marginTop: 16 }}>
            <Sparkles size={18} />
            <span>AI 图片生成</span>
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>
                当前角色
                <select value={selectedCharacter?.id ?? ""} onChange={(event) => useAppStore.setState({ selectedCharacterId: event.target.value })}>
                  {project.characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {character.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                图片用途
                <select value={imagePurpose} onChange={(event) => setImagePurpose(event.target.value as NonNullable<Asset["purpose"]>)}>
                  {ASSET_PURPOSES.filter((purpose) => purpose.value !== "other").map((purpose) => (
                    <option key={purpose.value} value={purpose.value}>
                      {purpose.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              风格
              <input value={imageStyle} onChange={(event) => setImageStyle(event.target.value)} />
            </label>
            <label>
              positive prompt
              <textarea value={positivePrompt} onChange={(event) => setPositivePrompt(event.target.value)} />
            </label>
            <label>
              negative prompt
              <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} />
            </label>
            <div className="grid-4">
              <label>
                width
                <input type="number" value={imageWidth} onChange={(event) => setImageWidth(Number(event.target.value))} />
              </label>
              <label>
                height
                <input type="number" value={imageHeight} onChange={(event) => setImageHeight(Number(event.target.value))} />
              </label>
              <label>
                steps
                <input type="number" value={imageSteps} onChange={(event) => setImageSteps(Number(event.target.value))} />
              </label>
              <label>
                count
                <input type="number" min="1" max="4" value={imageCount} onChange={(event) => setImageCount(Number(event.target.value))} />
              </label>
            </div>
            <div className="toolbar">
              <button className="secondary-button" onClick={generateImagePrompt} disabled={Boolean(imageBusy)}>
                <Sparkles size={16} /> 生成提示词
              </button>
              <button className="primary-button" onClick={generateImages} disabled={Boolean(imageBusy)}>
                <Image size={16} /> 生成图片
              </button>
              {generatedImages.length > 0 && (
                <button className="ghost-button" onClick={() => setGeneratedImages([])}>
                  清空候选
                </button>
              )}
            </div>
            {imageStatus && <div className="callout"><pre>{imageStatus}</pre></div>}
            {generatedImages.length > 0 && (
              <div className="asset-grid">
                {generatedImages.map((image, index) => (
                  <div className="asset-tile" key={`${image.url ?? "data"}-${index}`}>
                    {image.dataUrl || image.url ? (
                      <img src={image.dataUrl ?? image.url} alt={`AI 候选图 ${index + 1}`} />
                    ) : (
                      <div className="muted">无预览</div>
                    )}
                    <div>
                      <strong>候选图 {index + 1}</strong>
                      {image.revisedPrompt && <span className="muted">{image.revisedPrompt}</span>}
                      <button className="secondary-button" onClick={() => saveGeneratedImage(image, index)}>
                        保存到资源库
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              {selectedAsset.type === "image" && (selectedAsset.dataUrl || selectedAsset.thumbnailUrl || selectedAsset.path) && (
                <img
                  src={selectedAsset.dataUrl ?? selectedAsset.thumbnailUrl ?? selectedAsset.path}
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

function dataUrlMimeType(dataUrl?: string): string | undefined {
  return dataUrl?.match(/^data:([^;]+);base64,/)?.[1];
}
