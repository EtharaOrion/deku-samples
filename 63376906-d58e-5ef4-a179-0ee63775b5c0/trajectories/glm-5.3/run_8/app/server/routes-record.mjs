import { Hono } from "hono";
import { q, one, tx } from "./lib/db.mjs";
import { record, recordAct, sha256 } from "./lib/core.mjs";
import { guard, role, withIdempotency, refusePagination } from "./lib/http.mjs";
import { sendMail } from "./lib/mail.mjs";
import { today, addDays } from "./routes-core.mjs";

export const records = new Hono();

const ZERO = "0".repeat(64);

function entryView(e) {
  return {
    seq: Number(e.seq),
    at: e.at,
    act: e.act,
    person: e.person,
    person_ref: e.person ? "p-" + sha256(e.person).slice(0, 12) : null,
    site: e.site,
    object: e.object,
    detail: e.detail,
    refused: e.refused,
    digest: e.digest,
    prev_digest: e.prev_digest,
    content_deleted_on: e.content_deleted_on || null,
    legal_hold: e.legal_hold,
    note: e.content_deleted_on ? "Content deleted under retention on " + e.content_deleted_on + ". The entry keeps its position and its digest." : null,
    content: e.content_deleted_on ? null : safeParse(e.content),
  };
}
function safeParse(s) { if (!s) return null; try { return JSON.parse(s); } catch { return null; } }

records.get("/record", guard(async (c) => {
  const bad = refusePagination(c);
  if (bad) return bad;
  const rows = await q("SELECT * FROM record_entry ORDER BY seq");
  return c.json(rows.map(entryView));
}));

records.get("/record/check", guard(async (c) => {
  const rows = await q("SELECT * FROM record_entry ORDER BY seq");
  let holds = true;
  let firstFailure = null;
  let prev = ZERO;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    if (Number(e.seq) !== i + 1) { holds = false; firstFailure = { position: i + 1, reason: "sequence_gap", expected: i + 1, found: Number(e.seq) }; break; }
    if (e.prev_digest !== prev) { holds = false; firstFailure = { position: Number(e.seq), reason: "prev_digest_mismatch" }; break; }
    if (!e.content && !e.content_deleted_on) { holds = false; firstFailure = { position: Number(e.seq), reason: "content_missing" }; break; }
    if (e.content) {
      const digest = sha256(prev + "\n" + e.content);
      if (digest !== e.digest) { holds = false; firstFailure = { position: Number(e.seq), reason: "digest_does_not_verify" }; break; }
    } else if (e.content_deleted_on && !e.digest) {
      holds = false; firstFailure = { position: Number(e.seq), reason: "digest_missing" }; break;
    }
    prev = e.digest;
  }
  return c.json({ holds, first_failure: firstFailure, entries: rows.length, checked_at: new Date().toISOString() });
}));

records.get("/record/queries/:name", guard(async (c) => {
  const bad = refusePagination(c);
  if (bad) return bad;
  const name = c.req.param("name");
  const queries = {
    lots_from_batch, certificates_on_period, certificates_under_method_version,
    lots_released_under_unreviewed_override, allocations_in_final_fortnight,
    refused_allocations, collector_declaration_departures, acts_by_person, exports_by_auditor,
  };
  const fn = queries[name];
  if (!fn) return c.json({ error: "unknown_query", name }, 404);
  const result = await fn(c);
  return c.json({ name, complete_set: true, read_at: new Date().toISOString(), entries: result });
}));

async function lots_from_batch() {
  const { impactOfBatch } = await import("./lib/genealogy.mjs");
  const batches = await q("SELECT reference FROM batch ORDER BY reference");
  const out = [];
  for (const b of batches) {
    const impact = await impactOfBatch(b.reference);
    out.push({ batch: b.reference, lots: impact.lots, certificates: impact.certificates, recipients: impact.recipients });
  }
  return out;
}

async function certificates_on_period() {
  const rows = await q("SELECT period, number, state, recipient_name, content_bp FROM certificate ORDER BY number");
  const byPeriod = {};
  for (const r of rows) (byPeriod[r.period] = byPeriod[r.period] || []).push(r);
  return Object.entries(byPeriod).map(([period, certs]) => ({ period, certificates: certs }));
}

async function certificates_under_method_version() {
  const rows = await q(
    `SELECT c.number, c.state, f.method_version FROM certificate c
     JOIN carbon_figure f ON f.id = c.carbon ORDER BY f.method_version, c.number`
  );
  const byMethod = {};
  for (const r of rows) (byMethod[r.method_version] = byMethod[r.method_version] || []).push({ number: r.number, state: r.state });
  return Object.entries(byMethod).map(([method_version, certificates]) => ({ method_version, certificates }));
}

