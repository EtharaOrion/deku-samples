import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // No source map ships.
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // One bundle for the framework and one for the app: no route loads a
        // library it does not use, and there is no general-purpose DOM library
        // shipping alongside the framework.
        manualChunks: {
          framework: ['preact', 'preact/hooks']
        }
      }
    }
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:4173' }
  }
});
