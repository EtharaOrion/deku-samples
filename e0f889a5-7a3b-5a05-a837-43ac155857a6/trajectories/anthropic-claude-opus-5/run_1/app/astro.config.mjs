import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

// Every route is server-rendered HTML; only the parts that genuinely need
// behaviour become client islands.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [preact()],
  devToolbar: { enabled: false },
  // Astro's own origin check compares against a hostname it derives as
  // `localhost` unless a domain allow-list is configured, which would refuse
  // every form post on whatever host this is actually served at. The same
  // protection is enforced in server/index.js against the real Host header,
  // so it holds on any hostname without one being hardcoded.
  security: { checkOrigin: false },
  build: { assets: '_astro' },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
    build: { chunkSizeWarningLimit: 1200 },
  },
});
