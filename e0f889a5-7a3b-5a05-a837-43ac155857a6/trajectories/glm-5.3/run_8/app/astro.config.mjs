import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  srcDir: './src',
  outDir: './dist',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  build: { format: 'directory', assets: 'assets' },
  vite: {
    build: { target: 'es2022' },
    resolve: { alias: { '@server': r('./server'), '@components': r('./src/components'), '@layouts': r('./src/layouts'), '@lib': r('./src/lib'), '@styles': r('./src/styles') } },
  },
  server: { port: Number(process.env.PORT || process.env.APP_PUBLIC_PORT || 4173), host: '0.0.0.0' },
});
