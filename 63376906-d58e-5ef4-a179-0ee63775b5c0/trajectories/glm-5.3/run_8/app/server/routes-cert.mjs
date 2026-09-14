import { Hono } from "hono";
import { q, one, tx } from "./lib/db.mjs";
import { record, recordAct, sha256 } from "./lib/core.mjs";
import { contentBp } from "./lib/core.mjs";
import * as engine from "./lib/engine.mjs";
import { loadGraph, ancestorsOfLot, impactOfBatch } from "./lib/genealogy.mjs";
import { sendMail } from "./lib/mail.mjs";
import { guard, role, withIdempotency, refusePagination } from "./lib/http.mjs";
import { today, addDays } from "./routes-core.mjs";

export const certs = new Hono();

const SCHEME = "RCS-2026";
const REGISTRATION = "REG-RAVEL-0042";

/* ------------------------------------------------- the eight conditions */
async function eightConditions(lotRef, periodId, signerEmail, opts = {}) {
  const lot = await one("SELECT * FROM lot WHERE reference=$1", [lotRef]);
  if (!lot) return null;
  const period = periodId ? await one("SELECT * FROM balance_period WHERE id=$1", [periodId]) : null;

  const openDev = await one(
    `SELECT d.reference FROM deviation d JOIN deviation_subject s ON s.deviation=d.reference
     WHERE s.subject_kind='lot' AND s.subject=$1 AND d.state='open' LIMIT 1`, [lotRef]
  );
  const unreviewed = await one("SELECT reference FROM override WHERE lot=$1 AND reviewed=false LIMIT 1", [lotRef]);
  const content = await engine.lotContent(lotRef);
  const figure = await one("SELECT * FROM carbon_figure WHERE lot=$1 AND superseded_by IS NULL ORDER BY revision DESC LIMIT 1", [lotRef]);
  const carbonComplete = figure && figure.value_mg_per_kg !== null && figure.boundary && figure.method_version && figure.uncertainty_bp !== null;

  const periodClosed = period ? period.state === "closed" : false;
  let balanceHolds = false;
  let balanceRef = null;
  if (periodId) {
    const { byCategory } = await engine.periodCredits(periodId);
    balanceHolds = Object.values(byCategory).every((cat) => cat.credits_out_g <= cat.credits_in_g);
  }

  const signerEntered = await signerEnteredData(signerEmail, lotRef);
  const scoped = await signerScoped(signerEmail, lot.site);

  return [
    {
      condition: "lot_released",
      statement: "The lot is released.",
      satisfied: lot.disposition === "released",
      blocking_reference: lot.disposition === "released" ? null : "lot:" + lotRef,
      remedy: lot.disposition === "released" ? null : "Set the disposition to released. It is refused while a deviation touching the lot is open, and whoever entered a test result on the lot may not disposition it.",
    },
    {
      condition: "no_open_deviation",
      statement: "No deviation touching the lot is open.",
      satisfied: !openDev,
      blocking_reference: openDev ? "deviation:" + openDev.reference : null,
      remedy: openDev ? "Close deviation " + openDev.reference + " with an honest outcome." : null,
    },
    {
      condition: "no_unreviewed_override",
      statement: "No override on the lot is unreviewed.",
      satisfied: !unreviewed,
      blocking_reference: unreviewed ? "override:" + unreviewed.reference : null,
      remedy: unreviewed ? "A second person who is neither the authoriser nor outside the reviewing roles reviews override " + unreviewed.reference + "." : null,
    },
    {
      condition: "period_closed",
      statement: "The bookkeeping period is closed.",
      satisfied: periodClosed,
      blocking_reference: period ? (periodClosed ? null : "balance-period:" + period.id) : "balance-period:none",
      remedy: periodClosed ? null : "Close the balance period. Every lot in it must carry a disposition and the balance must reconcile.",
    },
    {
      condition: "balance_invariant_holds",
      statement: "The balance invariant holds with the allocation applied.",
      satisfied: balanceHolds,
      blocking_reference: balanceHolds ? null : "balance-period:" + (periodId || "none"),
      remedy: balanceHolds ? null : "Credits attached would exceed credits available.",
    },
    {
      condition: "carbon_figure_complete",
      statement: "The carbon figure exists with all four components.",
      satisfied: !!carbonComplete,
      blocking_reference: carbonComplete ? null : "lot:" + lotRef + "/carbon",
      remedy: carbonComplete ? null : "Compute a carbon figure carrying its value, boundary, method version and uncertainty.",
    },
    {
      condition: "signer_scope",
      statement: "The signer holds signing scope for that site on the date of signing.",
      satisfied: scoped.ok,
      blocking_reference: scoped.ok ? null : "site:" + lot.site,
      remedy: scoped.ok ? null : "The signer's grant does not cover " + lot.site + (scoped.until ? " beyond " + scoped.until : "") + ".",
    },
    {
      condition: "signer_not_data_enterer",
      statement: "The signer did not enter the data.",
      satisfied: !signerEntered.entered,
      blocking_reference: signerEntered.entered ? signerEntered.where : null,
      remedy: signerEntered.entered ? "The signer entered " + signerEntered.what + " on this lot. Another signer must sign it." : null,
    },
  ];
}

