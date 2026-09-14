import { Hono } from "hono";
import { q, one, tx } from "./lib/db.mjs";
import { record, recordAct, sha256 } from "./lib/core.mjs";
import { dryMass, creditGranted, contentBp, factorBpFromWindow, byproductShareBp } from "./lib/core.mjs";
import * as engine from "./lib/engine.mjs";
import { genealogyForLot, impactOfBatch, batchClaimability, batchFlags, missingCustody, approvalInForce, loadGraph, ancestorsOfLot } from "./lib/genealogy.mjs";
import { sendMail } from "./lib/mail.mjs";
import { guard, role, requireIdempotency, withIdempotency, refusePagination, num } from "./lib/http.mjs";

export const core = new Hono();

/* ------------------------------------------------- health */
core.get("/health", (c) => c.json({ status: "ok", at: new Date().toISOString() }));

/* ------------------------------------------------- auth */
core.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return c.json({ error: "invalid_request" }, 422);
  const kc = await keycloakTokenSafe(email, password);
  if (!kc) {
    await recordAct({ act: "refused", person: email, site: null, object: "login", detail: { reason: "credentials rejected" }, refused: "invalid_credentials" }).catch(() => {});
    return c.json({ error: "invalid_credentials" }, 401);
  }
  const grants = await q("SELECT * FROM access_grant WHERE email=$1 AND valid_to >= to_char(now(),'YYYY-MM-DD')", [email]);
  const roles = [...new Set(grants.map((g) => g.role))];
  const sites = [...new Set(grants.map((g) => g.site))].sort();
  const session = await createSessionSafe(email, roles, sites, kc.access_token);
  await recordAct({ act: "signed_in", person: email, site: null, object: "session", detail: { roles, sites } }).catch(() => {});
  return c.json({
    access_token: session.id,
    token_type: "Bearer",
    expires_at: session.expires_at,
    me: { email, roles, sites },
  });
});

async function keycloakTokenSafe(email, password) {
  try {
    return await keycloak(email, password);
  } catch {
    return null;
  }
}
async function keycloak(email, password) {
  const { keycloakToken } = await import("./lib/auth.mjs");
  return keycloakToken(email, password);
}
async function createSessionSafe(email, roles, sites, token) {
  const { createSession } = await import("./lib/auth.mjs");
  return createSession(email, roles, sites, token);
}

core.get("/auth/me", guard(async (c) => {
  const s = c.get("session");
  return c.json({ email: s.email, roles: s.roles, sites: s.sites });
}));

/* ------------------------------------------------- sites */
core.get("/sites", async (c) => {
  const rows = await q("SELECT * FROM site ORDER BY reference");
  return c.json(rows.map((s) => ({
    reference: s.reference,
    name: s.name,
    confidence: s.confidence,
    certification_state: s.certification_state,
  })));
});

core.get("/sites/:ref/capacity", async (c) => {
  const s = await one("SELECT * FROM site WHERE reference=$1", [c.req.param("ref")]);
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json({
    reference: s.reference,
    nameplate_kg: Number(s.nameplate_kg),
    basis: s.capacity_basis,
    contracted_kg: Number(s.contracted_kg),
    uncommitted_kg: Number(s.nameplate_kg) - Number(s.contracted_kg),
    confidence: s.confidence,
    last_revised: s.last_revised,
    derivation: { rule: "uncommitted_kg = nameplate_kg - contracted_kg, computed" },
  });
});

core.get("/sites/:ref/certification", async (c) => {
  const rows = await q("SELECT * FROM site_certification WHERE site=$1 ORDER BY effective_from", [c.req.param("ref")]);
  return c.json(rows.map((r) => ({
    site: r.site, state: r.state, valid_from: r.valid_from, valid_to: r.valid_to,
    effective_from: r.effective_from, recorded_on: r.recorded_on, recorded_by: r.recorded_by, lifted_on: r.lifted_on,
  })));
});

