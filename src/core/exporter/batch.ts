import type { Asset } from "../schema/types";

export function getV2PngBatchImageWarnings(images: Asset[]): string[] {
  return images.flatMap((image) => {
    const warnings: string[] = [];
    if (!image.dataUrl) warnings.push(`批量图片「${image.name}」缺少 dataUrl。`);
    if (image.dataUrl && !image.dataUrl.startsWith("data:image/png;base64,")) {
      warnings.push(`批量图片「${image.name}」不是 PNG，无法写入 V2 metadata。`);
    }
    return warnings;
  });
}