async function signerEnteredData(email, lotRef) {
  const tests = await one("SELECT reference FROM test_result WHERE subject_kind='lot' AND subject=$1 AND analyst=$2 LIMIT 1", [lotRef, email]);
  if (tests) return { entered: true, what: "a test result", where: "test-result:" + tests.reference };
  const lots = await one("SELECT reference FROM lot WHERE reference=$1 AND produced_by=$2", [lotRef, email]);
  if (lots) return { entered: true, what: "the lot", where: "lot:" + lots.reference };
  const idx = await loadGraph();
  const { batchMass } = ancestorsOfLot(idx, lotRef);
  const refs = [...batchMass.keys()];
  if (refs.length) {
    const b = await one("SELECT reference FROM batch WHERE reference = ANY($1) AND booked_by=$2 LIMIT 1", [refs, email]);
    if (b) return { entered: true, what: "a batch the lot descends from", where: "batch:" + b.reference };
    const r = await one("SELECT reference FROM run WHERE site=(SELECT site FROM lot WHERE reference=$1) AND operator=$2 LIMIT 1", [lotRef, email]);
    if (r) return { entered: true, what: "a run the lot descends from", where: "run:" + r.reference };
  }
  return { entered: false, what: null, where: null };
}

async function signerScoped(email, siteRef) {
  const grants = await q("SELECT * FROM access_grant WHERE email=$1 AND role='certificate_signer'", [email]);
  const g = grants.find((x) => x.site === siteRef);
  if (!g) return { ok: false, until: null };
  const untilOk = g.valid_to >= today();
  return { ok: untilOk, until: g.valid_to };
}

function permittedStatement(contentBpValue, claimType, categorySplit) {
  const pct = (contentBpValue / 100).toFixed(2);
  const cats = Object.entries(categorySplit).filter(([, v]) => v > 0).map(([k]) => k.replace(/_/g, " ")).join(" and ");
  return `The material named on this certificate represents ${pct} per cent recycled content (${cats}), claimed by ${claimType.replace(/_/g, " ")} and allocated by Ravel Materials SAS under scheme ${SCHEME}. This material is claimed by mass balance. It is not physically segregated.`;
}
function prohibitedStatement(claimType) {
  return "You may not state that this material physically contains recycled content.";
}

