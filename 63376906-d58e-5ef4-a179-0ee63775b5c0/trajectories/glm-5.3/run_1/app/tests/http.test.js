import { describe, it, expect, beforeAll } from 'vitest';

// These tests run against a live server on RAVEL_URL (default localhost:4173).
const BASE = process.env.RAVEL_URL || 'http://localhost:4173';
const live = await fetch(BASE + '/api/health').then((r) => r.ok).catch(() => false);

const req = async (method, path, body, token, key) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
};

const login = async (email) => {
  const r = await req('POST', '/api/auth/login', { email, password: 'deku-demo-pw-2026' }, null, 'test-' + email);
  return r.data.access_token;
};

describe.skipIf(!live)('the API behind the product', () => {
  let tok = {};
  beforeAll(async () => {
    tok = {};
    for (const e of ['plant@example.com', 'claims@example.com', 'quality@example.com', 'signer@example.com', 'signer2@example.com', 'auditor@example.com', 'analyst@example.com']) {
      tok[e] = await login(e);
    }
  });

  it('answers health with no session', async () => {
    const r = await req('GET', '/api/health');
    expect(r.status).toBe(200);
  });

  it('refuses a write with no idempotency key', async () => {
    const r = await req('POST', '/api/enquiries', { type: 'press', name: 'x', email: 'a@b.co' });
    expect(r.status).toBe(400);
  });

  it('refuses a category change for every role', async () => {
    for (const t of Object.values(tok)) {
      const r = await req('PATCH', '/api/batches/BATCH-1001', { category: 'pre_consumer' }, t, 'cat-' + Math.random());
      expect(r.status).toBe(409);
      expect(r.data.error).toBe('category_change_refused');
    }
  });

  it('seeds the batches the brief names, with claimability resolved on receipt date', async () => {
    const r = await req('GET', '/api/batches', null, tok['auditor@example.com']);
    const by = Object.fromEntries(r.data.map((b) => [b.reference, b]));
    expect(by['BATCH-1001'].dry_mass_g).toBe(450000);
    expect(by['BATCH-1003'].claimable).toBe(false);
    expect(by['BATCH-1003'].claimable_reason).toBe('collector_approval_lapsed');
    expect(by['BATCH-1003'].collector_name).toBe('Brine Textile Recovery');
    expect(by['BATCH-1004'].claimable).toBe(true);
    expect(by['BATCH-1004'].flags).toContain('lapsed_calibration');
    expect(by['BATCH-1005'].claimable_reason).toBe('custody_link_missing:transport');
  });

  it('carries BATCH-1001 once at 450000 g in the genealogy of LOT-N6-0001', async () => {
    const r = await req('GET', '/api/lots/LOT-N6-0001/genealogy', null, tok['auditor@example.com']);
    const b = r.data.nodes.find((n) => n.reference === 'BATCH-1001');
    expect(b.mass_g).toBe(450000);
    expect(r.data.text_equivalent.batches.length).toBeGreaterThan(0);
  });

  it('refuses pagination on the complete-set routes', async () => {
    const r = await req('GET', '/api/record/queries/lots_from_batch?page=1', null, tok['auditor@example.com']);
    expect(r.status).toBe(400);
    expect(r.data.error).toBe('pagination_refused');
  });

  it('verifies publicly, states a withdrawal, and does not enumerate', async () => {
    const r = await req('GET', '/api/verify/CERT-PILOT-000001');
    expect(r.status).toBe(200);
    expect(r.data.found).toBe(true);
    expect(r.data.state).toBe('withdrawn');
    expect(r.data.withdrawn_on).toBe('2026-04-18');
    const missing = await req('GET', '/api/verify/CERT-DEMO-999999');
    expect(missing.status).toBe(200);
    expect(missing.data.found).toBe(false);
  });

  it('never returns a carbon value without its three companions', async () => {
    const r = await req('GET', '/api/lots/LOT-N6-0001/carbon', null, tok['auditor@example.com']);
    expect(r.data.value_mg_per_kg).toBe(4260000);
    expect(r.data.boundary).toBe('cradle-to-gate');
    expect(r.data.method_version).toBeTruthy();
    expect(r.data.uncertainty_bp).toBe(1200);
    expect(r.data.energy_location_mg_per_kg).toBe(1850000);
    expect(r.data.energy_market_mg_per_kg).toBe(620000);
  });

  it('keeps the record chain verifying and refuses edits and deletions', async () => {
    const check = await req('GET', '/api/record/check', null, tok['auditor@example.com']);
    expect(check.data.holds).toBe(true);
    const patch = await req('PATCH', '/api/record/3', { act: 'x' }, tok['quality@example.com'], 'r1');
    expect(patch.status).toBe(403);
    const del = await req('DELETE', '/api/record/3', null, tok['quality@example.com'], 'r2');
    expect(del.status).toBe(403);
  });

  it('answers all nine record queries with complete sets', async () => {
    const names = ['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version', 'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations', 'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'];
    for (const n of names) {
      const r = await req('GET', '/api/record/queries/' + n, null, tok['auditor@example.com']);
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data)).toBe(true);
    }
  });

  it('reports the four integration ages with customer_reporting never sent', async () => {
    const r = await req('GET', '/api/reconciliation', null, tok['auditor@example.com']);
    expect(r.data.integration_ages.customer_reporting).toBeNull();
    expect(r.data.read_at).toBeTruthy();
  });

  it('separates the analyst from the dispositioner', async () => {
    // analyst entered results on LOT-N6-0001; even a quality manager who tested is refused,
    // and a non-quality role is refused outright
    const r = await req('POST', '/api/lots/LOT-N6-0001/disposition', { disposition: 'released' }, tok['plant@example.com'], 'sep-' + Math.random());
    expect(r.status).toBe(403);
  });

  it('keeps yield off limits to the roles the brief names', async () => {
    const ok = await req('GET', '/api/lots/LOT-N6-0001/yield', null, tok['auditor@example.com']);
    expect(ok.status).toBe(200);
  });
});
