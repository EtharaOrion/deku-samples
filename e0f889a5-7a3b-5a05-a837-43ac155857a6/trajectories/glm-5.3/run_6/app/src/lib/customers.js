import { db } from './db.js';
import { errors } from './errors.js';
import { issueToken, hashPassword, verifyPassword } from './tokens.js';
import { isValidEmail } from './cart.js';

export async function signup({ email, password, name }) {
  const sql = db();
  if (!isValidEmail(email)) throw errors.badRequest('Email is required.', 'email_required');
  if (!password || String(password).length < 8) {
    throw errors.badRequest('Password needs eight characters or more.', 'password_required');
  }
  if (!name || !String(name).trim()) throw errors.badRequest('Name is required.', 'name_required');
  const normalised = String(email).trim().toLowerCase();
  const existing = await sql`SELECT id FROM customer WHERE lower(email) = ${normalised} LIMIT 1`;
  if (existing.length > 0) {
    throw errors.conflict('That address is already registered. Sign in instead.', 'email_taken');
  }
  const [customer] = await sql`
    INSERT INTO customer (email, name, password_hash, status)
    VALUES (${normalised}, ${String(name).trim()}, ${hashPassword(String(password))}, 'active')
    RETURNING id, email, name, status, created_at
  `;
  return { access_token: issueToken(customer.id), customer: shape(customer) };
}

export async function login({ email, password }) {
  const sql = db();
  if (!email || !password) throw errors.badRequest('Email and password are required.', 'credentials_required');
  const [customer] = await sql`
    SELECT * FROM customer WHERE lower(email) = ${String(email).trim().toLowerCase()} LIMIT 1
  `;
  if (!customer || !verifyPassword(String(password), customer.passwordHash)) {
    throw errors.unauthorized('That did not work. Check the address and the password.', 'bad_credentials');
  }
  if (customer.status !== 'active') {
    throw errors.forbidden('That account is not active.', 'account_inactive');
  }
  return { access_token: issueToken(customer.id), customer: shape(customer) };
}

export async function customerFromToken(token) {
  const { readToken } = await import('./tokens.js');
  const payload = readToken(token);
  if (!payload) return null;
  const sql = db();
  const [customer] = await sql`
    SELECT id, email, name, status, created_at FROM customer WHERE id = ${payload.cid} LIMIT 1
  `;
  if (!customer || customer.status !== 'active') return null;
  return customer;
}

export function shape(customer) {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    status: customer.status,
    created_at: customer.createdAt
  };
}