/* ------------------------------------------------- preview and sign */
certs.post("/certificates/preview", role("certificate_signer"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const lotRef = body.lot;
  if (!lotRef) return c.json({ error: "lot_required" }, 422);
  const lot = await one("SELECT * FROM lot WHERE reference=$1", [lotRef]);
  if (!lot) return c.json({ error: "lot_not_found" }, 404);
  const recipient = body.recipient ? await one("SELECT * FROM customer WHERE reference=$1", [body.recipient]) : null;
  const period = await one(
    "SELECT * FROM balance_period WHERE site=$1 AND grade=$2 AND $3 BETWEEN period_from AND period_to ORDER BY period_from DESC LIMIT 1",
    [lot.site, lot.grade, lot.produced_at.toISOString().slice(0, 10)]
  );
  const conditions = await eightConditions(lotRef, period ? period.id : null, c.get("session").email);
  if (!conditions) return c.json({ error: "lot_not_found" }, 404);
  const content = await engine.lotContent(lotRef);
  return c.json({
    lot: lotRef,
    recipient: recipient ? recipient.reference : null,
    period: period ? period.id : null,
    claim_type: content.claim_type,
    content_bp: content.content_bp,
    conditions,
    conditions_checked_against: { lot: lotRef, period: period ? period.id : null, at: new Date().toISOString() },
    note: "None of the eight is waivable. The same eight are re-checked at the moment of signing.",
  });
});

certs.get("/certificates/preview-document", guard(async (c) => {
  const lotRef = c.req.query("lot");
  const lot = await one("SELECT * FROM lot WHERE reference=$1", [lotRef]);
  if (!lot) return c.text("No lot with this reference.\n", 404, { "content-type": "text/plain; charset=utf-8" });
  const content = await engine.lotContent(lotRef);
  const figure = await one("SELECT * FROM carbon_figure WHERE lot=$1 AND superseded_by IS NULL ORDER BY revision DESC LIMIT 1", [lotRef]);
  const doc = renderDocument({
    number: "— to be issued at signing —",
    version: 1,
    site: lot.site,
    lots: [{ reference: lotRef, mass_g: Number(lot.mass_g) }],
    grade: lot.grade,
    specification_version: 3,
    claim_type: content.claim_type,
    content_bp: content.content_bp,
    category_split: content.category_split,
    period: null,
    primary_share_bp: figure ? Number(figure.primary_share_bp) : null,
    scheme: SCHEME,
    registration: REGISTRATION,
    permitted_statement: permittedStatement(content.content_bp, content.claim_type, content.category_split),
    prohibited_statement: prohibitedStatement(content.claim_type),
    signer: "— the signer, at signing —",
    signed_at: new Date(),
    recipient_name: "— the recipient chosen at the next step —",
    recipient: "—",
    state: "draft",
    provisional_factor: content.provisional_factor,
    verification_url: "https://ravel.example.com/verify/{number}",
  }, figure);
  return c.text(doc, 200, { "content-type": "text/plain; charset=utf-8" });
}));

certs.get("/certificates", guard(async (c) => {
  const rows = await q("SELECT * FROM certificate ORDER BY number");
  return c.json(rows.map(certView));
}));

certs.get("/certificates/:number", guard(async (c) => {
  const cert = await one("SELECT * FROM certificate WHERE number=$1", [c.req.param("number")]);
  if (!cert) return c.json({ error: "not_found" }, 404);
  const figure = await one("SELECT * FROM carbon_figure WHERE id=$1", [cert.carbon]);
  const v = certView(cert);
  v.carbon_detail = figure ? {
    value_mg_per_kg: Number(figure.value_mg_per_kg),
    boundary: figure.boundary,
    method_version: figure.method_version,
    uncertainty_bp: Number(figure.uncertainty_bp),
    comparator: figure.comparator,
    primary_share_bp: Number(figure.primary_share_bp),
    breakdown: figure.breakdown,
  } : null;
  return c.json(v);
}));

