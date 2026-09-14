import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
export default defineConfig({
  plugins: [preact()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0, rollupOptions: { output: { entryFileNames: 'assets/app.[hash].js', chunkFileNames: 'assets/[name].[hash].js', assetFileNames: 'assets/[name].[hash][extname]' } } },
  server: { proxy: { '/api': 'http://localhost:4173' } },
});
