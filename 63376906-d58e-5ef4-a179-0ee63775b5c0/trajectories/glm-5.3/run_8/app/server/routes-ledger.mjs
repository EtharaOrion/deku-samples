import { Hono } from "hono";
import { q, one, tx } from "./lib/db.mjs";
import { record, recordAct, sha256 } from "./lib/core.mjs";
import { contentBp, factorBpFromWindow, byproductShareBp } from "./lib/core.mjs";
import * as engine from "./lib/engine.mjs";
import { loadGraph, ancestorsOfLot, impactOfBatch } from "./lib/genealogy.mjs";
import { sendMail } from "./lib/mail.mjs";
import { guard, role, withIdempotency, refusePagination, num } from "./lib/http.mjs";
import { today, addDays } from "./routes-core.mjs";

export const ledger = new Hono();

/* ------------------------------------------------- balance periods */
ledger.get("/balance-periods", guard(async (c) => {
  const rows = await q("SELECT * FROM balance_period ORDER BY site, period_from");
  return c.json(rows.map((p) => ({
    id: p.id, site: p.site, grade: p.grade, period_from: p.period_from, period_to: p.period_to, state: p.state,
  })));
}));

ledger.get("/balance-periods/:id", guard(async (c) => {
  const bad = refusePagination(c);
  if (bad) return bad;
  const s = await engine.periodSummary(c.req.param("id"));
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json(s);
}));

ledger.post("/balance-periods/:id/allocations", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "allocation", body, async (client) => {
    const periodId = c.req.param("id");
    const p = (await client.query("SELECT * FROM balance_period WHERE id=$1", [periodId])).rows[0];
    if (!p) return { status: 404, body: { error: "not_found" } };
    if (p.state === "closed") {
      await record(client, { act: "refused", person: c.get("session").email, site: p.site, object: periodId, detail: { attempted: "allocation" }, refused: "period_closed" });
      return { status: 409, body: { error: "period_closed", note: "This period is closed. Corrections require a restatement." } };
    }
    if (!body.lot || !["post_consumer", "pre_consumer"].includes(body.category) || !Number.isInteger(Number(body.mass_g)) || Number(body.mass_g) <= 0) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    // lock the period's movements so two racing allocations produce one success and one refusal
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["period:" + periodId]);
    const { byCategory } = await engine.periodCredits(periodId);
    const cat = byCategory[body.category] || { credits_in_g: 0, credits_out_g: 0, credits_available_g: 0 };
    const available = cat.credits_available_g;
    const requested = Number(body.mass_g);
    if (requested > available) {
      await record(client, {
        act: "refused", person: c.get("session").email, site: p.site, object: periodId,
        detail: { available_g: available, requested_g: requested, lot: body.lot, category: body.category, margin_at_instant: available },
        refused: "insufficient_credits",
      });
      return { status: 409, body: { error: "insufficient_credits", available_g: available, requested_g: requested } };
    }
    const lot = (await client.query("SELECT * FROM lot WHERE reference=$1", [body.lot])).rows[0];
    if (!lot) return { status: 422, body: { error: "unknown_lot" } };
    const reference = "ALC-" + String((await client.query("SELECT count(*)::int AS n FROM allocation")).rows[0].n + 1).padStart(4, "0");
    const eff = today();
    await client.query(
      `INSERT INTO allocation (reference, period, lot, category, mass_g, allocated_by, allocated_on, decided_by, favoured_over)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, periodId, body.lot, body.category, requested, c.get("session").email, eff, body.decided_by || null, body.favoured_over || null]
    );
    const movementRef = "CRM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    await client.query(
      `INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, lot, effective_on, event_at, recorded_by, derivation)
       VALUES ($1,$2,'out',$3,$4,'allocation',$5,$6,now(),$7,$8)`,
      [movementRef, periodId, body.category, requested, body.lot, eff, c.get("session").email,
        JSON.stringify({ allocation: reference, rule: "credits attached never exceed credits available" })]
    );
    await record(client, {
      act: "allocation_recorded", person: c.get("session").email, site: p.site, object: reference,
      detail: { lot: body.lot, category: body.category, mass_g: requested, decided_by: body.decided_by || null, favoured_over: body.favoured_over || null },
    });
    const content = await engine.lotContent(body.lot);
    return {
      status: 201,
      body: {
        reference,
        period: periodId,
        lot: body.lot,
        category: body.category,
        mass_g: requested,
        credits_available_after_g: available - requested,
        lot_content_bp: content.content_bp,
        lot_claim_type: content.claim_type,
        decided_by: body.decided_by || null,
        favoured_over: body.favoured_over || null,
      },
    };
  });
});

ledger.post("/balance-periods/:id/transfers", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "transfer", body, async (client) => {
    const toId = c.req.param("id");
    const to = (await client.query("SELECT * FROM balance_period WHERE id=$1", [toId])).rows[0];
    if (!to) return { status: 404, body: { error: "not_found" } };
    const from = (await client.query("SELECT * FROM balance_period WHERE id=$1", [body.from_period])).rows[0];
    if (!from) return { status: 422, body: { error: "unknown_from_period" } };
    const mass = num(body.mass_g, "mass_g");
    const category = body.category || "post_consumer";
    const reference = "TRF-" + String((await client.query("SELECT count(*)::int AS n FROM transfer")).rows[0].n + 1).padStart(4, "0");
    const eff = body.effective_on || today();
    await client.query(
      `INSERT INTO transfer (reference, from_period, to_period, mass_g, category, effective_on, moved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, from.id, to.id, mass, category, eff, c.get("session").email]
    );
    for (const [period, direction] of [[from.id, "out"], [to.id, "in"]]) {
      await client.query(
        `INSERT INTO credit_movement (reference, period, direction, category, mass_g, reason, origin_site, transfer, effective_on, event_at, recorded_by, derivation)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11)`,
        ["CRM-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 5).toUpperCase() + direction.toUpperCase(),
          period, direction, category, mass, direction === "in" ? "transfer_in" : "transfer_out",
          direction === "in" ? from.site : to.site, reference, eff, c.get("session").email,
          JSON.stringify({ transfer: reference, fresh_credit: false })]
      );
    }
    await record(client, { act: "period_transfer", person: c.get("session").email, site: to.site, object: reference, detail: { from: from.id, to: to.id, mass_g: mass, category } });
    const summary = await engine.periodSummary(to.id);
    return {
      status: 201,
      body: {
        reference,
        from_period: from.id,
        to_period: to.id,
        mass_g: mass,
        category,
        inbound_credits: summary.inbound_credits,
        note: "Never a fresh credit. The total credit across the two periods is unchanged by the journey.",
      },
    };
  });
});

