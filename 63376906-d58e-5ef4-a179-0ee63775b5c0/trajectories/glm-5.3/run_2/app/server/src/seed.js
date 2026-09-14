// The exact rows seeded on first start. Every act is written to the record in
// the order it happened, each carrying seq from 1, a digest and a prev_digest,
// with the first entry's prev_digest the sixty-four-character string of zeroes.
import { q, one, withTx } from "./db.js";
import { record, seal, GENESIS } from "./record.js";
import { dryMassG, creditGrantedG } from "./arithmetic.js";

const CAPACITY_BASIS = "8000 hours per year, 0.90 availability, 0.80 yield";

function d(iso) {
  return iso;
}

function ts(iso) {
  return iso;
}

export async function seedIfEmpty() {
  // Reference data is one unit with the operational seed: if either has run,
  // neither runs again, because a half-seeded database is the failure mode.
  const existing = await one(`select count(*)::int as n from sites`);
  const anyOperational = (await one(`select count(*)::int n from record_entries`)).n > 0;
  if ((existing && existing.n > 0) || anyOperational) return false;

  // --- sites
  await q(
    `insert into sites(reference, name, confidence, nameplate_kg, contracted_kg, capacity_basis, certification_state, last_revised)
     values
     ('SITE-PILOT','Pilot','commissioned',40000,24000,$1,'certified','2026-06-30'),
     ('SITE-DEMO','Demonstration','commissioned',400000,320000,$1,'certified','2026-06-30'),
     ('SITE-COMM','Commercial','planned',25000000,26000000,$1,'not_certified','2026-06-30')
     on conflict do nothing`,
    [CAPACITY_BASIS]
  );
  await q(
    `insert into site_certifications(site, state, effective_from, effective_to) values
     ('SITE-PILOT','certified','2025-01-01','2030-12-31'),
     ('SITE-DEMO','certified','2025-01-01','2030-12-31'),
     ('SITE-COMM','not_certified','2025-01-01','2030-12-31')
     on conflict do nothing`
  );

  // --- parties
  await q(
    `insert into parties(reference, kind, country, registration, registration_expiry, contact_email, application, industry, collection_site_types, declared_streams, scheme_status, current_name) values
     ('COL-ALDER','collector','PT','WCR-PT-4471','2027-03-31',null,null,null,$1,$2,'certified','Alder Reclaim'),
     ('COL-BRINE','collector','NL','WCR-NL-2208','2027-01-31',null,null,null,$3,$4,'certified','Brine Circular Materials'),
     ('COL-CINDER','collector','FR','WCR-FR-6613','2026-12-31',null,null,null,$5,$6,'conditional','Cinder Industrial Offcuts'),
     ('CUS-HELIOS','customer',null,null,null,'helios@example.com','technical apparel yarn','textiles','[]','[]',null,'Helios Filaments'),
     ('CUS-VANTA','customer',null,null,null,'vanta@example.com','airbag fabric','automotive','[]','[]',null,'Vanta Technical Weaves'),
     ('RAVEL','producer',null,null,null,null,null,null,'[]','[]',null,'Ravel Materials SAS')
     on conflict do nothing`,
    [
      JSON.stringify(["kerbside", "retail take-back"]),
      JSON.stringify(["nets", "carpet", "offcuts"]),
      JSON.stringify(["industrial", "municipal"]),
      JSON.stringify(["nets", "textile"]),
      JSON.stringify(["factory offcut"]),
      JSON.stringify(["offcuts", "coated fabric"]),
    ]
  );

  await q(
    `insert into party_versions(party, name, effective_from) values
     ('COL-ALDER','Alder Reclaim','2026-01-01'),
     ('COL-BRINE','Brine Textile Recovery','2026-01-01'),
     ('COL-BRINE','Brine Circular Materials','2026-08-01'),
     ('COL-CINDER','Cinder Industrial Offcuts','2026-01-01'),
     ('CUS-HELIOS','Helios Filaments','2026-01-01'),
     ('CUS-VANTA','Vanta Technical Weaves','2026-01-01'),
     ('RAVEL','Ravel Materials SAS','2026-01-01')`
  );

  // --- approval periods
  await q(
    `insert into approval_periods(collector, state, valid_from, valid_to, condition, condition_closes_on, created_by) values
     ('COL-ALDER','approved','2026-01-01','2026-12-31',null,null,'quality@example.com'),
     ('COL-BRINE','approved','2026-01-01','2026-06-30',null,null,'quality@example.com'),
     ('COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31','quality@example.com')`
  );

  // --- devices
  await q(
    `insert into devices(reference, site, calibrated_on) values
     ('WB-DEMO-01','SITE-DEMO','2026-05-01'),
     ('WB-DEMO-02','SITE-DEMO','2025-02-01')
     on conflict do nothing`
  );

  // --- findings
  await q(
    `insert into findings(collector, approval_period, raised_on, basis, departure_bp, detail, state, review_date)
     values('COL-CINDER', (select max(id) from approval_periods where collector='COL-CINDER'), '2026-03-06','sampled_composition',800,'Declared PA6 fraction 9900 basis points; measured 9100 basis points. Departure of 800 basis points stands against the collector.','open','2026-09-06')`
  );

  // --- balance periods
  const bp = await q(
    `insert into balance_periods(label, site, grade, period_from, period_to, state, carry_over_limit_bp, allocation_basis, closed_on, closed_by, cut_off, carried_forward, expired) values
     ('BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'mass','2026-01-15','claims@example.com','2026-01-10','{"post_consumer":180000,"pre_consumer":60000}','{"post_consumer":0,"pre_consumer":0}'),
     ('BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,'mass',null,null,null,'{}','{}'),
     ('BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,'mass',null,null,null,'{}','{}')
     returning id, label`
  );
  const bpId = Object.fromEntries(bp.map((r) => [r.label, r.id]));

  // --- conversion factors
  await q(
    `insert into conversion_factors(reference, site, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on) values
     ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-02'),
     ('CF-PILOT-1','SITE-PILOT',7500,null,null,0,0,true,'claims@example.com','2026-01-05')
     on conflict do nothing`
  );

  // --- carbon method
  await q(`insert into carbon_methods(reference, current_version) values('CM-PA6',2) on conflict do nothing`);
  await q(
    `insert into carbon_method_versions(method, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, primary_threshold_bp, data_quality, emission_factors, superseded, published_by) values
     ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-06-14',5000,$1,$2,true,'quality@example.com'),
     ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',5000,$3,$4,false,'quality@example.com')`,
    [
      JSON.stringify([
        { rule: "Primary data required for process energy", threshold_bp: 5000 },
        { rule: "Emission factors no older than three years", years: 3 },
      ]),
      JSON.stringify([
        { line: "process_energy", source: "EcoBase 2024", year: 2024 },
        { line: "reagents", source: "Supplier EPD 2024", year: 2024 },
      ]),
      JSON.stringify([
        { rule: "Primary share at or above 5000 basis points", threshold_bp: 5000 },
        { rule: "Emission factors no older than three years", years: 3 },
        { rule: "Supplier-specific factors verified annually", years: 1 },
      ]),
      JSON.stringify([
        { line: "collection_and_transport", source: "Ravel fleet records", year: 2026 },
        { line: "process_energy", source: "Ravel meter data", year: 2026 },
        { line: "reagents", source: "Supplier EPD 2026", year: 2026 },
        { line: "water_and_effluent", source: "Site permits", year: 2026 },
        { line: "waste_and_residues", source: "EcoBase 2025", year: 2025 },
        { line: "outbound_transport", source: "EcoBase 2025", year: 2025 },
        { line: "byproduct_credit", source: "Ravel allocation", year: 2026 },
      ]),
    ]
  );

  // --- energy instruments
  await q(
    `insert into energy_instruments(reference, quantity_kwh, vintage, region, state) values
     ('EAC-2026-0007',250000,'2026','EU-27','retired'),
     ('EAC-2025-0031',100000,'2025','EU-27','held')
     on conflict do nothing`
  );
  await q(
    `insert into energy_retirements(instrument, period, applied_kwh) values('EAC-2026-0007',$1,250000)`,
    [bpId["BP-DEMO-N6-2026H1"]]
  );

  return true;
}

