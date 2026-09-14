// server/seed.ts
import pg from "pg";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// server/engine/record.ts
import { createHash } from "node:crypto";
var GENESIS = "0".repeat(64);
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value === void 0 ? null : value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
}
function canonicalTimestamp(v) {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return v;
  }
  return JSON.stringify(v ?? null);
}
function digestOf(entry) {
  const h = createHash("sha256");
  h.update(
    canonicalJson([
      canonicalTimestamp(entry.recorded_at) || null,
      entry.person || null,
      entry.site || null,
      entry.object_kind || null,
      entry.object_reference || null,
      entry.act,
      entry.detail === void 0 ? null : JSON.parse(canonicalJson(entry.detail))
    ])
  );
  h.update(entry.prev_digest);
  return h.digest("hex");
}

// server/seed.ts
var here = dirname(fileURLToPath(import.meta.url));
var db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
var schema = readFileSync(join(here, "schema.sql"), "utf8");
var seed = readFileSync(join(here, "seed.sql"), "utf8");
async function main() {
  await db.query(schema);
  const existing = await db.query("SELECT COUNT(*)::int AS n FROM record_entries");
  if (existing.rows[0].n > 0) {
    console.log("seed already applied");
    await db.end();
    return;
  }
  await db.query(seed);
  const acts = [
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "collector", object_reference: "COL-ALDER", act: "collector_approved", detail: { state: "approved", valid_from: "2026-01-01", valid_to: "2026-12-31" }, event_at: "2026-01-01T09:00:00Z", effective_on: "2026-01-01" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "collector", object_reference: "COL-BRINE", act: "collector_approved", detail: { state: "approved", valid_from: "2026-01-01", valid_to: "2026-06-30" }, event_at: "2026-01-01T09:05:00Z", effective_on: "2026-01-01" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "collector", object_reference: "COL-CINDER", act: "collector_approved", detail: { state: "conditional", condition: "Sampling plan for coated streams to be agreed", valid_from: "2026-01-01", valid_to: "2026-12-31" }, event_at: "2026-01-01T09:10:00Z", effective_on: "2026-01-01" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "carbon_method", object_reference: "CM-PA6 v2", act: "carbon_method_published", detail: { standard: "ISO 14067", boundary: "cradle-to-gate", allocation_basis: "mass" }, event_at: "2026-01-20T10:00:00Z", effective_on: "2026-01-20" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "batch", object_reference: "BATCH-1001", act: "batch_booked_in", detail: { collector: "COL-ALDER", category: "post_consumer", net_g: 5e5, dry_mass_g: 45e4, device: "WB-DEMO-01", calibration_valid: true }, event_at: "2026-02-10T08:00:00Z", effective_on: "2026-02-10" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "batch", object_reference: "BATCH-1002", act: "batch_booked_in", detail: { collector: "COL-ALDER", category: "pre_consumer", net_g: 3e5, dry_mass_g: 3e5, device: "WB-DEMO-01", calibration_valid: true }, event_at: "2026-02-12T08:00:00Z", effective_on: "2026-02-12" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "batch", object_reference: "BATCH-1004", act: "batch_booked_in", detail: { collector: "COL-CINDER", category: "pre_consumer", net_g: 12e4, dry_mass_g: 12e4, device: "WB-DEMO-02", calibration_valid: false }, event_at: "2026-02-20T06:30:00Z", effective_on: "2026-02-20" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0001", act: "run_started", detail: { run_type: "dissolution", recipe_version: "RCP-DISS-2" }, event_at: "2026-03-01T08:00:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0001", act: "consumption_recorded", detail: { input: "BATCH-1001", mass_g: 3e5 }, event_at: "2026-03-01T08:10:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0001", act: "consumption_recorded", detail: { input: "BATCH-1002", mass_g: 3e5 }, event_at: "2026-03-01T08:12:00Z", effective_on: "2026-03-01" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "balance_period", object_reference: "BP-DEMO-N6-2026H1", act: "credit_granted", detail: { batch: "BATCH-1001", category: "post_consumer", dry_mass_g: 45e4, factor_bp: 8e3, credit_g: 36e4, movement: "CRM-0001" }, event_at: "2026-03-01T08:15:00Z", effective_on: "2026-03-01" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "balance_period", object_reference: "BP-DEMO-N6-2026H1", act: "credit_granted", detail: { batch: "BATCH-1002", category: "pre_consumer", dry_mass_g: 3e5, factor_bp: 8e3, credit_g: 24e4, movement: "CRM-0002" }, event_at: "2026-03-01T08:16:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0001", act: "output_recorded", detail: { output: "OUT-D-0001", kind: "intermediate", mass_g: 48e4 }, event_at: "2026-03-01T15:00:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0001", act: "run_closed", detail: { mass_in_g: 6e5, mass_out_g: 48e4, losses_g: 12e4, within_tolerance: true }, event_at: "2026-03-01T16:00:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0002", act: "run_started", detail: { run_type: "dissolution", recipe_version: "RCP-DISS-2" }, event_at: "2026-03-01T18:00:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0002", act: "consumption_recorded", detail: { input: "BATCH-1003", mass_g: 19e4, non_claimable: "collector approval lapsed on receipt date" }, event_at: "2026-03-01T18:10:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0002", act: "consumption_recorded", detail: { input: "BATCH-1004", mass_g: 12e4, flags: ["lapsed_calibration"] }, event_at: "2026-03-01T18:12:00Z", effective_on: "2026-03-01" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "balance_period", object_reference: "BP-DEMO-N6-2026H1", act: "credit_granted", detail: { batch: "BATCH-1004", category: "pre_consumer", dry_mass_g: 12e4, factor_bp: 8e3, credit_g: 96e3, movement: "CRM-0003" }, event_at: "2026-03-01T18:15:00Z", effective_on: "2026-03-01" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0002", act: "output_recorded", detail: { output: "OUT-D-0002", kind: "intermediate", mass_g: 25e4 }, event_at: "2026-03-02T01:00:00Z", effective_on: "2026-03-02" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0002", act: "run_closed", detail: { mass_in_g: 31e4, mass_out_g: 25e4, losses_g: 6e4, within_tolerance: true }, event_at: "2026-03-02T02:00:00Z", effective_on: "2026-03-02" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "deviation", object_reference: "DEV-0002", act: "deviation_raised", detail: { reason: "Dissolution yield below expectation on RUN-D-0002.", subjects: ["RUN-D-0002"] }, event_at: "2026-03-02T06:00:00Z", effective_on: "2026-03-02" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "batch", object_reference: "BATCH-1005", act: "batch_booked_in", detail: { collector: "COL-ALDER", category: "post_consumer", net_g: 1e5, dry_mass_g: 1e5, device: "WB-DEMO-01", calibration_valid: true, custody: "missing transport link" }, event_at: "2026-03-02T07:00:00Z", effective_on: "2026-03-02" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0003", act: "run_started", detail: { run_type: "dissolution", recipe_version: "RCP-DISS-2" }, event_at: "2026-03-03T08:00:00Z", effective_on: "2026-03-03" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0003", act: "consumption_recorded", detail: { input: "BATCH-1001", mass_g: 15e4 }, event_at: "2026-03-03T08:10:00Z", effective_on: "2026-03-03" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0003", act: "output_recorded", detail: { output: "OUT-D-0003", kind: "intermediate", mass_g: 12e4 }, event_at: "2026-03-03T13:00:00Z", effective_on: "2026-03-03" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-D-0003", act: "run_closed", detail: { mass_in_g: 15e4, mass_out_g: 12e4, losses_g: 3e4, within_tolerance: true }, event_at: "2026-03-03T14:00:00Z", effective_on: "2026-03-03" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-Y-0001", act: "run_started", detail: { run_type: "depolymerisation", recipe_version: "RCP-DEPO-4" }, event_at: "2026-03-04T06:00:00Z", effective_on: "2026-03-04" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-Y-0001", act: "consumption_recorded", detail: { inputs: ["OUT-D-0001 480000", "OUT-D-0002 250000", "OUT-D-0003 120000"] }, event_at: "2026-03-04T06:10:00Z", effective_on: "2026-03-04" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-Y-0001", act: "output_recorded", detail: { output: "OUT-Y-0001", kind: "intermediate", mass_g: 8e5 }, event_at: "2026-03-04T19:00:00Z", effective_on: "2026-03-04" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-Y-0001", act: "run_closed", detail: { mass_in_g: 85e4, mass_out_g: 8e5, losses_g: 5e4, within_tolerance: true }, event_at: "2026-03-04T20:00:00Z", effective_on: "2026-03-04" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-U-0001", act: "run_started", detail: { run_type: "purification", recipe_version: "RCP-PURI-1" }, event_at: "2026-03-05T06:00:00Z", effective_on: "2026-03-05" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-U-0001", act: "consumption_recorded", detail: { input: "OUT-Y-0001", mass_g: 8e5 }, event_at: "2026-03-05T06:10:00Z", effective_on: "2026-03-05" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "deviation", object_reference: "DEV-0001", act: "deviation_raised", detail: { reason: "Purification column pressure excursion on RUN-U-0001; specification risk on LOT-N6-0002.", subjects: ["RUN-U-0001", "LOT-N6-0002"] }, event_at: "2026-03-05T12:00:00Z", effective_on: "2026-03-05" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-U-0001", act: "output_recorded", detail: { output: "OUT-U-0001", kind: "intermediate", mass_g: 72e4 }, event_at: "2026-03-05T17:00:00Z", effective_on: "2026-03-05" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-U-0001", act: "output_recorded", detail: { output: "OUT-U-0002", kind: "byproduct", mass_g: 4e4, disposition: "sold" }, event_at: "2026-03-05T17:05:00Z", effective_on: "2026-03-05" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-U-0001", act: "run_closed", detail: { mass_in_g: 8e5, mass_out_g: 76e4, losses_g: 4e4, within_tolerance: true }, event_at: "2026-03-05T18:00:00Z", effective_on: "2026-03-05" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-R-0001", act: "run_started", detail: { run_type: "repolymerisation", recipe_version: "RCP-REPO-3" }, event_at: "2026-03-06T06:00:00Z", effective_on: "2026-03-06" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-R-0001", act: "consumption_recorded", detail: { input: "OUT-U-0001", mass_g: 72e4 }, event_at: "2026-03-06T06:10:00Z", effective_on: "2026-03-06" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-R-0001", act: "output_recorded", detail: { output: "LOT-N6-0001", kind: "lot", mass_g: 4e5 }, event_at: "2026-03-06T21:00:00Z", effective_on: "2026-03-06" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-R-0001", act: "output_recorded", detail: { output: "LOT-N6-0002", kind: "lot", mass_g: 3e5 }, event_at: "2026-03-06T21:05:00Z", effective_on: "2026-03-06" },
    { person: "plant@example.com", site: "SITE-DEMO", object_kind: "run", object_reference: "RUN-R-0001", act: "run_closed", detail: { mass_in_g: 72e4, mass_out_g: 7e5, losses_g: 2e4, within_tolerance: true }, event_at: "2026-03-06T22:00:00Z", effective_on: "2026-03-06" },
    { person: "analyst@example.com", site: "SITE-DEMO", object_kind: "test_result", object_reference: "TR-0001", act: "test_result_recorded", detail: { subject: "LOT-N6-0001", property: "relative_viscosity", method: "ISO 307" }, event_at: "2026-03-06T09:00:00Z", effective_on: "2026-03-06" },
    { person: "analyst@example.com", site: "SITE-DEMO", object_kind: "test_result", object_reference: "TR-0002", act: "test_result_recorded", detail: { subject: "LOT-N6-0001", property: "moisture", method: "ISO 15512" }, event_at: "2026-03-06T09:30:00Z", effective_on: "2026-03-06" },
    { person: "analyst@example.com", site: "SITE-DEMO", object_kind: "test_result", object_reference: "TR-0003", act: "test_result_recorded", detail: { subject: "LOT-N6-0001", property: "yellowness_index", method: "ASTM E313" }, event_at: "2026-03-06T10:00:00Z", effective_on: "2026-03-06" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "balance_period", object_reference: "BP-DEMO-N6-2026H1", act: "period_close_refused", detail: { reason: "lot_without_disposition", lots: ["LOT-N6-0001", "LOT-N6-0002"] }, event_at: "2026-03-10T09:00:00Z", effective_on: "2026-03-10" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "lot", object_reference: "LOT-N6-0001", act: "disposition_set", detail: { disposition: "released", note: "disposition set with the analyst separation overridden; see OVR-0001" }, event_at: "2026-03-18T02:00:00Z", effective_on: "2026-03-18" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "override", object_reference: "OVR-0001", act: "override_recorded", detail: { separation: "analyst_not_dispositioner", lot: "LOT-N6-0001", authorised_by: "quality@example.com" }, event_at: "2026-03-18T02:01:00Z", effective_on: "2026-03-18" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "lot", object_reference: "LOT-N6-0002", act: "disposition_set", detail: { disposition: "quarantined" }, event_at: "2026-03-18T02:10:00Z", effective_on: "2026-03-18" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "deviation", object_reference: "DEV-0002", act: "deviation_closed", detail: { outcome: "cause_not_established" }, event_at: "2026-04-01T09:00:00Z", effective_on: "2026-04-01" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "conversion_factor", object_reference: "CF-DEMO-1", act: "conversion_factor_published", detail: { factor_bp: 8e3, derived_in_g: 1e6, derived_out_g: 8e5, window: "2026-01-01 to 2026-03-31" }, event_at: "2026-04-01T10:00:00Z", effective_on: "2026-04-01" },
    { person: "claims@example.com", site: "SITE-PILOT", object_kind: "balance_period", object_reference: "BP-PILOT-N6-2026H1", act: "credit_granted", detail: { category: "post_consumer", dry_mass_g: 2e5, movement: "CRM-0006", note: "fresh credit granted at consumption under the provisional factor of the pilot site" }, event_at: "2026-03-01T07:00:00Z", effective_on: "2026-03-01" },
    { person: "claims@example.com", site: "SITE-PILOT", object_kind: "balance_period", object_reference: "BP-PILOT-N6-2026H1", act: "allocation_made", detail: { lot: "LOT-N6-0003", category: "post_consumer", mass_g: 15e4, movement: "CRM-0007", content_bp: 7500 }, event_at: "2026-03-02T09:00:00Z", effective_on: "2026-03-02" },
    { person: "signer2@example.com", site: "SITE-PILOT", object_kind: "certificate", object_reference: "CERT-PILOT-000001", act: "certificate_signed", detail: { lot: "LOT-N6-0003", recipient: "CUS-HELIOS", claim_type: "mass_balance", content_bp: 7500, provisional_factor: true }, event_at: "2026-03-02T10:00:00Z", effective_on: "2026-03-02" },
    { person: "signer2@example.com", site: "SITE-PILOT", object_kind: "certificate", object_reference: "CERT-PILOT-000002", act: "certificate_signed", detail: { lot: "LOT-N6-0003", recipient: "CUS-VANTA", claim_type: "mass_balance", content_bp: 7500, provisional_factor: true }, event_at: "2026-03-02T11:00:00Z", effective_on: "2026-03-02" },
    { person: "signer2@example.com", site: "SITE-PILOT", object_kind: "certificate", object_reference: "CERT-PILOT-000001", act: "certificate_withdrawn", detail: { reason: "A collector category was corrected after acceptance", notified_recipients: ["CUS-HELIOS"] }, event_at: "2026-04-18T09:00:00Z", effective_on: "2026-04-18" },
    { person: "claims@example.com", site: "SITE-PILOT", object_kind: "restatement", object_reference: "RST-0001", act: "restatement_opened", detail: { period: "BP-PILOT-N6-2026H1", reason: "Suspension of the site certification for SITE-PILOT recorded retrospectively.", certificates: ["CERT-PILOT-000001", "CERT-PILOT-000002"] }, event_at: "2026-04-20T09:00:00Z", effective_on: "2026-04-20" },
    { person: "claims@example.com", site: "SITE-PILOT", object_kind: "restatement", object_reference: "RST-0001", act: "restatement_resolved", detail: { certificate: "CERT-PILOT-000001", outcome: "withdrawn" }, event_at: "2026-04-21T09:00:00Z", effective_on: "2026-04-21" },
    { person: "quality@example.com", site: "SITE-PILOT", object_kind: "site", object_reference: "SITE-PILOT", act: "site_certification_recorded", detail: { state: "suspended", effective_from: "2026-04-01", effective_to: "2026-05-31", reason: "Documentation gap in the collector approval file" }, event_at: "2026-04-20T08:00:00Z", effective_on: "2026-04-01" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "transfer", object_reference: "TRF-0001", act: "transfer_made", detail: { from: "BP-PILOT-N6-2026H1", to: "BP-DEMO-N6-2026H1", mass_g: 5e4, category: "post_consumer" }, event_at: "2026-05-12T09:00:00Z", effective_on: "2026-05-12" },
    { person: "claims@example.com", site: "SITE-DEMO", object_kind: "balance_period", object_reference: "BP-DEMO-N6-2026H1", act: "allocation_refused", detail: { lot: "LOT-N6-0001", category: "post_consumer", requested_g: 4e5, available_g: 41e4 }, event_at: "2026-05-20T10:00:00Z", effective_on: "2026-05-20" },
    { person: "auditor@example.com", site: "SITE-DEMO", object_kind: "inbound_record", object_reference: "INB-0001", act: "inbound_record_kept_verbatim", detail: { source: "weighbridge", bytes: 116 }, event_at: "2026-02-20T06:14:00Z", effective_on: "2026-02-20" },
    { person: "auditor@example.com", site: "SITE-DEMO", object_kind: "inbound_record", object_reference: "INB-0002", act: "inbound_record_kept_verbatim", detail: { source: "control_system", bytes: 82 }, event_at: "2026-03-04T22:41:00Z", effective_on: "2026-03-04" },
    { person: "auditor@example.com", site: "SITE-DEMO", object_kind: "inbound_record", object_reference: "INB-0003", act: "inbound_record_kept_verbatim", detail: { source: "laboratory", bytes: 130 }, event_at: "2026-03-06T09:02:00Z", effective_on: "2026-03-06" },
    { person: "quality@example.com", site: "SITE-PILOT", object_kind: "record_entry", object_reference: "47", act: "legal_hold_placed", detail: { hold: "HLD-0001", note: "Hold on the signing of CERT-PILOT-000001" }, event_at: "2026-04-19T08:00:00Z", effective_on: "2026-04-19" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "finding", object_reference: "FND-0001", act: "collector_finding_raised", detail: { collector: "COL-CINDER", batch: "BATCH-1004", departure_bp: 800 }, event_at: "2026-03-01T09:00:00Z", effective_on: "2026-03-01" },
    { person: "quality@example.com", site: "SITE-DEMO", object_kind: "batch", object_reference: "BATCH-1003", act: "batch_booked_in", detail: { collector: "COL-BRINE", category: "post_consumer", net_g: 2e5, dry_mass_g: 19e4, device: "WB-DEMO-01", calibration_valid: true, claimable: false, reason: "collector_approval_lapsed" }, event_at: "2026-07-05T08:00:00Z", effective_on: "2026-07-05" }
  ];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(918273645)");
    let prev = "0".repeat(64);
    for (const a of acts) {
      const recordedAt = a.event_at;
      const digest = digestOf({ recorded_at: recordedAt, person: a.person, site: a.site, object_kind: a.object_kind, object_reference: a.object_reference, act: a.act, detail: a.detail, prev_digest: prev });
      const r = await client.query(
        `INSERT INTO record_entries (recorded_at,event_at,effective_on,person,site,object_kind,object_reference,act,detail,digest,prev_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING seq`,
        [recordedAt, a.event_at, a.effective_on || null, a.person, a.site, a.object_kind, a.object_reference, a.act, JSON.stringify(a.detail), digest, prev]
      );
      if (a.act === "certificate_signed" && a.object_reference === "CERT-PILOT-000001") {
        await client.query(`INSERT INTO legal_holds (reference,seq,placed_by,placed_on) VALUES ('HLD-0001',$1,'quality@example.com','2026-04-19')`, [r.rows[0].seq]);
        await client.query("UPDATE record_entries SET legal_hold=true WHERE seq=$1", [r.rows[0].seq]);
      }
      prev = digest;
    }
    const signing = await client.query(`SELECT seq FROM record_entries WHERE act='certificate_signed' AND object_reference='CERT-PILOT-000001'`);
    if (signing.rows[0]) {
      await client.query(`UPDATE legal_holds SET seq=$1 WHERE reference='HLD-0001'`, [signing.rows[0].seq]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  console.log(`seeded ${acts.length} record entries`);
  await db.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