core.post("/sites/:ref/certification", role("quality_manager"), async (c) => {
  return withIdempotency(c, "site-certification", await c.req.json().catch(() => ({})), async (client) => {
    const body = await c.req.json().catch(() => ({}));
    const site = c.req.param("ref");
    const state = body.state;
    const effectiveFrom = body.effective_from;
    if (!["certified", "suspended"].includes(state) || !effectiveFrom) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const ins = await client.query(
      `INSERT INTO site_certification (site, state, valid_from, valid_to, effective_from, recorded_on, recorded_by, lifted_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [site, state, body.valid_from || effectiveFrom, body.valid_to || null, effectiveFrom, today(), c.get("session").email, state === "certified" ? today() : null]
    );
    let certificatesInWindow = [];
    if (state === "suspended") {
      const certs = await client.query(
        "SELECT * FROM certificate WHERE site=$1 AND signed_at >= $2 AND (withdrawn_on IS NULL OR withdrawn_on >= $2)",
        [site, effectiveFrom + "T00:00:00Z"]
      );
      certificatesInWindow = certs.rows.map((cert) => ({
        number: cert.number,
        state: cert.state,
        resolution_under_restatement: cert.state === "withdrawn" ? "withdrawn" : "unaffected",
        note: "identified inside the suspension window; each resolves once under the three restatement outcomes",
      }));
    }
    await record(client, {
      act: "site_certification_recorded", person: c.get("session").email, site,
      object: site, detail: { state, effective_from: effectiveFrom, certificates_in_window: certificatesInWindow.length },
    });
    return {
      status: 201,
      body: {
        site, state, effective_from: effectiveFrom,
        issuing: state === "suspended" ? "stopped" : "restored",
        blocking_condition: state === "suspended" ? "site_certification_suspended" : null,
        certificates_in_window: certificatesInWindow,
        reference: ins.rows[0].id,
      },
    };
  });
});

/* ------------------------------------------------- parties */
core.get("/parties/:ref/versions", async (c) => {
  const rows = await q("SELECT * FROM party_version WHERE reference=$1 ORDER BY effective_from", [c.req.param("ref")]);
  return c.json(rows.map((r) => ({ reference: r.reference, name: r.name, effective_from: r.effective_from })));
});

core.post("/parties/:ref/versions", role("quality_manager", "claims_manager"), async (c) => {
  return withIdempotency(c, "party-version", await c.req.json().catch(() => ({})), async (client) => {
    const body = await c.req.json().catch(() => ({}));
    if (!body.name || !body.effective_from) return { status: 422, body: { error: "invalid_request" } };
    const ref = c.req.param("ref");
    const prev = await client.query("SELECT * FROM party_version WHERE reference=$1 AND effective_from < $2 ORDER BY effective_from DESC LIMIT 1", [ref, body.effective_from]);
    const ins = await client.query(
      "INSERT INTO party_version (reference, name, effective_from) VALUES ($1,$2,$3) RETURNING *",
      [ref, body.name, body.effective_from]
    );
    await record(client, {
      act: "party_version_recorded", person: c.get("session").email, site: null, object: ref,
      detail: { name: body.name, effective_from: body.effective_from, supersedes: prev.rows.length ? prev.rows[0].name : null },
    });
    return { status: 201, body: { reference: ref + "@" + body.effective_from, name: body.name, effective_from: body.effective_from, supersedes: prev.rows.length ? prev.rows[0].name : null } };
  });
});

export function partyNameAt(rows, date) {
  let current = null;
  for (const r of rows) if (r.effective_from <= date) current = r.name;
  return current;
}

/* ------------------------------------------------- collectors */
core.get("/collectors", async (c) => {
  const collectors = await q("SELECT * FROM collector ORDER BY reference");
  const periods = await q("SELECT * FROM approval_period ORDER BY collector, valid_from");
  const findings = await q("SELECT * FROM finding");
  const parties = await q("SELECT * FROM party_version");
  return c.json(collectors.map((col) => collectorView(col, periods, findings, parties)));
});

core.get("/collectors/:ref", async (c) => {
  const col = await one("SELECT * FROM collector WHERE reference=$1", [c.req.param("ref")]);
  if (!col) return c.json({ error: "not_found" }, 404);
  const periods = await q("SELECT * FROM approval_period WHERE collector=$1 ORDER BY valid_from", [col.reference]);
  const findings = await q("SELECT * FROM finding WHERE collector=$1", [col.reference]);
  const parties = await q("SELECT * FROM party_version WHERE reference=$1", [col.reference]);
  return c.json(collectorView(col, periods, findings, parties));
});

function collectorView(col, periods, findings, parties) {
  const name = partyNameAt(parties, today());
  const mine = periods.filter((p) => p.collector === col.reference);
  const now = today();
  return {
    reference: col.reference,
    name: name || col.name,
    country: col.country,
    registration: col.registration,
    registration_expiry: col.registration_expiry,
    collection_site_types: col.site_types,
    declared_streams: col.streams,
    scheme_status: col.scheme_status,
    findings: findings.filter((f) => f.collector === col.reference).map((f) => ({
      reference: f.reference, reason: f.reason, departure_bp: f.departure_bp === null ? null : Number(f.departure_bp), raised_on: f.raised_on, due_on: f.due_on, state: f.state,
    })),
    approval_periods: mine.map((p) => {
      const days = Math.round((Date.parse(p.valid_to) - Date.parse(now)) / 86400000);
      return {
        state: p.state,
        valid_from: p.valid_from,
        valid_to: p.valid_to,
        condition: p.condition || null,
        condition_closes_on: p.condition_closes_on || null,
        expiring: p.state === "approved" && days >= 0 && days <= 14,
      };
    }),
  };
}

core.post("/collectors/:ref/approvals", role("quality_manager"), async (c) => {
  return withIdempotency(c, "collector-approval", await c.req.json().catch(() => ({})), async (client) => {
    const ref = c.req.param("ref");
    const body = await c.req.json().catch(() => ({}));
    const states = ["approved", "conditional", "suspended", "lapsed"];
    if (!states.includes(body.state) || !body.valid_from || !body.valid_to) return { status: 422, body: { error: "invalid_request" } };
    if (body.state === "conditional" && (!body.condition || !body.condition_closes_on)) {
      return { status: 422, body: { error: "conditional_approval_requires_condition_and_close_date" } };
    }
    const col = await client.query("SELECT * FROM collector WHERE reference=$1", [ref]);
    if (!col.rows.length) return { status: 404, body: { error: "not_found" } };
    const ins = await client.query(
      `INSERT INTO approval_period (collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ref, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null, c.get("session").email]
    );
    await record(client, {
      act: "collector_" + (body.state === "approved" ? "approved" : body.state === "suspended" ? "suspended" : body.state === "lapsed" ? "lapsed" : "approval_recorded"),
      person: c.get("session").email, site: null, object: ref,
      detail: { state: body.state, valid_from: body.valid_from, valid_to: body.valid_to },
    });
    return { status: 201, body: { reference: "APR-" + ins.rows[0].id, collector: ref, state: body.state, valid_from: body.valid_from, valid_to: body.valid_to } };
  });
});

/* ------------------------------------------------- batches */
core.get("/batches", guard(async (c) => {
  const rows = await q("SELECT * FROM batch ORDER BY received_on, reference");
  const devices = new Map((await q("SELECT * FROM weighing_device")).map((d) => [d.reference, d]));
  const out = [];
  for (const b of rows) out.push(await batchView(b, devices.get(b.device)));
  return c.json(out);
}));

core.get("/batches/:ref", guard(async (c) => {
  const b = await one("SELECT * FROM batch WHERE reference=$1", [c.req.param("ref")]);
  if (!b) return c.json({ error: "not_found" }, 404);
  const device = await one("SELECT * FROM weighing_device WHERE reference=$1", [b.device]);
  return c.json(await batchView(b, device));
}));

