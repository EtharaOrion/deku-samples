import { Hono } from 'hono';
import { many, one } from '../lib/db.mjs';
import { optionalAuth } from '../lib/auth.mjs';
import { badRequest, notFound } from '../lib/errors.mjs';
import { pageSizeFrom, decodeCursor, buildPage } from '../lib/pagination.mjs';
import { startFlashSession, completeFlashSession, failFlashSession, deviceBySerial, compareVersions } from '../lib/devices.mjs';

const app = new Hono();
app.use('*', optionalAuth);

async function body(c) {
  try { return (await c.req.json()) || {}; } catch { return {}; }
}

const NOTE_GROUPS = ['Newly Added', 'Improvements', 'Bug Fixes', 'Known Issues'];

/** Notes hold four ordered groups only, in that fixed order. */
function shapeNotes(notes) {
  const out = {};
  for (const g of NOTE_GROUPS) {
    const items = notes && Array.isArray(notes[g]) ? notes[g] : null;
    if (items && items.length) out[g] = items;
  }
  return out;
}

function shapeRelease(r) {
  return {
    version: r.version,
    build: r.build,
    released_on: r.released_on,
    channel: r.channel,
    artifact_name: r.artifact_name,
    size_bytes: Number(r.size_bytes),
    sha256: r.sha256,
    description: r.description,
    notes: shapeNotes(r.notes),
    note_groups: NOTE_GROUPS,
  };
}

// The archive orders by build descending and never by release date: 1.4.3 and
// 1.4.2 share a date and must still order deterministically.
app.get('/releases', async (c) => {
  const pageSize = pageSizeFrom(c);
  const cursor = decodeCursor(c.req.query('cursor'));

  const rows = await many(
    `SELECT * FROM app_release
      WHERE ($1::int IS NULL OR build < $1::int)
      ORDER BY build DESC
      LIMIT $2`,
    [cursor?.build ?? null, pageSize + 1],
  );
  const page = buildPage(rows, pageSize, (r) => ({ build: r.build }));
  return c.json({
    data: page.data.map(shapeRelease),
    next_cursor: page.next_cursor,
    has_more: page.has_more,
  });
});

app.get('/releases/:version', async (c) => {
  const release = await one('SELECT * FROM app_release WHERE version = $1', [c.req.param('version')]);
  if (!release) throw notFound('That release does not exist.');
  return c.json({ release: shapeRelease(release) });
});

/** The manifest the installer reads, served for one product at a time. */
app.get('/firmware/manifest', async (c) => {
  const model = c.req.query('model') || c.req.query('handle');
  if (!model) throw badRequest('model_required', 'Name the camera model.');

  const product = await one(
    `SELECT * FROM product WHERE (handle = $1 OR lower(title) = lower($1)) AND kind = 'camera'`,
    [model],
  );
  if (!product) throw notFound('That camera does not exist.');

  // A channel the device has not opted into is never offered.
  const optIn = String(c.req.query('channels') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const allowed = ['general', ...optIn.filter((ch) => ['beta', 'internal'].includes(ch))];

  const rows = await many(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = ANY($2::text[])
      ORDER BY build DESC`,
    [product.id, allowed],
  );

  return c.json({
    product: { handle: product.handle, title: product.title },
    generated_at: new Date().toISOString(),
    entries: rows.map((f) => ({
      version: f.version,
      build: f.build,
      channel: f.channel,
      min_firmware: f.min_firmware,
      min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes),
      sha256: f.sha256,
      released_on: f.released_on,
    })),
  });
});

/**
 * Look a camera up for the installer. Ownership and warranty are not conditions of
 * repair, so this answers for any serial that exists.
 */
app.get('/devices/:serial/firmware', async (c) => {
  const device = await deviceBySerial(c.req.param('serial'));
  if (!device) throw notFound('We do not recognise that serial number.');
  if (device.status === 'blocked') throw notFound('We do not recognise that serial number.');

  const entries = await many(
    `SELECT * FROM firmware WHERE product_id = $1 AND channel = 'general' ORDER BY build DESC`,
    [device.product_id],
  );

  const eligible = entries.map((f) => {
    let reason = null;
    if (f.min_firmware && (!device.firmware_version || compareVersions(device.firmware_version, f.min_firmware) < 0)) {
      reason = `This camera must be running ${f.min_firmware} or later first.`;
    }
    return {
      version: f.version, build: f.build, channel: f.channel,
      min_firmware: f.min_firmware, min_app_version: f.min_app_version,
      size_bytes: Number(f.size_bytes), sha256: f.sha256,
      eligible: reason === null, reason,
    };
  });

  const recommended = eligible.find((f) => f.eligible && (!device.firmware_version || compareVersions(f.version, device.firmware_version) > 0))
    || eligible.find((f) => f.eligible) || null;

  return c.json({
    device: {
      serial: device.serial,
      model: device.model,
      option_value: device.option_value,
      firmware_version: device.firmware_version,
    },
    recommended,
    entries: eligible,
  });
});

app.post('/flash-sessions', async (c) => {
  const { serial, target_build, channels } = await body(c);
  if (!serial) throw badRequest('serial_required', 'Serial number is required.');
  if (target_build === undefined || target_build === null) {
    throw badRequest('target_build_required', 'Name the firmware to write.');
  }

  const { session, device, firmware } = await startFlashSession({
    serial,
    targetBuild: target_build,
    optInChannels: Array.isArray(channels) ? channels : [],
  });

  return c.json({
    session: {
      id: Number(session.id),
      state: session.state,
      started_at: session.started_at,
      serial: device.serial,
      model: device.model,
      target_version: firmware.version,
      target_build: firmware.build,
      reported_version: null,
    },
  }, 201);
});

app.post('/flash-sessions/:id/complete', async (c) => {
  const { reported_version } = await body(c);
  const { session, device } = await completeFlashSession(c.req.param('id'), reported_version);
  return c.json({
    session: {
      id: Number(session.id),
      state: session.state,
      reported_version: session.reported_version,
      ended_at: session.ended_at,
    },
    // The version the camera reported, never the one requested.
    device: { serial: device.serial, firmware_version: device.firmware_version },
  });
});

app.post('/flash-sessions/:id/fail', async (c) => {
  const { reason } = await body(c);
  const { session, device } = await failFlashSession(c.req.param('id'), reason);
  return c.json({
    session: {
      id: Number(session.id),
      state: session.state,
      failure_reason: session.failure_reason,
      ended_at: session.ended_at,
    },
    device: { serial: device.serial, firmware_version: device.firmware_version },
  });
});

/** Delivery methods, so checkout can render them without inventing prices. */
app.get('/delivery-methods', async (c) => {
  const rows = await many(
    `SELECT sm.code, sm.title, sm.price_minor, sm.window_text FROM shipping_method sm
       JOIN shipping_zone sz ON sz.id = sm.zone_id WHERE sz.code = 'us-domestic' ORDER BY sm.position`,
  );
  return c.json({ data: rows, next_cursor: null, has_more: false });
});

export default app;