ledger.post("/balance-periods/:id/close", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "period-close", body, async (client) => {
    const id = c.req.param("id");
    const p = (await client.query("SELECT * FROM balance_period WHERE id=$1", [id])).rows[0];
    if (!p) return { status: 404, body: { error: "not_found" } };
    if (p.state === "closed") return { status: 409, body: { error: "already_closed", note: "A closed period refuses to reopen." } };
    // the person who published the carbon method version the period applies may not close it
    const method = (await client.query(
      "SELECT * FROM carbon_method WHERE id=$1 AND superseded_by IS NULL ORDER BY version DESC LIMIT 1", ["CM-PA6"]
    )).rows[0];
    if (method && method.published_by === c.get("session").email) {
      await record(client, { act: "refused", person: c.get("session").email, site: p.site, object: id, detail: { attempted: "close", method_version: method.id + " v" + method.version }, refused: "publisher_cannot_close" });
      return { status: 403, body: { error: "separation_refused", separation: "method_publisher_not_period_closer", method_version: method.id + " v" + method.version } };
    }
    const lots = (await client.query(
      `SELECT l.* FROM allocation a JOIN lot l ON l.reference = a.lot WHERE a.period = $1`, [id]
    )).rows;
    const missingDisposition = lots.filter((l) => l.disposition === "pending");
    const openDevs = (await client.query(
      `SELECT DISTINCT d.reference FROM deviation d
       JOIN deviation_subject s ON s.deviation = d.reference
       JOIN allocation a ON a.lot = s.subject
       WHERE a.period = $1 AND d.state='open' AND s.subject_kind='lot'`, [id]
    )).rows;
    const { byCategory } = await engine.periodCredits(id);
    let reconciles = true;
    for (const key of ["post_consumer", "pre_consumer"]) {
      const cat = byCategory[key];
      if (cat.credits_out_g > cat.credits_in_g) reconciles = false;
    }
    const blockers = [];
    if (missingDisposition.length) blockers.push({ condition: "lot_lacks_disposition", lots: missingDisposition.map((l) => l.reference) });
    if (openDevs.length) blockers.push({ condition: "open_deviation", deviations: openDevs.map((d) => d.reference) });
    if (!reconciles) blockers.push({ condition: "balance_does_not_reconcile" });
    if (blockers.length) {
      await record(client, { act: "refused", person: c.get("session").email, site: p.site, object: id, detail: { attempted: "close", blockers }, refused: "close_blocked" });
      return { status: 409, body: { error: "close_refused", blockers } };
    }
    const carry = {};
    const expired = {};
    for (const key of ["post_consumer", "pre_consumer"]) {
      const cat = byCategory[key];
      const r = engine.carryOver(cat.credits_in_g, cat.credits_available_g, Number(p.carry_over_limit_bp));
      carry[key] = r.carried_forward_g;
      expired[key] = r.expired_g;
    }
    const cutOff = body.cut_off || addDays(today(), -5);
    await client.query(
      "UPDATE balance_period SET state='closed', closed_on=$2, closed_by=$3, cut_off=$4, carried_forward=$5, expired=$6 WHERE id=$1",
      [id, today(), c.get("session").email, cutOff, JSON.stringify(carry), JSON.stringify(expired)]
    );
    await record(client, { act: "period_closed", person: c.get("session").email, site: p.site, object: id, detail: { cut_off: cutOff, carried_forward: carry, expired } });
    return {
      status: 201,
      body: {
        reference: "CLOSE-" + id,
        id,
        state: "closed",
        closed_on: today(),
        closed_by: c.get("session").email,
        cut_off: cutOff,
        carried_forward_g: carry,
        expired_g: expired,
        note: "A closed period refuses every further write and refuses to reopen.",
      },
    };
  });
});

