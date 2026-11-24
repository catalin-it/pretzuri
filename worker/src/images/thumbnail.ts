import crypto from "node:crypto";
import sharp from "sharp";
import { sniffImageFormat } from "./source.js";

// Low memory on the shared NAS: one libvips thread, no operation cache.
sharp.cache(false);
sharp.concurrency(1);

export interface ThumbOptions {
  maxPx: number;
  quality: number;
}

export interface Thumbnail {
  data: Buffer;
  width: number;
  height: number;
  /** Short content hash used in the file name (`p/<product>/<hash>.webp`). */
  hash: string;
}

/** sharp pipeline options (exported for tests). Metadata (EXIF, ICC, GPS) is dropped: sharp keeps none by default. */
export function sharpOptions(o: ThumbOptions) {
  const px = Math.max(16, Math.min(4096, Math.round(o.maxPx)));
  return {
    input: { limitInputPixels: 40_000_000, failOn: "error" as const, animated: false },
    resize: { width: px, height: px, fit: "inside" as const, withoutEnlargement: true },
    webp: { quality: Math.max(1, Math.min(100, Math.round(o.quality))), effort: 4 },
  };
}

/** Validates the bytes are a real raster image and returns a max-size WebP without metadata. */
export async function makeThumbnail(input: Buffer, o: ThumbOptions): Promise<Thumbnail> {
  if (!sniffImageFormat(input)) throw new Error("not a supported image (jpeg/png/webp/gif)");
  const opt = sharpOptions(o);
  const { data, info } = await sharp(input, opt.input)
    .rotate() // apply EXIF orientation before the metadata is dropped
    .resize(opt.resize)
    .webp(opt.webp)
    .toBuffer({ resolveWithObject: true });
  const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
  return { data, width: info.width, height: info.height, hash };
}

export function thumbnailPath(productId: number, hash: string): string {
  return `p/${productId}/${hash}.webp`;
}
