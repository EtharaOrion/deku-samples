import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'server',
  // No adapter session store: the token and the cart handle live in cookies and
  // every fact behind them lives in PostgreSQL, so the container writes no state
  // to its own disk.
  adapter: node({ mode: 'middleware' }),
  session: { driver: 'memory' },
  integrations: [preact()],
  devToolbar: { enabled: false },
  // The adapter runs behind our own Node server, so Astro cannot see the public
  // origin. We verify same-origin form posts ourselves in src/lib/actions.js.
  security: { checkOrigin: false },
  build: { assets: '_astro' },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
    build: { rollupOptions: { external: [] } },
  },
});
