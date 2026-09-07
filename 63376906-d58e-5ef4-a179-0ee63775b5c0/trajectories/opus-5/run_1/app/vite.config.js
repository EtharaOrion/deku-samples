import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    sourcemap: false,
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  server: { host: '0.0.0.0' },
});
