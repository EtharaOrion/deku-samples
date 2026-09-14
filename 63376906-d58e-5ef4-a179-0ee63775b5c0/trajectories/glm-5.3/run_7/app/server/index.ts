import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const port = Number(process.env.PORT || 4173);
const { app } = await import('./app.js');
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log('ravel serving on 0.0.0.0:' + info.port);
});
