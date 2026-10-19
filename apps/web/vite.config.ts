// vite.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import analyzer from "vite-bundle-analyzer";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";

/**
 * Cloudflare Workers builds resolve the `browser` export of
 * `fumadocs-mdx/runtime/vite`, which lacks the `sourceAsync` the docs loader
 * calls at startup; force the server runtime for server environments.
 */
function fumadocsServerRuntime(): Plugin {
  const serverRuntime = fileURLToPath(
    import.meta.resolve("fumadocs-mdx/runtime/vite"),
  );
  return {
    name: "fumadocs-mdx-server-runtime",
    enforce: "pre",
    resolveId(id) {
      if (
        id === "fumadocs-mdx/runtime/vite" &&
        this.environment.config.consumer === "server"
      ) {
        return serverRuntime;
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    fumadocsServerRuntime(),
    Icons({ compiler: "jsx", jsx: "react" }),
    mdx(await import("./source.config")),
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      router: { entry: "main.tsx" },
      sitemap: {
        enabled: true,
        host: process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://imageport.app",
      },
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },
      prerender: {
        filter: ({ path }) => {
          if (["/en", "/zh", "/"].includes(path)) return true;
          if (path.includes("/docs") && !path.includes("/#")) {
            return true;
          }
          return false;
        },
      },
      pages: [
        { path: "/en", prerender: { enabled: true } },
        { path: "/zh", prerender: { enabled: true } },
        { path: "/api/search", prerender: { enabled: true } },
      ],
    }),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    nitro(),
    process.env.ANALYZE === "true" ? analyzer() : undefined,
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("fumadocs")) {
            return "fumadocs";
          }
          return null;
        },
      },
    },
  },
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
