import type { Hono } from 'hono';
import { firmwareForProduct, startFlashSession, completeFlashSession, failFlashSession, FlashError, sessionView, firmwareByBuild } from '../flash.ts';
import { productByHandle } from '../catalog.ts';
import { q } from '../db/pool.ts';
import { clientError, ApiEnv } from './util.ts';
import { latestFirmware, deviceBySerial } from '../devices.ts';

export function registerFirmwareRoutes(app: Hono<ApiEnv>) {
  // The manifest the installer reads: one product at a time, general channel only
  // unless the device has opted into another channel.
  app.get('/api/firmware/manifest', async (c) => {
    const model = c.req.query('model');
    const channel = c.req.query('channel');
    if (!model) return clientError(c, 400, 'missing_model', 'We need to know which camera.');
    const product = await productByHandle(model);
    if (!product || product.kind !== 'camera') return clientError(c, 404, 'not_found', 'That page does not exist.');
    const rows = await firmwareForProduct(product.id, channel);
    const entries = rows
      .filter((f: any) => (channel ? f.channel === channel : f.channel === 'general' || f.channel === 'beta'))
      .filter((f: any) => f.channel !== 'yanked')
      .map((f: any) => ({
        version: f.version,
        build: Number(f.build),
        channel: f.channel,
        min_firmware: f.min_firmware ?? null,
        min_app_version: f.min_app_version,
        size_bytes: Number(f.size_bytes),
        sha256: f.sha256,
      }));
    return c.json({ product: product.title, product_handle: product.handle, generated_at: new Date().toISOString(), entries });
  });

  // The installer states what a camera reports. Ownership is not a condition of
  // repair, so this surface exposes the model, serial and reported version only.
  app.get('/api/devices/:serial/summary', async (c) => {
    const serial = (c.req.param('serial') || '').trim().toUpperCase();
    const device = await deviceBySerial(serial);
    if (!device) return clientError(c, 404, 'unknown_serial', 'We do not recognise that serial number.');
    return c.json({
      serial: device.serial,
      model: device.model,
      product_handle: device.product_handle,
      firmware_version: device.firmware_version ?? null,
      blocked: device.status === 'blocked',
    });
  });

  app.get('/api/firmware', async (c) => {
    const model = c.req.query('model');
    const product = model ? await productByHandle(model) : null;
    const rows = product ? await firmwareForProduct(product.id) : [];
    return c.json({ data: rows, next_cursor: null, has_more: false });
  });

  app.post('/api/flash-sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const serial = String(body.serial || '').trim();
    const targetBuild = Number(body.target_build);
    if (!serial) return clientError(c, 400, 'missing_serial', 'Serial is required.');
    if (!Number.isFinite(targetBuild)) return clientError(c, 400, 'missing_target_build', 'We need to know which firmware.');
    try {
      const session = await startFlashSession({ serial, targetBuild });
      return c.json({ session }, 201);
    } catch (err: any) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });

  app.post('/api/flash-sessions/:id/complete', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const reported = String(body.reported_version || '').trim();
    if (!reported) return clientError(c, 400, 'missing_reported_version', 'We need the version the camera reported.');
    try {
      const session = await completeFlashSession(c.req.param('id'), reported);
      return c.json({ session });
    } catch (err: any) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });

  app.post('/api/flash-sessions/:id/fail', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || 'unknown').trim();
    try {
      const session = await failFlashSession(c.req.param('id'), reason);
      return c.json({ session });
    } catch (err: any) {
      if (err instanceof FlashError) return clientError(c, err.status, err.code, err.message);
      throw err;
    }
  });
}
