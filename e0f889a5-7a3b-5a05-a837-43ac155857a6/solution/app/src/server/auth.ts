import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { signingSecret } from "./env";
import { one } from "./db";
import { unauthorized } from "./errors";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_KEYLEN = 32;
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

/** scrypt with a per-password salt. A stored hash never reveals the password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltPart, hashPart] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltPart || !hashPart) return false;
  const salt = Buffer.from(saltPart, "base64url");
  const expected = Buffer.from(hashPart, "base64url");
  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length || SCRYPT_KEYLEN);
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

export type TokenClaims = { sub: number; email: string; exp: number };

/** A bearer token is a signed claim with an expiry. It carries no secret of its
 *  own, so no fifteenth table is needed to hold one. */
export function issueToken(customerId: number, email: string): { token: string; expiresIn: number } {
  const claims: TokenClaims = {
    sub: customerId,
    email,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${body}.${sign(body)}`, expiresIn: TOKEN_TTL_SECONDS };
}

export function readToken(token: string | undefined | null): TokenClaims | null {
  if (!token || token.length > 4096) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(body);
  if (!tokenMatches(mac, expected)) return null;
  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !claims ||
    !Number.isSafeInteger(claims.sub) ||
    claims.sub < 1 ||
    typeof claims.email !== "string" ||
    !Number.isSafeInteger(claims.exp)
  ) {
    return null;
  }
  if (claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

export type Customer = {
  id: number;
  email: string;
  name: string;
  status: string;
  created_at: string;
};

export function bearerOf(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? "").trim() || null : null;
}

export const SESSION_COOKIE = "vela_auth";

/** Read one cookie without letting malformed percent escapes turn a public
 *  request into a server error. */
export function cookieValue(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim()) || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The browser carries the same token in a cookie the pages set. */
export function sessionCookie(header: string | null | undefined): string | null {
  return cookieValue(header, SESSION_COOKIE);
}

/** An absent, malformed or expired token is refused, and nothing is mutated. */
export async function customerFromToken(token: string | null): Promise<Customer | null> {
  const claims = readToken(token);
  if (!claims) return null;
  const row = await one<Customer>(
    "SELECT id, email, name, status, created_at FROM customer WHERE id = $1 AND status = 'active'",
    [claims.sub],
  );
  return row ?? null;
}

export async function requireCustomer(token: string | null): Promise<Customer> {
  const customer = await customerFromToken(token);
  if (!customer) throw unauthorized("Sign in to continue.");
  return customer;
}

export function opaqueToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", signingSecret()).update(token).digest("hex");
}

/** An unguessable capability for a single public workflow resource. */
export function scopedToken(scope: string, resource: string | number): string {
  return createHmac("sha256", signingSecret())
    .update(`${scope}:${resource}`)
    .digest("base64url");
}

export function tokenMatches(supplied: string | null | undefined, expected: string): boolean {
  if (!supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
