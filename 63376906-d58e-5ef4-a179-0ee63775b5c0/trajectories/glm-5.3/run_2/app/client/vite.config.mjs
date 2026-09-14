import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
export default defineConfig({
  plugins: [preact()],
  build: { sourcemap: false, target: "es2020" },
  server: { proxy: { "/api": "http://localhost:4199" } },
});
