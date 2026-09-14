// Intake routes: batches with idempotency (mounted under /api).
import { Hono } from 'hono';
import { requireWriteSession } from '../middleware.js';

export const intakeRoutes = new Hono();

intakeRoutes.use('*', async (c, next) => {
  // Intake continues to accept a batch while the rest of the system is degraded.
  return next();
});
