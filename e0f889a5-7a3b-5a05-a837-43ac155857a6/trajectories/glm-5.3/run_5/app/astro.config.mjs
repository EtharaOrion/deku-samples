import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

const port = Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173);

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: '0.0.0.0', port },
  vite: { build: { target: 'es2022' } },
});
