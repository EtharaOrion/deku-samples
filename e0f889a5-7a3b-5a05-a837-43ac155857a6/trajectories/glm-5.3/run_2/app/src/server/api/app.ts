import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';

export type ApiEnv = { Variables: { requestId: string } };

export function makeApiApp(): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>();

  app.use('*', async (c, next) => {
    c.set('requestId', (c.req.header('x-request-id') as string) || randomUUID());
    await next();
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'That page does not exist.', request_id: c.get('requestId') } }, 404));
  app.onError((err, c) => {
    const anyErr = err as any;
    const status = typeof anyErr.status === 'number' ? anyErr.status : 500;
    const code = anyErr.code || 'internal_error';
    const message = status >= 500 ? 'Something went wrong at our end.' : (anyErr.message || 'That did not work.');
    if (status >= 500) console.error(JSON.stringify({ level: 'error', msg: 'api_error', error: err.message, stack: err.stack, request_id: c.get('requestId'), time: new Date().toISOString() }));
    return c.json({ error: { code, message, request_id: c.get('requestId') } }, status as any);
  });

  return app;
}
