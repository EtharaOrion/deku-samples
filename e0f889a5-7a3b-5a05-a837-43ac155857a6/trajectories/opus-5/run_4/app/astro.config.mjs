import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

// Every route is server-rendered HTML; only the parts that genuinely need
// behaviour become client islands. The node adapter runs in middleware mode so
// Hono owns the single origin and serves /api beside the pages.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [preact()],
  devToolbar: { enabled: false },
  build: { assets: '_astro' },
  // Nothing in this product uses Astro sessions; state lives in PostgreSQL.
  // Point the unused driver at a writable path so it can never fail on a
  // container whose application directory is read-only.
  session: { driver: 'fs-lite', options: { base: '/tmp/astro-sessions' } },
  // The same-origin check on form posts is done at the edge in server/index.mjs
  // instead, because behind a port mapping Astro compares the Origin header
  // against a URL it rebuilds without the port and rejects its own forms.
  security: { checkOrigin: false },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
  },
});
