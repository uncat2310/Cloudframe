import { createFileRoute } from "@tanstack/react-router";
import { loadSelfHostConfig } from "@/lib/self-host/config";
import { hasValidSession } from "@/lib/self-host/session";
import { getSelfHostStorage } from "@/lib/self-host/storage";

/**
 * Same-origin proxy for stored objects the browser has to read with
 * `fetch`/XHR (HEIC conversion, Live Photo playback), so the public bucket
 * URL needs no CORS rules in self-hosted mode.
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
        });
        if (object.value.contentType) {
          headers.set("Content-Type", object.value.contentType);
        }
        if (object.value.size !== undefined) {
          headers.set("Content-Length", String(object.value.size));
        }
        return new Response(object.value.body, { headers });
      },
    },
  },
});
