/** The one place the client speaks to the API. */

import type { Identity } from './routes';

export const SESSION_COOKIE = 'ravel_session';
const SESSION_MAX_AGE_SECONDS = 43200;
const TOKEN_KEY = 'ravel_session_token';
const IDENTITY_KEY = 'ravel_session_identity';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly rule: string,
    detail: string,
    readonly refusedFigures: Record<string, unknown> = {},
  ) {
    super(detail);
  }
}

function readToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function readIdentity(): Identity | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(IDENTITY_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as Identity;
  } catch {
    return null;
  }
}

function writeSession(token: string, identity: Identity): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSession(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(IDENTITY_KEY);
  }
  if (typeof document !== 'undefined') {
    document.cookie = `${SESSION_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`;
  }
}

function idempotencyKey(): string {
  const source = globalThis.crypto;
  if (source && typeof source.randomUUID === 'function') return source.randomUUID();
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  const token = readToken();
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (WRITE_METHODS.has(method)) headers.set('idempotency-key', idempotencyKey());

  const response = await fetch(`/api${path}`, { ...init, method, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const shape = (body ?? {}) as { error?: string; detail?: string };
    throw new ApiError(
      response.status,
      shape.error ?? 'request_failed',
      shape.detail ?? `the request to ${path} was refused with ${response.status}`,
      (body ?? {}) as Record<string, unknown>,
    );
  }
  return body as T;
}

interface LoginAnswer {
  access_token: string;
  token_type: string;
}

export async function login(email: string, password: string): Promise<Identity> {
  const answer = await api<LoginAnswer>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem(TOKEN_KEY, answer.access_token);
  const identity = await api<Identity>('/auth/me');
  writeSession(answer.access_token, identity);
  return identity;
}

interface EnquiryAnswer {
  reference: string;
  type: string;
  destination: string;
  response_days: number;
}

export function sendEnquiry(payload: {
  type: string;
  name: string;
  organisation: string;
  email: string;
  message: string;
}): Promise<EnquiryAnswer> {
  return api<EnquiryAnswer>('/enquiries', { method: 'POST', body: JSON.stringify(payload) });
}
