import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  srcDir: './src',
  outDir: './dist',
  publicDir: './public',
  build: { inlineStylesheets: 'auto' }
});
