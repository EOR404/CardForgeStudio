import type { Asset } from "../schema/types";

export const ADJACENT_ASSET_FILE_MARKER = "__see_adjacent_file__";

export type AssetReferenceManifestEntry = {
  id: string;
  name: string;
  type: Asset["type"];
  purpose?: Asset["purpose"];
  source?: Asset["source"];
  mimeType?: string;
  path?: string;
  thumbnailUrl?: string;
  tags: string[];
  notes?: string;
};

export function serializeAssetForExternalFile(asset: Asset): Asset {
  return {
    ...asset,
    dataUrl: asset.dataUrl ? ADJACENT_ASSET_FILE_MARKER : undefined,
    thumbnailUrl: isDataUrl(asset.thumbnailUrl) ? ADJACENT_ASSET_FILE_MARKER : asset.thumbnailUrl
  };
}

export function buildAssetReferenceManifest(assets: Asset[]): AssetReferenceManifestEntry[] {
  return assets.filter(isReferenceAsset).map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    purpose: asset.purpose,
    source: asset.source,
    mimeType: asset.mimeType,
    path: asset.path,
    thumbnailUrl: isDataUrl(asset.thumbnailUrl) ? undefined : asset.thumbnailUrl,
    tags: asset.tags,
    notes: asset.notes
  }));
}

export function isReferenceAsset(asset: Asset): boolean {
  return Boolean(asset.path && !asset.dataUrl) || asset.source === "reference";
}

function isDataUrl(value?: string): boolean {
  return Boolean(value?.startsWith("data:"));
}