export async function batchView(b, device) {
  const cl = await batchClaimability(b, device);
  const flags = batchFlags(b, device ? device.calibrated_on : null);
  return {
    reference: b.reference,
    collector: b.collector,
    collector_name: b.collector_name,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: Number(b.net_g),
    moisture_bp: Number(b.moisture_bp),
    moisture_method: b.moisture_method,
    device: b.device,
    device_calibration: device ? device.calibrated_on : null,
    received_on: b.received_on,
    composition: b.composition || [],
    contamination: b.contamination || {},
    custody: b.custody || [],
    custody_complete: cl.missing_kind === null,
    missing_custody_kind: cl.missing_kind,
    dry_mass_g: dryMass(Number(b.net_g), Number(b.moisture_bp)),
    claimable: cl.claimable,
    claimable_reason: cl.reason,
    claimable_from: b.claimable_from || null,
    approval_in_force: cl.approval ? { state: cl.approval.state, valid_from: cl.approval.valid_from, valid_to: cl.approval.valid_to } : null,
    flags,
    accepted_g: b.accepted_g === null ? null : Number(b.accepted_g),
    rejected_g: Number(b.rejected_g),
    rejected_destination: b.rejected_destination,
    booked_by: b.booked_by,
    derivation: { rule: "dry_mass_g = floor(net_g * (10000 - moisture_bp) / 10000)" },
  };
}

core.post("/batches", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "batches", body, async (client) => {
    const required = ["collector", "site", "category", "gross_g", "tare_g", "net_g", "moisture_bp", "moisture_method", "device", "received_on", "composition", "contamination", "custody"];
    for (const f of required) if (body[f] === undefined || body[f] === null) return { status: 422, body: { error: "missing_field", field: f } };
    if (!["post_consumer", "pre_consumer"].includes(body.category)) {
      return { status: 422, body: { error: "invalid_category", field: "category" } };
    }
    for (const f of ["gross_g", "tare_g", "net_g", "moisture_bp"]) {
      if (!Number.isInteger(Number(body[f])) || Number(body[f]) < 0) return { status: 422, body: { error: "integer_required", field: f } };
    }
    const collector = (await client.query("SELECT * FROM collector WHERE reference=$1", [body.collector])).rows[0];
    if (!collector) return { status: 422, body: { error: "unknown_collector" } };
    const device = (await client.query("SELECT * FROM weighing_device WHERE reference=$1", [body.device])).rows[0];
    if (!device) return { status: 422, body: { error: "unknown_device" } };
    const seq = (await client.query("SELECT count(*)::int AS n FROM batch WHERE received_on=$1", [body.received_on])).rows[0].n;
    const year = body.received_on.slice(0, 4);
    const reference = "BATCH-" + (1000 + (await client.query("SELECT count(*)::int AS n FROM batch")).rows[0].n + 1);
    const parties = (await client.query("SELECT * FROM party_version WHERE reference=$1", [body.collector])).rows;
    const collectorName = partyNameAt(parties, body.received_on) || collector.name;
    const cl = await batchClaimability({ collector: body.collector, received_on: body.received_on, custody: body.custody, device: body.device }, device);
    const ins = await client.query(
      `INSERT INTO batch (reference, collector, collector_name, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, received_at, composition, contamination, custody, accepted_g, rejected_g, booked_by, claimable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,0,$19,$20) RETURNING *`,
      [reference, body.collector, collectorName, body.site, body.grade || "N6", body.category,
       body.gross_g, body.tare_g, body.net_g, body.moisture_bp, body.moisture_method, body.device,
       body.received_on, new Date().toISOString(), JSON.stringify(body.composition), JSON.stringify(body.contamination), JSON.stringify(body.custody),
       body.net_g, c.get("session").email, null]
    );
    // a batch and its weighing land together
    await record(client, { act: "batch_booked", person: c.get("session").email, site: body.site, object: reference, detail: { net_g: body.net_g, category: body.category } });
    await record(client, { act: "weighing_recorded", person: c.get("session").email, site: body.site, object: reference, detail: { device: body.device, calibration: calibrationWord(device.calibrated_on, body.received_on) } });
    // composition departure against the declaration
    if (Array.isArray(body.composition)) {
      for (const comp of body.composition) {
        if (comp.basis === "sampled" && comp.measured_fraction_bp !== undefined) {
          const departure = Math.abs(Number(comp.measured_fraction_bp) - Number(comp.fraction_bp));
          if (departure > 500) {
            await client.query(
              `INSERT INTO finding (reference, collector, batch, reason, departure_bp, raised_on, due_on, state)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'open')`,
              ["FND-" + Date.now().toString(36).toUpperCase(), body.collector, reference,
                "Measured composition departed from the declaration by more than 500 basis points", departure, today(), addDays(today(), 30)]
            );
          }
        }
      }
    }
    const row = ins.rows[0];
    return { status: 201, body: Object.assign({ reference }, await batchView(row, device)) };
  });
});

function calibrationWord(calibratedOn, receivedOn) {
  const laps = Date.parse(receivedOn) - Date.parse(calibratedOn) > 365.25 * 24 * 3600 * 1000;
  return laps ? "lapsed" : "valid";
}

core.patch("/batches/:ref", role("plant_operator", "quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "batch-patch", body, async (client) => {
    const ref = c.req.param("ref");
    const b = (await client.query("SELECT * FROM batch WHERE reference=$1", [ref])).rows[0];
    if (!b) return { status: 404, body: { error: "not_found" } };
    if (body.category && body.category !== b.category) {
      await record(client, {
        act: "refused", person: c.get("session").email, site: b.site, object: ref,
        detail: { attempted: "category change", from: b.category, to: body.category },
        refused: "category_immutable_after_acceptance",
      });
      return { status: 409, body: { error: "category_immutable_after_acceptance", rule: "A batch category cannot be changed after acceptance, by anybody, through any route." } };
    }
    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, col] of [["gross_g", "gross_g"], ["tare_g", "tare_g"], ["net_g", "net_g"], ["moisture_bp", "moisture_bp"], ["composition", "composition"], ["contamination", "contamination"]]) {
      if (body[k] !== undefined) { fields.push(`${col}=$${i++}`); vals.push(typeof body[k] === "object" ? JSON.stringify(body[k]) : body[k]); }
    }
    if (!fields.length) return { status: 422, body: { error: "nothing_to_change" } };
    vals.push(ref);
    await client.query(`UPDATE batch SET ${fields.join(", ")} WHERE reference=$${i}`, vals);
    await record(client, { act: "batch_amended", person: c.get("session").email, site: b.site, object: ref, detail: body });
    const after = (await client.query("SELECT * FROM batch WHERE reference=$1", [ref])).rows[0];
    const device = (await client.query("SELECT * FROM weighing_device WHERE reference=$1", [b.device])).rows[0];
    return { status: 200, body: await batchView(after, device) };
  });
});

