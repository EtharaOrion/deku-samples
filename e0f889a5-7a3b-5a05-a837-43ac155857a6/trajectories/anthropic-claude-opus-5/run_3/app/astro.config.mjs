import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';

// Every route is server-rendered HTML; only the parts that genuinely need
// behaviour become client islands.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 4173),
  },
  devToolbar: { enabled: false },
  // The framework's cross-site form check rejects any non-GET request whose
  // Origin is not this site, which would refuse ordinary JSON API calls. The
  // API is not cookie-authorised for mutation: it takes a bearer token, and the
  // cart cookie is SameSite=Lax, so a cross-site POST cannot carry it.
  security: { checkOrigin: false },
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: { sourcemap: false },
  },
});
