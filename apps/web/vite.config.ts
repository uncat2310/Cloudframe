// vite.config.ts
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import analyzer from "vite-bundle-analyzer";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

/**
 * Sent with every page and API response (on Workers also written to
 * `_headers` for static assets). The SPA shell has inline bootstrap scripts,
 * so the CSP restricts framing, plugins, `<base>` and form targets rather
 * than scripts.
 */
const securityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

/**
 * HEIC decoding, the image codecs and the Live Photo player only ever run in
 * the browser, loaded with a dynamic import(). On the server they are replaced
 * by an empty module so they don't bloat the Worker bundle.
 */
const BROWSER_ONLY_MODULES =
  /^(heic-to|livephotoskit|@jsquash\/(avif|jpeg|jxl|png|webp))(\/|$)/;
const BROWSER_ONLY_STUB = "\0browser-only-stub";

function browserOnlyOnServer(): Plugin {
  return {
    name: "cloudframe:browser-only-on-server",
    enforce: "pre",
    applyToEnvironment: (environment) => environment.name !== "client",
    resolveId: (id) =>
      BROWSER_ONLY_MODULES.test(id) ? BROWSER_ONLY_STUB : undefined,
    load: (id) => (id === BROWSER_ONLY_STUB ? "export default {};" : undefined),
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    browserOnlyOnServer(),
    Icons({ compiler: "jsx", jsx: "react" }),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      router: { entry: "main.tsx" },
      // Written as index.html so Cloudflare's static assets can serve the
      // shell for every page without invoking the Worker (see wrangler.jsonc).
      spa: { enabled: true, prerender: { outputPath: "/index" } },
    }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    nitro({
      routeRules: {
        "/**": { headers: securityHeaders },
        "/api/rpc/**": {
          headers: { ...securityHeaders, "Cache-Control": "no-store" },
        },
        // Route rule headers win over the handler's, so the object proxy's
        // sandbox has to be declared here too.
        "/api/self-host/object": {
          headers: {
            ...securityHeaders,
            "Content-Security-Policy":
              "default-src 'none'; sandbox; frame-ancestors 'none'",
          },
        },
      },
    }),
    process.env.ANALYZE === "true" ? analyzer() : undefined,
  ],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    exclude: [
      "@jsquash/avif",
      "@jsquash/jpeg",
      "@jsquash/jxl",
      "@jsquash/png",
      "@jsquash/webp",
    ],
  },
  worker: {
    format: "es",
  },
});