core.post("/batches/:ref/custody", role("plant_operator", "quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "batch-custody", body, async (client) => {
    const ref = c.req.param("ref");
    const b = (await client.query("SELECT * FROM batch WHERE reference=$1", [ref])).rows[0];
    if (!b) return { status: 404, body: { error: "not_found" } };
    if (!body.document || !body.arrived_on) return { status: 422, body: { error: "invalid_request" } };
    const custody = (b.custody || []).concat([{ kind: body.kind || "transport", date: body.arrived_on, party: body.party || "late evidence", document: body.document }]);
    await client.query("UPDATE batch SET custody=$2, claimable_from=$3 WHERE reference=$1", [ref, JSON.stringify(custody), body.arrived_on]);
    await record(client, { act: "custody_late_document_attached", person: c.get("session").email, site: b.site, object: ref, detail: { arrived_on: body.arrived_on, kind: body.kind || "transport" } });
    const after = (await client.query("SELECT * FROM batch WHERE reference=$1", [ref])).rows[0];
    const device = (await client.query("SELECT * FROM weighing_device WHERE reference=$1", [b.device])).rows[0];
    const view = await batchView(after, device);
    view.claimable_from = body.arrived_on;
    view.note = "The batch becomes claimable from the date the late evidence arrived, not from its receipt date.";
    return { status: 201, body: Object.assign({ reference: "CST-" + Date.now().toString(36).toUpperCase() }, view) };
  });
});

core.post("/batches/:ref/reject", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "batch-reject", body, async (client) => {
    const ref = c.req.param("ref");
    const b = (await client.query("SELECT * FROM batch WHERE reference=$1", [ref])).rows[0];
    if (!b) return { status: 404, body: { error: "not_found" } };
    const rejected = num(body.rejected_g, "rejected_g");
    if (!body.reason || !body.destination) return { status: 422, body: { error: "invalid_request" } };
    const accepted = Number(b.net_g) - rejected;
    if (accepted < 0) return { status: 422, body: { error: "rejected_exceeds_delivered" } };
    await client.query(
      "UPDATE batch SET accepted_g=$2, rejected_g=$3, rejected_destination=$4, reject_reason=$5 WHERE reference=$1",
      [ref, accepted, rejected, body.destination, body.reason]
    );
    await record(client, { act: "batch_rejected", person: c.get("session").email, site: b.site, object: ref, detail: { rejected_g: rejected, reason: body.reason, destination: body.destination } });
    return {
      status: 201,
      body: {
        reference: "REJ-" + Date.now().toString(36).toUpperCase(),
        batch: ref,
        delivered_g: Number(b.net_g),
        accepted_g: accepted,
        rejected_g: rejected,
        rejected_destination: body.destination,
        derivation: { rule: "accepted mass plus rejected mass equals delivered mass" },
      },
    };
  });
});

core.get("/batches/:ref/impact", guard(async (c) => {
  const bad = refusePagination(c);
  if (bad) return bad;
  const impact = await impactOfBatch(c.req.param("ref"));
  if (!impact) return c.json({ error: "not_found" }, 404);
  return c.json(impact);
}));

/* ------------------------------------------------- runs */
core.get("/runs", guard(async (c) => {
  const rows = await q("SELECT * FROM run ORDER BY started_at");
  const cons = await q("SELECT * FROM consumption");
  const outs = await q("SELECT * FROM output");
  return c.json(rows.map((r) => ({
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    operator: r.operator,
    started_at: r.started_at,
    state: r.state,
    losses_g: r.losses_g === null ? null : Number(r.losses_g),
    flags: [],
    consumptions: cons.filter((x) => x.run === r.reference).length,
    outputs: outs.filter((x) => x.run === r.reference).length,
  })));
}));

core.get("/runs/:ref", guard(async (c) => {
  const r = await one("SELECT * FROM run WHERE reference=$1", [c.req.param("ref")]);
  if (!r) return c.json({ error: "not_found" }, 404);
  const recipe = await one("SELECT * FROM recipe_version WHERE reference=$1", [r.recipe_version]);
  const cons = await q("SELECT * FROM consumption WHERE run=$1 ORDER BY consumed_at", [r.reference]);
  const outs = await q("SELECT * FROM output WHERE run=$1 ORDER BY produced_at", [r.reference]);
  const within = withinTolerance(recipe, r.achieved);
  const badCustody = [];
  for (const cn of cons) {
    if (cn.input_kind !== "batch") continue;
    const b = await one("SELECT * FROM batch WHERE reference=$1", [cn.input]);
    if (b) {
      const missing = missingCustody(b);
      if (missing) badCustody.push({ batch: b.reference, missing_kind: missing });
    }
  }
  return c.json({
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? { reference: recipe.reference, set_points: recipe.set_points, released_by: recipe.released_by, released_on: recipe.released_on } : null,
    achieved: r.achieved || null,
    within_tolerance: within.ok,
    tolerance_detail: within.detail,
    operator: r.operator,
    started_at: r.started_at,
    closed_at: r.closed_at,
    state: r.state,
    losses_g: r.losses_g === null ? null : Number(r.losses_g),
    mass_in_g: Number(r.mass_in_g),
    mass_out_g: Number(r.mass_out_g),
    consumptions: cons.map((cn) => ({ reference: cn.reference, input: cn.input, input_kind: cn.input_kind, mass_g: Number(cn.mass_g), effective_on: cn.effective_on })),
    outputs: outs.map((o) => ({ reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition, lot: o.lot })),
    flags: badCustody.length ? ["custody_link_missing"] : [],
    custody_detail: badCustody,
    derivation: { rule: "losses_g = mass in minus mass out" },
  });
}));

function withinTolerance(recipe, achieved) {
  if (!recipe || !achieved) return { ok: true, detail: null };
  const sp = recipe.set_points || {};
  const detail = [];
  let ok = true;
  for (const key of Object.keys(sp)) {
    const rule = sp[key];
    if (!rule || typeof rule !== "object" || rule.min === undefined) continue;
    const value = achieved[key];
    if (value === undefined) continue;
    const good = value >= rule.min && value <= rule.max;
    if (!good) ok = false;
    detail.push({ parameter: key, value, min: rule.min, max: rule.max, within: good });
  }
  return { ok, detail };
}

