import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'client',
  publicDir: '../public',
  plugins: [preact()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // no source map ships
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
  },
  server: { host: '0.0.0.0' },
});