function certView(cert) {
  return {
    number: cert.number,
    version: Number(cert.version),
    site: cert.site,
    lots: cert.lots,
    grade: cert.grade,
    specification_version: Number(cert.specification_version),
    claim_type: cert.claim_type,
    content_bp: Number(cert.content_bp),
    category_split: cert.category_split,
    period: cert.period,
    carbon: cert.carbon,
    primary_share_bp: cert.primary_share_bp === null ? null : Number(cert.primary_share_bp),
    scheme: cert.scheme,
    registration: cert.registration,
    test_results: cert.test_results,
    permitted_statement: cert.permitted_statement,
    prohibited_statement: cert.prohibited_statement,
    signer: cert.signer,
    signed_at: cert.signed_at,
    verification_url: cert.verification_url,
    state: cert.state,
    withdrawn_reason: cert.withdrawn_reason,
    withdrawn_by: cert.withdrawn_by,
    withdrawn_on: cert.withdrawn_on,
    withdrawal_notified: cert.withdrawal_notified,
    provisional_factor: cert.provisional_factor,
    recipient: cert.recipient,
    recipient_name: cert.recipient_name,
    derived_certificates: cert.derived_certificates,
    reissue_of: cert.reissue_of,
  };
}

certs.post("/certificates", role("certificate_signer"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  // signing re-authenticates: the password again, a session alone is not a signing credential
  const { keycloakToken } = await import("./lib/auth.mjs");
  const kc = await keycloakToken(c.get("session").email, String(body.password || "")).catch(() => null);
  if (!kc) {
    await recordAct({ act: "refused", person: c.get("session").email, site: null, object: "certificate", detail: { attempted: "sign", reason: "re-authentication failed" }, refused: "reauthentication_required" }).catch(() => {});
    return c.json({ error: "reauthentication_required", reason: "Signing carries the password again. A session alone is not a signing credential." }, 401);
  }
  return withIdempotency(c, "certificate-sign", body, async (client) => {
    const lotRef = body.lot;
    const recipientRef = body.recipient;
    if (!lotRef || !recipientRef) return { status: 422, body: { error: "invalid_request" } };
    const lot = (await client.query("SELECT * FROM lot WHERE reference=$1", [lotRef])).rows[0];
    if (!lot) return { status: 422, body: { error: "lot_not_found" } };
    const recipient = (await client.query("SELECT * FROM customer WHERE reference=$1", [recipientRef])).rows[0];
    if (!recipient) return { status: 422, body: { error: "unknown_recipient" } };
    const period = (await client.query(
      "SELECT * FROM balance_period WHERE site=$1 AND grade=$2 ORDER BY period_from DESC LIMIT 1", [lot.site, lot.grade]
    )).rows[0];
    const conditions = await eightConditions(lotRef, period ? period.id : null, c.get("session").email);
    const failing = conditions.filter((x) => !x.satisfied);
    if (failing.length) {
      await record(client, {
        act: "refused", person: c.get("session").email, site: lot.site, object: "certificate:" + lotRef,
        detail: { attempted: "sign", failing_conditions: failing.map((f) => f.condition) },
        refused: "conditions_failed",
      });
      return {
        status: 409,
        body: {
          error: "conditions_failed",
          conditions,
          failing: failing.map((f) => f.condition),
          changed_condition: failing[0] ? failing[0].condition : null,
          note: "The eight conditions are decided again at the moment of signing, against the records as they stand then.",
        },
      };
    }
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["certseq:" + lot.site]);
    const seq = (await client.query("SELECT last FROM certificate_seq WHERE site=$1 FOR UPDATE", [lot.site])).rows[0];
    const next = Number(seq.last) + 1;
    await client.query("UPDATE certificate_seq SET last=$2 WHERE site=$1", [lot.site, next]);
    const number = "CERT-" + lot.site.replace("SITE-", "") + "-" + String(next).padStart(6, "0");
    const content = await engine.lotContent(lotRef);
    const figure = (await client.query("SELECT * FROM carbon_figure WHERE lot=$1 AND superseded_by IS NULL ORDER BY revision DESC LIMIT 1", [lotRef])).rows[0];
    const tests = (await client.query("SELECT * FROM test_result WHERE subject_kind='lot' AND subject=$1 AND usable_for_release", [lotRef])).rows;
    const permitted = permittedStatement(content.content_bp, content.claim_type, content.category_split);
    const prohibited = prohibitedStatement(content.claim_type);
    await client.query(
      `INSERT INTO certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, period,
        carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, conditions,
        recipient, recipient_name, state, verification_url, provisional_factor, input_versions)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now(),$18,$19,$20,'issued',$21,$22,$23)`,
      [number, lot.site, JSON.stringify([{ reference: lotRef, mass_g: Number(lot.mass_g) }]), lot.grade,
        Number(recipient.holds_version), content.claim_type, content.content_bp, JSON.stringify(content.category_split),
        period ? period.id : null, figure ? figure.id : null, figure ? Number(figure.primary_share_bp) : null,
        SCHEME, REGISTRATION,
        JSON.stringify(tests.map((t) => ({ reference: t.reference, property: t.property, method: t.method, value: Number(t.value), unit: t.unit }))),
        permitted, prohibited, c.get("session").email,
        JSON.stringify(conditions), recipient.reference, recipient.name,
        "https://ravel.example.com/verify/" + number, content.provisional_factor,
        JSON.stringify({
          method: figure ? { id: figure.method_version.split(" v")[0], version: Number(figure.method_version.split(" v")[1]) } : null,
          conversion_factor: (figure && figure.versions && figure.versions.conversion_factor) || null,
          specification: { grade: "SPEC-N6", version: Number(recipient.holds_version) },
          lots: [lotRef],
        })]
    );
    const cust = (await client.query("SELECT * FROM customer WHERE reference=$1", [recipientRef])).rows[0];
    await sendMail(cust.contact, "Certificate " + number + " issued",
      "Certificate " + number + " has been issued.\nClaim type: " + content.claim_type.replace(/_/g, " ") +
      "\nRecycled content: " + (content.content_bp / 100).toFixed(2) + " per cent\n\nPermitted statement:\n" + permitted +
      "\n\nYou may not state that this material physically contains recycled content.\nVerify at https://ravel.example.com/verify/" + number);
    await record(client, {
      act: "certificate_signed", person: c.get("session").email, site: lot.site, object: number,
      detail: { lot: lotRef, recipient: recipientRef, content_bp: content.content_bp, conditions_stored: conditions },
    });
    return { status: 201, body: { reference: number, number, state: "issued", verification_url: "https://ravel.example.com/verify/" + number } };
  });
});

