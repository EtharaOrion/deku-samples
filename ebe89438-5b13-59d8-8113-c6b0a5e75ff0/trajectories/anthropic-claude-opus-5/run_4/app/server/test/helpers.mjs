import assert from 'node:assert/strict';
import pg from 'pg';

export const BASE = process.env.BASE ?? 'http://localhost:4180';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
export const PW = 'deku-demo-pw-2026';

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const state = { passed: 0, failed: 0, failures: [] };

export async function test(name, fn) {
  try {
    await fn();
    state.passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    state.failed++;
    state.failures.push(`${name}: ${err.message}`);
    console.log(`FAIL  ${name}\n      ${err.message.split('\n').join('\n      ')}`);
  }
}

export async function req(pathname, { method = 'GET', token, body, raw } = {}) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json, headers: res.headers };
}

export async function login(email) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password: PW } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.body)}`);
  return r.body.access_token;
}

let counter = 0;

/**
 * A brand new guest account. Each test uses its own so no test spends another
 * test's share of the real ten-a-minute registration limit.
 */
export async function freshGuest(label = 'g') {
  const email = `${label}-${Date.now().toString(36)}-${counter++}@example.test`;
  const r = await req('/api/auth/signup', {
    method: 'POST',
    body: { email, password: PW, name: `Guest ${label} ${counter}` },
  });
  assert.equal(r.status, 201, `signup ${email}: ${JSON.stringify(r.body)}`);
  return { token: r.body.access_token, email, id: r.body.id };
}

export async function resetEvent(slug, patch = {}) {
  const { rows } = await db.query('SELECT id FROM events WHERE slug=$1', [slug]);
  const id = rows[0].id;
  await db.query('DELETE FROM email_log WHERE event_id=$1', [id]);
  await db.query('DELETE FROM registrations WHERE event_id=$1', [id]);
  const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
  if (sets.length) await db.query(`UPDATE events SET ${sets.join(',')} WHERE id=$1`, [id, ...Object.values(patch)]);
  return id;
}

export async function mailFor(email, subject) {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=50`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.messages ?? []).filter((m) => (subject ? m.Subject === subject : true));
}

export async function messageBody(id) {
  return fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json());
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function report() {
  console.log(`\n${state.passed} passed, ${state.failed} failed`);
  if (state.failures.length) {
    console.log('\nFailures:');
    for (const f of state.failures) console.log(' - ' + f);
  }
  await db.end();
  process.exit(state.failed ? 1 : 0);
}