ledger.post("/balance-periods/:id/restatements", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "restatement", body, async (client) => {
    const id = c.req.param("id");
    const p = (await client.query("SELECT * FROM balance_period WHERE id=$1", [id])).rows[0];
    if (!p) return { status: 404, body: { error: "not_found" } };
    if (!body.reason || String(body.reason).trim().length < 10) return { status: 422, body: { error: "reason_required" } };
    const reference = "RST-" + Date.now().toString(36).toUpperCase();
    const certs = (await client.query("SELECT * FROM certificate WHERE period=$1", [id])).rows;
    let contentMovements = [];
    if (body.revised_factor_bp) {
      const rows = [];
      for (const cert of certs) {
        const lots = cert.lots || [];
        let corrected = cert.content_bp;
        for (const l of lots) {
          const allocs = (await client.query("SELECT * FROM allocation WHERE lot=$1", [l.reference])).rows;
          const attached = allocs.reduce((s, a) => s + Number(a.mass_g), 0);
          corrected = Math.floor((attached * Number(body.revised_factor_bp)) / 10000 * 10000 / (l.mass_g || 1));
        }
        rows.push({ certificate: cert.number, content_bp: cert.content_bp, corrected_content_bp: corrected });
      }
      contentMovements = rows;
    }
    await client.query(
      `INSERT INTO restatement (reference, period, reason, opened_by, opened_on, state, revised_factor, content_movements)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7)`,
      [reference, id, body.reason, c.get("session").email, today(), body.revised_factor_bp ? String(body.revised_factor_bp) : null,
        contentMovements.length ? JSON.stringify(contentMovements) : null]
    );
    await record(client, { act: "restatement_opened", person: c.get("session").email, site: p.site, object: reference, detail: { period: id, reason: body.reason, certificates: certs.map((x) => x.number) } });
    return {
      status: 201,
      body: {
        reference,
        period: id,
        reason: body.reason,
        certificates: certs.map((x) => ({ number: x.number, state: x.state })),
        content_movements: contentMovements,
      },
    };
  });
});