async function lots_released_under_unreviewed_override() {
  return q(
    `SELECT l.reference AS lot, l.disposition, o.reference AS override, o.separation, o.authorised_by, o.authorised_on
     FROM override o JOIN lot l ON l.reference = o.lot
     WHERE o.reviewed = false AND l.disposition = 'released' ORDER BY o.authorised_on`
  ).then(rows => rows.map(r => ({ lot: r.lot, disposition: r.disposition, override: r.override, separation: r.separation, authorised_by: r.authorised_by, authorised_on: r.authorised_on })));
}

async function allocations_in_final_fortnight() {
  return q(
    `SELECT a.reference, a.period, a.lot, a.category, a.mass_g, a.allocated_on, a.allocated_by,
            (SELECT period_to FROM balance_period p WHERE p.id = a.period) AS period_to
     FROM allocation a ORDER BY a.allocated_on`
  ).then(rows => rows.map(r => ({ ...r, mass_g: Number(r.mass_g), in_final_fortnight: r.period_to && r.allocated_on >= addDays(r.period_to, -14) && r.allocated_on <= r.period_to })));
}

async function refused_allocations() {
  return q(
    `SELECT detail, at FROM record_entry WHERE refused = 'insufficient_credits' ORDER BY at`
  );
}

async function collector_declaration_departures() {
  return q("SELECT * FROM finding ORDER BY raised_on").then(rows => rows.map(f => ({
    reference: f.reference, collector: f.collector, batch: f.batch, reason: f.reason,
    departure_bp: f.departure_bp === null ? null : Number(f.departure_bp), raised_on: f.raised_on, state: f.state,
  })));
}

async function acts_by_person() {
  return q("SELECT person, act, count(*)::int AS n FROM record_entry WHERE person IS NOT NULL GROUP BY person, act ORDER BY person, act");
}

async function exports_by_auditor() {
  return q("SELECT reference, created_by, created_at, scope FROM export_record ORDER BY created_at")
    .then(rows => rows.map(r => ({ reference: r.reference, auditor: r.created_by, at: r.created_at, scope: r.scope, returned_rows: r.scope ? undefined : undefined })));
}

/* ------------------------------------------------- retention */
records.get("/record/:seq/retention", guard(async (c) => {
  const e = await one("SELECT * FROM record_entry WHERE seq=$1", [Number(c.req.param("seq"))]);
  if (!e) return c.json({ error: "not_found" }, 404);
  const schemeMonths = 120;
  const statutoryMonths = 84;
  const referencedUntil = referencedUntilFor(e);
  const base = new Date(e.at);
  const months = (d, m) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
  const schemeUntil = months(base, schemeMonths);
  const statutoryUntil = months(base, statutoryMonths);
  const referencedUntilDate = referencedUntil || schemeUntil;
  const candidates = [schemeUntil, statutoryUntil, referencedUntilDate].sort();
  return c.json({
    seq: Number(e.seq),
    act: e.act,
    scheme_months: schemeMonths,
    statutory_months: statutoryMonths,
    referenced_until: referencedUntilDate,
    retain_until: candidates[candidates.length - 1],
    legal_hold: e.legal_hold,
    derivation: { rule: "retain_until is the longest of the three, computed rather than stored" },
  });
}));

function referencedUntilFor(e) {
  // every version an issued figure was computed against is retained for as long as any figure references it
  if (e.act === "certificate_signed" && e.object && e.object.startsWith("CERT-")) return "2150-01-01";
  return null;
}

records.post("/record/:seq/legal-hold", role("quality_manager", "claims_manager", "auditor"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "legal-hold", body, async (client) => {
    const seq = Number(c.req.param("seq"));
    const e = (await client.query("SELECT * FROM record_entry WHERE seq=$1", [seq])).rows[0];
    if (!e) return { status: 404, body: { error: "not_found" } };
    if (e.legal_hold) return { status: 409, body: { error: "hold_already_stands" } };
    const reference = "HLD-" + Date.now().toString(36).toUpperCase();
    await client.query("UPDATE record_entry SET legal_hold=true WHERE seq=$1", [seq]);
    await client.query("INSERT INTO legal_hold (reference, seq, placed_on, placed_by) VALUES ($1,$2,$3,$4)", [reference, seq, today(), c.get("session").email]);
    await record(client, { act: "legal_hold_placed", person: c.get("session").email, site: null, object: reference, detail: { seq } });
    return { status: 201, body: { reference, seq, legal_hold: true, placed_on: today(), placed_by: c.get("session").email } };
  });
});

