import type { Asset, CardProject } from "../schema/types";

export function getRecentExportImageAssets(project: CardProject, limit = 8): Asset[] {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  const recent: Asset[] = [];
  const records = [...project.exports].sort((a, b) => b.createdAt - a.createdAt);
  for (const record of records) {
    for (const assetId of record.assetIds) {
      if (seen.has(assetId)) continue;
      const asset = assetsById.get(assetId);
      if (!asset || asset.type !== "image") continue;
      seen.add(assetId);
      recent.push(asset);
      if (recent.length >= limit) return recent;
    }
  }
  return recent;
}