ledger.post("/restatements/:ref/resolutions", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "resolution", body, async (client) => {
    const r = (await client.query("SELECT * FROM restatement WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!r) return { status: 404, body: { error: "not_found" } };
    if (!body.certificate || !["reissued", "withdrawn", "unaffected"].includes(body.outcome) || !body.reason) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const cert = (await client.query("SELECT * FROM certificate WHERE number=$1", [body.certificate])).rows[0];
    if (!cert || cert.period !== r.period) return { status: 422, body: { error: "certificate_not_in_restatement" } };
    const dup = (await client.query("SELECT 1 FROM resolution WHERE restatement=$1 AND certificate=$2", [r.reference, body.certificate])).rows;
    if (dup.length) return { status: 409, body: { error: "already_resolved", rule: "A restatement holds exactly one resolution per affected certificate." } };
    await client.query(
      `INSERT INTO resolution (restatement, certificate, outcome, reason, resolved_by, resolved_on)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.reference, body.certificate, body.outcome, body.reason, c.get("session").email, today()]
    );
    await record(client, { act: "restatement_resolved", person: c.get("session").email, site: null, object: body.certificate, detail: { restatement: r.reference, outcome: body.outcome } });
    const remaining = (await client.query(
      "SELECT c.number FROM certificate c WHERE c.period=$1 AND c.number NOT IN (SELECT certificate FROM resolution WHERE restatement=$2)",
      [r.period, r.reference]
    )).rows;
    if (!remaining.length) {
      await client.query("UPDATE restatement SET state='resolved' WHERE reference=$1", [r.reference]);
    }
    return { status: 201, body: { reference: "RES-" + Date.now().toString(36).toUpperCase(), restatement: r.reference, certificate: body.certificate, outcome: body.outcome, remaining_certificates: remaining.map((x) => x.number) } };
  });
});

ledger.get("/restatements", guard(async (c) => {
  const rows = await q("SELECT * FROM restatement ORDER BY opened_on DESC");
  const res = await q("SELECT * FROM resolution");
  return c.json(rows.map((r) => ({
    reference: r.reference, period: r.period, reason: r.reason, state: r.state, opened_by: r.opened_by, opened_on: r.opened_on,
    content_movements: r.content_movements || [],
    resolutions: res.filter((x) => x.restatement === r.reference).map((x) => ({ certificate: x.certificate, outcome: x.outcome, reason: x.reason, resolved_on: x.resolved_on })),
  })));
}));

/* ------------------------------------------------- conversion factors */
ledger.get("/conversion-factors", guard(async (c) => {
  const rows = await q("SELECT * FROM conversion_factor ORDER BY site, published_on");
  return c.json(rows.map(f => factorView(f)));
}));

function factorView(f) {
  return {
    reference: f.reference,
    site: f.site,
    factor_bp: Number(f.factor_bp),
    derived_from: f.derived_from,
    derived_to: f.derived_to,
    derived_in_g: Number(f.derived_in_g),
    derived_out_g: Number(f.derived_out_g),
    provisional: f.provisional,
    published_by: f.published_by,
    published_on: f.published_on,
    derivation: {
      rule: "factor_bp = floor(derived_out_g * 10000 / derived_in_g)",
      checks: f.derived_in_g > 0 ? { computed: factorBpFromWindow(f.derived_in_g, f.derived_out_g), declared: Number(f.factor_bp) } : null,
    },
  };
}

ledger.post("/conversion-factors", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "conversion-factor", body, async (client) => {
    if (!body.site || !Number.isInteger(Number(body.factor_bp))) return { status: 422, body: { error: "invalid_request" } };
    const inG = Number(body.derived_in_g || 0);
    const outG = Number(body.derived_out_g || 0);
    const factor = Number(body.factor_bp);
    if (inG === 0) {
      // provisional: no window, declares itself
      const reference = "CF-" + body.site.replace("SITE-", "") + "-" + Date.now().toString(36).toUpperCase();
      await client.query(
        `INSERT INTO conversion_factor (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
         VALUES ($1,$2,$3,NULL,NULL,0,0,true,$4,$5)`,
        [reference, body.site, factor, c.get("session").email, today()]
      );
      await record(client, { act: "conversion_factor_published", person: c.get("session").email, site: body.site, object: reference, detail: { factor_bp: factor, provisional: true } });
      return { status: 201, body: { reference, provisional: true, note: "A provisional factor has no window. Every certificate resting on it says so." } };
    }
    const expected = factorBpFromWindow(inG, outG);
    if (factor !== expected) {
      await record(client, { act: "refused", person: c.get("session").email, site: body.site, object: "conversion-factor", detail: { declared: factor, computed: expected }, refused: "factor_does_not_reconcile" });
      return { status: 422, body: { error: "factor_does_not_reconcile", declared_bp: factor, computed_bp: expected, rule: "factor_bp = floor(derived_out_g * 10000 / derived_in_g)" } };
    }
    const reference = "CF-" + body.site.replace("SITE-", "") + "-" + Date.now().toString(36).toUpperCase();
    await client.query(
      `INSERT INTO conversion_factor (reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9)`,
      [reference, body.site, factor, body.derived_from, body.derived_to, inG, outG, c.get("session").email, today()]
    );
    await record(client, { act: "conversion_factor_published", person: c.get("session").email, site: body.site, object: reference, detail: { factor_bp: factor, derived_in_g: inG, derived_out_g: outG } });
    return { status: 201, body: { reference, factor_bp: factor, derived_in_g: inG, derived_out_g: outG } };
  });
});

/* ------------------------------------------------- carbon methods and figures */
ledger.get("/carbon-methods", guard(async (c) => {
  const rows = await q("SELECT * FROM carbon_method ORDER BY id, version");
  return c.json(rows.map(methodView));
}));

ledger.get("/carbon-methods/:id/versions/:version", guard(async (c) => {
  const m = await one("SELECT * FROM carbon_method WHERE id=$1 AND version=$2", [c.req.param("id"), Number(c.req.param("version"))]);
  if (!m) return c.json({ error: "not_found" }, 404);
  return c.json(methodView(m));
}));

function methodView(m) {
  return {
    id: m.id,
    version: Number(m.version),
    standard: m.standard,
    functional_unit: m.functional_unit,
    boundary: m.boundary,
    allocation_basis: m.allocation_basis,
    reviewer: m.reviewer,
    published_on: m.published_on,
    published_by: m.published_by,
    superseded: m.superseded_by !== null,
    superseded_by: m.superseded_by === null ? null : Number(m.superseded_by),
    data_quality: m.data_quality,
    emission_factors: m.emission_factors,
  };
}

ledger.post("/carbon-methods/:id/versions", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "carbon-method", body, async (client) => {
    const id = c.req.param("id");
    if (!body.standard || !body.functional_unit || !body.boundary || !body.allocation_basis || !body.reviewer) {
      return { status: 422, body: { error: "invalid_request" } };
    }
    const latest = (await client.query("SELECT * FROM carbon_method WHERE id=$1 ORDER BY version DESC LIMIT 1", [id])).rows[0];
    if (latest) {
      const used = (await client.query("SELECT 1 FROM carbon_figure WHERE method_version=$1 LIMIT 1", [id + " v" + latest.version])).rows;
      if (used.length) {
        await client.query("UPDATE carbon_method SET superseded_by=$2 WHERE id=$1 AND version=$3", [id, Number(latest.version) + 1, latest.version]);
      }
    }
    const version = Number(latest ? latest.version + 1 : 1);
    await client.query(
      `INSERT INTO carbon_method (id, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality, emission_factors)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, version, body.standard, body.functional_unit, body.boundary, body.allocation_basis, body.reviewer, today(), c.get("session").email,
        JSON.stringify(body.data_quality || { primary_share_threshold_bp: 5000 }), JSON.stringify(body.emission_factors || [])]
    );
    await record(client, { act: "method_version_published", person: c.get("session").email, site: null, object: id + " v" + version, detail: { standard: body.standard, boundary: body.boundary } });
    return { status: 201, body: { reference: id + " v" + version, id, version, published_on: today() } };
  });
});

