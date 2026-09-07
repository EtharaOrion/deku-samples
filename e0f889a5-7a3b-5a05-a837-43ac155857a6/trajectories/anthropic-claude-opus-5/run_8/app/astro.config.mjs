import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  server: { host: '0.0.0.0' },
  devToolbar: { enabled: false },
  build: { assets: '_astro' },
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
