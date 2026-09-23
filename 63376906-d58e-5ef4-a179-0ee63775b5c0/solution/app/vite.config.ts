import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
  },
});