core.post("/runs", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "runs", body, async (client) => {
    const types = ["dissolution", "depolymerisation", "purification", "repolymerisation"];
    if (!types.includes(body.run_type) || !body.site || !body.equipment || !body.recipe_version || !body.started_at) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const recipe = (await client.query("SELECT * FROM recipe_version WHERE reference=$1", [body.recipe_version])).rows[0];
    if (!recipe) return { status: 422, body: { error: "unknown_recipe" } };
    const n = (await client.query("SELECT count(*)::int AS n FROM run")).rows[0].n;
    const prefix = { dissolution: "D", depolymerisation: "Y", purification: "U", repolymerisation: "R" }[body.run_type];
    const reference = "RUN-" + prefix + "-" + String(n + 1).padStart(4, "0");
    await client.query(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, operator, started_at, recorded_at, state, achieved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now(),'open',$8)`,
      [reference, body.run_type, body.site, body.equipment, body.recipe_version, body.operator || c.get("session").email, body.started_at, body.achieved ? JSON.stringify(body.achieved) : null]
    );
    await record(client, { act: "run_started", person: c.get("session").email, site: body.site, object: reference, detail: { run_type: body.run_type, recipe_version: body.recipe_version } });
    return { status: 201, body: { reference, run_type: body.run_type, site: body.site, state: "open" } };
  });
});

core.post("/runs/:ref/consumptions", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "run-consumption", body, async (client) => {
    const run = (await client.query("SELECT * FROM run WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!run) return { status: 404, body: { error: "not_found" } };
    if (run.state === "closed") {
      await record(client, { act: "refused", person: c.get("session").email, site: run.site, object: run.reference, detail: { attempted: "consumption on closed run" }, refused: "run_closed" });
      return { status: 409, body: { error: "run_closed" } };
    }
    if (!body.input || !Number.isInteger(Number(body.mass_g)) || Number(body.mass_g) <= 0) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const inputKind = body.input_kind || (body.input.startsWith("BATCH-") ? "batch" : "output");
    const effectiveOn = body.effective_on || today();
    const period = await engine.periodForEffectiveDate(run.site, "N6", effectiveOn);
    if (period && period.state === "closed" && period.cut_off && effectiveOn > period.cut_off) {
      await record(client, { act: "refused", person: c.get("session").email, site: run.site, object: run.reference, detail: { attempted: "consumption into closed period", effective_on: effectiveOn }, refused: "period_closed" });
      return { status: 409, body: { error: "period_closed", period: period.id, remedy: "open a restatement" } };
    }
    const reference = "CON-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
    const ins = await client.query(
      `INSERT INTO consumption (reference, run, input, input_kind, mass_g, consumed_at, effective_on, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, run.reference, body.input, inputKind, body.mass_g, new Date().toISOString(), effectiveOn, c.get("session").email]
    );
    await client.query("UPDATE run SET mass_in_g = mass_in_g + $2 WHERE reference=$1", [run.reference, body.mass_g]);
    await record(client, { act: "consumption_recorded", person: c.get("session").email, site: run.site, object: reference, detail: { run: run.reference, input: body.input, mass_g: body.mass_g, effective_on: effectiveOn } });
    const credit = await engine.grantCreditsForConsumption(client, {
      consumption: { reference, input: body.input, input_kind: inputKind, mass_g: Number(body.mass_g), effective_on: effectiveOn, consumed_at: new Date(), recorded_by: c.get("session").email },
    });
    return {
      status: 201,
      body: {
        reference,
        run: run.reference,
        input: body.input,
        input_kind: inputKind,
        mass_g: body.mass_g,
        effective_on: effectiveOn,
        credit: credit ? { granted_g: credit.granted, claimable: credit.claimable, reason: credit.reason || null, period: credit.period, derivation: "floor(dry_mass_consumed_g * factor_bp / 10000)" } : null,
      },
    };
  });
});

core.post("/runs/:ref/outputs", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "run-output", body, async (client) => {
    const run = (await client.query("SELECT * FROM run WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!run) return { status: 404, body: { error: "not_found" } };
    if (run.state === "closed") {
      await record(client, { act: "refused", person: c.get("session").email, site: run.site, object: run.reference, detail: { attempted: "output on closed run" }, refused: "run_closed" });
      return { status: 409, body: { error: "run_closed" } };
    }
    const kinds = ["intermediate", "lot", "byproduct"];
    if (!kinds.includes(body.kind) || !Number.isInteger(Number(body.mass_g)) || Number(body.mass_g) <= 0) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    if (body.kind === "byproduct" && !["sold", "disposed"].includes(body.disposition)) {
      return { status: 422, body: { error: "byproduct_requires_disposition" } };
    }
    let lotRef = body.lot || null;
    const stageLetter = { dissolution: "D", depolymerisation: "Y", purification: "U", repolymerisation: "R" }[run.run_type];
    const count = (await client.query("SELECT count(*)::int AS n FROM output WHERE run LIKE $1", ["RUN-" + stageLetter + "-%"])).rows[0].n;
    const reference = "OUT-" + stageLetter + "-" + String(count + 1).padStart(4, "0");
    if (body.kind === "lot") {
      const lotCount = (await client.query("SELECT count(*)::int AS n FROM lot WHERE grade=$1", ["N6"])).rows[0].n;
      lotRef = "LOT-N6-" + String(lotCount + 1).padStart(4, "0");
      await client.query(
        `INSERT INTO lot (reference, site, grade, mass_g, disposition, claim_type, produced_at, produced_by)
         VALUES ($1,$2,$3,$4,'pending','mass_balance',now(),$5)`,
        [lotRef, run.site, body.grade || "N6", body.mass_g, c.get("session").email]
      );
    }
    await client.query(
      `INSERT INTO output (reference, run, kind, mass_g, disposition, lot, produced_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())`,
      [reference, run.reference, body.kind, body.mass_g, body.disposition || null, lotRef]
    );
    await client.query("UPDATE run SET mass_out_g = mass_out_g + $2 WHERE reference=$1", [run.reference, body.mass_g]);
    await record(client, { act: "output_recorded", person: c.get("session").email, site: run.site, object: reference, detail: { run: run.reference, kind: body.kind, mass_g: body.mass_g, lot: lotRef } });
    return { status: 201, body: { reference, run: run.reference, kind: body.kind, mass_g: body.mass_g, disposition: body.disposition || null, lot: lotRef } };
  });
});

