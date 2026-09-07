import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Every route is server-rendered HTML; only the parts that genuinely need
// behaviour become client islands.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  server: { host: true },
  devToolbar: { enabled: false },
  build: { assets: '_astro' },
  vite: {
    ssr: { external: ['pg', 'nodemailer', '@node-rs/argon2'] },
  },
});
