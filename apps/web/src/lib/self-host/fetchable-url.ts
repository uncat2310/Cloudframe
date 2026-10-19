import { selfHostMode } from "./flag";

let publicBase: string | undefined;

export function setSelfHostPublicBase(pubUrl: string) {
  publicBase = pubUrl.endsWith("/") ? pubUrl : `${pubUrl}/`;
}

/**
 * URL to use when the browser must read an image's bytes with `fetch`/XHR.
 * In self-hosted mode, public bucket URLs are routed through the same-origin
 * object proxy so the bucket needs no CORS rules; anything else (including
 * `blob:` URLs) is returned unchanged.
 */
export function toFetchableUrl(url: string) {
  if (!selfHostMode || !publicBase || !url.startsWith(publicBase)) return url;
  const key = url.slice(publicBase.length);
  return `/api/self-host/object?key=${encodeURIComponent(key)}`;
}