ledger.post("/carbon-figures/:id/recompute", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "recompute", body, async (client) => {
    const f = (await client.query("SELECT * FROM carbon_figure WHERE id=$1", [c.req.param("id")])).rows[0];
    if (!f) return { status: 404, body: { error: "not_found" } };
    const lot = (await client.query("SELECT * FROM lot WHERE reference=$1", [f.lot])).rows[0];
    const period = (await client.query("SELECT * FROM balance_period WHERE site=$1 ORDER BY period_from DESC LIMIT 1", [lot.site])).rows[0];
    if (period && period.state === "closed") {
      const open = (await client.query("SELECT 1 FROM restatement WHERE period=$1 AND state='open'", [period.id])).rows;
      if (!open.length) {
        return { status: 409, body: { error: "closed_period_requires_restatement" } };
      }
    }
    const newId = "CFG-" + Date.now().toString(36).toUpperCase();
    const revision = Number(f.revision) + 1;
    const resolvable = await figureInputsResolvable(client, f);
    if (!resolvable.ok) {
      await record(client, { act: "recompute_refused", person: c.get("session").email, site: lot.site, object: f.id, detail: { reason: resolvable.reason }, refused: "not_reproducible" });
      return { status: 422, body: { error: "not_reproducible", reproducible: false, reason: resolvable.reason } };
    }
    await client.query("UPDATE carbon_figure SET superseded_by=$2, cache_valid=false WHERE id=$1", [f.id, newId]);
    await client.query(
      `INSERT INTO carbon_figure (id, lot, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator,
        energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, retired_kwh, unmatched_kwh, versions, computed_on, computed_by, revision, cache_valid)
       SELECT $2, lot, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, breakdown, comparator,
        energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, retired_kwh, unmatched_kwh, versions, $3, $4, $5, true
       FROM carbon_figure WHERE id=$1`,
      [f.id, newId, today(), c.get("session").email, revision]
    );
    const certs = (await client.query("SELECT number FROM certificate WHERE carbon=$1", [f.id])).rows;
    await record(client, {
      act: "figure_recomputed", person: c.get("session").email, site: lot.site, object: newId,
      detail: { superseded: f.id, reason: body.reason || null, certificates_carrying_superseded: certs.map((x) => x.number) },
    });
    return {
      status: 201,
      body: {
        reference: newId,
        superseded: f.id,
        reason: body.reason || null,
        recomputed_by: c.get("session").email,
        recomputed_on: today(),
        certificates_carrying_superseded_figure: certs.map((x) => x.number),
      },
    };
  });
});

async function figureInputsResolvable(client, f) {
  const versions = f.versions || {};
  if (versions.method) {
    const m = (await client.query("SELECT * FROM carbon_method WHERE id=$1 AND version=$2", [versions.method.id, versions.method.version])).rows;
    if (!m.length) return { ok: false, reason: "retired carbon method version " + versions.method.id + " v" + versions.method.version };
  }
  if (versions.conversion_factor) {
    const cf = (await client.query("SELECT 1 FROM conversion_factor WHERE reference=$1", [versions.conversion_factor])).rows;
    if (!cf.length) return { ok: false, reason: "lost conversion factor " + versions.conversion_factor };
  }
  return { ok: true };
}

/* ------------------------------------------------- energy instruments */
ledger.get("/energy-instruments", guard(async (c) => {
  const rows = await q("SELECT * FROM energy_instrument ORDER BY reference");
  const rets = await q("SELECT * FROM energy_retirement");
  return c.json(rows.map((i) => ({
    reference: i.reference,
    quantity_kwh: Number(i.quantity_kwh),
    vintage: i.vintage,
    region: i.region,
    state: i.state,
    retirements: rets.filter((r) => r.instrument === i.reference).map((r) => ({ period: r.period, retired_kwh: Number(r.retired_kwh), retired_on: r.retired_on })),
  })));
}));

