import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [preact()],
  server: { host: '0.0.0.0' },
  devToolbar: { enabled: false },
  build: { assets: '_astro' },
  // Astro's own origin check compares against a hostname it derives without the
  // port, which can never match a browser's Origin on this deployment. The same
  // protection is enforced in server/index.js against the real Host header, so
  // it holds whatever hostname the app is reached by.
  security: { checkOrigin: false },
  vite: {
    ssr: { noExternal: [] },
  },
});
