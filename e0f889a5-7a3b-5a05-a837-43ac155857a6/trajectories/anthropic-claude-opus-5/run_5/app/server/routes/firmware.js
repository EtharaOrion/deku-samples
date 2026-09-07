import { Hono } from 'hono';
import { manifestFor, startSession, completeSession, failSession, sessionById } from '../lib/flash.js';
import {
  MODEL_CODES, assertSerialShape, deviceBySerial, latestFirmwareFor, compareVersions,
} from '../lib/devices.js';
import { badRequest, notFound, unprocessable } from '../lib/errors.js';

const routes = new Hono();

/**
 * What the installer is allowed to know about a camera before a write.
 *
 * A camera registered to somebody else, and a camera out of warranty, are both
 * repaired: ownership and warranty are not conditions of repair. So this route
 * is public, and it never names the owner.
 */
routes.get('/devices/:serial/public', async (c) => {
  const serial = assertSerialShape(c.req.param('serial'));
  const device = await deviceBySerial(serial);
  if (!device) throw notFound('We do not recognise that serial number.', 'unknown_serial');
  if (device.status === 'blocked') {
    throw unprocessable('device_blocked', 'That camera is blocked. Get in touch before using it.');
  }
  const latest = await latestFirmwareFor(device.product_id);
  return c.json({
    serial: device.serial,
    model: device.model,
    handle: device.handle,
    firmware_version: device.firmware_version,
    latest_firmware: latest?.version ?? null,
    update_available: Boolean(
      device.firmware_version && latest && compareVersions(device.firmware_version, latest.version) < 0,
    ),
  });
});

/** The manifest is served for one product at a time. */
routes.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model') || c.req.query('handle');
  if (!model) throw badRequest('model_required', 'Name the model to read a manifest for.');
  // Accept a handle, a model code or a title.
  const handle =
    MODEL_CODES[String(model).toUpperCase()] ??
    ({ 'vela-a1': 'flagship', 'vela a1': 'flagship', 'vela-cricket': 'compact', 'vela cricket': 'compact' }[
      String(model).toLowerCase()
    ] ?? String(model).toLowerCase());

  const channelParam = c.req.query('channel');
  // A non-general channel is only ever offered to a device that opted into it.
  const channels = channelParam
    ? ['general', ...String(channelParam).split(',').map((s) => s.trim()).filter(Boolean)]
    : ['general'];

  return c.json(await manifestFor({ handle, channels: [...new Set(channels)] }));
});

routes.post('/flash-sessions', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body?.target_build === undefined || body?.target_build === null) {
    throw badRequest('target_build_required', 'Name the firmware build to write.');
  }
  const channels = Array.isArray(body?.channels) && body.channels.length
    ? ['general', ...body.channels]
    : ['general'];
  const session = await startSession({
    serial: body?.serial,
    targetBuild: body.target_build,
    reportedVersion: body?.reported_version ?? null,
    channels: [...new Set(channels)],
  });
  return c.json(session, 201);
});

routes.get('/flash-sessions/:id', async (c) => {
  const session = await sessionById(c.req.param('id'));
  if (!session) throw notFound('That session does not exist.', 'unknown_session');
  return c.json({
    id: Number(session.id),
    state: session.state,
    serial: session.serial,
    model: session.model,
    target_version: session.firmware_version,
    reported_version: session.reported_version,
    failure_reason: session.failure_reason,
  });
});

routes.post('/flash-sessions/:id/complete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await completeSession({ id: c.req.param('id'), reportedVersion: body?.reported_version }));
});

routes.post('/flash-sessions/:id/fail', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json(await failSession({ id: c.req.param('id'), reason: body?.reason }));
});

export default routes;
