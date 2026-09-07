import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // The public routes must not pull the console's weight, so the console
        // is its own chunk.
        manualChunks(id) {
          if (id.includes('/client/console/')) return 'console';
          return undefined;
        },
      },
    },
  },
  server: { host: '0.0.0.0' },
});
