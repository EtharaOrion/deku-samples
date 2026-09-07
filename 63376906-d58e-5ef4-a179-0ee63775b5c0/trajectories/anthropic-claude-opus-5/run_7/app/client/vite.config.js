import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    // No source map ships.
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 0
  },
  server: {
    proxy: { '/api': 'http://localhost:4173' }
  }
});