ledger.post("/energy-instruments/:ref/retire", role("claims_manager", "quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "energy-retire", body, async (client) => {
    const inst = (await client.query("SELECT * FROM energy_instrument WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!inst) return { status: 404, body: { error: "not_found" } };
    const periodId = body.period;
    const period = (await client.query("SELECT * FROM balance_period WHERE id=$1", [periodId])).rows[0];
    if (!period) return { status: 422, body: { error: "unknown_period" } };
    if (inst.state !== "retired") {
      await record(client, { act: "refused", person: c.get("session").email, site: null, object: inst.reference, detail: { attempted: "retire", reason: "instrument not retired" }, refused: "instrument_not_retired" });
      return { status: 409, body: { error: "instrument_not_retired", state: inst.state } };
    }
    const consumption = (await client.query("SELECT metered_kwh FROM carbon_figure WHERE lot IN (SELECT reference FROM lot WHERE site=$1) ORDER BY computed_on DESC LIMIT 1", [period.site])).rows;
    const metered = consumption.length ? Number(consumption[0].metered_kwh) : 0;
    const existing = (await client.query("SELECT coalesce(sum(retired_kwh),0) AS n FROM energy_retirement WHERE period=$1", [periodId])).rows;
    const already = Number(existing[0].n);
    const vintageYear = String(period.period_from).slice(0, 4);
    if (inst.vintage !== vintageYear) {
      await record(client, { act: "refused", person: c.get("session").email, site: null, object: inst.reference, detail: { attempted: "retire", vintage: inst.vintage, period_year: vintageYear }, refused: "vintage_mismatch" });
      return { status: 409, body: { error: "vintage_mismatch", instrument_vintage: inst.vintage, period_year: vintageYear } };
    }
    if (already + Number(inst.quantity_kwh) > metered) {
      await record(client, { act: "refused", person: c.get("session").email, site: null, object: inst.reference, detail: { attempted: "retire", metered, already }, refused: "exceeds_metered_consumption" });
      return { status: 409, body: { error: "exceeds_metered_consumption", metered_kwh: metered, retired_kwh: already, instrument_kwh: Number(inst.quantity_kwh) } };
    }
    await client.query(
      "INSERT INTO energy_retirement (instrument, period, retired_kwh, retired_on, retired_by) VALUES ($1,$2,$3,$4,$5)",
      [inst.reference, periodId, inst.quantity_kwh, today(), c.get("session").email]
    );
    await record(client, { act: "instrument_retired", person: c.get("session").email, site: period.site, object: inst.reference, detail: { period: periodId, retired_kwh: Number(inst.quantity_kwh) } });
    return {
      status: 201,
      body: {
        reference: "ERT-" + Date.now().toString(36).toUpperCase(),
        instrument: inst.reference,
        period: periodId,
        retired_kwh: Number(inst.quantity_kwh),
        metered_kwh: metered,
        unmatched_kwh: metered - already - Number(inst.quantity_kwh),
      },
    };
  });
});

/* ------------------------------------------------- specifications, customers */
ledger.get("/specifications/:grade/versions/:version", guard(async (c) => {
  const s = await one("SELECT * FROM specification WHERE grade=$1 AND version=$2", [c.req.param("grade"), Number(c.req.param("version"))]);
  if (!s) return c.json({ error: "not_found" }, 404);
  return c.json({
    grade: s.grade,
    version: Number(s.version),
    issued_on: s.issued_on,
    virgin_reference: s.virgin_reference,
    virgin_reference_source: s.virgin_source,
    virgin_reference_date: s.virgin_reference_date,
    rows: s.rows,
    superseded: s.superseded_by !== null,
    superseded_by: s.superseded_by,
    derivation: { rule: "A guaranteed limit is tested on every lot." },
  });
}));

ledger.post("/specifications/:grade/versions/:version/issue", role("quality_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "specification-issue", body, async (client) => {
    const grade = c.req.param("grade");
    const version = Number(c.req.param("version"));
    const s = (await client.query("SELECT * FROM specification WHERE grade=$1 AND version=$2", [grade, version])).rows[0];
    if (!s) return { status: 404, body: { error: "not_found" } };
    if (!body.customer) return { status: 422, body: { error: "customer_required" } };
    const cust = (await client.query("SELECT * FROM customer WHERE reference=$1", [body.customer])).rows[0];
    if (!cust) return { status: 422, body: { error: "unknown_customer" } };
    await client.query(
      "INSERT INTO specification_issue (grade, version, customer, issued_on, issued_by) VALUES ($1,$2,$3,$4,$5)",
      [grade, version, body.customer, today(), c.get("session").email]
    );
    await record(client, { act: "specification_issued", person: c.get("session").email, site: null, object: grade + " v" + version, detail: { customer: body.customer } });
    return { status: 201, body: { reference: "SPI-" + Date.now().toString(36).toUpperCase(), grade, version: version, customer: body.customer, issued_on: today() } };
  });
});

ledger.get("/customers/:ref", guard(async (c) => {
  const cust = await one("SELECT * FROM customer WHERE reference=$1", [c.req.param("ref")]);
  if (!cust) return c.json({ error: "not_found" }, 404);
  const issues = await q("SELECT * FROM specification_issue WHERE customer=$1", [cust.reference]);
  const conf = await q("SELECT * FROM conformance WHERE customer=$1", [cust.reference]);
  return c.json({
    reference: cust.reference,
    contact: cust.contact,
    holds_specification_version: { grade: cust.holds_specification, version: Number(cust.holds_version) },
    application: cust.application,
    industry: cust.industry,
    specifications_issued: issues.map((i) => ({ grade: i.grade, version: Number(i.version), issued_on: i.issued_on })),
    conformance: conf.map((x) => ({
      application: x.application,
      specification: { grade: x.grade, version: Number(x.version) },
      trials: x.trials,
      outcome: x.outcome,
      opened_on: x.opened_on,
    })),
  });
}));

/* ------------------------------------------------- change notices */
ledger.get("/change-notices", guard(async (c) => {
  const rows = await q("SELECT * FROM change_notice ORDER BY raised_on DESC");
  const acks = await q("SELECT * FROM change_ack");
  return c.json(rows.map((n) => ({
    reference: n.reference,
    what: n.what,
    detail: n.detail,
    state: n.state,
    notice_period_days: Number(n.notice_period_days),
    specifications_affected: n.specifications_affected,
    customers_affected: n.customers_affected,
    qualifications_affected: n.qualifications_affected,
    blocking: n.blocking,
    acknowledgements: acks.filter((a) => a.notice === n.reference).map((a) => ({ customer: a.customer, kind: a.kind, at: a.at })),
  })));
}));

