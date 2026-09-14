import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 4173);

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone', host, port }),
  server: { host, port },
  vite: {
    ssr: { external: ['pg', 'nodemailer'] },
  },
});
