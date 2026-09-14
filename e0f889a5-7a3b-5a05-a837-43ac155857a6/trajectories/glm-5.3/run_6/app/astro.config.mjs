import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import solid from '@astrojs/solid-js';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [solid()],
  server: { host: '0.0.0.0', port: 4173 },
  vite: { build: { assetsInlineLimit: 0 } }
});