ledger.post("/change-notices", role("quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "change-notice", body, async (client) => {
    if (!body.what || !body.detail) return { status: 422, body: { error: "invalid_request" } };
    // derive rather than assert
    const specs = await deriveSpecificationsAffected(client, body);
    const customers = (await client.query("SELECT DISTINCT customer FROM specification_issue WHERE grade = ANY($1)", [specs])).rows.map((r) => r.customer);
    const allCustomers = (await client.query("SELECT * FROM customer")).rows;
    const quals = customers.filter((cu) => {
      const cust = allCustomers.find((x) => x.reference === cu);
      return cust && cust.industry === "automotive" && body.qualification_relevant !== false;
    });
    const blocking = quals.length ? { rule: "A change touching a qualification-relevant parameter for a customer in the automotive industry blocks rather than warns.", customers: quals } : null;
    const reference = "CHG-" + Date.now().toString(36).toUpperCase();
    const noticeDays = Number(body.notice_period_days || 90);
    await client.query(
      `INSERT INTO change_notice (reference, what, detail, raised_by, raised_on, state, notice_period_days, specifications_affected, customers_affected, qualifications_affected, blocking)
       VALUES ($1,$2,$3,$4,$5,'proposed',$6,$7,$8,$9,$10)`,
      [reference, body.what, body.detail, c.get("session").email, today(), noticeDays, specs, customers, quals, blocking ? JSON.stringify(blocking) : null]
    );
    await record(client, { act: "change_notice_raised", person: c.get("session").email, site: null, object: reference, detail: { what: body.what, specifications_affected: specs, customers_affected: customers, qualifications_affected: quals } });
    return {
      status: 201,
      body: {
        reference,
        what: body.what,
        specifications_affected: specs,
        customers_affected: customers,
        qualifications_affected: quals,
        notice_period_days: noticeDays,
        blocking,
        note: quals.length ? "This change may invalidate " + quals.length + " customer qualification" + (quals.length === 1 ? "" : "s") + "." : null,
      },
    };
  });
});

async function deriveSpecificationsAffected(client, body) {
  if (body.recipe_version) {
    const rows = (await client.query("SELECT * FROM recipe_version WHERE reference=$1", [body.recipe_version])).rows;
    if (rows.length) {
      const sp = rows[0].set_points || {};
      const moves = (body.moves || []).filter((m) => m.parameter === "temperature" || m.parameter === "pressure");
      if (moves.length) return ["SPEC-N6"];
    }
  }
  if (body.grade) return [body.grade];
  return ["SPEC-N6"];
}

ledger.post("/change-notices/:ref/notify", role("quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "change-notify", body, async (client) => {
    const n = (await client.query("SELECT * FROM change_notice WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!n) return { status: 404, body: { error: "not_found" } };
    if (!body.customer) return { status: 422, body: { error: "customer_required" } };
    const cust = (await client.query("SELECT * FROM customer WHERE reference=$1", [body.customer])).rows[0];
    if (!cust) return { status: 422, body: { error: "unknown_customer" } };
    await client.query("INSERT INTO change_ack (notice, customer, kind) VALUES ($1,$2,'notified')", [n.reference, body.customer]);
    await sendMail(cust.contact, "Change notice " + n.reference + " requires acknowledgement",
      "Change: " + n.what + "\nDetail: " + n.detail + "\nSpecifications affected: " + (n.specifications_affected || []).join(", ") +
      "\nNotice period: " + n.notice_period_days + " days\n\nPlease acknowledge this change notice.");
    await record(client, { act: "change_notice_notified", person: c.get("session").email, site: null, object: n.reference, detail: { customer: body.customer, mail: cust.contact } });
    return { status: 201, body: { reference: "ACK-" + Date.now().toString(36).toUpperCase(), notice: n.reference, customer: body.customer, notified: cust.contact } };
  });
});

ledger.post("/change-notices/:ref/release", role("quality_manager", "claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "change-release", body, async (client) => {
    const n = (await client.query("SELECT * FROM change_notice WHERE reference=$1", [c.req.param("ref")])).rows[0];
    if (!n) return { status: 404, body: { error: "not_found" } };
    const owed = n.customers_affected || [];
    const acked = (await client.query("SELECT DISTINCT customer FROM change_ack WHERE notice=$1", [n.reference])).rows.map((r) => r.customer);
    const outstanding = owed.filter((cu) => !acked.includes(cu));
    if (outstanding.length) {
      await record(client, { act: "refused", person: c.get("session").email, site: null, object: n.reference, detail: { attempted: "release", outstanding }, refused: "notice_owed" });
      return { status: 409, body: { error: "notice_owed", customers_owing_notice: outstanding } };
    }
    await client.query("UPDATE change_notice SET state='released' WHERE reference=$1", [n.reference]);
    await record(client, { act: "change_notice_released", person: c.get("session").email, site: null, object: n.reference, detail: {} });
    return { status: 201, body: { reference: n.reference, state: "released" } };
  });
});