core.post("/runs/:ref/close", role("plant_operator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "run-close", body, async (client) => {
    const run = (await client.query("SELECT * FROM run WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!run) return { status: 404, body: { error: "not_found" } };
    if (run.state === "closed") {
      await record(client, { act: "refused", person: c.get("session").email, site: run.site, object: run.reference, detail: { attempted: "second close" }, refused: "run_already_closed" });
      return { status: 409, body: { error: "run_already_closed", note: "the attempt is itself recorded" } };
    }
    const losses = Number(run.mass_in_g) - Number(run.mass_out_g);
    await client.query("UPDATE run SET state='closed', closed_at=now(), losses_g=$2 WHERE reference=$1", [run.reference, losses]);
    const recipe = (await client.query("SELECT * FROM recipe_version WHERE reference=$1", [run.recipe_version])).rows[0];
    const within = withinTolerance(recipe, run.achieved);
    if (!within.ok) {
      const dref = "DEV-" + Date.now().toString(36).toUpperCase();
      await client.query(
        `INSERT INTO deviation (reference, state, raised_by, raised_on, description, closes_run)
         VALUES ($1,'open',$2,$3,$4,$5)`,
        [dref, c.get("session").email, today(), "Run finished outside its recipe tolerance", run.reference]
      );
      await client.query("INSERT INTO deviation_subject (deviation, subject_kind, subject) VALUES ($1,'run',$2)", [dref, run.reference]);
    }
    await record(client, { act: "run_closed", person: c.get("session").email, site: run.site, object: run.reference, detail: { losses_g: losses, within_tolerance: within.ok } });
    return {
      status: 201,
      body: {
        reference: "CLOSE-" + run.reference,
        run: run.reference,
        state: "closed",
        losses_g: losses,
        mass_in_g: Number(run.mass_in_g),
        mass_out_g: Number(run.mass_out_g),
        within_tolerance: within.ok,
        derivation: { rule: "losses_g = mass in minus mass out" },
      },
    };
  });
});

/* ------------------------------------------------- lots */
core.get("/lots", guard(async (c) => {
  const rows = await q("SELECT * FROM lot ORDER BY reference");
  const out = [];
  for (const l of rows) {
    const content = await engine.lotContent(l.reference);
    out.push({
      reference: l.reference,
      grade: l.grade,
      site: l.site,
      mass_g: Number(l.mass_g),
      disposition: l.disposition,
      claim_type: l.claim_type,
      content_bp: content ? content.content_bp : null,
      credit_attached_g: content ? content.credit_attached_g : 0,
      provisional_factor: content ? content.provisional_factor : false,
    });
  }
  return c.json(out);
}));

core.get("/lots/:ref", guard(async (c) => {
  const l = await one("SELECT * FROM lot WHERE reference=$1", [c.req.param("ref")]);
  if (!l) return c.json({ error: "not_found" }, 404);
  const content = await engine.lotContent(l.reference);
  const overrides = await q("SELECT * FROM override WHERE lot=$1", [l.reference]);
  const devs = await q(
    "SELECT d.* FROM deviation d JOIN deviation_subject s ON s.deviation=d.reference WHERE s.subject_kind='lot' AND s.subject=$1 AND d.state='open'",
    [l.reference]
  );
  const tests = await q("SELECT * FROM test_result WHERE subject_kind='lot' AND subject=$1", [l.reference]);
  const idx = await loadGraphSafe();
  const { batchMass } = ancestorsOfLot(idx, l.reference);
  const devices = new Map((await q("SELECT * FROM weighing_device")).map((d) => [d.reference, d]));
  const flags = [];
  for (const ref of batchMass.keys()) {
    const b = idx.batchByRef.get(ref);
    if (!b) continue;
    const dev = devices.get(b.device);
    for (const f of batchFlags(b, dev ? dev.calibrated_on : null)) if (!flags.includes(f)) flags.push(f);
    const cl = await batchClaimability(b, dev);
    if (!cl.claimable && !flags.includes("non_claimable_input")) flags.push("non_claimable_input");
  }
  return c.json({
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    claim_type: l.claim_type,
    content_bp: content.content_bp,
    credit_attached_g: content.credit_attached_g,
    category_split: content.category_split,
    provisional_factor: content.provisional_factor,
    flags,
    overrides: overrides.map((o) => ({
      reference: o.reference, separation: o.separation, reason: o.reason,
      authorised_by: o.authorised_by, authorised_on: o.authorised_on, reviewed: o.reviewed,
      reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on,
    })),
    open_deviations: devs.map((d) => d.reference),
    test_results: tests.map((t) => ({
      reference: t.reference, property: t.property, method: t.method, value: Number(t.value), unit: t.unit,
      method_mismatch: t.method_mismatch, usable_for_release: t.usable_for_release, analyst: t.analyst,
    })),
    derivation: content.derivation,
  });
}));

async function loadGraphSafe() {
  return loadGraph();
}

core.get("/lots/:ref/genealogy", guard(async (c) => {
  const bad = refusePagination(c);
  if (bad) return bad;
  const g = await genealogyForLot(c.req.param("ref"));
  if (!g) return c.json({ error: "not_found" }, 404);
  return c.json(g);
}));

core.get("/lots/:ref/yield", role("plant_operator", "quality_manager", "claims_manager"), async (c) => {
  const ref = c.req.param("ref");
  const l = await one("SELECT * FROM lot WHERE reference=$1", [ref]);
  if (!l) return c.json({ error: "not_found" }, 404);
  const idx = await loadGraphSafe();
  const { batchMass } = ancestorsOfLot(idx, ref);
  const inMass = [...batchMass.values()].reduce((s, m) => s + m, 0);
  const yieldBp = inMass ? Math.floor((Number(l.mass_g) * 10000) / inMass) : null;
  return c.json({
    lot: ref,
    input_mass_g: inMass,
    lot_mass_g: Number(l.mass_g),
    yield_bp: yieldBp,
    derivation: { rule: "floor(lot_mass_g * 10000 / input_mass_g)", batches: [...batchMass.keys()] },
    note: "A yield figure appears on no certificate and in no verification answer.",
  });
});

