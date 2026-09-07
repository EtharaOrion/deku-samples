import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

// Every route is server-rendered HTML; only the parts that need behaviour become
// client islands.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  integrations: [preact()],
  server: { host: true },
  devToolbar: { enabled: false },
  // The app is reached through a mapped port, so the Origin a browser sends does
  // not match the address this server binds. Same-origin is enforced in middleware
  // against the request's own Host instead.
  security: { checkOrigin: false },
  build: { inlineStylesheets: 'auto' },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
  },
});