/* ------------------------------------------------- contracts */
ledger.get("/contracts", guard(async (c) => {
  const rows = await q("SELECT * FROM contract ORDER BY id");
  const out = [];
  for (const ct of rows) out.push(await contractView(ct));
  return c.json(out);
}));

ledger.get("/contracts/:id/projection", guard(async (c) => {
  const ct = await one("SELECT * FROM contract WHERE id=$1", [c.req.param("id")]);
  if (!ct) return c.json({ error: "not_found" }, 404);
  const v = await contractView(ct);
  const allocs = await q("SELECT * FROM contract_allocation WHERE contract=$1", [ct.id]);
  const deliveredContent = allocs.reduce((s, a) => s + Number(a.mass_g), 0);
  const lotContents = [];
  for (const a of allocs) {
    const lc = await engine.lotContent(a.lot);
    lotContents.push({ lot: a.lot, mass_g: Number(a.mass_g), content_bp: lc ? lc.content_bp : 0 });
  }
  const weighted = deliveredContent ? Math.floor(lotContents.reduce((s, l) => s + l.mass_g * l.content_bp, 0) / deliveredContent) : 0;
  const committedG = Number(ct.committed_kg) * 1000;
  const remaining = Math.max(0, committedG - deliveredContent);
  const requiredRemaining = remaining > 0 ? Math.floor(((Number(ct.floor_bp) * committedG - weighted * deliveredContent) / remaining)) : null;
  const site = await one("SELECT * FROM site WHERE reference=$1", [ct.site]);
  const unreachable = requiredRemaining !== null && requiredRemaining > 10000;
  return c.json({
    contract: ct.id,
    recipient: ct.recipient,
    site: ct.site,
    period: ct.period,
    delivered_kg: Number(deliveredContent) / 1000,
    committed_kg: Number(ct.committed_kg),
    running_content_bp: weighted,
    floor_bp: Number(ct.floor_bp),
    required_remaining_bp: requiredRemaining,
    state: unreachable ? "unreachable" : "on_track",
    unreachable_since: unreachable ? ct.unreachable_on || today() : null,
    unreachable_allocation: ct.unreachable_allocation || null,
    planned_site_flag: site && site.confidence === "planned",
    flag_dismissible: false,
    shortfall_consequence: ct.shortfall_consequence,
    allocations: allocs.map((a) => ({ reference: a.reference, lot: a.lot, mass_g: Number(a.mass_g), decided_by: a.decided_by, favoured_over: a.favoured_over })),
    derivation: {
      rule: "required_remaining_bp is the average the remaining volume must reach",
      allocations: allocs.map((a) => a.reference),
    },
  });
}));

async function contractView(ct) {
  const site = await one("SELECT * FROM site WHERE reference=$1", [ct.site]);
  return {
    id: ct.id,
    recipient: ct.recipient,
    site: ct.site,
    period: ct.period,
    committed_kg: Number(ct.committed_kg),
    floor_bp: Number(ct.floor_bp),
    delivered_kg: Number(ct.delivered_kg),
    shortfall_consequence: ct.shortfall_consequence,
    planned_site_flag: site && site.confidence === "planned",
    flag_dismissible: false,
  };
}

ledger.post("/contracts/:id/allocations", role("claims_manager"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return withIdempotency(c, "contract-allocation", body, async (client) => {
    const ct = (await client.query("SELECT * FROM contract WHERE id=$1", [c.req.param("id")])).rows[0];
    if (!ct) return { status: 404, body: { error: "not_found" } };
    if (!body.lot) return { status: 422, body: { error: "lot_required" } };
    const already = (await client.query("SELECT 1 FROM contract_allocation WHERE lot=$1 AND contract <> $2", [body.lot, ct.id])).rows;
    if (already.length) {
      await record(client, { act: "refused", person: c.get("session").email, site: ct.site, object: ct.id, detail: { attempted: "contract allocation", lot: body.lot }, refused: "claim_already_allocated" });
      return { status: 409, body: { error: "claim_already_allocated", rule: "A claim already allocated to one contract is refused a second attachment." } };
    }
    if (!body.decided_by || !Array.isArray(body.favoured_over)) {
      return { status: 422, body: { error: "short_supply_requires_decided_by_and_favoured_over", rule: "Where supply is short, an allocation carries who decided and which contracts went without." } };
    }
    const reference = "CAL-" + Date.now().toString(36).toUpperCase();
    const mass = num(body.mass_g, "mass_g");
    await client.query(
      `INSERT INTO contract_allocation (reference, contract, lot, mass_g, decided_by, favoured_over, allocated_on, allocated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, ct.id, body.lot, mass, body.decided_by, body.favoured_over, today(), c.get("session").email]
    );
    await record(client, {
      act: "contract_allocation", person: c.get("session").email, site: ct.site, object: reference,
      detail: { contract: ct.id, lot: body.lot, mass_g: mass, decided_by: body.decided_by, favoured_over: body.favoured_over },
    });
    return { status: 201, body: { reference, contract: ct.id, lot: body.lot, mass_g: mass, decided_by: body.decided_by, favoured_over: body.favoured_over } };
  });
});