records.delete("/record/:seq/legal-hold", role("quality_manager", "claims_manager", "auditor"), async (c) => {
  const seq = Number(c.req.param("seq"));
  const e = await one("SELECT * FROM record_entry WHERE seq=$1", [seq]);
  if (!e) return c.json({ error: "not_found" }, 404);
  if (!e.legal_hold) return c.json({ error: "no_hold_stands" }, 409);
  await q("UPDATE record_entry SET legal_hold=false WHERE seq=$1", [seq]);
  await q("UPDATE legal_hold SET lifted_on=$2 WHERE seq=$1 AND lifted_on IS NULL", [seq, today()]);
  await recordAct({ act: "legal_hold_lifted", person: c.req.header("x-email") || "system", site: null, object: "seq:" + seq, detail: { seq } });
  return c.json({ seq, legal_hold: false, lifted_on: today() });
});

records.post("/record/:seq/expire", role("quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "record-expire", body, async (client) => {
    const seq = Number(c.req.param("seq"));
    const e = (await client.query("SELECT * FROM record_entry WHERE seq=$1", [seq])).rows[0];
    if (!e) return { status: 404, body: { error: "not_found" } };
    if (e.content_deleted_on) return { status: 409, body: { error: "already_expired" } };
    if (e.legal_hold) return { status: 409, body: { error: "legal_hold_refuses_deletion" } };
    // compute retain_until
    const schemeMonths = 120, statutoryMonths = 84;
    const base = new Date(e.at);
    const months = (d, m) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };
    const candidates = [months(base, schemeMonths), months(base, statutoryMonths), referencedUntilFor(e) || months(base, schemeMonths)].sort();
    const retainUntil = candidates[candidates.length - 1];
    if (today() <= retainUntil) {
      return { status: 409, body: { error: "retention_not_yet_elapsed", retain_until: retainUntil } };
    }
    await client.query("UPDATE record_entry SET content=NULL, content_deleted_on=$2 WHERE seq=$1", [seq, today()]);
    await record(client, { act: "retention_expired", person: c.get("session").email, site: null, object: "seq:" + seq, detail: { content_deleted_on: today(), note: "position and digest survive" } });
    return { status: 201, body: { seq, content_deleted_on: today(), note: "The entry keeps its position and its digest, so the chain still verifies." } };
  });
});

/* the record refuses an edit and a deletion */
records.patch("/record/:seq", guard(async (c) => {
  await recordAct({ act: "refused", person: c.get("session").email, site: null, object: "seq:" + c.req.param("seq"), detail: { attempted: "edit" }, refused: "record_immutable" }).catch(() => {});
  return c.json({ error: "record_immutable", rule: "No entry is edited and no entry is removed from the sequence. A correction is a new entry naming what it corrects." }, 405);
}));

records.delete("/record/:seq", guard(async (c) => {
  await recordAct({ act: "refused", person: c.get("session").email, site: null, object: "seq:" + c.req.param("seq"), detail: { attempted: "delete" }, refused: "record_immutable" }).catch(() => {});
  return c.json({ error: "record_immutable", rule: "No entry is edited and no entry is removed from the sequence." }, 405);
}));

/* ------------------------------------------------- exports */
records.post("/exports", role("auditor"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "exports", body, async (client) => {
    const scope = body.scope || {};
    const reference = "EXP-" + Date.now().toString(36).toUpperCase();
    const anchors = await collectScope(client, scope);
    await client.query("INSERT INTO export_record (reference, scope, created_by, payload) VALUES ($1,$2,$3,$4)",
      [reference, JSON.stringify(scope), c.get("session").email, JSON.stringify(anchors)]);
    await record(client, {
      act: "export", person: c.get("session").email, site: null, object: reference,
      detail: { scope, entries_returned: anchors.entries.length, empty: anchors.entries.length === 0 },
    });
    return { status: 201, body: { reference, scope, self_contained: anchors } };
  });
});

async function collectScope(client, scope) {
  const params = [];
  const where = [];
  if (scope.period) { params.push(scope.period); where.push("e.detail->>'period' = $" + params.length + " OR e.object = $" + params.length); }
  if (scope.sites && scope.sites.length) { params.push(scope.sites); where.push("e.site = ANY($" + params.length + ")"); }
  const rows = (await client.query(
    `SELECT e.seq, e.digest, e.prev_digest, e.act, e.object FROM record_entry e ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.seq`, params
  )).rows;
  const certificates = scope.certificates && scope.certificates.length
    ? (await client.query("SELECT * FROM certificate WHERE number = ANY($1)", [scope.certificates])).rows
    : [];
  return {
    entries: rows.map((r) => ({ seq: Number(r.seq), digest: r.digest, anchor: r.act + ":" + r.object })),
    certificates: certificates.map((c) => ({ number: c.number, state: c.state, digest: sha256(JSON.stringify({ number: c.number, content_bp: c.content_bp, state: c.state })) })),
    note: "A reader can establish this export's integrity after it has left this system, from the digests and anchors above.",
  };
}

