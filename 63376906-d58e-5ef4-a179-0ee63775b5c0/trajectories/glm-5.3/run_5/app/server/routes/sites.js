import { Hono } from 'hono';

const r = new Hono();

r.get('/', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM site ORDER BY reference')).rows;
  return c.json(rows.map((s) => ({
    reference: s.reference,
    name: s.name,
    confidence: s.confidence,
    certification_state: s.certification_state
  })));
});

r.get('/sites', async (c) => {
  const db = c.get('db');
  const rows = (await db.query('SELECT * FROM site ORDER BY reference')).rows;
  return c.json(rows.map((s) => ({
    reference: s.reference,
    name: s.name,
    confidence: s.confidence,
    certification_state: s.certification_state
  })));
});

r.get('/sites/:reference/capacity', async (c) => {
  const db = c.get('db');
  const s = (await db.query('SELECT * FROM site WHERE reference=$1', [c.req.param('reference')])).rows[0];
  if (!s) return c.json({ error: 'not_found' }, 404);
  return c.json({
    reference: s.reference,
    nameplate_kg: s.nameplate_kg,
    basis: s.capacity_basis,
    contracted_kg: s.contracted_kg,
    uncommitted_kg: s.nameplate_kg - s.contracted_kg,
    confidence: s.confidence,
    last_revised: s.last_revised
  });
});

r.get('/parties/:reference/versions', async (c) => {
  const db = c.get('db');
  const rows = (await db.query(
    'SELECT name, effective_from FROM party_version WHERE party_ref=$1 ORDER BY effective_from',
    [c.req.param('reference')])).rows;
  return c.json(rows);
});

r.post('/parties/:reference/versions', async (c) => {
  const db = c.get('db');
  const s = await (await import('../lib/auth.js')).currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const { requireRoles } = await import('./public.js');
  void requireRoles;
  if (!['quality_manager', 'claims_manager'].some((role) => s.roles.includes(role))) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  const { withIdempotency } = await import('../lib/idempotency.js');
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !body.effective_from) {
      return Response.json({ error: 'invalid_request', message: 'name and effective_from are required' }, { status: 400 });
    }
    await db.query('INSERT INTO party_version (party_ref,name,effective_from) VALUES ($1,$2,$3)',
      [c.req.param('reference'), body.name, body.effective_from]);
    const { appendEntry } = await import('../lib/record.js');
    await appendEntry(db, {
      kind: 'party_version_recorded', object_ref: `${c.req.param('reference')}:${body.effective_from}`,
      person: s.email, site: null,
      content: { party: c.req.param('reference'), name: body.name, effective_from: body.effective_from, supersedes_previous: true }
    });
    return Response.json({ reference: `${c.req.param('reference')}:${body.effective_from}`, name: body.name, effective_from: body.effective_from }, { status: 201 });
  });
});

// A site certification suspension that can reach backwards.
r.post('/sites/:reference/certification', async (c) => {
  const db = c.get('db');
  const { currentSession } = await import('../lib/auth.js');
  const s = await currentSession(c);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!s.roles.includes('quality_manager')) {
    return Response.json({ error: 'forbidden', reason: 'role_not_permitted' }, { status: 403 });
  }
  const { withIdempotency } = await import('../lib/idempotency.js');
  return withIdempotency(c, async () => {
    const body = await c.req.json().catch(() => ({}));
    const state = body.state || 'suspended';
    if (!['certified', 'suspended', 'not_certified'].includes(state)) {
      return Response.json({ error: 'invalid_state' }, { status: 400 });
    }
    const site = c.req.param('reference');
    const effective_from = body.effective_from;
    const effective_to = body.effective_to || '2999-12-31';
    if (!effective_from) return Response.json({ error: 'invalid_request', message: 'effective_from is required' }, { status: 400 });

    await db.query(
      `INSERT INTO site_certification (site,state,valid_from,valid_to,recorded_on,recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [site, state, effective_from, effective_to, new Date().toISOString().slice(0, 10), s.email]);

    let certificates_in_window = [];
    if (state === 'suspended') {
      const certs = (await db.query('SELECT number, signed_at, site, state FROM certificate WHERE site=$1', [site])).rows;
      certificates_in_window = certs
        .filter((cert) => {
          const d = new Date(cert.signed_at).toISOString().slice(0, 10);
          return d >= effective_from && d <= effective_to;
        })
        .map((cert) => ({
          number: cert.number,
          state: cert.state,
          signed_on: new Date(cert.signed_at).toISOString().slice(0, 10),
          restatement_outcome: cert.state === 'withdrawn' ? 'withdrawn' : 'unaffected'
        }));
    }

    const { appendEntry } = await import('../lib/record.js');
    await appendEntry(db, {
      kind: 'site_certification_recorded', object_ref: `${site}:${state}:${effective_from}`,
      person: s.email, site,
      content: { site, state, effective_from, effective_to, certificates_in_window }
    });
    return Response.json({
      site, state, effective_from, effective_to,
      certificates_in_window,
      issuing_stopped: state === 'suspended',
      blocking_condition: state === 'suspended' ? 'site_certification_suspended' : null
    }, { status: 201 });
  });
});

r.get('/sites/:reference/certification', async (c) => {
  const db = c.get('db');
  const rows = (await db.query(
    'SELECT * FROM site_certification WHERE site=$1 ORDER BY valid_from', [c.req.param('reference')])).rows;
  return c.json(rows.map((x) => ({
    site: x.site, state: x.state, valid_from: x.valid_from, valid_to: x.valid_to,
    recorded_on: x.recorded_on, recorded_by: x.recorded_by
  })));
});

export default r;
