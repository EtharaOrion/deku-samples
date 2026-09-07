import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  plugins: [preact({ prefreshEnabled: false, devtoolsInProd: false })],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // No source map ships.
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // The console's heavy surfaces load on the route that needs them, so a
        // public route never carries the console's script.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'framework';
          return undefined;
        },
      },
    },
  },
});