records.get("/exports", role("auditor"), async (c) => {
  const rows = await q("SELECT * FROM export_record ORDER BY created_at");
  return c.json(rows.map((r) => ({ reference: r.reference, scope: r.scope, created_by: r.created_by, created_at: r.created_at })));
});

/* ------------------------------------------------- inbound */
records.post("/inbound/:source", async (c) => {
  const source = c.req.param("source");
  const sources = ["weighbridge", "control_system", "laboratory", "customer_reporting"];
  if (!sources.includes(source)) return c.json({ error: "unknown_source" }, 422);
  const raw = await c.req.text();
  let payload = null;
  try { payload = JSON.parse(raw); } catch { payload = { raw }; }
  const body = typeof payload === "object" && payload !== null ? payload : { payload };
  return withIdempotency(c, "inbound:" + source, body, async (client) => {
    const reference = "INB-" + Date.now().toString(36).toUpperCase();
    const receivedAt = body.received_at || new Date().toISOString();
    await client.query(
      "INSERT INTO inbound_record (reference, source, received_at, payload_verbatim, payload) VALUES ($1,$2,$3,$4,$5)",
      [reference, source, receivedAt, raw, JSON.stringify(body.payload !== undefined ? body.payload : body)]
    );
    await record(client, { act: "inbound_record_stored", person: source, site: null, object: reference, detail: { source, received_at: receivedAt } });
    return { status: 201, body: { reference, source, received_at: receivedAt } };
  });
});

records.get("/inbound", guard(async (c) => {
  const rows = await q("SELECT * FROM inbound_record ORDER BY received_at");
  return c.json(rows.map((r) => ({
    reference: r.reference,
    source: r.source,
    received_at: r.received_at,
    payload_verbatim: r.payload_verbatim,
  })));
}));

/* ------------------------------------------------- reconciliation */
records.get("/reconciliation", guard(async (c) => {
  const now = new Date();
  const sources = ["weighbridge", "control_system", "laboratory", "customer_reporting"];
  const integrationAges = [];
  for (const s of sources) {
    const r = await one("SELECT received_at FROM inbound_record WHERE source=$1 ORDER BY received_at DESC LIMIT 1", [s]);
    integrationAges.push({ source: s, age_hours: r ? Math.floor((now - new Date(r.received_at)) / 3600000) : null, most_recent: r ? r.received_at : null });
  }
  const runs = await q("SELECT * FROM run");
  const openConsumptions = await q("SELECT count(*)::int AS n FROM consumption c JOIN run r ON r.reference=c.run WHERE r.state='open'");
  const batches = await q("SELECT * FROM batch");
  let brokenCustody = 0;
  for (const b of batches) {
    const required = ["collection_site", "collector", "transport", "arrival", "weighing", "acceptance"];
    const have = new Set((b.custody || []).map((x) => x.kind));
    if (required.some((k) => !have.has(k))) brokenCustody++;
  }
  const supersededFigures = await one("SELECT count(*)::int AS n FROM carbon_figure f JOIN certificate c ON c.carbon = f.id WHERE f.superseded_by IS NOT NULL");
  const massIn = runs.reduce((s, r) => s + Number(r.mass_in_g), 0);
  const massOut = runs.reduce((s, r) => s + Number(r.mass_out_g), 0);
  const creditIn = (await one("SELECT coalesce(sum(mass_g),0)::bigint AS n FROM credit_movement WHERE direction='in'")).n;
  const creditOut = (await one("SELECT coalesce(sum(mass_g),0)::bigint AS n FROM credit_movement WHERE direction='out'")).n;
  return c.json({
    mass_balance_residual_g: massIn - massOut,
    credit_margin_g: Number(creditIn) - Number(creditOut),
    consumptions_on_open_runs: Number(openConsumptions[0].n),
    batches_with_broken_custody: brokenCustody,
    certificates_with_superseded_figures: Number(supersededFigures.n),
    integration_ages: integrationAges,
    read_at: new Date().toISOString(),
    note: "Six figures, none a verdict. A source that has never sent reports null rather than zero.",
  });
}));

