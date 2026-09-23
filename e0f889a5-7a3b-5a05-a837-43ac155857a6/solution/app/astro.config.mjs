import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { env } from './src/server/env.ts';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: env.host, port: env.port },
  devToolbar: { enabled: false },
  // The JSON API is the contract surface and is called without an Origin header
  // by non-browser clients, so the framework's form-origin guard is not the
  // right tool here. Same-origin is enforced for HTML form posts in middleware.
  security: { checkOrigin: false },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
  },
});
