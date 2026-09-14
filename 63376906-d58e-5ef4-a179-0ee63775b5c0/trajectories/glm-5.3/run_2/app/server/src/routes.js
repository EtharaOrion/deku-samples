import { Hono } from "hono";
import { q, one, withTx } from "./db.js";
import { requireAuth, requireRole, loginToKeycloak, issueSession, identity, refusePagination } from "./auth.js";
import { record, recordPool, checkChain, digestOf, GENESIS } from "./record.js";
import { storeIdempotent } from "./idempotency.js";
import { may } from "./config.js";
import { dryMassG, creditGrantedG, contentBP, factorFromWindowBP, blendedBP, shareBP, carriedForwardG, requiredRemainingBP, nowIso } from "./arithmetic.js";
import { batchClaimability, balanceView, marginFor, approvalInForce, periodFor, factorForSite } from "./engine.js";
import { forwardTraversal, reverseTraversal, textEquivalent, flagsForBatch, flagsForLot, partyNameOn, upstreamBatches, certSummary, batchByRef, runByRef, lotByRef } from "./genealogy.js";
import { certificateConditions, permittedStatement, prohibitedStatement, CONDITION_LABELS } from "./certificate.js";
import { sendMail, mailActs } from "./mail.js";

export const api = new Hono();

const j = (x) => JSON.parse(JSON.stringify(x));

// ---------- health ----------
api.get("/health", (c) => c.json({ status: "ok", time: nowIso() }));

// ---------- auth ----------
api.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.email || !body.password)
    return c.json({ error: "email_and_password_required" }, 400);
  const user = await loginToKeycloak(body.email, body.password);
  if (!user) return c.json({ error: "invalid_credentials" }, 401);
  const sess = await issueSession(user);
  return c.json(sess, 200);
});

api.get("/auth/me", requireAuth(async (c, sess) => c.json({
  email: sess.email,
  roles: sess.roles,
  sites: sess.sites,
  name: sess.name,
  grant_ends_on: "2027-06-30",
})));

// ---------- sites ----------
api.get("/sites", async (c) => {
  const rows = await q(`select * from sites order by nameplate_kg desc`);
  return c.json(rows.map((r) => ({
    reference: r.reference,
    name: r.name,
    confidence: r.confidence,
    certification_state: r.certification_state,
  })));
});

api.get("/sites/:reference/capacity", async (c) => {
  const r = await one(`select * from sites where reference = $1`, [c.req.param("reference")]);
  if (!r) return c.json({ error: "not_found" }, 404);
  return c.json({
    reference: r.reference,
    nameplate_kg: Number(r.nameplate_kg),
    basis: r.capacity_basis,
    contracted_kg: Number(r.contracted_kg),
    uncommitted_kg: Number(r.nameplate_kg) - Number(r.contracted_kg),
    confidence: r.confidence,
    last_revised: r.last_revised,
  });
});

api.post("/sites/:reference/certification", requireRole("certification_record", async (c, sess) => {
  const body = await c.req.json();
  const site = c.req.param("reference");
  if (!["certified", "suspended"].includes(body.state))
    return c.json({ error: "state_invalid" }, 400);
  const eff = body.effective_from || nowIso().slice(0, 10);
  const effTo = body.effective_to || "2030-12-31";
  const row = await withTx(`cert:${site}`, async (tx) => {
    const r = await tx.one(
      `insert into site_certifications(site, state, effective_from, effective_to) values($1,$2,$3,$4) returning *`,
      [site, body.state, eff, effTo]
    );
    return r;
  });
  // certificates signed inside the window, each resolved under the three outcomes
  const window = await q(
    `select * from certificates where site = $1 and signed_at::date between $2 and $3 and state = 'issued'`,
    [site, eff, effTo]
  );
  const certificates_in_window = window.map((cert) => ({
    ...certSummary(cert),
    proposed_resolution: cert.state === "withdrawn" ? "withdrawn" : "reissued",
  }));
  await recordPool({ act: "certification_recorded", person: sess.email, site, object_reference: site, content: { state: body.state, effective_from: eff, effective_to: effTo, certificates_in_window } }).catch(() => {});
  return c.json({ state: body.state, effective_from: eff, effective_to: effTo, certificates_in_window }, 201);
}));

// ---------- parties ----------
api.get("/parties/:reference/versions", async (c) => {
  const rows = await q(
    `select name, effective_from from party_versions where party = $1 order by effective_from`,
    [c.req.param("reference")]
  );
  return c.json(rows);
});