// Batches, runs, outputs, lots, ledger, deviations, overrides, certificates,
// inbound records, transfer and record entries. Every act is an entry.
const FULL_CUSTODY = (received_on, collector) => [
  { kind: "collection_site", date: received_on, party: collector },
  { kind: "collector", date: received_on, party: collector },
  { kind: "transport", date: received_on, party: "Haulier Nord" },
  { kind: "arrival", date: received_on, party: "Ravel Demonstration" },
  { kind: "weighing", date: received_on, party: "Ravel Demonstration" },
  { kind: "acceptance", date: received_on, party: "Ravel Demonstration" },
];

function custodyWithout(received_on, collector, missing) {
  return FULL_CUSTODY(received_on, collector).filter((l) => l.kind !== missing);
}

export async function seedOperational() {
  // Everything the seed writes is one unit: if any of it is present, the seed
  // has run, and a partially-present state is not re-seeded.
  const anyRuns = (await one(`select count(*)::int n from runs`)).n > 0;
  const anyBatches = (await one(`select count(*)::int n from batches`)).n > 0;
  const anyMovements = (await one(`select count(*)::int n from credit_movements`)).n > 0;
  const anyEntries = (await one(`select count(*)::int n from record_entries`)).n > 0;
  if (anyRuns || anyBatches || anyMovements || anyEntries) return false;
  const bpRows = await q(`select id, label from balance_periods order by id`);
  if (!bpRows.length) throw new Error("seedIfEmpty must run before seedOperational");
  const bpId = Object.fromEntries(bpRows.map((r) => [r.label, r.id]));
  const demoPeriod = bpId["BP-DEMO-N6-2026H1"];
  const pilotPeriod = bpId["BP-PILOT-N6-2026H1"];

  // --- batches, exactly as the tables fix them
  const batchDefs = [
    {
      reference: "BATCH-1001", collector: "COL-ALDER", category: "post_consumer",
      received_on: "2026-02-10", gross_g: 512000, tare_g: 12000, net_g: 500000,
      moisture_bp: 1000, device: "WB-DEMO-01", moisture_method: "ISO 15512",
      composition: [{ polymer: "PA6", fraction_bp: 9200, basis: "sampled", measured_fraction_bp: 9200, elastane_bp: 400 }],
      contamination: { non_nylon_bp: 300, elastane_bp: 400, coatings: "none", colour_load: "medium", foreign_matter: "traces" },
      custody: FULL_CUSTODY("2026-02-10", "COL-ALDER"),
      collector_name: "Alder Reclaim",
    },
    {
      reference: "BATCH-1002", collector: "COL-ALDER", category: "pre_consumer",
      received_on: "2026-02-12", gross_g: 312000, tare_g: 12000, net_g: 300000,
      moisture_bp: 0, device: "WB-DEMO-01", moisture_method: "ISO 15512",
      composition: [{ polymer: "PA6", fraction_bp: 9600, basis: "sampled", measured_fraction_bp: 9600, elastane_bp: 200 }],
      contamination: { non_nylon_bp: 200, elastane_bp: 200, coatings: "none", colour_load: "low", foreign_matter: "none" },
      custody: FULL_CUSTODY("2026-02-12", "COL-ALDER"),
      collector_name: "Alder Reclaim",
    },
    {
      reference: "BATCH-1003", collector: "COL-BRINE", category: "post_consumer",
      received_on: "2026-07-05", gross_g: 216000, tare_g: 16000, net_g: 200000,
      moisture_bp: 500, device: "WB-DEMO-01", moisture_method: "ISO 15512",
      composition: [{ polymer: "PA6", fraction_bp: 8800, basis: "sampled", measured_fraction_bp: 8800, elastane_bp: 600 }],
      contamination: { non_nylon_bp: 600, elastane_bp: 600, coatings: "traces", colour_load: "high", foreign_matter: "present" },
      custody: FULL_CUSTODY("2026-07-05", "COL-BRINE"),
      collector_name: "Brine Textile Recovery",
    },
    {
      reference: "BATCH-1004", collector: "COL-CINDER", category: "pre_consumer",
      received_on: "2026-02-20", gross_g: 132000, tare_g: 12000, net_g: 120000,
      moisture_bp: 0, device: "WB-DEMO-02", moisture_method: "ISO 15512",
      composition: [{ polymer: "PA6", fraction_bp: 9900, basis: "declared", measured_fraction_bp: 9100, elastane_bp: 100 }],
      contamination: { non_nylon_bp: 800, elastane_bp: 100, coatings: "present", colour_load: "low", foreign_matter: "none" },
      custody: FULL_CUSTODY("2026-02-20", "COL-CINDER"),
      collector_name: "Cinder Industrial Offcuts",
    },
    {
      reference: "BATCH-1005", collector: "COL-ALDER", category: "post_consumer",
      received_on: "2026-03-02", gross_g: 111000, tare_g: 11000, net_g: 100000,
      moisture_bp: 0, device: "WB-DEMO-01", moisture_method: "ISO 15512",
      composition: [{ polymer: "PA6", fraction_bp: 9400, basis: "sampled", measured_fraction_bp: 9400, elastane_bp: 300 }],
      contamination: { non_nylon_bp: 300, elastane_bp: 300, coatings: "none", colour_load: "medium", foreign_matter: "traces" },
      custody: custodyWithout("2026-03-02", "COL-ALDER", "transport"),
      collector_name: "Alder Reclaim",
    },
  ];

  for (const b of batchDefs) {
    const dry = dryMassG(b.net_g, b.moisture_bp);
    await q(
      `insert into batches(reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on, composition, contamination, custody, accepted_g, rejected_g, rejected_destination, status, effective_on, collector_name_at_receipt)
       values($1,$2,'SITE-DEMO','N6',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,0,null,'accepted',$10,$15)`,
      [
        b.reference, b.collector, b.category, b.gross_g, b.tare_g, b.net_g,
        b.moisture_bp, b.moisture_method, b.device, b.received_on,
        JSON.stringify(b.composition), JSON.stringify(b.contamination),
        JSON.stringify(b.custody), b.net_g, b.collector_name,
      ]
    );
    await q(
      `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at)
       values('batch_booked_in','plant@example.com','SITE-DEMO',$1,'act',$2,$3,$4)`,
      [
        b.reference,
        JSON.stringify({ reference: b.reference, collector: b.collector, category: b.category, net_g: b.net_g, moisture_bp: b.moisture_bp, device: b.device, dry_mass_g: dry }),
        b.received_on,
        b.received_on + "T08:15:00Z",
      ]
    );
  }

  // --- runs, consumptions, outputs
  await seedOperationalTail(demoPeriod, pilotPeriod);
  return true;
}

