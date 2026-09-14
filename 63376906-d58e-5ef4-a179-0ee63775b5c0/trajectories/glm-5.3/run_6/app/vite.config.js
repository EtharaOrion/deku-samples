import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'web',
  plugins: [preact()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 12288,
    rollupOptions: {
      input: 'web/index.html',
      output: {
        manualChunks: undefined
      }
    }
  },
  server: { proxy: { '/api': 'http://localhost:4173' } }
});
