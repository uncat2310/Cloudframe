import type { ThumbnailMode } from "./config";

/**
 * One size for every gallery tile: the longer side is at most 800px (sharp on
 * 2x screens for the gallery's row height), never upscaled, in the most
 * efficient format the browser accepts. A single size keeps each image to one
 * unique transformation per month on Cloudflare's quota.
 */
const CLOUDFLARE_OPTIONS =
  "width=800,height=800,fit=scale-down,quality=80,format=auto";

/**
 * Extensions Cloudflare Image Transformations can read. HEIC keeps going
 * through the in-browser conversion, SVG and videos are shown as they are.
 */
const TRANSFORMABLE = /\.(jpe?g|png|webp|avif|gif)$/i;

let mode: ThumbnailMode = "off";

export function setSelfHostThumbnails(next: ThumbnailMode) {
  mode = next;
}

/**
 * Thumbnail URL for a public image URL, or `undefined` to show the original.
 */
export function toThumbnailUrl(
  url: string,
  thumbnailMode: ThumbnailMode = mode,
): string | undefined {
  if (thumbnailMode !== "cloudflare") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || !TRANSFORMABLE.test(parsed.pathname)) {
    return undefined;
  }
  return `${parsed.origin}/cdn-cgi/image/${CLOUDFLARE_OPTIONS}${parsed.pathname}`;
}
