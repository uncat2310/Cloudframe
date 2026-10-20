import { createFileRoute } from "@tanstack/react-router";
import { loadSelfHostConfig } from "@/lib/self-host/config";
import {
  isImageOrVideoType,
  isInsideIncludePath,
} from "@/lib/self-host/policy";
import { hasValidSession } from "@/lib/self-host/session";
import { getSelfHostStorage } from "@/lib/self-host/storage";

/**
 * Same-origin proxy for stored objects the browser has to read with
 * `fetch`/XHR (HEIC conversion, Live Photo playback), so the public bucket
 * URL needs no CORS rules in self-hosted mode.
 *
 * Responses come from the panel's own origin, so they are locked down: no
 * MIME sniffing, a sandboxing CSP, and anything that is not an image or
 * video is sent as a download instead of being rendered.
 */
export const Route = createFileRoute("/api/self-host/object")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const result = loadSelfHostConfig();
        if (!result.ok) return new Response(null, { status: 503 });
        if (!(await hasValidSession(result.config, request.headers))) {
          return new Response(null, { status: 401 });
        }
        const key = new URL(request.url).searchParams.get("key");
        if (!key) return new Response(null, { status: 400 });
        if (!isInsideIncludePath(result.config.s3.includePath, key)) {
          return new Response(null, { status: 403 });
        }

        const object = await getSelfHostStorage(result.config).openStoredImage(
          key,
        );
        if (!object.ok) {
          return new Response(null, {
            status: object.error.reason === "not-found" ? 404 : 502,
          });
        }
        const headers = new Headers({
          "Cache-Control": "private, max-age=3600",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
        });
        const { contentType, size } = object.value;
        if (isImageOrVideoType(contentType)) {
          headers.set("Content-Type", contentType);
        } else {
          headers.set("Content-Type", "application/octet-stream");
          headers.set("Content-Disposition", "attachment");
        }
        if (size !== undefined) {
          headers.set("Content-Length", String(size));
        }
        return new Response(object.value.body, { headers });
      },
    },
  },
});
