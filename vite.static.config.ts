import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

function renameStaticHtml(): Plugin {
  return {
    name: "rename-static-html",
    closeBundle() {
      const from = join(process.cwd(), "drag-drop-deploy", "static.index.html");
      const to = join(process.cwd(), "drag-drop-deploy", "index.html");
      if (existsSync(from)) {
        renameSync(from, to);
      }
    },
  };
}

export default defineConfig({
  base: "./",
  publicDir: "static-public",
  plugins: [
    tanstackRouter({ target: "react" }),
    react(),
    tailwindcss(),
    tsConfigPaths(),
    renameStaticHtml(),
  ],
  build: {
    outDir: "drag-drop-deploy",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: "static.index.html",
    },
  },
  resolve: {
    dedupe: ["react", "react-dom", "three"],
  },
});
