import crypto from "node:crypto";
import { q, one } from "./db.mjs";

/* ---------------- arithmetic: every derived integer floored ---------------- */
export const floorDiv = (a, b) => Math.floor(a / b);

export function dryMass(netG, moistureBp) {
  return Math.floor((netG * (10000 - moistureBp)) / 10000);
}
export function creditGranted(dryG, factorBp) {
  return Math.floor((dryG * factorBp) / 10000);
}
export function contentBp(creditAttachedG, lotMassG) {
  if (!lotMassG) return 0;
  return Math.floor((creditAttachedG * 10000) / lotMassG);
}
export function blendContent(massA, contentA, massB, contentB) {
  return Math.floor((massA * contentA + massB * contentB) / (massA + massB));
}
export function byproductShareBp(byproductG, totalOutputG) {
  if (!totalOutputG) return 0;
  return Math.floor((byproductG * 10000) / totalOutputG);
}
export function factorBpFromWindow(derivedInG, derivedOutG) {
  if (!derivedInG) return null;
  return Math.floor((derivedOutG * 10000) / derivedInG);
}

/* ---------------- the append-only record ---------------- */
const ZERO = "0".repeat(64);

export async function record(client, { act, person, site, object, detail = {}, refused = null }) {
  const moment = new Date().toISOString();
  const prev = await client.query(
    "SELECT seq, digest FROM record_entry ORDER BY seq DESC LIMIT 1"
  );
  const prevSeq = prev.rows.length ? Number(prev.rows[0].seq) : 0;
  const prevDigest = prev.rows.length ? prev.rows[0].digest : ZERO;
  const content = JSON.stringify({ act, person, site, object, detail, refused, at: moment });
  const digest = sha256(prevDigest + "\n" + content);
  const ins = await client.query(
    `INSERT INTO record_entry (seq, at, act, person, site, object, detail, refused, digest, prev_digest, content)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING seq, digest, prev_digest`,
    [prevSeq + 1, moment, act, person, site, object, JSON.stringify(detail), refused, digest, prevDigest, content]
  );
  return ins.rows[0];
}

export function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export async function recordAct(entry) {
  // convenience: record outside an explicit transaction
  const c = await (await import("./db.mjs")).db().connect();
  try {
    await c.query("BEGIN");
    // serialize the record append with an advisory lock so digests chain cleanly
    await c.query("SELECT pg_advisory_xact_lock(918273645)");
    const r = await record(c, entry);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

/* ---------------- idempotency ---------------- */
export async function idempotencyCheck(client, key, route, body) {
  const row = await client.query(
    "SELECT * FROM idempotency_key WHERE key=$1 AND route=$2",
    [key, route]
  );
  const bodyJson = JSON.stringify(body ?? null);
  if (row.rows.length) {
    const existing = row.rows[0];
    if (existing.body !== bodyJson) {
      return { reuse: true };
    }
    return { hit: existing };
  }
  await client.query(
    "INSERT INTO idempotency_key (key, route, body, response, reference, at) VALUES ($1,$2,$3,$4,$5,$6)",
    [key, route, bodyJson, null, null, new Date().toISOString()]
  );
  return { fresh: true };
}
export async function idempotencyStore(client, key, route, response) {
  await client.query(
    "UPDATE idempotency_key SET response=$3 WHERE key=$1 AND route=$2",
    [key, route, JSON.stringify(response)]
  );
}