certs.get("/certificates/:number/document", async (c) => {
  const cert = await one("SELECT * FROM certificate WHERE number=$1", [c.req.param("number")]);
  if (!cert) return c.text("No certificate with this number exists on this register.\n", 404, { "content-type": "text/plain; charset=utf-8" });
  const figure = cert.carbon ? await one("SELECT * FROM carbon_figure WHERE id=$1", [cert.carbon]) : null;
  const doc = renderDocument(cert, figure);
  return c.text(doc, 200, { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" });
});

export function renderDocument(cert, figure) {
  const pct = (Number(cert.content_bp) / 100).toFixed(2);
  const lines = [];
  lines.push("RAVEL MATERIALS SAS");
  lines.push("RECYCLED CONTENT CERTIFICATE");
  lines.push("");
  lines.push("Certificate number: " + cert.number);
  lines.push("Version: " + cert.version);
  lines.push("State: " + cert.state + (cert.state === "withdrawn" ? " (withdrawn)" : ""));
  lines.push("Site: " + cert.site);
  lines.push("Grade: " + cert.grade);
  lines.push("Specification: " + "SPEC-N6 version " + cert.specification_version);
  lines.push("Scheme: " + cert.scheme);
  lines.push("Producer registration: " + cert.registration);
  lines.push("Balance period: " + (cert.period || "—"));
  lines.push("Signed by: " + cert.signer);
  lines.push("Signed at: " + (cert.signed_at instanceof Date ? cert.signed_at.toISOString() : String(cert.signed_at)));
  lines.push("Recipient: " + cert.recipient_name + " (" + cert.recipient + ")");
  lines.push("");
  lines.push("MATERIAL");
  for (const l of cert.lots || []) lines.push("  Lot " + l.reference + " — " + l.mass_g + " g");
  lines.push("Claim type: " + cert.claim_type.replace(/_/g, " "));
  lines.push("Recycled content: " + pct + " per cent");
  const cats = Object.entries(cert.category_split || {}).filter(([, v]) => Number(v) > 0);
  for (const [k, v] of cats) lines.push("  " + k.replace(/_/g, " ") + ": " + v + " g");
  lines.push("Provisional conversion factor: " + (cert.provisional_factor ? "yes — every figure resting on it says so" : "no"));
  lines.push("");
  lines.push("CARBON");
  lines.push("  Value: " + (figure ? figure.value_mg_per_kg + " mg CO2e per kg" : "not stated"));
  lines.push("  Boundary: " + (figure ? figure.boundary : "not stated"));
  lines.push("  Method version: " + (figure ? figure.method_version : "not stated"));
  lines.push("  Uncertainty: " + (figure ? figure.uncertainty_bp + " basis points" : "not stated"));
  lines.push("  Primary data share: " + (cert.primary_share_bp === null ? "—" : cert.primary_share_bp + " basis points"));
  lines.push("");
  lines.push("PERMITTED STATEMENT");
  lines.push(cert.permitted_statement);
  lines.push("");
  lines.push("PROHIBITED STATEMENT");
  lines.push(cert.prohibited_statement);
  lines.push("");
  lines.push("This material is claimed by mass balance. It is not physically segregated.");
  lines.push("You may not state that this material physically contains recycled content.");
  if (cert.state === "withdrawn") {
    lines.push("");
    lines.push("This certificate was withdrawn on " + cert.withdrawn_on + ". Reason: " + cert.withdrawn_reason + ".");
  }
  lines.push("");
  lines.push("Verify this certificate at ravel.example.com/verify/" + cert.number);
  return lines.join("\n") + "\n";
}

certs.post("/certificates/:number/withdraw", role("certificate_signer"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { keycloakToken } = await import("./lib/auth.mjs");
  const kc = await keycloakToken(c.get("session").email, String(body.password || "")).catch(() => null);
  if (!kc) return c.json({ error: "reauthentication_required" }, 401);
  return withIdempotency(c, "certificate-withdraw", body, async (client) => {
    const number = c.req.param("number");
    const cert = (await client.query("SELECT * FROM certificate WHERE number=$1", [number])).rows[0];
    if (!cert) return { status: 404, body: { error: "not_found" } };
    if (cert.state === "withdrawn") return { status: 409, body: { error: "already_withdrawn" } };
    if (!body.reason || String(body.reason).trim().length < 10) return { status: 422, body: { error: "reason_required" } };
    const scoped = await signerScoped(c.get("session").email, cert.site);
    if (!scoped.ok) {
      await record(client, { act: "refused", person: c.get("session").email, site: cert.site, object: number, detail: { attempted: "withdraw", reason: "site outside scope" }, refused: "signer_scope" });
      return { status: 403, body: { error: "site_outside_signer_scope", site: cert.site } };
    }
    // five consequences in one action
    const cust = (await client.query("SELECT * FROM customer WHERE reference=$1", [cert.recipient])).rows[0];
    const lots = (cert.lots || []).map((l) => l.reference);
    const derived = (await client.query("SELECT number FROM certificate WHERE reissue_of=$1", [number])).rows.map((r) => r.number);
    let traversal = { lots: [], certificates: [], recipients: [] };
    const batches = new Set();
    for (const lotRef of lots) {
      const idx = await loadGraph();
      const { batchMass } = ancestorsOfLot(idx, lotRef);
      for (const b of batchMass.keys()) batches.add(b);
    }
    for (const b of batches) {
      const impact = await impactOfBatch(b);
      for (const l of impact.lots) if (!traversal.lots.includes(l.reference)) traversal.lots.push(l.reference);
      for (const crt of impact.certificates) if (!traversal.certificates.includes(crt.number)) traversal.certificates.push(crt.number);
      for (const r of impact.recipients) if (!traversal.recipients.includes(r)) traversal.recipients.push(r);
    }
    const voidStatements = [
      cert.permitted_statement,
      "You may not state that this material physically contains recycled content.",
      "The material named on certificate " + number + " carries " + (Number(cert.content_bp) / 100).toFixed(2) + " per cent recycled content.",
    ];
    await client.query(
      "UPDATE certificate SET state='withdrawn', withdrawn_reason=$2, withdrawn_by=$3, withdrawn_on=$4, withdrawal_notified=$5, derived_certificates=$6 WHERE number=$1",
      [number, body.reason, c.get("session").email, today(),
        JSON.stringify({ recipients: [cust.contact], void_statements: voidStatements, at: new Date().toISOString() }),
        derived]
    );
    await sendMail(cust.contact, "Certificate " + number + " withdrawn",
      "Certificate " + number + " has been withdrawn.\nReason: " + body.reason +
      "\n\nEvery statement this certificate permitted is now void:\n" + voidStatements.map((s) => "  — " + s).join("\n") +
      "\n\nThe document remains readable at https://ravel.example.com/verify/" + number);
    await record(client, {
      act: "certificate_withdrawn", person: c.get("session").email, site: cert.site, object: number,
      detail: {
        reason: body.reason,
        notified_recipients: [cust.contact],
        void_statements: voidStatements,
        derived_certificates: derived,
        batch_traversal: { batches: [...batches], lots: traversal.lots, certificates: traversal.certificates },
      },
    });
    return {
      status: 201,
      body: {
        number,
        state: "withdrawn",
        reason: body.reason,
        withdrawn_by: c.get("session").email,
        withdrawn_on: today(),
        notified_recipients: [cust.contact],
        void_statements: voidStatements,
        derived_certificates: derived,
        batch_traversal: traversal,
      },
    };
  });
});

certs.post("/certificates/:number/reissue", role("certificate_signer"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { keycloakToken } = await import("./lib/auth.mjs");
  const kc = await keycloakToken(c.get("session").email, String(body.password || "")).catch(() => null);
  if (!kc) return c.json({ error: "reauthentication_required" }, 401);
  return withIdempotency(c, "certificate-reissue", body, async (client) => {
    const number = c.req.param("number");
    const cert = (await client.query("SELECT * FROM certificate WHERE number=$1", [number])).rows[0];
    if (!cert) return { status: 404, body: { error: "not_found" } };
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["certseq:" + cert.site]);
    const seq = (await client.query("SELECT last FROM certificate_seq WHERE site=$1 FOR UPDATE", [cert.site])).rows[0];
    const next = Number(seq.last) + 1;
    await client.query("UPDATE certificate_seq SET last=$2 WHERE site=$1", [cert.site, next]);
    const newNumber = "CERT-" + cert.site.replace("SITE-", "") + "-" + String(next).padStart(6, "0");
    await client.query(
      `INSERT INTO certificate (number, version, site, lots, grade, specification_version, claim_type, content_bp, category_split, period,
        carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, signer, signed_at, conditions,
        recipient, recipient_name, state, verification_url, provisional_factor, derived_certificates, input_versions, reissue_of)
       SELECT $2, 1, site, lots, grade, specification_version, claim_type, content_bp, category_split, period,
        carbon, primary_share_bp, scheme, registration, test_results, permitted_statement, prohibited_statement, $3, now(), conditions,
        recipient, recipient_name, 'issued', $4, provisional_factor, derived_certificates, input_versions, $5
       FROM certificate WHERE number=$1`,
      [number, newNumber, c.get("session").email, "https://ravel.example.com/verify/" + newNumber, number]
    );
    await record(client, { act: "certificate_reissued", person: c.get("session").email, site: cert.site, object: newNumber, detail: { of: number } });
    return { status: 201, body: { reference: newNumber, number: newNumber, reissue_of: number, note: "A re-issue produces a new version at a new address rather than new bytes at the old one." } };
  });
});

/* ------------------------------------------------- replay */
certs.get("/certificates/:number/replay", guard(async (c) => {
  const cert = await one("SELECT * FROM certificate WHERE number=$1", [c.req.param("number")]);
  if (!cert) return c.json({ error: "not_found" }, 404);
  const versions = cert.input_versions || {};
  const inputs = [];
  let reproducible = true;
  let reason = null;

  if (versions.method && versions.method.id) {
    const m = await one("SELECT * FROM carbon_method WHERE id=$1 AND version=$2", [versions.method.id, versions.method.version]);
    if (!m) { reproducible = false; reason = "retired carbon method version " + versions.method.id + " v" + versions.method.version; }
    else inputs.push({ input: "carbon_method", version: m.id + " v" + m.version, present: true });
  }
  if (versions.conversion_factor) {
    const cf = await one("SELECT * FROM conversion_factor WHERE reference=$1", [versions.conversion_factor]);
    if (!cf) { reproducible = false; reason = "lost conversion factor " + versions.conversion_factor; }
    else inputs.push({ input: "conversion_factor", version: cf.reference + " @" + cf.factor_bp, present: true });
  }
  if (versions.specification) {
    const sp = await one("SELECT * FROM specification WHERE grade=$1 AND version=$2", [versions.specification.grade, versions.specification.version]);
    if (!sp) { reproducible = false; reason = "retired specification " + versions.specification.grade + " v" + versions.specification.version; }
    else inputs.push({ input: "specification", version: sp.grade + " v" + sp.version, present: true });
  }

  const lotRefs = (cert.lots || []).map((l) => l.reference);
  const recomputedContent = {};
  let differing = null;
  for (const ref of lotRefs) {
    const content = await engine.lotContent(ref);
    recomputedContent[ref] = content.content_bp;
    if (lotRefs.length === 1 && content.content_bp !== Number(cert.content_bp)) {
      differing = { input: "content_bp", issued: Number(cert.content_bp), recomputed: content.content_bp, note: "the ledger allocations moved" };
    }
  }

  let recomputedCarbon = null;
  const figure = await one("SELECT * FROM carbon_figure WHERE id=$1", [cert.carbon]);
  if (figure) {
    recomputedCarbon = figure.cache_valid ? Number(figure.value_mg_per_kg) : null;
    if (figure && !figure.cache_valid && !differing) {
      differing = { input: "emission_factor", issued: Number(figure.value_mg_per_kg), recomputed: null, note: "a cached carbon figure's emission factor was superseded" };
    }
  }

  const agrees = reproducible && !differing;
  return c.json({
    number: cert.number,
    reproducible,
    reason,
    issued: {
      content_bp: Number(cert.content_bp),
      claim_type: cert.claim_type,
      permitted_statement: cert.permitted_statement,
    },
    recomputed: reproducible ? {
      content_bp: recomputedContent,
      claim_type: cert.claim_type,
    } : null,
    agrees,
    differing_input: differing,
    input_versions: inputs,
    note: "It is never recomputed under today's rules and presented as the original.",
  });
}));

/* ------------------------------------------------- public verify (rate limited) */
const verifyBuckets = new Map();
function rateLimited(key, limit = 30, windowMs = 60000) {
  const now = Date.now();
  let b = verifyBuckets.get(key);
  if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; verifyBuckets.set(key, b); }
  b.n += 1;
  return b.n <= limit;
}

certs.get("/verify/:number", async (c) => {
  const ip = c.req.header("x-forwarded-for") || "local";
  if (!rateLimited("verify:" + ip)) return c.json({ error: "rate_limited" }, 429);
  const number = c.req.param("number");
  const cert = await one("SELECT * FROM certificate WHERE number=$1", [number]);
  if (!cert) {
    return c.json({ found: false, number });
  }
  return c.json({
    found: true,
    number: cert.number,
    state: cert.state,
    issued_on: cert.signed_at.toISOString().slice(0, 10),
    withdrawn_on: cert.withdrawn_on || null,
    withdrawal_reason: cert.withdrawn_reason || null,
    site: cert.site,
    grade: cert.grade,
    claim_type: cert.claim_type,
    recipient_name: cert.recipient_name,
  });
});