core.get("/lots/:ref/carbon", guard(async (c) => {
  const f = await one("SELECT * FROM carbon_figure WHERE lot=$1 AND superseded_by IS NULL ORDER BY revision DESC LIMIT 1", [c.req.param("ref")]);
  if (!f) return c.json({ error: "no_carbon_figure" }, 404);
  const period = await one("SELECT * FROM balance_period WHERE site=(SELECT site FROM lot WHERE reference=$1) AND state<>'closed' ORDER BY period_from DESC LIMIT 1", [c.req.param("ref")]);
  const method = await one("SELECT * FROM carbon_method WHERE id = split_part($1,' ',1) AND version = regexp_replace($1, '^.* v', '')::bigint", [f.method_version]);
  if (period && method && method.allocation_basis !== period.allocation_basis) {
    return c.json({ error: "allocation_basis_mismatch", period_basis: period.allocation_basis, method_basis: method.allocation_basis }, 409);
  }
  const threshold = method && method.data_quality ? method.data_quality.primary_share_threshold_bp : 5000;
  return c.json({
    lot: f.lot,
    value_mg_per_kg: Number(f.value_mg_per_kg),
    boundary: f.boundary,
    method_version: f.method_version,
    uncertainty_bp: Number(f.uncertainty_bp),
    comparator: f.comparator,
    primary_share_bp: Number(f.primary_share_bp),
    default_led: Number(f.primary_share_bp) < threshold,
    cache_valid: f.cache_valid,
    breakdown: f.breakdown || [],
    energy_location_mg_per_kg: f.energy_location_mg_per_kg === null ? null : Number(f.energy_location_mg_per_kg),
    energy_market_mg_per_kg: f.energy_market_mg_per_kg === null ? null : Number(f.energy_market_mg_per_kg),
    metered_kwh: f.metered_kwh === null ? null : Number(f.metered_kwh),
    retired_kwh: f.retired_kwh === null ? null : Number(f.retired_kwh),
    unmatched_kwh: f.unmatched_kwh === null ? null : Number(f.unmatched_kwh),
    versions: f.versions,
    computed_on: f.computed_on,
    derivation: { rule: "the lines sum to the value", lines: (f.breakdown || []).length },
  });
}));

core.post("/lots/:ref/disposition", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "lot-disposition", body, async (client) => {
    const ref = c.req.param("ref");
    const l = (await client.query("SELECT * FROM lot WHERE reference=$1", [ref])).rows[0];
    if (!l) return { status: 404, body: { error: "not_found" } };
    const states = ["pending", "released", "quarantined", "rejected"];
    if (!states.includes(body.disposition)) return { status: 422, body: { error: "invalid_request" } };
    const mine = (await client.query("SELECT 1 FROM test_result WHERE subject_kind='lot' AND subject=$1 AND analyst=$2 LIMIT 1", [ref, c.get("session").email])).rows.length;
    if (mine) {
      await record(client, { act: "refused", person: c.get("session").email, site: l.site, object: ref, detail: { attempted: "disposition" }, refused: "analyst_not_dispositioner" });
      return { status: 403, body: { error: "separation_refused", separation: "analyst_not_dispositioner", remedy: "an override naming this separation, or a different dispositions" } };
    }
    const openDev = (await client.query(
      "SELECT d.reference FROM deviation d JOIN deviation_subject s ON s.deviation=d.reference WHERE s.subject_kind='lot' AND s.subject=$1 AND d.state='open' LIMIT 1", [ref]
    )).rows;
    if (openDev.length) {
      await record(client, { act: "refused", person: c.get("session").email, site: l.site, object: ref, detail: { attempted: "disposition", deviation: openDev[0].reference }, refused: "open_deviation" });
      return { status: 409, body: { error: "open_deviation", deviation: openDev[0].reference } };
    }
    await client.query("UPDATE lot SET disposition=$2, disposition_by=$3, disposition_on=$4 WHERE reference=$1", [ref, body.disposition, c.get("session").email, today()]);
    await record(client, { act: "disposition_set", person: c.get("session").email, site: l.site, object: ref, detail: { disposition: body.disposition } });
    return { status: 201, body: { reference: "DSP-" + ref, lot: ref, disposition: body.disposition, by: c.get("session").email, on: today() } };
  });
});

core.post("/lots/:ref/blend", role("claims_manager", "quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "lot-blend", body, async (client) => {
    if (!body.with_lot) return { status: 422, body: { error: "invalid_request" } };
    const ref = c.req.param("ref");
    const result = await engine.blendLots(ref, body.with_lot);
    if (!result) return { status: 404, body: { error: "not_found" } };
    await record(client, { act: "lots_blended", person: c.get("session").email, site: null, object: ref, detail: Object.assign({ with: body.with_lot }, result) });
    return {
      status: 201,
      body: Object.assign({ reference: "BLD-" + Date.now().toString(36).toUpperCase(), lots: [ref, body.with_lot] }, result),
    };
  });
});