async function seedOperationalTail(demoPeriod, pilotPeriod) {
  const runDefs = [
    {
      reference: "RUN-D-0001", run_type: "dissolution", recipe: "RCP-DISS-2",
      started_at: "2026-02-15T06:00:00Z", closed_at: "2026-02-15T14:00:00Z",
      consumptions: [
        { type: "batch", ref: "BATCH-1001", mass: 300000, event_at: "2026-02-15T06:30:00Z", effective_on: "2026-02-15" },
        { type: "batch", ref: "BATCH-1002", mass: 300000, event_at: "2026-02-15T06:45:00Z", effective_on: "2026-02-15" },
      ],
      outputs: [{ reference: "OUT-D-0001", kind: "intermediate", mass: 480000 }],
      losses: 120000,
      set_points: { temperature_c: 165, pressure_bar: 3, residence_min: 60 },
      within_tolerance: true,
    },
    {
      reference: "RUN-D-0002", run_type: "dissolution", recipe: "RCP-DISS-2",
      started_at: "2026-02-22T06:00:00Z", closed_at: "2026-02-22T13:00:00Z",
      consumptions: [
        { type: "batch", ref: "BATCH-1003", mass: 190000, event_at: "2026-02-22T06:30:00Z", effective_on: "2026-02-22" },
        { type: "batch", ref: "BATCH-1004", mass: 120000, event_at: "2026-02-22T06:50:00Z", effective_on: "2026-02-22" },
      ],
      outputs: [{ reference: "OUT-D-0002", kind: "intermediate", mass: 250000 }],
      losses: 60000,
      set_points: { temperature_c: 166, pressure_bar: 3, residence_min: 61 },
      within_tolerance: true,
    },
    {
      reference: "RUN-D-0003", run_type: "dissolution", recipe: "RCP-DISS-2",
      started_at: "2026-03-01T06:00:00Z", closed_at: "2026-03-01T12:00:00Z",
      consumptions: [
        { type: "batch", ref: "BATCH-1001", mass: 150000, event_at: "2026-03-01T06:30:00Z", effective_on: "2026-03-01" },
      ],
      outputs: [{ reference: "OUT-D-0003", kind: "intermediate", mass: 120000 }],
      losses: 30000,
      set_points: { temperature_c: 163, pressure_bar: 2, residence_min: 58 },
      within_tolerance: true,
    },
    {
      reference: "RUN-Y-0001", run_type: "depolymerisation", recipe: "RCP-DEPO-4",
      started_at: "2026-03-05T06:00:00Z", closed_at: "2026-03-05T18:00:00Z",
      consumptions: [
        { type: "output", ref: "OUT-D-0001", mass: 480000, event_at: "2026-03-05T07:00:00Z", effective_on: "2026-03-05" },
        { type: "output", ref: "OUT-D-0002", mass: 250000, event_at: "2026-03-05T07:20:00Z", effective_on: "2026-03-05" },
        { type: "output", ref: "OUT-D-0003", mass: 120000, event_at: "2026-03-05T07:40:00Z", effective_on: "2026-03-05" },
      ],
      outputs: [{ reference: "OUT-Y-0001", kind: "intermediate", mass: 800000 }],
      losses: 50000,
      set_points: { temperature_c: 250, pressure_bar: 2 },
      within_tolerance: true,
    },
    {
      reference: "RUN-U-0001", run_type: "purification", recipe: "RCP-PURI-1",
      started_at: "2026-03-08T06:00:00Z", closed_at: "2026-03-08T16:00:00Z",
      consumptions: [
        { type: "output", ref: "OUT-Y-0001", mass: 800000, event_at: "2026-03-08T07:00:00Z", effective_on: "2026-03-08" },
      ],
      outputs: [
        { reference: "OUT-U-0001", kind: "intermediate", mass: 720000 },
        { reference: "OUT-U-0002", kind: "byproduct", mass: 40000, disposition: "sold" },
      ],
      losses: 40000,
      set_points: { temperature_c: 190, pressure_bar: 1 },
      within_tolerance: true,
    },
    {
      reference: "RUN-R-0001", run_type: "repolymerisation", recipe: "RCP-REPO-3",
      started_at: "2026-03-12T06:00:00Z", closed_at: "2026-03-12T20:00:00Z",
      consumptions: [
        { type: "output", ref: "OUT-U-0001", mass: 720000, event_at: "2026-03-12T07:00:00Z", effective_on: "2026-03-12" },
      ],
      outputs: [
        { reference: "LOT-N6-0001", kind: "lot", mass: 400000, lot: "LOT-N6-0001" },
        { reference: "LOT-N6-0002", kind: "lot", mass: 300000, lot: "LOT-N6-0002" },
      ],
      losses: 20000,
      set_points: { temperature_c: 260, pressure_bar: 6 },
      within_tolerance: true,
    },
  ];

  for (const r of runDefs) {
    await q(
      `insert into runs(reference, run_type, site, equipment, recipe_version, operator, started_at, closed_at, losses_g, actual_set_points, within_tolerance)
       values($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,$7,$8,$9)`,
      [r.reference, r.run_type, "EQ-" + r.reference, r.recipe, r.started_at, r.closed_at, r.losses, JSON.stringify(r.set_points), r.within_tolerance]
    );
    for (const c of r.consumptions) {
      await q(
        `insert into consumptions(run, input_type, input_reference, mass_g, event_at, effective_on, period)
         values($1,$2,$3,$4,$5,$6,$7)`,
        [r.reference, c.type, c.ref, c.mass, c.event_at, c.effective_on, demoPeriod]
      );
    }
    for (const o of r.outputs) {
      await q(
        `insert into outputs(reference, run, kind, mass_g, disposition, lot)
         values($1,$2,$3,$4,$5,$6)`,
        [o.reference, r.reference, o.kind, o.mass, o.disposition || null, o.lot || null]
      );
    }
    await q(
      `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at)
       values('run_started','plant@example.com','SITE-DEMO',$1,'act',$2,$3,$4)`,
      [r.reference, JSON.stringify({ reference: r.reference, run_type: r.run_type, recipe_version: r.recipe, started_at: r.started_at }), r.started_at.slice(0, 10), r.started_at]
    );
    await q(
      `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at)
       values('run_closed','plant@example.com','SITE-DEMO',$1,'act',$2,$3,$4)`,
      [r.reference, JSON.stringify({ reference: r.reference, losses_g: r.losses, within_tolerance: r.within_tolerance }), r.closed_at.slice(0, 10), r.closed_at]
    );
  }

  // --- lots
  await q(
    `insert into lots(reference, grade, site, mass_g, disposition, claim_type, produced_at, provisional_factor, period)
     values
     ('LOT-N6-0001','N6','SITE-DEMO',400000,'released','mass_balance','2026-03-12T20:00:00Z',false,$1),
     ('LOT-N6-0002','N6','SITE-DEMO',300000,'quarantined','mass_balance','2026-03-12T20:00:00Z',false,$1),
     ('LOT-N6-0003','N6','SITE-PILOT',200000,'released','mass_balance','2026-02-25T16:00:00Z',true,$2)`,
    [demoPeriod, pilotPeriod]
  );

  // --- ledger: credits enter when a claimable batch is consumed, in dry mass
  // times the site's conversion factor, floored. The seeded consumptions carry
  // the dry mass consumed, so the credits below are exactly the table's.
  const factorDemo = 8000;
  const grantedPerRun = [
    { run: "RUN-D-0001", batch: "BATCH-1001", dry: 300000, credit: 240000, category: "post_consumer", effective_on: "2026-02-15", event_at: "2026-02-15T06:30:00Z" },
    { run: "RUN-D-0001", batch: "BATCH-1002", dry: 300000, credit: 240000, category: "pre_consumer", effective_on: "2026-02-15", event_at: "2026-02-15T06:45:00Z" },
    { run: "RUN-D-0002", batch: "BATCH-1003", dry: 190000, credit: 0, mass: 190000, category: "non_claimable", effective_on: "2026-02-22", event_at: "2026-02-22T06:30:00Z" },
    { run: "RUN-D-0002", batch: "BATCH-1004", dry: 120000, credit: 96000, category: "pre_consumer", effective_on: "2026-02-22", event_at: "2026-02-22T06:50:00Z" },
    { run: "RUN-D-0003", batch: "BATCH-1001", dry: 150000, credit: 120000, category: "post_consumer", effective_on: "2026-03-01", event_at: "2026-03-01T06:30:00Z" },
  ];
  for (const m of grantedPerRun) {
    await q(
      `insert into credit_movements(period, kind, category, mass_g, reference, fresh_credit, effective_on, event_at)
       values($1,'in',$2,$3,$4,$5,$6,$7)`,
      [demoPeriod, m.category, m.mass !== undefined ? m.mass : m.credit, m.batch, m.credit > 0, m.effective_on, m.event_at]
    );
    await q(
      `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at)
       values('consumption_recorded','plant@example.com','SITE-DEMO',$1,'act',$2,$3,$4)`,
      [m.run, JSON.stringify({ run: m.run, input: m.batch, dry_mass_g: m.dry, credit_g: m.credit, category: m.category, factor_reference: "CF-DEMO-1", derivation: "dry_mass_g * factor_bp / 10000, floored" }), m.effective_on, m.event_at]
    );
  }

  // --- transfer TRF-0001: 50000 g post-consumer from pilot to demo. The
  // receiving ledger records an inbound credit naming SITE-PILOT as its origin;
  // it is never a fresh credit, and the total credit across the two periods is
  // unchanged by the journey, so the pilot period keeps the credit it granted.
  await q(
    `insert into transfers(reference, from_period, to_period, mass_g, category, effective_on, created_by)
     values('TRF-0001',$1,$2,50000,'post_consumer','2026-05-12','claims@example.com')`,
    [pilotPeriod, demoPeriod]
  );
  await q(
    `insert into credit_movements(period, kind, category, mass_g, reference, origin_site, movement, fresh_credit, effective_on, event_at)
     values($1,'in','post_consumer',50000,'TRF-0001','SITE-PILOT','TRF-0001',false,'2026-05-12','2026-05-12T09:00:00Z')`,
    [demoPeriod]
  );

  // --- deviations, overrides
  await q(
    `insert into deviations(reference, raised_by, description, affects_runs, affects_lots, state, outcome, raised_at, closed_at) values
     ('DEV-0001','quality@example.com','Colour carry-over above action limit in the purification stage.', $1, $2, 'open', null, '2026-03-10T11:00:00Z', null),
     ('DEV-0002','quality@example.com','Dissolution pressure excursion outside tolerance recorded on RUN-D-0002.', $3, '[]', 'closed', 'cause_not_established', '2026-02-23T08:00:00Z', '2026-03-02T15:00:00Z')`,
    [JSON.stringify(["RUN-U-0001"]), JSON.stringify(["LOT-N6-0002"]), JSON.stringify(["RUN-D-0002"])]
  );
  await q(
    `insert into overrides(reference, separation, reason, lot, authorised_by, authorised_on, reviewed) values
     ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site.','LOT-N6-0001','quality@example.com','2026-03-18',false)`
  );
  await q(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at) values
     ('deviation_raised','quality@example.com','SITE-DEMO','DEV-0001','act',$1,'2026-03-10','2026-03-10T11:00:00Z'),
     ('deviation_closed','quality@example.com','SITE-DEMO','DEV-0002','act',$2,'2026-03-02','2026-03-02T15:00:00Z'),
     ('override_recorded','quality@example.com','SITE-DEMO','OVR-0001','act',$3,'2026-03-18','2026-03-18T09:00:00Z')`,
    [
      JSON.stringify({ reference: "DEV-0001", affects_runs: ["RUN-U-0001"], affects_lots: ["LOT-N6-0002"] }),
      JSON.stringify({ reference: "DEV-0002", outcome: "cause_not_established" }),
      JSON.stringify({ reference: "OVR-0001", separation: "analyst_not_dispositioner", lot: "LOT-N6-0001", authorised_by: "quality@example.com" }),
    ]
  );

  // --- test results, carbon figure
  await q(
    `insert into test_results(reference, subject_type, subject, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release) values
     ('TR-0001','lot','LOT-N6-0001','relative_viscosity','ISO 307','VISC-2','analyst@example.com','2.46','ratio',400,false,true),
     ('TR-0002','lot','LOT-N6-0001','moisture','ISO 15512','KF-1','analyst@example.com','0.06','percent',200,false,true),
     ('TR-0003','lot','LOT-N6-0002','relative_viscosity','ISO 307','VISC-2','analyst@example.com','2.38','ratio',400,false,true)`
  );
  await q(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at) values
     ('test_result_entered','analyst@example.com','SITE-DEMO','TR-0001','act',$1,'2026-03-14','2026-03-14T10:02:00Z'),
     ('test_result_entered','analyst@example.com','SITE-DEMO','TR-0002','act',$2,'2026-03-14','2026-03-14T10:40:00Z'),
     ('test_result_entered','analyst@example.com','SITE-DEMO','TR-0003','act',$3,'2026-03-14','2026-03-14T11:15:00Z')`,
    [
      JSON.stringify({ reference: "TR-0001", subject: "LOT-N6-0001", property: "relative_viscosity", method: "ISO 307", value: "2.46", unit: "ratio", uncertainty_bp: 400 }),
      JSON.stringify({ reference: "TR-0002", subject: "LOT-N6-0001", property: "moisture", method: "ISO 15512", value: "0.06", unit: "percent", uncertainty_bp: 200 }),
      JSON.stringify({ reference: "TR-0003", subject: "LOT-N6-0002", property: "relative_viscosity", method: "ISO 307", value: "2.38", unit: "ratio", uncertainty_bp: 400 }),
    ]
  );

  const breakdown = [
    { line: "collection_and_transport", mg_per_kg: 310000, tag: "primary" },
    { line: "process_energy", mg_per_kg: 1850000, tag: "primary" },
    { line: "reagents", mg_per_kg: 1180000, tag: "supplier_specific" },
    { line: "water_and_effluent", mg_per_kg: 240000, tag: "primary" },
    { line: "waste_and_residues", mg_per_kg: 330000, tag: "secondary" },
    { line: "outbound_transport", mg_per_kg: 410000, tag: "secondary" },
    { line: "byproduct_credit", mg_per_kg: -60000, tag: "primary" },
  ];
  const figure = await one(
    `insert into carbon_figures(lot, version, value_mg_per_kg, boundary, method_version, uncertainty_bp, primary_share_bp, comparator, breakdown,
      energy_location_mg_per_kg, energy_market_mg_per_kg, metered_kwh, retired_kwh, unmatched_kwh, input_versions, cache_valid, computed_by, computed_at)
     values('LOT-N6-0001',1,4260000,'cradle-to-gate',2,1200,6500,$1,$2,1850000,620000,300000,250000,50000,$3,true,'quality@example.com','2026-04-02T10:00:00Z')
     returning id`,
    [
      JSON.stringify({ material: "virgin PA6", dataset: "EcoBase 2025", dataset_year: 2025, region: "EU-27" }),
      JSON.stringify(breakdown),
      JSON.stringify({
        carbon_method: "CM-PA6",
        method_version: 2,
        conversion_factor: "CF-DEMO-1",
        specification: "SPEC-N6",
        version: 3,
        energy_instruments: ["EAC-2026-0007"],
        recipes: ["RCP-DISS-2", "RCP-DEPO-4", "RCP-PURI-1", "RCP-REPO-3"],
        tests: ["TR-0001", "TR-0002"],
      }),
    ]
  );

  // --- specifications
  await q(
    `insert into specifications(reference, version, grade, issued_on, superseded, virgin_reference, rows) values
     ('SPEC-N6',2,'N6','2025-08-01',true,$1,$2),
     ('SPEC-N6',3,'N6','2026-02-01',false,$1,$2)`,
    [
      JSON.stringify({
        reference: "virgin PA6 at relative viscosity 2.42",
        source: "EcoBase 2025",
        dated: "2025-11-30",
      }),
      JSON.stringify([
        { property: "relative_viscosity", method: "ISO 307", limit: "2.40", unit: "ratio", basis: "guaranteed" },
        { property: "moisture", method: "ISO 15512", limit: "0.10", unit: "percent", basis: "guaranteed" },
        { property: "yellowness_index", method: "ASTM E313", limit: "8.0", unit: "index", basis: "typical" },
        { property: "ash_content", method: "ISO 3451-1", limit: "0.30", unit: "percent", basis: "informational" },
      ]),
    ]
  );
  await q(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at) values
     ('specification_issued','quality@example.com',null,'SPEC-N6','act',$1,'2026-02-01','2026-02-01T09:00:00Z')`,
    [JSON.stringify({ specification: "SPEC-N6", version: 3, issued_to: ["CUS-HELIOS"], issued_on: "2026-02-01" })]
  );

  // --- customers and conformance
  await q(
    `insert into conformances(customer, application, industry, specification, version, trials, outcome) values
     ('CUS-HELIOS','technical apparel yarn','textiles','SPEC-N6',3,$1,'passing'),
     ('CUS-VANTA','airbag fabric','automotive','SPEC-N6',2,$2,'under_evaluation')`,
    [
      JSON.stringify([
        { trial: "spinning trial 40 dtex", date: "2026-02-20", outcome: "pass" },
        { trial: "dye uniformity", date: "2026-03-01", outcome: "pass" },
      ]),
      JSON.stringify([{ trial: "airbag weave pilot", date: "2026-01-15", outcome: "conditional" }]),
    ]
  );
  await q(
    `insert into specification_issues(specification, version, customer, issued_on) values
     ('SPEC-N6',3,'CUS-HELIOS','2026-02-01')`
  );

  // --- contracts
  await q(
    `insert into contracts(id, recipient, site, period, committed_kg, floor_bp, delivered_kg, running_content_bp, state, shortfall_consequence) values
     ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,0,'on_track',null),
     ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,0,'on_track','a make-good volume in the following period')
     on conflict do nothing`
  );

  // --- certificates. The SITE-PILOT sequence has issued two; SITE-DEMO none.
  const certPermitted1 =
    "This material is claimed by mass balance. It is not physically segregated. The recycled-content figure is 75 per cent (150000 g post-consumer). You may not state that this material physically contains recycled content.";
  const certPermitted2 =
    "This material is claimed by mass balance. It is not physically segregated. The recycled-content figure is 75 per cent (150000 g post-consumer). You may not state that this material physically contains recycled content.";
  const certProhibited =
    "You may not state that this material physically contains recycled content.";
  await q(
    `insert into certificates(number, version, site, grade, period, lot, lot_mass_g, recipient, recipient_name, claim_type, content_bp,
      category_split, specification_version, carbon_figure, carbon, primary_share_bp, scheme, registration, test_results,
      permitted_statement, prohibited_statement, permitted_statement_lang, prohibited_statement_lang, signer, signer_name,
      signed_at, verification_url, state, withdrawn_reason, withdrawn_by, withdrawn_on, notified_recipients, void_statements,
      derived_certificates, batch_traversal, conditions, provisional_factor, derived_from)
     values
     ('CERT-PILOT-000001',1,'SITE-PILOT','N6',$1,'LOT-N6-0003',200000,'CUS-HELIOS','Helios Filaments','mass_balance',7500,
      $2,3,null,$3,null,'RCS-2026','REG-RAVEL-0042','[]',$4,$5,'en','en','signer2@example.com','Pavel Ostrowski',
      '2026-03-02T10:00:00Z','https://ravel.example.com/verify/CERT-PILOT-000001','withdrawn',
      'A collector category was corrected after acceptance','signer2@example.com','2026-04-18T09:00:00Z',$6,$7,'[]',$8,$9,true,null),
     ('CERT-PILOT-000002',1,'SITE-PILOT','N6',$1,'LOT-N6-0003',200000,'CUS-VANTA','Vanta Technical Weaves','mass_balance',7500,
      $2,3,null,$3,null,'RCS-2026','REG-RAVEL-0042','[]',$10,$5,'en','en','signer2@example.com','Pavel Ostrowski',
      '2026-03-02T11:30:00Z','https://ravel.example.com/verify/CERT-PILOT-000002','issued',
      null,null,null,'[]','[]','[]',$8,$9,true,null)`,
    [
      pilotPeriod,
      JSON.stringify({ post_consumer: 150000, pre_consumer: 0 }),
      JSON.stringify({
        value_mg_per_kg: 5210000,
        boundary: "cradle-to-gate",
        method_version: 2,
        uncertainty_bp: 1800,
        attached: true,
      }),
      certPermitted1,
      certProhibited,
      JSON.stringify([
        { reference: "CUS-HELIOS", name: "Helios Filaments", contact_email: "helios@example.com", notified_on: "2026-04-18T09:00:00Z" },
      ]),
      JSON.stringify([
        "This material is claimed by mass balance. It is not physically segregated. The recycled-content figure is 75 per cent (150000 g post-consumer).",
        "You may not state that this material physically contains recycled content.",
      ]),
      JSON.stringify({ lots: ["LOT-N6-0003"], certificates: ["CERT-PILOT-000001", "CERT-PILOT-000002"], recipients: ["CUS-HELIOS", "CUS-VANTA"] }),
      JSON.stringify([
        { condition: "lot_released", satisfied: true, blocking_reference: null },
        { condition: "no_open_deviation", satisfied: true, blocking_reference: null },
        { condition: "no_unreviewed_override", satisfied: true, blocking_reference: null },
        { condition: "period_closed", satisfied: true, blocking_reference: null },
        { condition: "balance_invariant_holds", satisfied: true, blocking_reference: null },
        { condition: "carbon_figure_complete", satisfied: true, blocking_reference: null },
        { condition: "signer_scope", satisfied: true, blocking_reference: null },
        { condition: "signer_not_data_enterer", satisfied: true, blocking_reference: null },
      ]),
      certPermitted2,
    ]
  );
  await q(`insert into certificate_counters(site, next_number) values('SITE-PILOT',3),('SITE-DEMO',1) on conflict do nothing`);

  await q(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at) values
     ('certificate_signed','signer2@example.com','SITE-PILOT','CERT-PILOT-000001','act',$1,'2026-03-02','2026-03-02T10:00:00Z'),
     ('certificate_signed','signer2@example.com','SITE-PILOT','CERT-PILOT-000002','act',$2,'2026-03-02','2026-03-02T11:30:00Z'),
     ('certificate_withdrawn','signer2@example.com','SITE-PILOT','CERT-PILOT-000001','act',$3,'2026-04-18','2026-04-18T09:00:00Z')`,
    [
      JSON.stringify({ number: "CERT-PILOT-000001", lot: "LOT-N6-0003", recipient: "CUS-HELIOS", content_bp: 7500, claim_type: "mass_balance", provisional_factor: true }),
      JSON.stringify({ number: "CERT-PILOT-000002", lot: "LOT-N6-0003", recipient: "CUS-VANTA", content_bp: 7500, claim_type: "mass_balance", provisional_factor: true }),
      JSON.stringify({ number: "CERT-PILOT-000001", reason: "A collector category was corrected after acceptance", notified_recipients: ["CUS-HELIOS"], derived_certificates: [] }),
    ]
  );

  // --- inbound records, payload kept verbatim
  await q(
    `insert into inbound_records(reference, source, received_at, payload_verbatim, payload) values
     ('INB-0001','weighbridge','2026-02-20T06:14:00Z',$1,$2),
     ('INB-0002','control_system','2026-03-04T22:41:00Z',$3,$4),
     ('INB-0003','laboratory','2026-03-06T09:02:00Z',$5,$6)`,
    [
      JSON.stringify({ device: "WB-DEMO-02", ticket: "T-88214", site: "SITE-DEMO", gross_g: 132000, tare_g: 12000, net_g: 120000, calibration_state: "lapsed", batch: "BATCH-1004" }),
      { device: "WB-DEMO-02", ticket: "T-88214", site: "SITE-DEMO", gross_g: 132000, tare_g: 12000, net_g: 120000, calibration_state: "lapsed", batch: "BATCH-1004" },
      JSON.stringify({ run: "RUN-D-0001", parameters: { temperature_c: 165, pressure_bar: 3, residence_min: 60 }, recorded: "after the fact" }),
      { run: "RUN-D-0001", parameters: { temperature_c: 165, pressure_bar: 3, residence_min: 60 }, recorded: "after the fact" },
      JSON.stringify({ subject: "LOT-N6-0001", property: "relative_viscosity", method: "ISO 307", value: "2.46", unit: "ratio", analyst: "analyst@example.com" }),
      { subject: "LOT-N6-0001", property: "relative_viscosity", method: "ISO 307", value: "2.46", unit: "ratio", analyst: "analyst@example.com" },
    ]
  );
  await q(
    `insert into record_entries(act, person, site, object_reference, kind, content, effective_on, created_at) values
     ('inbound_record_kept','system','SITE-DEMO','INB-0001','inbound',$1,'2026-02-20','2026-02-20T06:14:00Z'),
     ('inbound_record_kept','system','SITE-DEMO','INB-0002','inbound',$2,'2026-03-04','2026-03-04T22:41:00Z'),
     ('inbound_record_kept','system','SITE-DEMO','INB-0003','inbound',$3,'2026-03-06','2026-03-06T09:02:00Z')`,
    [
      JSON.stringify({ reference: "INB-0001", source: "weighbridge", received_at: "2026-02-20T06:14:00Z" }),
      JSON.stringify({ reference: "INB-0002", source: "control_system", received_at: "2026-03-04T22:41:00Z" }),
      JSON.stringify({ reference: "INB-0003", source: "laboratory", received_at: "2026-03-06T09:02:00Z" }),
    ]
  );

  // --- public content
  await q(
    `insert into statistics(key, value, source, year, geography) values
     ('textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'),
     ('plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'),
     ('textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27')
     on conflict do nothing`
  );
  await q(
    `insert into positions(title, location, department, contract_type, closes_on) values
     ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`
  );
  await q(
    `insert into news_items(title, tag, outlet, published_on, link, language) values
     ('Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://ravel.example.com/news/series-a','en'),
     ('Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://ravel.example.com/news/offtake','en'),
     ('Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://ravel.example.com/news/yield','fr')`
  );
  await q(
    `insert into claim_substantiations(key, claim, route, first_published_on, evidence, method_version, approver, review_date) values
     ('recycled_content_mass_balance','Recycled Nylon 6 produced under a mass-balance chain of custody','/product','2026-01-15',$1,'CM-PA6 v2','Marit Solheim','2027-01-15'),
     ('lower_carbon_than_virgin','Lower cradle-to-gate carbon than virgin PA6 from the named comparator','/technology','2026-01-20',$2,'CM-PA6 v2','Marit Solheim','2027-01-20')
     on conflict do nothing`,
    [
      JSON.stringify([
        { kind: "certificate", reference: "CERT-PILOT-000002" },
        { kind: "balance_period", reference: "BP-DEMO-N6-2026H1" },
      ]),
      JSON.stringify([
        { kind: "carbon_figure", reference: "LOT-N6-0001", value_mg_per_kg: 4260000, boundary: "cradle-to-gate", method_version: 2, uncertainty_bp: 1200 },
        { kind: "comparator", dataset: "EcoBase 2025", dataset_year: 2025, region: "EU-27" },
      ]),
    ]
  );

  // --- legal hold on the signing of CERT-PILOT-000001
  const holdSeq = await one(
    `select seq from record_entries where act='certificate_signed' and object_reference='CERT-PILOT-000001'`
  );
  if (holdSeq) {
    await q(
      `insert into record_holds(reference, seq, placed_by) values('HLD-0001',$1,'auditor@example.com') on conflict do nothing`,
      [holdSeq.seq]
    );
  }

  // --- close the chain: seal every entry in order of insertion
  await withTx(`seed`, async (tx) => {
    const rows = await tx.query(`select seq from record_entries order by seq`);
    for (const r of rows) {
      await seal(tx, Number(r.seq));
    }
  });

  return true;
}
