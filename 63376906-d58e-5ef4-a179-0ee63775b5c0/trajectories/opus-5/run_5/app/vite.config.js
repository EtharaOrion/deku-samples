import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'client',
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
  },
  server: { host: '0.0.0.0' },
});