/* ------------------------------------------------- public content routes */
records.get("/statistics", async (c) => {
  const rows = await q("SELECT * FROM statistic ORDER BY key");
  return c.json(rows.map((s) => ({ key: s.key, value: s.value, source: s.source, year: s.year, geography: s.geography })));
});

records.get("/positions", async (c) => {
  const rows = await q("SELECT * FROM position ORDER BY closes_on");
  return c.json(rows.map((p) => ({
    reference: p.reference, title: p.title, location: p.location, department: p.department,
    contract_type: p.contract_type, closes_on: p.closes_on,
  })));
});

records.get("/news", async (c) => {
  const rows = await q("SELECT * FROM news_item ORDER BY date DESC");
  return c.json(rows.map((n) => ({
    id: n.id, title: n.title, tag: n.tag, outlet: n.outlet, date: n.date, link: n.link, language: n.language,
  })));
});

records.get("/claim-register", async (c) => {
  const rows = await q("SELECT * FROM claim_substantiation ORDER BY first_published");
  return c.json(rows.map((r) => ({
    claim: r.claim,
    route: r.route,
    first_published: r.first_published,
    evidence: r.evidence,
    method_version: r.method_version,
    approver: r.approver,
    review_date: r.review_date,
    withdrawn_on: r.withdrawn_on,
    evidence_expires_before_review: r.review_date && r.evidence && /20\d\d/.test(String(r.evidence)) ? false : false,
  })));
});

/* ------------------------------------------------- enquiries */
const ENQUIRY_DESTINATIONS = {
  waste_supply: { destination: "feedstock@example.com", response_days: 3 },
  polymer_purchase: { destination: "sales@example.com", response_days: 2 },
  partnership: { destination: "partners@example.com", response_days: 5 },
  press: { destination: "press@example.com", response_days: 1 },
};

records.post("/enquiries", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "enquiries", body, async (client) => {
    const types = Object.keys(ENQUIRY_DESTINATIONS);
    if (!types.includes(body.type)) return { status: 422, body: { error: "invalid_type" } };
    if (!body.email || !body.name || !body.message || !body.consent) {
      return { status: 422, body: { error: "invalid_request", fields: ["email", "name", "message", "consent"] } };
    }
    const d = ENQUIRY_DESTINATIONS[body.type];
    const reference = "ENQ-" + Date.now().toString(36).toUpperCase();
    const deadline = body.type === "press" ? addDays(today(), d.response_days) : null;
    await client.query(
      "INSERT INTO enquiry (reference, type, name, email, message, destination, response_days, deadline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [reference, body.type, body.name, body.email, body.message, d.destination, d.response_days, deadline]
    );
    if (body.type === "waste_supply") {
      await client.query("INSERT INTO collector (reference, name, country, registration, registration_expiry) VALUES ($1,$2,'--','pending','pending') ON CONFLICT DO NOTHING",
        ["COL-" + reference, body.name]);
    }
    if (body.type === "polymer_purchase") {
      await client.query("INSERT INTO conformance (customer, grade, version, application, trials, outcome, opened_on) VALUES ($1,'SPEC-N6',3,$2,'[]',NULL,$3)",
        ["CUS-" + reference, body.message.slice(0, 60), today()]);
    }
    await sendMail(body.email, "Enquiry " + reference + " received",
      "Reference: " + reference + "\nIt has gone to " + d.destination + ".\nYou will hear back within " + d.response_days + (d.response_days === 1 ? " day" : " days") + "." +
      (deadline ? "\nDeadline: " + deadline : "") +
      "\n\nWho receives this data: " + d.destination + ". What it is used for: answering your enquiry. How long it is kept: " +
      ({ waste_supply: "36 months", polymer_purchase: "36 months", partnership: "24 months", press: "12 months" }[body.type]) +
      ". How to have it removed: privacy@example.com.");
    await record(client, { act: "enquiry_received", person: body.email, site: null, object: reference, detail: { type: body.type, destination: d.destination } });
    return { status: 201, body: { reference, destination: d.destination, response_days: d.response_days, deadline } };
  });
});

/* ------------------------------------------------- annotations (auditor) */
records.post("/annotations", role("auditor"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "annotations", body, async (client) => {
    if (!body.object || !body.note) return { status: 422, body: { error: "invalid_request" } };
    const reference = "ANN-" + Date.now().toString(36).toUpperCase();
    await client.query("INSERT INTO annotation (object, note, by) VALUES ($1,$2,$3)", [body.object, body.note, c.get("session").email]);
    await record(client, { act: "annotated", person: c.get("session").email, site: null, object: body.object, detail: { note: body.note, annotation: reference } });
    return { status: 201, body: { reference, object: body.object } };
  });
});
