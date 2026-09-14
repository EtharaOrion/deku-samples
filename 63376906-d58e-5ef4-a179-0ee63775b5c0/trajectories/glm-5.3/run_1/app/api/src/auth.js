import { cfg } from './config.js';
import { one } from './db.js';

const tokenUrl = () => `${cfg.authIssuerUrl.replace(/\/$/, '')}/protocol/openid-connect/token`;

export async function keycloakLogin(email, password) {
  const res = await fetch(tokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: cfg.authClientId, client_secret: cfg.authClientSecret, username: email, password })
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.access_token) return null;
  let claims = {};
  try {
    const parts = j.access_token.split('.');
    claims = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  } catch { /* token unreadable */ }
  return { kc_access_token: j.access_token, claims };
}

export async function sessionFor(email) {
  const u = await one('SELECT email, name, role, sites, grant_ends_on FROM users WHERE email = $1', [email]);
  if (!u) return null;
  if (new Date(u.grant_ends_on) < new Date(new Date().toISOString().slice(0, 10))) return { expired: true };
  return { email: u.email, name: u.name, role: u.role, sites: u.sites };
}