/* ------------------------------------------------- test results */
core.post("/test-results", role("lab_analyst", "quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "test-results", body, async (client) => {
    if (!body.subject || !body.property || !body.method || !body.analyst || body.value === undefined || !body.unit) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    if (!body.method) return { status: 422, body: { error: "method_required" } };
    const spec = (await client.query("SELECT * FROM specification WHERE grade=$1 ORDER BY version DESC LIMIT 1", ["SPEC-N6"])).rows[0];
    const named = spec ? (spec.rows || []).find((r) => r.property === body.property) : null;
    const mismatch = named ? named.method !== body.method : false;
    const reference = "TST-" + Date.now().toString(36).toUpperCase();
    await client.query(
      `INSERT INTO test_result (reference, subject_kind, subject, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release, taken_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [reference, body.subject.startsWith("BATCH-") ? "batch" : "lot", body.subject, body.property, body.method,
        body.instrument || null, body.analyst, body.value, body.unit, Number(body.uncertainty_bp || 0),
        mismatch, !mismatch, body.taken_on || today()]
    );
    await record(client, { act: "test_result_recorded", person: c.get("session").email, site: null, object: reference, detail: { subject: body.subject, property: body.property, method: body.method, method_mismatch: mismatch } });
    return {
      status: 201,
      body: {
        reference,
        subject: body.subject,
        property: body.property,
        method: body.method,
        method_mismatch: mismatch,
        usable_for_release: !mismatch,
        value: body.value,
        unit: body.unit,
        uncertainty_bp: Number(body.uncertainty_bp || 0),
        note: mismatch ? "Recorded as evidence. It does not reach a disposition because the method differs from the one the specification names." : null,
      },
    };
  });
});

/* ------------------------------------------------- deviations */
core.get("/deviations", guard(async (c) => {
  const rows = await q("SELECT * FROM deviation ORDER BY raised_on");
  const subs = await q("SELECT * FROM deviation_subject");
  return c.json(rows.map((d) => ({
    reference: d.reference,
    state: d.state,
    description: d.description,
    outcome: d.outcome,
    raised_by: d.raised_by,
    raised_on: d.raised_on,
    closed_on: d.closed_on,
    subjects: subs.filter((s) => s.deviation === d.reference).map((s) => ({ kind: s.subject_kind, subject: s.subject })),
  })));
}));

core.post("/deviations", role("quality_manager", "plant_operator", "lab_analyst"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "deviations", body, async (client) => {
    if (!body.description || !Array.isArray(body.subjects) || !body.subjects.length) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const reference = "DEV-" + Date.now().toString(36).toUpperCase();
    await client.query(
      `INSERT INTO deviation (reference, state, raised_by, raised_on, description) VALUES ($1,'open',$2,$3,$4)`,
      [reference, c.get("session").email, today(), body.description]
    );
    for (const s of body.subjects) {
      await client.query("INSERT INTO deviation_subject (deviation, subject_kind, subject) VALUES ($1,$2,$3)", [reference, s.kind || "lot", s.reference]);
    }
    await record(client, { act: "deviation_raised", person: c.get("session").email, site: null, object: reference, detail: { description: body.description, subjects: body.subjects } });
    return { status: 201, body: { reference, state: "open", subjects: body.subjects } };
  });
});

core.post("/deviations/:ref/close", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "deviation-close", body, async (client) => {
    const d = (await client.query("SELECT * FROM deviation WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!d) return { status: 404, body: { error: "not_found" } };
    if (!["root_cause_found", "cause_not_established"].includes(body.outcome)) {
      return { status: 422, body: { error: "invalid_outcome" } };
    }
    if (d.state === "closed") return { status: 409, body: { error: "already_closed" } };
    await client.query("UPDATE deviation SET state='closed', outcome=$2, closed_on=$3 WHERE reference=$1", [d.reference, body.outcome, today()]);
    await record(client, { act: "deviation_closed", person: c.get("session").email, site: null, object: d.reference, detail: { outcome: body.outcome } });
    return { status: 201, body: { reference: d.reference, state: "closed", outcome: body.outcome, closed_on: today() } };
  });
});

/* ------------------------------------------------- overrides */
core.get("/overrides", guard(async (c) => {
  const rows = await q("SELECT * FROM override ORDER BY authorised_on");
  return c.json(rows.map((o) => ({
    reference: o.reference, separation: o.separation, reason: o.reason, lot: o.lot,
    authorised_by: o.authorised_by, authorised_on: o.authorised_on,
    reviewed: o.reviewed, reviewed_by: o.reviewed_by, reviewed_on: o.reviewed_on,
  })));
}));

core.post("/overrides", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "overrides", body, async (client) => {
    if (!body.separation || !body.reason || !body.lot || !body.authorised_by) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    if (String(body.reason).trim().length < 40) {
      return { status: 422, body: { error: "reason_too_short", rule: "An override carries a reason of at least forty characters." } };
    }
    const lot = (await client.query("SELECT * FROM lot WHERE reference=$1", [body.lot])).rows[0];
    if (!lot) return { status: 404, body: { error: "lot_not_found" } };
    const reference = "OVR-" + String((await client.query("SELECT count(*)::int AS n FROM override")).rows[0].n + 1).padStart(4, "0");
    await client.query(
      `INSERT INTO override (reference, separation, reason, lot, authorised_by, authorised_on, reviewed)
       VALUES ($1,$2,$3,$4,$5,$6,false)`,
      [reference, body.separation, body.reason, body.lot, body.authorised_by, today()]
    );
    await record(client, { act: "override_recorded", person: c.get("session").email, site: lot.site, object: reference, detail: { separation: body.separation, lot: body.lot, authorised_by: body.authorised_by } });
    return {
      status: 201,
      body: {
        reference, separation: body.separation, lot: body.lot, authorised_by: body.authorised_by, authorised_on: today(),
        reviewed: false, note: "Permanent. It shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.",
      },
    };
  });
});

core.post("/overrides/:ref/review", role("quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "override-review", body, async (client) => {
    const o = (await client.query("SELECT * FROM override WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!o) return { status: 404, body: { error: "not_found" } };
    const me = c.get("session").email;
    if (o.authorised_by === me) {
      await record(client, { act: "refused", person: me, site: null, object: o.reference, detail: { attempted: "review" }, refused: "authoriser_cannot_review" });
      return { status: 403, body: { error: "authoriser_cannot_review" } };
    }
    if (o.reviewed) return { status: 409, body: { error: "already_reviewed" } };
    await client.query("UPDATE override SET reviewed=true, reviewed_by=$2, reviewed_on=$3 WHERE reference=$1", [o.reference, me, today()]);
    await record(client, { act: "override_reviewed", person: me, site: null, object: o.reference, detail: { note: body.note || null } });
    return { status: 201, body: { reference: o.reference, reviewed: true, reviewed_by: me, reviewed_on: today() } };
  });
});

/* ------------------------------------------------- helpers */
export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
