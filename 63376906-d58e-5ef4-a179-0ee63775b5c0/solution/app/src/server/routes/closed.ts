import { Hono } from 'hono';
import type { AppEnv } from '../auth/guard.js';
import { json } from './context.js';

export const closedRoutes = new Hono<AppEnv>();

const IMMUTABLE_METHODS = ['PATCH', 'PUT', 'DELETE'];

const IMMUTABLE_PATHS = [
  '/runs/:ref',
  '/certificates/:number',
  '/balance-periods/:id',
  '/carbon-methods/:id/versions/:version',
  '/record/:seq',
  '/lots/:ref',
  '/batches',
  '/batches/:ref',
];

const OUT_OF_SCOPE_PATHS = [
  '/setpoints',
  '/alarms',
  '/trends',
  '/interlocks',
  '/sensors',
  '/instrument-queue',
  '/analyst-worklist',
  '/calibration-curves',
  '/lca-model',
  '/invoices',
  '/prices',
  '/purchase-orders',
  '/dispatch',
  '/payments',
  '/files',
  '/engine/state',
];

for (const path of IMMUTABLE_PATHS) {
  closedRoutes.on(IMMUTABLE_METHODS, path, (c) =>
    json(
      {
        error: 'record_immutable',
        detail: `${c.req.method} ${c.req.path} is refused: a record is corrected by a new act naming what it corrects, never by editing or removing what stands.`,
      },
      409,
    ),
  );
}

for (const path of OUT_OF_SCOPE_PATHS) {
  closedRoutes.all(path, () => json({ error: 'route_not_found', detail: 'this product holds no such route' }, 404));
  closedRoutes.all(`${path}/*`, () => json({ error: 'route_not_found', detail: 'this product holds no such route' }, 404));
}

closedRoutes.all('*', (c) =>
  json({ error: 'route_not_found', detail: `${c.req.method} ${c.req.path} is not a route this product answers` }, 404),
);