api.post("/parties/:reference/versions", requireRole("party_version", async (c, sess) => {
  const body = await c.req.json();
  if (!body.name || !body.effective_from) return c.json({ error: "name_and_effective_from_required" }, 400);
  await q(
    `insert into party_versions(party, name, effective_from) values($1,$2,$3)`,
    [c.req.param("reference"), body.name, body.effective_from]
  );
  await q(`update parties set current_name = $2 where reference = $1`, [c.req.param("reference"), body.name]);
  const payload = { reference: `${c.req.param("reference")}:${body.effective_from}`, name: body.name, effective_from: body.effective_from };
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

// ---------- collectors ----------
api.get("/collectors", async (c) => {
  const parties = await q(`select * from parties where kind = 'collector' order by reference`);
  const out = [];
  for (const p of parties) {
    const periods = await q(
      `select * from approval_periods where collector = $1 order by valid_from`,
      [p.reference]
    );
    const fnd = await q(`select * from findings where collector = $1 order by raised_on desc`, [p.reference]);
    out.push({
      reference: p.reference,
      name: p.current_name,
      country: p.country,
      registration: p.registration,
      registration_expiry: p.registration_expiry,
      collection_site_types: p.collection_site_types,
      declared_streams: p.declared_streams,
      scheme_status: p.scheme_status,
      findings: fnd.map((f) => ({
        raised_on: f.raised_on,
        basis: f.basis,
        departure_bp: f.departure_bp,
        detail: f.detail,
        state: f.state,
        review_date: f.review_date,
      })),
      approval_periods: periods.map((a) => ({
        state: a.state,
        valid_from: a.valid_from,
        valid_to: a.valid_to,
        ...(a.state === "conditional" ? { condition: a.condition, condition_closes_on: a.condition_closes_on } : {}),
        expiring: (new Date(a.valid_to) - new Date()) / 86400000 <= 14,
      })),
    });
  }
  return c.json(out);
});

api.get("/collectors/:reference", async (c) => {
  const p = await one(`select * from parties where reference = $1 and kind='collector'`, [c.req.param("reference")]);
  if (!p) return c.json({ error: "not_found" }, 404);
  const periods = await q(`select * from approval_periods where collector = $1 order by valid_from`, [p.reference]);
  const fnd = await q(`select * from findings where collector = $1 order by raised_on desc`, [p.reference]);
  return c.json({
    reference: p.reference,
    name: p.current_name,
    country: p.country,
    registration: p.registration,
    registration_expiry: p.registration_expiry,
    collection_site_types: p.collection_site_types,
    declared_streams: p.declared_streams,
    scheme_status: p.scheme_status,
    findings: fnd.map((f) => ({
      raised_on: f.raised_on, basis: f.basis, departure_bp: f.departure_bp, detail: f.detail, state: f.state, review_date: f.review_date,
    })),
    approval_periods: periods.map((a) => ({
      state: a.state,
      valid_from: a.valid_from,
      valid_to: a.valid_to,
      ...(a.state === "conditional" ? { condition: a.condition, condition_closes_on: a.condition_closes_on } : {}),
      expiring: (new Date(a.valid_to) - new Date()) / 86400000 <= 14,
    })),
  });
});

api.post("/collectors/:reference/approvals", requireRole("collector_approval", async (c, sess) => {
  const body = await c.req.json();
  if (!["approved", "conditional", "suspended", "lapsed"].includes(body.state))
    return c.json({ error: "state_invalid" }, 400);
  if (!body.valid_from || !body.valid_to) return c.json({ error: "valid_from_and_to_required" }, 400);
  const collector = c.req.param("reference");
  const row = await withTx(`collector:${collector}`, async (tx) =>
    tx.one(
      `insert into approval_periods(collector, state, valid_from, valid_to, condition, condition_closes_on, created_by)
       values($1,$2,$3,$4,$5,$6,$7) returning *`,
      [collector, body.state, body.valid_from, body.valid_to, body.condition || null, body.condition_closes_on || null, sess.email]
    )
  );
  const payload = {
    reference: `APR-${row.id}`,
    state: row.state,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    expiring: (new Date(row.valid_to) - new Date()) / 86400000 <= 14,
  };
  await recordPool({ act: "collector_approved", person: sess.email, object_reference: collector, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

// ---------- batches ----------
function batchView(b) {
  return b;
}

api.get("/batches", async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const rows = await q(`select * from batches order by received_on, reference`);
  const out = [];
  for (const b of rows) {
    const cl = await batchClaimability(b);
    out.push({
      reference: b.reference,
      collector: b.collector,
      collector_name: b.collector_name_at_receipt,
      site: b.site,
      grade: b.grade,
      category: b.category,
      gross_g: Number(b.gross_g),
      tare_g: Number(b.tare_g),
      net_g: Number(b.net_g),
      moisture_bp: b.moisture_bp,
      moisture_method: b.moisture_method,
      device: b.device,
      received_on: b.received_on,
      dry_mass_g: dryMassG(Number(b.net_g), b.moisture_bp),
      claimable: cl.claimable,
      claimable_reason: cl.claimable_reason,
      claimable_from: cl.claimable_from,
      flags: cl.flags,
      custody_complete: cl.missing_kinds.length === 0,
      missing_custody_kinds: cl.missing_kinds,
      composition: b.composition,
      contamination: b.contamination,
      custody: b.custody,
      accepted_g: b.accepted_g === null ? null : Number(b.accepted_g),
      rejected_g: Number(b.rejected_g || 0),
      rejected_destination: b.rejected_destination,
      status: b.status,
      derivation: {
        dry_mass_g: "net_g * (10000 - moisture_bp) / 10000, floored",
        claimable: `approval period in force on ${b.received_on}`,
      },
    });
  }
  return c.json(out);
});

api.get("/batches/:reference", async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const b = await batchByRef(c.req.param("reference"));
  if (!b) return c.json({ error: "not_found" }, 404);
  const cl = await batchClaimability(b);
  return c.json({
    reference: b.reference,
    collector: b.collector,
    collector_name: b.collector_name_at_receipt,
    site: b.site,
    grade: b.grade,
    category: b.category,
    gross_g: Number(b.gross_g),
    tare_g: Number(b.tare_g),
    net_g: Number(b.net_g),
    moisture_bp: b.moisture_bp,
    moisture_method: b.moisture_method,
    device: b.device,
    received_on: b.received_on,
    dry_mass_g: dryMassG(Number(b.net_g), b.moisture_bp),
    claimable: cl.claimable,
    claimable_reason: cl.claimable_reason,
    claimable_from: cl.claimable_from,
    flags: cl.flags,
    custody_complete: cl.missing_kinds.length === 0,
    missing_custody_kinds: cl.missing_kinds,
    composition: b.composition,
    contamination: b.contamination,
    custody: b.custody,
    accepted_g: b.accepted_g === null ? null : Number(b.accepted_g),
    rejected_g: Number(b.rejected_g || 0),
    rejected_destination: b.rejected_destination,
    status: b.status,
    derivation: {
      dry_mass_g: "net_g * (10000 - moisture_bp) / 10000, floored",
      claimable: `approval period in force on ${b.received_on}`,
    },
  });
});

api.post("/batches", requireRole("batch_create", async (c, sess) => {
  const body = await c.req.json();
  if (!body.category) return c.json({ error: "category_required_no_default" }, 400);
  if (!["post_consumer", "pre_consumer"].includes(body.category))
    return c.json({ error: "category_invalid" }, 400);
  if (!body.collector || !body.site || !body.received_on)
    return c.json({ error: "collector_site_and_received_on_required" }, 400);
  if (body.net_g === undefined || body.gross_g === undefined || body.tare_g === undefined)
    return c.json({ error: "masses_required" }, 400);
  if (Number(body.gross_g) - Number(body.tare_g) !== Number(body.net_g))
    return c.json({ error: "net_must_equal_gross_minus_tare" }, 400);
  if (!Number.isInteger(Number(body.net_g)) || !Number.isInteger(Number(body.gross_g)) || !Number.isInteger(Number(body.tare_g)))
    return c.json({ error: "masses_must_be_integer_grams" }, 400);
  if (body.moisture_bp === undefined || !Number.isInteger(Number(body.moisture_bp)))
    return c.json({ error: "moisture_bp_required" }, 400);
  const collectorName = await partyNameOn(body.collector, body.received_on);
  const reference = `BATCH-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 9)}`;
  const accepted = body.accepted_g ?? Number(body.net_g);
  await q(
    `insert into batches(reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on,
      composition, contamination, custody, accepted_g, rejected_g, rejected_destination, status, effective_on, collector_name_at_receipt)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,null,'accepted',$12,$17)`,
    [
      reference, body.collector, body.site, body.grade || "N6", body.category,
      Number(body.gross_g), Number(body.tare_g), Number(body.net_g), Number(body.moisture_bp),
      body.moisture_method || null, body.device || null, body.received_on,
      JSON.stringify(body.composition || []), JSON.stringify(body.contamination || {}),
      JSON.stringify(body.custody || []), accepted, collectorName,
    ]
  );
  const b = await batchByRef(reference);
  const cl = await batchClaimability(b);
  // a measured composition departing from the declaration raises a finding
  // against the collector's approval record rather than the plant
  if ((body.composition || []).some((c2) => c2.measured_fraction_bp !== undefined && c2.fraction_bp !== undefined && Math.abs(c2.measured_fraction_bp - c2.fraction_bp) > 500)) {
    const ap = await approvalInForce(body.collector, body.received_on);
    const dep = Math.max(...(body.composition || [])
      .filter((c2) => c2.measured_fraction_bp !== undefined)
      .map((c2) => Math.abs(c2.measured_fraction_bp - c2.fraction_bp)));
    await q(
      `insert into findings(collector, approval_period, raised_on, basis, departure_bp, detail, state, review_date)
       values($1,$2,$3,'sampled_composition',$4,$5,'open', $6)`,
      [body.collector, ap?.id || null, body.received_on, dep,
       `Measured composition departs from the declaration by ${dep} basis points.`, null]
    );
  }
  const payload = {
    reference,
    dry_mass_g: dryMassG(Number(body.net_g), Number(body.moisture_bp)),
    claimable: cl.claimable,
    claimable_reason: cl.claimable_reason,
    claimable_from: cl.claimable_from,
    flags: cl.flags,
    custody_complete: cl.missing_kinds.length === 0,
    missing_custody_kinds: cl.missing_kinds,
    collector_name: collectorName,
  };
  await recordPool({ act: "batch_booked_in", person: sess.email, site: body.site, object_reference: reference, content: { ...payload, category: body.category, net_g: Number(body.net_g) } });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.patch("/batches/:reference", requireRole("batch_patch", async (c, sess) => {
  const b = await batchByRef(c.req.param("reference"));
  if (!b) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json();
  if (body.category && body.category !== b.category) {
    // The category is required at intake and can never be changed after
    // acceptance, for every role, through any route.
    return c.json({ error: "category_immutable_after_acceptance", rule: "A batch category cannot be changed after acceptance." }, 409);
  }
  const fields = [];
  const params = [c.req.param("reference")];
  const setters = [];
  for (const [k, col] of [["contamination", "contamination"], ["composition", "composition"]]) {
    if (body[k] !== undefined) {
      params.push(JSON.stringify(body[k]));
      setters.push(`${col} = $${params.length}`);
    }
  }
  if (setters.length) await q(`update batches set ${setters.join(", ")} where reference = $1`, params);
  await recordPool({ act: "batch_annotated", person: sess.email, site: b.site, object_reference: b.reference, content: { fields: Object.keys(body) } });
  return c.json({ reference: b.reference, updated: Object.keys(body) }, 200);
}));

api.post("/batches/:reference/custody", requireRole("batch_custody", async (c, sess) => {
  const b = await batchByRef(c.req.param("reference"));
  if (!b) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json();
  if (!body.kind || !body.date) return c.json({ error: "kind_and_date_required" }, 400);
  const custody = [...(b.custody || []), { kind: body.kind, date: body.date, party: body.party || b.collector, late: true, arrived_on: body.arrived_on || body.date }];
  const cl_before = await batchClaimability(b);
  await q(`update batches set custody = $2, claimable_from = $3 where reference = $1`, [
    b.reference, JSON.stringify(custody), cl_before.claimable ? null : body.arrived_on || body.date,
  ]);
  const after = await batchByRef(b.reference);
  const cl = await batchClaimability(after);
  const payload = {
    reference: b.reference,
    custody_complete: cl.missing_kinds.length === 0,
    claimable: cl.claimable,
    claimable_from: after.claimable_from,
  };
  await recordPool({ act: "custody_link_attached", person: sess.email, site: b.site, object_reference: b.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/batches/:reference/reject", requireRole("batch_reject", async (c, sess) => {
  const b = await batchByRef(c.req.param("reference"));
  if (!b) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json();
  const rejected = Number(body.rejected_g || 0);
  if (!body.reason || !body.destination) return c.json({ error: "reason_and_destination_required" }, 400);
  const existingRejected = Number(b.rejected_g || 0);
  const accepted = Number(b.net_g) - existingRejected - rejected;
  if (accepted < 0) {
    return c.json({ error: "rejected_exceeds_delivered", accepted_plus_rejected_must_equal_delivered: true }, 409);
  }
  await q(
    `update batches set accepted_g = $2, rejected_g = $3, rejected_destination = $4 where reference = $1`,
    [b.reference, accepted, existingRejected + rejected, body.destination]
  );
  const payload = {
    reference: `REJ-${b.reference}-${Date.now().toString().slice(-5)}`,
    batch: b.reference,
    rejected_g: existingRejected + rejected,
    accepted_g: accepted,
    delivered_g: Number(b.net_g),
    rejected_destination: body.destination,
    reason: body.reason,
  };
  await recordPool({ act: "batch_rejected", person: sess.email, site: b.site, object_reference: b.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.get("/batches/:reference/impact", requireAuth(async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const t = await reverseTraversal(c.req.param("reference"));
  if (!t) return c.json({ error: "not_found" }, 404);
  return c.json({ ...t, read_at: nowIso() });
}));

// ---------- lots ----------
async function lotView(l) {
  const allocations = await q(
    `select * from credit_movements where kind='out' and reference = $1 order by id`,
    [l.reference]
  );
  const attached = allocations.reduce((a, m) => a + Number(m.mass_g), 0);
  const flags = await flagsForLot(l.reference);
  const traversal = await forwardTraversal(l.reference);
  return {
    reference: l.reference,
    grade: l.grade,
    site: l.site,
    mass_g: Number(l.mass_g),
    disposition: l.disposition,
    claim_type: l.claim_type,
    produced_at: l.produced_at,
    credit_attached_g: attached,
    content_bp: contentBP(attached, Number(l.mass_g)),
    provisional_factor: l.provisional_factor,
    flags,
    category_split: (allocations || []).reduce((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + Number(m.mass_g);
      return acc;
    }, {}),
    sites: l.sites,
    blended_from: l.blended_from,
    derivation: {
      content_bp: "credit_attached_g * 10000 / lot_mass_g, floored",
      attached_from: allocations.map((m) => m.reference).filter(Boolean),
    },
    genealogy_summary: traversal
      ? { nodes: traversal.nodes.length, flagged: traversal.flagged }
      : null,
  };
}

api.get("/lots", async (c) => {
  const rows = await q(`select * from lots order by reference`);
  const out = [];
  for (const l of rows) out.push(await lotView(l));
  return c.json(out);
});

api.get("/lots/:reference", async (c) => {
  const l = await lotByRef(c.req.param("reference"));
  if (!l) return c.json({ error: "not_found" }, 404);
  return c.json(await lotView(l));
});

api.get("/lots/:reference/genealogy", async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const g = await forwardTraversal(c.req.param("reference"));
  if (!g) return c.json({ error: "not_found" }, 404);
  return c.json({ ...g, text_equivalent: textEquivalent(g), read_at: nowIso() });
});

api.get("/lots/:reference/yield", requireAuth(async (c) => {
  const l = await lotByRef(c.req.param("reference"));
  if (!l) return c.json({ error: "not_found" }, 404);
  const out = await one(`select * from outputs where lot = $1`, [l.reference]);
  if (!out) return c.json({ error: "no_yield_without_a_producing_run" }, 404);
  const run = await runByRef(out.run);
  const cons = await q(`select * from consumptions where run = $1`, [run.reference]);
  const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
  return c.json({
    lot: l.reference,
    run: run.reference,
    mass_in_g: massIn,
    lot_mass_g: Number(l.mass_g),
    yield_bp: massIn > 0 ? Math.floor((Number(l.mass_g) * 10000) / massIn) : 0,
    derivation: "lot_mass_g * 10000 / run mass in, floored",
  });
}));

api.post("/lots/:reference/blend", requireRole("lot_blend", async (c, sess) => {
  const a = await lotByRef(c.req.param("reference"));
  const body = await c.req.json();
  const b = await lotByRef(body.lot);
  if (!a || !b) return c.json({ error: "lot_not_found" }, 404);
  if (a.reference === b.reference) return c.json({ error: "cannot_blend_a_lot_with_itself" }, 400);
  const massA = Number(a.mass_g);
  const massB = Number(b.mass_g);
  const allocA = await q(`select * from credit_movements where kind='out' and reference = $1`, [a.reference]);
  const allocB = await q(`select * from credit_movements where kind='out' and reference = $1`, [b.reference]);
  const attachedA = allocA.reduce((s, m) => s + Number(m.mass_g), 0);
  const attachedB = allocB.reduce((s, m) => s + Number(m.mass_g), 0);
  const contentA = contentBP(attachedA, massA);
  const contentB = contentBP(attachedB, massB);
  const blended = blendedBP(massA, contentA, massB, contentB);
  const reference = `LOT-${a.grade}-${Date.now().toString().slice(-4)}`;
  const sites = a.site === b.site ? [a.site] : [a.site, b.site];
  // the resulting claim is the weaker of the two claim types; where the two
  // sites differ, both are named and the weaker certification scope is taken
  const claimOrder = ["physically_segregated", "controlled_blending", "mass_balance"];
  const weaker = claimOrder.indexOf(a.claim_type) >= claimOrder.indexOf(b.claim_type) ? a.claim_type : b.claim_type;
  const provisional = a.provisional_factor || b.provisional_factor;
  await q(
    `insert into lots(reference, grade, site, mass_g, disposition, claim_type, produced_at, provisional_factor, period, sites, blended_from, credit_attached_g, content_bp)
     values($1,$2,$3,$4,'pending',$5,now(),$6,$7,$8,$9,$10,$11)`,
    [reference, a.grade, a.site, massA + massB, weaker, provisional, a.period || b.period,
     JSON.stringify(sites), JSON.stringify([
       { reference: a.reference, mass_g: massA, content_bp: contentA, claim_type: a.claim_type, provisional_factor: a.provisional_factor },
       { reference: b.reference, mass_g: massB, content_bp: contentB, claim_type: b.claim_type, provisional_factor: b.provisional_factor },
     ]), attachedA + attachedB, blended]
  );
  const payload = {
    reference,
    mass_g: massA + massB,
    content_bp: blended,
    claim_type: weaker,
    sites,
    provisional_factor: provisional,
    derivation: {
      content_bp: `(mass_a * content_a + mass_b * content_b) / (mass_a + mass_b), floored`,
      inputs: [
        { reference: a.reference, mass_g: massA, content_bp: contentA },
        { reference: b.reference, mass_g: massB, content_bp: contentB },
      ],
    },
  };
  await recordPool({ act: "lot_blended", person: sess.email, site: a.site, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

// ---------- tests, dispositions, deviations, overrides ----------
api.post("/test-results", requireRole("test_create", async (c, sess) => {
  const body = await c.req.json();
  if (!body.method) return c.json({ error: "method_required" }, 400);
  if (!body.property || body.value === undefined || !body.unit || !body.subject)
    return c.json({ error: "property_value_unit_subject_required" }, 400);
  const lotRow = await lotByRef(body.subject);
  const spec = lotRow
    ? await one(`select * from specifications where grade = $1 order by version desc limit 1`, [lotRow.grade])
    : null;
  const namedMethod = (spec?.rows || []).find((r) => r.property === body.property)?.method;
  const mismatch = !!namedMethod && namedMethod !== body.method;
  const reference = `TR-${Date.now().toString().slice(-6)}`;
  await q(
    `insert into test_results(reference, subject_type, subject, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [reference, body.subject_type || (body.subject.startsWith("BATCH-") ? "batch" : "lot"), body.subject,
     body.property, body.method, body.instrument || null, sess.email, String(body.value), body.unit,
     Number(body.uncertainty_bp || 0), mismatch, !mismatch]
  );
  const payload = { reference, subject: body.subject, property: body.property, method: body.method, value: String(body.value), unit: body.unit, uncertainty_bp: Number(body.uncertainty_bp || 0), method_mismatch: mismatch, usable_for_release: !mismatch };
  await recordPool({ act: "test_result_entered", person: sess.email, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/lots/:reference/disposition", requireRole("disposition", async (c, sess) => {
  const l = await lotByRef(c.req.param("reference"));
  if (!l) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json();
  if (!["pending", "released", "quarantined", "rejected"].includes(body.disposition))
    return c.json({ error: "disposition_invalid" }, 400);
  // Whoever entered a test result on that lot does not disposition it.
  const entered = await q(`select * from test_results where subject = $1 and analyst = $2`, [l.reference, sess.email]);
  if (entered.length > 0) {
    await recordPool({ act: "disposition_refused", person: sess.email, site: l.site, object_reference: l.reference, content: { refused: true, reason: "test_enterer_cannot_disposition", entered: entered.map((t) => t.reference) } });
    return c.json({ error: "test_enterer_cannot_disposition", entered: entered.map((t) => t.reference) }, 409);
  }
  const openDev = (await q(`select * from deviations where state='open'`)).filter((d) => (d.affects_lots || []).includes(l.reference));
  if (openDev.length > 0) {
    await recordPool({ act: "disposition_refused", person: sess.email, site: l.site, object_reference: l.reference, content: { refused: true, reason: "open_deviation_touching_lot", deviations: openDev.map((d) => d.reference) } });
    return c.json({ error: "open_deviation_touching_lot", deviations: openDev.map((d) => d.reference) }, 409);
  }
  await q(`update lots set disposition = $2 where reference = $1`, [l.reference, body.disposition]);
  const payload = { reference: l.reference, disposition: body.disposition };
  await recordPool({ act: "disposition_set", person: sess.email, site: l.site, object_reference: l.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/deviations", requireRole("deviation_create", async (c, sess) => {
  const body = await c.req.json();
  if (!body.description) return c.json({ error: "description_required" }, 400);
  if (!(body.affects_runs || body.affects_lots)) return c.json({ error: "affects_required" }, 400);
  const reference = `DEV-${Date.now().toString().slice(-4)}`;
  await q(
    `insert into deviations(reference, raised_by, description, affects_runs, affects_lots, state) values($1,$2,$3,$4,$5,'open')`,
    [reference, sess.email, body.description, JSON.stringify(body.affects_runs || []), JSON.stringify(body.affects_lots || [])]
  );
  const payload = { reference, affects_runs: body.affects_runs || [], affects_lots: body.affects_lots || [], state: "open" };
  await recordPool({ act: "deviation_raised", person: sess.email, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/deviations/:reference/close", requireRole("deviation_close", async (c, sess) => {
  const d = await one(`select * from deviations where reference = $1`, [c.req.param("reference")]);
  if (!d) return c.json({ error: "not_found" }, 404);
  if (d.state === "closed") return c.json({ error: "already_closed" }, 409);
  const body = await c.req.json();
  if (!["root_cause_found", "cause_not_established"].includes(body.outcome))
    return c.json({ error: "outcome_invalid" }, 400);
  await q(`update deviations set state='closed', outcome=$2, closed_at=now() where reference=$1`, [d.reference, body.outcome]);
  const payload = { reference: d.reference, outcome: body.outcome };
  await recordPool({ act: "deviation_closed", person: sess.email, object_reference: d.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/overrides", requireRole("override_create", async (c, sess) => {
  const body = await c.req.json();
  if (!body.separation || !body.lot || !body.authorised_by)
    return c.json({ error: "separation_lot_and_authoriser_required" }, 400);
  if (!body.reason || body.reason.length < 40)
    return c.json({ error: "reason_of_at_least_forty_characters_required" }, 400);
  const reference = `OVR-${Date.now().toString().slice(-4)}`;
  await q(
    `insert into overrides(reference, separation, reason, lot, authorised_by, authorised_on, reviewed)
     values($1,$2,$3,$4,$5,$6,false)`,
    [reference, body.separation, body.reason, body.lot, body.authorised_by, body.authorised_on || nowIso().slice(0, 10)]
  );
  const payload = { reference, separation: body.separation, lot: body.lot, authorised_by: body.authorised_by, reviewed: false };
  await recordPool({ act: "override_recorded", person: sess.email, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/overrides/:reference/review", requireRole("override_review", async (c, sess) => {
  const o = await one(`select * from overrides where reference = $1`, [c.req.param("reference")]);
  if (!o) return c.json({ error: "not_found" }, 404);
  if (o.reviewed) return c.json({ error: "already_reviewed" }, 409);
  if (o.authorised_by === sess.email) {
    return c.json({ error: "authoriser_cannot_review_own_override" }, 403);
  }
  await q(`update overrides set reviewed = true, reviewed_by = $2, reviewed_at = now() where reference = $1`, [o.reference, sess.email]);
  const payload = { reference: o.reference, reviewed: true, reviewed_by: sess.email, removes_nothing: true };
  await recordPool({ act: "override_reviewed", person: sess.email, object_reference: o.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

// ---------- runs ----------
api.get("/runs", async (c) => {
  const rows = await q(`select * from runs order by started_at`);
  const out = [];
  for (const r of rows) {
    const cons = await q(`select * from consumptions where run = $1 order by id`, [r.reference]);
    const outs = await q(`select * from outputs where run = $1 order by reference`, [r.reference]);
    const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
    const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
    const batches = cons.filter((x) => x.input_type === "batch");
    let upstreamFlags = [];
    for (const b of batches) {
      const bb = await batchByRef(b.input_reference);
      if (bb) upstreamFlags.push(...(await flagsForBatch(bb)));
    }
    out.push({
      reference: r.reference,
      run_type: r.run_type,
      site: r.site,
      equipment: r.equipment,
      recipe_version: r.recipe_version,
      operator: r.operator,
      started_at: r.started_at,
      closed_at: r.closed_at,
      state: r.closed_at ? "closed" : "open",
      losses_g: r.losses_g === null ? null : Number(r.losses_g),
      mass_in_g: massIn,
      mass_out_g: massOut,
      within_tolerance: r.within_tolerance,
      actual_set_points: r.actual_set_points,
      consumptions: cons.map((x) => ({
        input_type: x.input_type, input_reference: x.input_reference,
        mass_g: Number(x.mass_g), effective_on: x.effective_on, credit_g: Number(x.credit_g || 0),
      })),
      outputs: outs.map((o) => ({
        reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g),
        disposition: o.disposition, lot: o.lot,
      })),
      flags: [...new Set(upstreamFlags)],
      queued_close: r.queued_close,
      derivation: { losses_g: "mass in minus mass out" },
    });
  }
  return c.json(out);
});

api.get("/runs/:reference", async (c) => {
  const r = await runByRef(c.req.param("reference"));
  if (!r) return c.json({ error: "not_found" }, 404);
  const recipe = (await one(`select value from meta where key='recipes'`))?.value?.[r.recipe_version] || null;
  const cons = await q(`select * from consumptions where run = $1 order by id`, [r.reference]);
  const outs = await q(`select * from outputs where run = $1 order by reference`, [r.reference]);
  return c.json({
    reference: r.reference,
    run_type: r.run_type,
    site: r.site,
    equipment: r.equipment,
    recipe_version: r.recipe_version,
    recipe: recipe ? { set_points: recipe.set_points, reagents: recipe.reagents, released_by: recipe.released_by, released_on: recipe.released_on } : null,
    actual_set_points: r.actual_set_points,
    within_tolerance: r.within_tolerance,
    operator: r.operator,
    started_at: r.started_at,
    closed_at: r.closed_at,
    state: r.closed_at ? "closed" : "open",
    losses_g: r.losses_g === null ? null : Number(r.losses_g),
    mass_in_g: cons.reduce((a, x) => a + Number(x.mass_g), 0),
    mass_out_g: outs.reduce((a, x) => a + Number(x.mass_g), 0),
    annotation: r.annotation,
    queued_close: r.queued_close,
    consumptions: cons.map((x) => ({ input_type: x.input_type, input_reference: x.input_reference, mass_g: Number(x.mass_g), effective_on: x.effective_on, credit_g: Number(x.credit_g || 0) })),
    outputs: outs.map((o) => ({ reference: o.reference, kind: o.kind, mass_g: Number(o.mass_g), disposition: o.disposition, lot: o.lot })),
    derivation: { losses_g: "mass in minus mass out" },
  });
});

api.post("/runs", requireRole("run_create", async (c, sess) => {
  const body = await c.req.json();
  if (!["dissolution", "depolymerisation", "purification", "repolymerisation"].includes(body.run_type))
    return c.json({ error: "run_type_invalid" }, 400);
  if (!body.site || !body.recipe_version || !body.operator || !body.started_at)
    return c.json({ error: "site_recipe_operator_started_at_required" }, 400);
  const reference = `RUN-${body.run_type[0].toUpperCase()}-${Date.now().toString().slice(-4)}`;
  await q(
    `insert into runs(reference, run_type, site, equipment, recipe_version, operator, started_at)
     values($1,$2,$3,$4,$5,$6,$7)`,
    [reference, body.run_type, body.site, body.equipment || null, body.recipe_version, body.operator, body.started_at]
  );
  const payload = { reference, run_type: body.run_type, site: body.site, recipe_version: body.recipe_version, started_at: body.started_at };
  await recordPool({ act: "run_started", person: sess.email, site: body.site, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/runs/:reference/consumptions", requireRole("run_consume", async (c, sess) => {
  const r = await runByRef(c.req.param("reference"));
  if (!r) return c.json({ error: "not_found" }, 404);
  if (r.closed_at) return c.json({ error: "run_closed_refuses_write" }, 409);
  const body = await c.req.json();
  if (!body.input_reference || !Number.isInteger(Number(body.mass_g)) || Number(body.mass_g) <= 0)
    return c.json({ error: "input_reference_and_positive_integer_mass_required" }, 400);
  const inputType = body.input_reference.startsWith("BATCH-") ? "batch" : "output";
  const effective_on = body.effective_on || nowIso().slice(0, 10);
  const period = await periodFor(r.site, "N6", effective_on);
  // a consumption whose effective date falls in a closed period is refused as a
  // write into that period and opens a restatement instead
  if (period && period.state === "closed") {
    const rest = await withTx(`restatement`, async (tx) => {
      const ref = `RS-${Date.now().toString().slice(-6)}`;
      const certs = await tx.query(`select * from certificates where period = $1`, [period.id]);
      const row = await tx.one(
        `insert into restatements(reference, period, reason, opened_by) values($1,$2,$3,$4) returning *`,
        [ref, period.id, `Consumption with effective date ${effective_on} arrived after the period closed.`, sess.email]
      );
      return { reference: ref, certificates_affected: certs.length };
    });
    await recordPool({ act: "restatement_opened", person: sess.email, site: r.site, object_reference: rest.reference, content: rest });
    return c.json({ error: "period_closed_write_refused", restatement: rest }, 409);
  }
  let credit = 0;
  let category = null;
  if (inputType === "batch") {
    const b = await batchByRef(body.input_reference);
    if (!b) return c.json({ error: "batch_not_found" }, 404);
    const cl = await batchClaimability(b);
    const factor = await factorForSite(r.site, effective_on);
    const dryConsumed = dryMassG(Number(body.mass_g), b.moisture_bp);
    const claimableNow = cl.claimable && (!cl.claimable_from || new Date(cl.claimable_from) <= new Date(effective_on));
    if (claimableNow && factor) {
      credit = creditGrantedG(dryConsumed, factor.factor_bp);
      category = b.category;
      await q(
        `insert into credit_movements(period, kind, category, mass_g, reference, fresh_credit, effective_on, event_at)
         values($1,'in',$2,$3,$4,true,$5,$6)`,
        [period.id, category, credit, `${r.reference}:${b.reference}`, effective_on, body.event_at || nowIso()]
      );
    } else {
      category = "non_claimable";
      await q(
        `insert into credit_movements(period, kind, category, mass_g, reference, fresh_credit, effective_on, event_at)
         values($1,'in','non_claimable',$2,$3,false,$4,$5)`,
        [period.id, dryConsumed, `${r.reference}:${b.reference}`, effective_on, body.event_at || nowIso()]
      );
    }
  }
  await q(
    `insert into consumptions(run, input_type, input_reference, mass_g, credit_g, credit_category, event_at, recorded_at, effective_on, period)
     values($1,$2,$3,$4,$5,$6,$7,now(),$8,$9)`,
    [r.reference, inputType, body.input_reference, Number(body.mass_g), credit, category, body.event_at || nowIso(), effective_on, period?.id || null]
  );
  const payload = {
    reference: `CON-${r.reference}-${Date.now().toString().slice(-5)}`,
    run: r.reference, input_reference: body.input_reference, mass_g: Number(body.mass_g),
    dry_mass_g: inputType === "batch" ? dryMassG(Number(body.mass_g), (await batchByRef(body.input_reference)).moisture_bp) : Number(body.mass_g),
    credit_g: credit, category, effective_on,
  };
  await recordPool({ act: "consumption_recorded", person: sess.email, site: r.site, object_reference: r.reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/runs/:reference/outputs", requireRole("run_output", async (c, sess) => {
  const r = await runByRef(c.req.param("reference"));
  if (!r) return c.json({ error: "not_found" }, 404);
  if (r.closed_at) return c.json({ error: "run_closed_refuses_write" }, 409);
  const body = await c.req.json();
  if (!["intermediate", "lot", "byproduct"].includes(body.kind))
    return c.json({ error: "kind_invalid" }, 400);
  if (body.kind === "byproduct" && !["sold", "disposed"].includes(body.disposition))
    return c.json({ error: "byproduct_requires_disposition" }, 400);
  if (!Number.isInteger(Number(body.mass_g)) || Number(body.mass_g) <= 0)
    return c.json({ error: "positive_integer_mass_required" }, 400);
  const prefix = body.kind === "lot" ? "LOT" : "OUT";
  const reference = body.reference || `${prefix}-${r.reference.split("-")[1]}-${Date.now().toString().slice(-4)}`;
  await q(
    `insert into outputs(reference, run, kind, mass_g, disposition, lot) values($1,$2,$3,$4,$5,$6)`,
    [reference, r.reference, body.kind, Number(body.mass_g), body.disposition || null, body.kind === "lot" ? reference : null]
  );
  if (body.kind === "lot") {
    const period = await periodFor(r.site, body.grade || "N6", nowIso().slice(0, 10));
    const factor = await factorForSite(r.site, nowIso());
    await q(
      `insert into lots(reference, grade, site, mass_g, disposition, claim_type, produced_at, provisional_factor, period)
       values($1,$2,$3,$4,'pending',$5,now(),$6,$7)`,
      [reference, body.grade || "N6", r.site, Number(body.mass_g), body.claim_type || "mass_balance", factor?.provisional || false, period?.id || null]
    );
  }
  const payload = { reference, run: r.reference, kind: body.kind, mass_g: Number(body.mass_g), disposition: body.disposition || null };
  await recordPool({ act: "output_recorded", person: sess.email, site: r.site, object_reference: reference, content: payload });
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

api.post("/runs/:reference/close", requireRole("run_close", async (c, sess) => {
  const r = await runByRef(c.req.param("reference"));
  if (!r) return c.json({ error: "not_found" }, 404);
  if (r.closed_at) {
    // A closed run refuses every write, and a second close answers 409 and is
    // itself recorded as an attempt.
    await q(`update runs set close_attempts = close_attempts + 1 where reference = $1`, [r.reference]);
    await recordPool({ act: "second_close_attempt", person: sess.email, site: r.site, object_reference: r.reference, content: { refused: true, reason: "already_closed" } });
    return c.json({ error: "run_already_closed" }, 409);
  }
  const cons = await q(`select * from consumptions where run = $1`, [r.reference]);
  const outs = await q(`select * from outputs where run = $1`, [r.reference]);
  const massIn = cons.reduce((a, x) => a + Number(x.mass_g), 0);
  const massOut = outs.reduce((a, x) => a + Number(x.mass_g), 0);
  const losses = massIn - massOut;
  const recipe = (await one(`select value from meta where key='recipes'`))?.value?.[r.recipe_version];
  const actual = r.actual_set_points || {};
  let within = true;
  if (recipe?.set_points) {
    for (const [k, range] of Object.entries(recipe.set_points)) {
      const v = actual[k];
      if (v !== undefined && !Number.isNaN(Number(v)) && (Number(v) < range.min || Number(v) > range.max)) within = false;
    }
  }

  const payload = await withTx(`run:${r.reference}`, async (tx) => {
    await tx.query(
      `update runs set closed_at = now(), losses_g = $2, within_tolerance = $3 where reference = $1`,
      [r.reference, losses, within]
    );
    // a sold byproduct takes a share of the run's claim and emissions; a
    // disposed byproduct is a loss
    const totalOut = massOut;
    const byproducts = outs.filter((o) => o.kind === "byproduct");
    const shares = byproducts.map((o) => ({
      reference: o.reference,
      mass_g: Number(o.mass_g),
      disposition: o.disposition,
      share_bp: shareBP(Number(o.mass_g), totalOut),
    }));
    const seq = await record(tx, { act: "run_closed", person: sess.email, site: r.site, object_reference: r.reference, content: { losses_g: losses, within_tolerance: within, mass_in_g: massIn, mass_out_g: massOut } });
    return { reference: r.reference, losses_g: losses, mass_in_g: massIn, mass_out_g: massOut, within_tolerance: within, byproduct_shares: shares, record_seq: seq };
  });
  // A run outside its recipe tolerance raises a deviation whether or not its
  // output passed its tests.
  if (!within) {
    const lots = outs.filter((o) => o.kind === "lot").map((o) => o.lot);
    const ref = `DEV-${Date.now().toString().slice(-4)}`;
    await q(
      `insert into deviations(reference, raised_by, description, affects_runs, affects_lots, state) values($1,$2,$3,$4,$5,'open')`,
      [ref, sess.email, `Run ${r.reference} recorded set points outside recipe ${r.recipe_version} tolerance.`, JSON.stringify([r.reference]), JSON.stringify(lots)]
    );
    await recordPool({ act: "deviation_raised", person: sess.email, site: r.site, object_reference: ref, content: { reference: ref, run: r.reference } });
  }
  await storeIdempotent(c, 201, payload);
  return c.json(payload, 201);
}));

