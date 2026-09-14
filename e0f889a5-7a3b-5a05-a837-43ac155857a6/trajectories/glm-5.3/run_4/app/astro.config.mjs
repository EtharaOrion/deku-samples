import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: process.env.APP_PUBLIC_URL || 'http://localhost:4173',
  server: { host: true, port: Number(process.env.PORT || 4173) },
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  vite: { build: { cssMinify: true } },
  srcDir: './src',
  pages: './src/pages',
});
