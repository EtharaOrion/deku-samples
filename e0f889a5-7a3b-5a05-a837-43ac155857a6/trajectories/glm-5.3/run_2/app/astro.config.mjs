import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  srcDir: './src',
  publicDir: './public',
  server: { port: Number(process.env.PORT || 4173), host: '0.0.0.0' },
  vite: {
    build: { target: 'es2022' },
  },
});
