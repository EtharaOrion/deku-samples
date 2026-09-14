import pg from 'pg';
import crypto from 'node:crypto';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
for (let attempt = 0; attempt < 40; attempt++) {
  try { await pool.query('select 1'); break; }
  catch (e) { if (attempt === 39) throw e; await new Promise((r) => setTimeout(r, 1000)); }
}
const q = (sql, p = []) => pool.query(sql, p).then(r => r.rows);
const ZERO64 = '0'.repeat(64);
const digest = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
let SEQ = 0;
async function entry(kind, opts = {}) {
  const last = (await q('select seq, digest from record_entry order by seq desc limit 1'))[0];
  const seq = (last ? Number(last.seq) : 0) + 1;
  const prev = last ? last.digest : ZERO64;
  const content = { kind, actor: opts.actor || 'system', actor_name: opts.actor_name || null, site: opts.site || null, object_ref: opts.ref || null, summary: opts.summary || '' };
  const d = digest(prev + canonical(content));
  await q(`insert into record_entry(seq, event_at, recorded_at, effective_on, actor, actor_name, site, object_ref, kind, summary, digest, prev_digest, content)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [seq, opts.event_at || new Date('2026-01-05T09:00:00Z'), opts.recorded_at || new Date('2026-01-05T09:00:00Z'), opts.effective_on || '2026-01-05', content.actor, content.actor_name, content.site, content.object_ref, kind, content.summary, d, prev, JSON.stringify(content)]);
  return seq;
}

async function main() {
  const seeded = await q('select count(*)::int as n from seed_marker');
  if (seeded[0].n > 0) { console.log('already seeded'); await pool.end(); return; }

  // ---------- sites ----------
  const sites = [
    ['SITE-PILOT','Pilot','commissioned',40000,24000,'certified'],
    ['SITE-DEMO','Demonstration','commissioned',400000,320000,'certified'],
    ['SITE-COMM','Commercial','planned',25000000,26000000,'not_certified'],
  ];
  for (const [r,n,c,np,ck,cs] of sites)
    await q(`insert into site values ($1,$2,$3,$4,$5,'8000 hours per year, 0.90 availability, 0.80 yield',$6,'2026-06-30')`, [r,n,c,np,ck,cs]);
  await entry('site_recorded', { summary: 'Site register established', event_at: new Date('2026-01-02T09:00:00Z'), effective_on: '2026-01-02' });

  // ---------- accounts and grants ----------
  const accounts = [
    ['plant@example.com','Ines Bekele','plant_operator',['SITE-DEMO','SITE-PILOT']],
    ['analyst@example.com','Tomas Vlach','lab_analyst',['SITE-DEMO','SITE-PILOT']],
    ['quality@example.com','Marit Solheim','quality_manager',['SITE-DEMO','SITE-PILOT']],
    ['claims@example.com','Osei Danquah','claims_manager',['SITE-DEMO','SITE-PILOT']],
    ['signer@example.com','Hana Ferreira','certificate_signer',['SITE-DEMO','SITE-PILOT']],
    ['signer2@example.com','Pavel Ostrowski','certificate_signer',['SITE-PILOT']],
    ['auditor@example.com','Ruth Lindqvist','auditor',['SITE-DEMO','SITE-PILOT']],
  ];
  for (const [email,name,role,sts] of accounts) {
    await q(`insert into account values ($1,$2,$3,null,now())`, [email,name,role]);
    for (const s of sts) await q(`insert into grant_(email, site, valid_from, valid_to) values ($1,$2,'2026-01-01','2027-06-30')`, [email,s]);
  }
  await entry('access_grant', { summary: 'Seven accounts granted site scope ending 2027-06-30', event_at: new Date('2026-01-02T10:00:00Z'), effective_on: '2026-01-02' });

  // ---------- parties, collectors, approvals ----------
  const parties = [
    ['COL-ALDER','collector',null],['COL-BRINE','collector',null],['COL-CINDER','collector',null],
    ['CUS-HELIOS','customer','helios@example.com'],['CUS-VANTA','customer','vanta@example.com'],
  ];
  for (const [ref,kind,email] of parties) await q(`insert into party values ($1,$2,$3)`, [ref,kind,email]);
  await entry('party_recorded', { summary: 'Party register opened', event_at: new Date('2026-01-02T11:00:00Z'), effective_on: '2026-01-02' });

  const pv = [
    ['COL-ALDER','Alder Reclaim','2026-01-01',null],
    ['COL-BRINE','Brine Textile Recovery','2026-01-01',2],
    ['COL-BRINE','Brine Circular Materials','2026-08-01',null],
    ['COL-CINDER','Cinder Industrial Offcuts','2026-01-01',null],
    ['CUS-HELIOS','Helios Fabrics','2026-01-01',null],
    ['CUS-VANTA','Vanta Automotive Textiles','2026-01-01',null],
  ];
  for (const [p,n,ef,sb] of pv) {
    const rows = await q(`insert into party_version(party,name,effective_from,superseded_by) values ($1,$2,$3,$4) returning id`, [p,n,ef,sb]);
    if (sb) await q(`update party_version set superseded_by = $1 where party=$2 and effective_from < $3 and superseded_by is null`, [rows[0].id, p, ef]);
  }
  await entry('party_version_recorded', { summary: 'Party names in force recorded; COL-BRINE renamed effective 2026-08-01', event_at: new Date('2026-07-20T10:00:00Z'), effective_on: '2026-07-20' });

  const collectors = [
    ['COL-ALDER','PT','WCR-PT-4471','2027-03-31',['kerbside','retail take-back'],['nylon 6 nets','nylon 6 carpet'],'active'],
    ['COL-BRINE','NL','WCR-NL-2208','2027-01-31',['industrial laundry'],['nylon 6 textile'],'active'],
    ['COL-CINDER','FR','WCR-FR-6613','2026-12-31',['factory offcut'],['nylon 6 offcuts'],'conditional'],
  ];
  for (const [r,cc,reg,exp,cst,ds,ss] of collectors)
    await q(`insert into collector values ($1,$1,$2,$3,$4,$5,$6,$7,now())`, [r,cc,reg,exp,JSON.stringify(cst),JSON.stringify(ds),ss]);
  const approvals = [
    ['COL-ALDER','approved','2026-01-01','2026-12-31',null,null],
    ['COL-BRINE','approved','2026-01-01','2026-06-30',null,null],
    ['COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31'],
  ];
  for (const [c,s,vf,vt,cond,cc] of approvals) {
    await q(`insert into approval_period(collector,state,valid_from,valid_to,condition,condition_closes_on) values ($1,$2,$3,$4,$5,$6)`, [c,s,vf,vt,cond,cc]);
    await entry('collector_approved', { ref: c, actor: 'quality@example.com', actor_name: 'Marit Solheim', summary: `Approval ${s} recorded for ${c} ${vf} to ${vt}`, event_at: new Date('2026-01-05T10:00:00Z'), effective_on: '2026-01-05' });
  }

  // ---------- devices ----------
  await q(`insert into device values ('WB-DEMO-01','SITE-DEMO','2026-05-01')`);
  await q(`insert into device values ('WB-DEMO-02','SITE-DEMO','2025-02-01')`);
  await entry('weighing_calibration_recorded', { summary: 'Weighing devices registered; WB-DEMO-02 calibration lapsed 2026-02-01', event_at: new Date('2026-01-05T11:00:00Z'), effective_on: '2026-01-05' });

  // ---------- recipes ----------
  const recipes = [
    ['RCP-DISS-2','dissolution',2,{temperature_c:165,pressure_bar:3,solvent_ratio:6.5},{temperature_c:[160,170],pressure_bar:[2,4],solvent_ratio:[6.0,7.0]},[{name:'formic acid',ratio_bp:820},{name:'water',ratio_bp:9000}],90,'quality@example.com','2026-01-10'],
    ['RCP-DEPO-4','depolymerisation',4,{temperature_c:270,pressure_bar:12,residence_min:150},{temperature_c:[260,280],pressure_bar:[10,14],residence_min:[140,160]},[{name:'sodium hydroxide',ratio_bp:450}],150,'quality@example.com','2026-01-10'],
    ['RCP-PURI-1','purification',1,{temperature_c:95,pressure_bar:1},{temperature_c:[90,100],pressure_bar:[1,2]},[{name:'activated carbon',ratio_bp:30}],60,'quality@example.com','2026-01-10'],
    ['RCP-REPO-3','repolymerisation',3,{temperature_c:255,pressure_bar:8},{temperature_c:[245,265],pressure_bar:[6,10]},[{name:'caprolactam',ratio_bp:9500}],240,'quality@example.com','2026-01-10'],
  ];
  for (const [r,t,v,sp,tol,rg,res,by,on] of recipes)
    await q(`insert into recipe values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null)`, [r,t,v,JSON.stringify(sp),JSON.stringify(tol),JSON.stringify(rg),res,by,on]);
  await entry('recipe_released', { summary: 'Recipe versions released', actor: 'quality@example.com', actor_name: 'Marit Solheim', event_at: new Date('2026-01-10T09:00:00Z'), effective_on: '2026-01-10' });

  // ---------- conversion factors ----------
  await q(`insert into conversion_factor values ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-05',now())`);
  await q(`insert into conversion_factor values ('CF-PILOT-1','SITE-PILOT',7500,null,null,0,0,true,'claims@example.com','2026-01-15',now())`);
  await entry('conversion_factor_published', { ref: 'CF-DEMO-1', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-DEMO', summary: 'CF-DEMO-1 published at 8000 bp from window 2026-01-01 to 2026-03-31', event_at: new Date('2026-04-05T09:00:00Z'), effective_on: '2026-04-05' });
  await entry('conversion_factor_published', { ref: 'CF-PILOT-1', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-PILOT', summary: 'CF-PILOT-1 published provisional at 7500 bp', event_at: new Date('2026-01-15T09:00:00Z'), effective_on: '2026-01-15' });

  // ---------- balance periods ----------
  const bps = [
    ['BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'2026-01-15','2026-01-10',{post_consumer:12000,pre_consumer:0},{post_consumer:48000,pre_consumer:0}],
    ['BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,null,null,null,null],
    ['BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,null,null,null,null],
  ];
  for (const [id,s,g,pf,pt,st,col,clo,co,cf,ex] of bps)
    await q(`insert into balance_period(id,site,grade,period_from,period_to,state,carry_over_limit_bp,closed_on,cut_off,carried_forward_g,expired_g,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`, [id,s,g,pf,pt,st,col,clo||null,co||null,JSON.stringify(cf),JSON.stringify(ex)]);
  await entry('balance_period_closed', { ref: 'BP-DEMO-N6-2025H2', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-DEMO', summary: 'BP-DEMO-N6-2025H2 closed 2026-01-15 cut-off 2026-01-10; 12000 g post-consumer carried forward, 48000 g expired', event_at: new Date('2026-01-15T16:00:00Z'), effective_on: '2026-01-15' });



  // ---------- batches ----------
  const fullCustody = (d0, d1) => [
    { kind: 'collection_site', date: d0, party: 'COL-X' },
    { kind: 'collector', date: d0, party: 'COL-X' },
    { kind: 'transport', date: d0, party: 'TRN-LOG' },
    { kind: 'arrival', date: d1, party: 'SITE-DEMO' },
    { kind: 'weighing', date: d1, party: 'SITE-DEMO' },
    { kind: 'acceptance', date: d1, party: 'SITE-DEMO' },
  ];
  const batches = [
    { reference: 'BATCH-1001', collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 505000, tare_g: 5000, net_g: 500000, moisture_bp: 1000, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-02-10',
      composition: [{ polymer: 'PA6', fraction_bp: 9200, basis: 'sampled', measured_fraction_bp: 9200 }], contamination: { non_nylon_bp: 300, elastane_bp: 400, coatings: 'none', colour_load: 'medium', foreign_matter: 'none' }, custody: fullCustody('2026-02-08','2026-02-10') },
    { reference: 'BATCH-1002', collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'pre_consumer', gross_g: 302000, tare_g: 2000, net_g: 300000, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-02-12',
      composition: [{ polymer: 'PA6', fraction_bp: 9700, basis: 'declared' }], contamination: { non_nylon_bp: 100, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' }, custody: fullCustody('2026-02-11','2026-02-12') },
    { reference: 'BATCH-1003', collector: 'COL-BRINE', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 202000, tare_g: 2000, net_g: 200000, moisture_bp: 500, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-07-05',
      composition: [{ polymer: 'PA6', fraction_bp: 9400, basis: 'declared' }], contamination: { non_nylon_bp: 300, elastane_bp: 200, coatings: 'traces', colour_load: 'medium', foreign_matter: 'none' }, custody: fullCustody('2026-07-03','2026-07-05') },
    { reference: 'BATCH-1004', collector: 'COL-CINDER', site: 'SITE-DEMO', category: 'pre_consumer', gross_g: 121000, tare_g: 1000, net_g: 120000, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-02', received_on: '2026-02-20',
      composition: [{ polymer: 'PA6', fraction_bp: 9900, basis: 'declared', measured_fraction_bp: 9100 }], contamination: { non_nylon_bp: 500, elastane_bp: 0, coatings: 'coated offcuts present', colour_load: 'high', foreign_matter: 'traces' }, custody: fullCustody('2026-02-19','2026-02-20') },
    { reference: 'BATCH-1005', collector: 'COL-ALDER', site: 'SITE-DEMO', category: 'post_consumer', gross_g: 101000, tare_g: 1000, net_g: 100000, moisture_bp: 0, moisture_method: 'ISO 15512', device: 'WB-DEMO-01', received_on: '2026-03-02',
      composition: [{ polymer: 'PA6', fraction_bp: 9500, basis: 'declared' }], contamination: { non_nylon_bp: 200, elastane_bp: 100, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      custody: fullCustody('2026-03-01','2026-03-02').filter((l) => l.kind !== 'transport') },
  ];
  for (const b of batches) {
    await q(`insert into batch(reference,collector,site,grade,category,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,received_on,composition,contamination,custody,accepted,rejected_g,booked_by)
             values ($1,$2,$3,'N6',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,0,'plant@example.com')`,
      [b.reference,b.collector,b.site,b.category,b.gross_g,b.tare_g,b.net_g,b.moisture_bp,b.moisture_method,b.device,b.received_on,JSON.stringify(b.composition),JSON.stringify(b.contamination),JSON.stringify(b.custody)]);
    await entry('batch_booked', { ref: b.reference, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: b.site, summary: `Batch ${b.reference} booked in from ${b.collector}, net ${b.net_g} g`, event_at: new Date(b.received_on + 'T08:00:00Z'), effective_on: b.received_on });
    await entry('weighing_recorded', { ref: b.reference, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: b.site, summary: `Weighing of ${b.reference} on ${b.device}, calibration ${b.device === 'WB-DEMO-02' ? 'lapsed' : 'valid'}`, event_at: new Date(b.received_on + 'T08:05:00Z'), effective_on: b.received_on });
  }
  await q(`insert into finding(collector,batch,kind,detail,departure_bp,raised_on,review_by,state) values ('COL-CINDER','BATCH-1004','declaration_departure','Measured PA6 fraction 9100 bp against declared 9900 bp',800,'2026-02-24','2026-08-24','open')`);
  await entry('finding_raised', { ref: 'BATCH-1004', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Finding raised on COL-CINDER: declaration departure of 800 basis points', event_at: new Date('2026-02-24T09:00:00Z'), effective_on: '2026-02-24' });

  // ---------- runs, consumptions, outputs ----------
  const runs = [
    { reference: 'RUN-D-0001', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-01T06:00:00Z', closed: '2026-03-01T14:00:00Z', losses: 120000, actual: { temperature_c: 165, pressure_bar: 3, solvent_ratio: 6.4 }, within: true,
      cons: [['batch','BATCH-1001',300000,'2026-03-01'],['batch','BATCH-1002',300000,'2026-03-01']],
      outs: [['OUT-D-0001','intermediate',480000,null]] },
    { reference: 'RUN-D-0002', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-02T06:00:00Z', closed: '2026-03-02T13:00:00Z', losses: 60000, actual: { temperature_c: 168, pressure_bar: 3.2, solvent_ratio: 6.6 }, within: true,
      cons: [['batch','BATCH-1003',190000,'2026-03-02'],['batch','BATCH-1004',120000,'2026-03-02']],
      outs: [['OUT-D-0002','intermediate',250000,null]] },
    { reference: 'RUN-D-0003', run_type: 'dissolution', recipe: 'RCP-DISS-2', started: '2026-03-03T06:00:00Z', closed: '2026-03-03T12:00:00Z', losses: 30000, actual: { temperature_c: 162, pressure_bar: 2.8, solvent_ratio: 6.1 }, within: true,
      cons: [['batch','BATCH-1001',150000,'2026-03-03']], outs: [['OUT-D-0003','intermediate',120000,null]] },
    { reference: 'RUN-Y-0001', run_type: 'depolymerisation', recipe: 'RCP-DEPO-4', started: '2026-03-04T06:00:00Z', closed: '2026-03-04T20:00:00Z', losses: 50000, actual: { temperature_c: 272, pressure_bar: 12, residence_min: 148 }, within: true,
      cons: [['output','OUT-D-0001',480000,'2026-03-04'],['output','OUT-D-0002',250000,'2026-03-04'],['output','OUT-D-0003',120000,'2026-03-04']],
      outs: [['OUT-Y-0001','intermediate',800000,null]] },
    { reference: 'RUN-U-0001', run_type: 'purification', recipe: 'RCP-PURI-1', started: '2026-03-05T06:00:00Z', closed: '2026-03-05T18:00:00Z', losses: 40000, actual: { temperature_c: 95, pressure_bar: 1 }, within: true,
      cons: [['output','OUT-Y-0001',800000,'2026-03-05']],
      outs: [['OUT-U-0001','intermediate',720000,null],['OUT-U-0002','byproduct',40000,'sold']] },
    { reference: 'RUN-R-0001', run_type: 'repolymerisation', recipe: 'RCP-REPO-3', started: '2026-03-06T06:00:00Z', closed: '2026-03-06T22:00:00Z', losses: 20000, actual: { temperature_c: 255, pressure_bar: 8 }, within: true,
      cons: [['output','OUT-U-0001',720000,'2026-03-06']],
      outs: [['LOT-N6-0001','lot',400000,null],['LOT-N6-0002','lot',300000,null]] },
  ];
  for (const r of runs) {
    await q(`insert into run(reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,state,actual,within_tolerance,created_at) values ($1,$2,'SITE-DEMO',$3,$4,'plant@example.com',$5,$6,$7,'closed',$8,true,now())`,
      [r.reference, r.run_type, 'REACTOR-' + r.reference.split('-')[1] + '-A', r.recipe, new Date(r.started), new Date(r.closed), r.losses, JSON.stringify(r.actual)]);
    await entry('run_started', { ref: r.reference, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: 'SITE-DEMO', summary: `Run ${r.reference} opened (${r.run_type})`, event_at: new Date(r.started), effective_on: r.started.slice(0,10) });
    for (const [kind, ref, mass, eff] of r.cons) {
      await q(`insert into consumption(run_ref,input_kind,input_ref,mass_g,effective_on,recorded_by) values ($1,$2,$3,$4,$5,'plant@example.com')`, [r.reference, kind, ref, mass, eff]);
      await entry('consumption_recorded', { ref: r.reference, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: 'SITE-DEMO', summary: `${mass} g of ${ref} consumed by ${r.reference}`, event_at: new Date(r.started), effective_on: eff });
    }
    for (const [ref, kind, mass, disp] of r.outs) {
      const lot = kind === 'lot' ? ref : null;
      await q(`insert into output(reference,run_ref,kind,mass_g,disposition,lot,recorded_at,recorded_by) values ($1,$2,$3,$4,$5,$6,$7,'plant@example.com')`, [ref, r.reference, kind, mass, disp, lot, new Date(r.closed)]);
      await entry('output_recorded', { ref, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: 'SITE-DEMO', summary: `Output ${ref} of ${mass} g (${kind}) from ${r.reference}`, event_at: new Date(r.closed), effective_on: r.started.slice(0,10) });
    }
    await q(`insert into lot(reference,site,grade,mass_g,disposition,claim_type,produced_at,created_at) values ($1,'SITE-DEMO','N6',$2,'pending','mass_balance',$3,now()) on conflict (reference) do nothing`, ['LOT-N6-0001', 400000, new Date(r.closed)]).catch(()=>{});
    await entry('run_closed', { ref: r.reference, actor: 'plant@example.com', actor_name: 'Ines Bekele', site: 'SITE-DEMO', summary: `Run ${r.reference} closed, losses ${r.losses} g`, event_at: new Date(r.closed), effective_on: r.started.slice(0,10) });
  }
  await q(`insert into lot(reference,site,grade,mass_g,disposition,claim_type,produced_at,created_at) values ('LOT-N6-0002','SITE-DEMO','N6',300000,'pending','mass_balance','2026-03-06T22:00:00Z',now()) on conflict (reference) do nothing`);
  await q(`update lot set mass_g = 400000 where reference = 'LOT-N6-0001'`);
  await q(`insert into lot values ('LOT-N6-0003','SITE-PILOT','N6',200000,'released','mass_balance','2026-03-01T10:00:00Z',now()) on conflict (reference) do nothing`);
  await q(`update lot set disposition = 'released', disposition_by = 'quality@example.com' where reference = 'LOT-N6-0001'`);
  await q(`update lot set disposition = 'quarantined', disposition_by = 'quality@example.com' where reference = 'LOT-N6-0002'`);
  await entry('lot_dispositioned', { ref: 'LOT-N6-0001', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'LOT-N6-0001 released', event_at: new Date('2026-03-18T09:00:00Z'), effective_on: '2026-03-18' });

  // ---------- deviations, overrides, test results ----------
  await q(`insert into deviation values ('DEV-0001','open',ARRAY['RUN-U-0001'],ARRAY['LOT-N6-0002'],'Colour specification excursion on purification output','none','2026-03-07',null,'quality@example.com',now())`);
  await entry('deviation_raised', { ref: 'DEV-0001', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Deviation DEV-0001 raised on RUN-U-0001 and LOT-N6-0002', event_at: new Date('2026-03-07T09:00:00Z'), effective_on: '2026-03-07' });
  await q(`insert into deviation values ('DEV-0002','closed',ARRAY['RUN-D-0002'],ARRAY['{}'],'Feedstock variability in dissolution batch 2','cause_not_established','2026-03-03','2026-03-20','quality@example.com',now())`);
  await entry('deviation_raised', { ref: 'DEV-0002', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Deviation DEV-0002 raised on RUN-D-0002', event_at: new Date('2026-03-03T10:00:00Z'), effective_on: '2026-03-03' });
  await entry('deviation_closed', { ref: 'DEV-0002', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Deviation DEV-0002 closed: cause not established', event_at: new Date('2026-03-20T10:00:00Z'), effective_on: '2026-03-20' });
  await q(`insert into override values ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','2026-03-18',false,null,null,now())`);
  await entry('override_recorded', { ref: 'OVR-0001', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Override OVR-0001 recorded: analyst_not_dispositioner on LOT-N6-0001, unreviewed', event_at: new Date('2026-03-18T09:30:00Z'), effective_on: '2026-03-18' });
  await q(`insert into test_result(subject_kind,subject_ref,property,method,instrument,analyst,value,unit,uncertainty_bp) values
    ('lot','LOT-N6-0001','relative_viscosity','ISO 307','VISCO-2','analyst@example.com',242,'ratio',300),
    ('lot','LOT-N6-0001','moisture','ISO 15512','KARL-F','analyst@example.com',900,'bp',150),
    ('lot','LOT-N6-0003','relative_viscosity','ISO 307','VISCO-2','analyst@example.com',241,'ratio',300)`);
  await entry('test_result_recorded', { ref: 'LOT-N6-0001', actor: 'analyst@example.com', actor_name: 'Tomas Vlach', site: 'SITE-DEMO', summary: 'Relative viscosity and moisture results recorded on LOT-N6-0001', event_at: new Date('2026-03-06T09:02:00Z'), effective_on: '2026-03-06' });

  // ---------- credit movements ----------
  const movs = [
    ['BP-DEMO-N6-2026H1','in','post_consumer',360000,'consumption','BATCH-1001','2026-03-01',null],
    ['BP-DEMO-N6-2026H1','in','pre_consumer',240000,'consumption','BATCH-1002','2026-03-01',null],
    ['BP-DEMO-N6-2026H1','in','non_claimable',0,'non_claimable_input','BATCH-1003','2026-03-02',null],
    ['BP-DEMO-N6-2026H1','in','pre_consumer',96000,'consumption','BATCH-1004','2026-03-02',null],
  ];
  for (const [p,dir,cat,mass,kind,batch,eff,lot] of movs)
    await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,effective_on,event_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$8::date + interval '2 hours')`,
      [p,dir,cat,mass,kind,batch,lot,eff]);
  await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,origin_site,movement_ref,effective_on,event_at) values ('BP-DEMO-N6-2026H1','in','post_consumer',50000,'transfer_in',null,null,'SITE-PILOT','TRF-0001','2026-05-12','2026-05-12T10:00:00Z')`);
  await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,origin_site,movement_ref,effective_on,event_at) values ('BP-PILOT-N6-2026H1','out','post_consumer',50000,'transfer_out',null,null,'SITE-PILOT','TRF-0001','2026-05-12','2026-05-12T10:00:00Z')`);
  await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,origin_site,effective_on,event_at) values
    ('BP-PILOT-N6-2026H1','in','post_consumer',50000,'opening_balance',null,null,'SITE-PILOT','2026-01-15','2026-01-15T09:00:00Z')`);
  await q(`insert into transfer values ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1',50000,'post_consumer','2026-05-12',now())`);
  await entry('transfer_recorded', { ref: 'TRF-0001', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-PILOT', summary: 'TRF-0001 moved 50000 g post-consumer credit from SITE-PILOT to SITE-DEMO, not a fresh credit', event_at: new Date('2026-05-12T10:00:00Z'), effective_on: '2026-05-12' });
  await entry('credits_granted', { ref: 'BP-DEMO-N6-2026H1', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-DEMO', summary: 'Credits granted at consumption: 360000 g post-consumer, 336000 g pre-consumer; 190000 g non-claimable input recorded', event_at: new Date('2026-03-06T22:00:00Z'), effective_on: '2026-03-06' });

  // ---------- carbon ----------
  await q(`insert into carbon_method values ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-11-04',
    $1,$2,5000,2,'quality@example.com',now())`,
    [JSON.stringify({primary_share_threshold_bp:5000,recency_years:3,minimum_data_quality:'high for energy lines'}),
     JSON.stringify([{line:'collection_and_transport',source:'Plant logistics records',year:'2026'},
                     {line:'process_energy',source:'Utility meter dataset',year:'2026'},
                     {line:'reagents',source:'Supplier EPDs',year:'2025'},
                     {line:'water_and_effluent',source:'Utility meter dataset',year:'2026'},
                     {line:'waste_and_residues',source:'EcoBase 2025',year:'2025'},
                     {line:'outbound_transport',source:'EcoBase 2025',year:'2025'},
                     {line:'byproduct_credit',source:'Plant logistics records',year:'2026'}])]);
  await q(`insert into carbon_method values ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',
    $1,$2,5000,null,'quality@example.com',now())`,
    [JSON.stringify({primary_share_threshold_bp:5000,recency_years:3,minimum_data_quality:'high for energy lines'}),
     JSON.stringify([{line:'collection_and_transport',source:'Plant logistics records',year:'2026'},
                     {line:'process_energy',source:'Utility meter dataset',year:'2026'},
                     {line:'reagents',source:'Supplier EPDs',year:'2025'},
                     {line:'water_and_effluent',source:'Utility meter dataset',year:'2026'},
                     {line:'waste_and_residues',source:'EcoBase 2025',year:'2025'},
                     {line:'outbound_transport',source:'EcoBase 2025',year:'2025'},
                     {line:'byproduct_credit',source:'Plant logistics records',year:'2026'}])]);
  await entry('carbon_method_published', { ref: 'CM-PA6', actor: 'quality@example.com', actor_name: 'Marit Solheim', summary: 'CM-PA6 version 2 published against ISO 14067', event_at: new Date('2026-01-20T11:00:00Z'), effective_on: '2026-01-20' });
  const breakdown = [
    { line: 'collection_and_transport', mg_per_kg: 310000, tag: 'primary' },
    { line: 'process_energy', mg_per_kg: 1850000, tag: 'primary' },
    { line: 'reagents', mg_per_kg: 1180000, tag: 'supplier_specific' },
    { line: 'water_and_effluent', mg_per_kg: 240000, tag: 'primary' },
    { line: 'waste_and_residues', mg_per_kg: 330000, tag: 'secondary' },
    { line: 'outbound_transport', mg_per_kg: 410000, tag: 'secondary' },
    { line: 'byproduct_credit', mg_per_kg: -60000, tag: 'primary' },
  ];
  await q(`insert into carbon_figure values ('CFGC-0001','LOT-N6-0001',1,'CM-PA6',2,4260000,1200,6500,'cradle-to-gate',
    $1,$2,1850000,620000,300000,250000,50000,true,$3,null,null,null,null,now())`,
    [JSON.stringify({ material: 'virgin PA6', dataset: 'EcoBase 2025', dataset_year: '2025', region: 'EU-27' }),
     JSON.stringify(breakdown),
     JSON.stringify({ method: 'CM-PA6 v2', factor: 'CF-DEMO-1', specification: 'SPEC-N6 v3', byproduct_share_bp: 526 })]);
  await entry('carbon_figure_computed', { ref: 'CFGC-0001', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'Carbon figure CFGC-0001 computed for LOT-N6-0001 under CM-PA6 v2', event_at: new Date('2026-03-10T10:00:00Z'), effective_on: '2026-03-10' });
  await q(`insert into energy_instrument values ('EAC-2026-0007',250000,'2026','EU-27','retired','BP-DEMO-N6-2026H1',now())`);
  await q(`insert into energy_instrument values ('EAC-2025-0031',100000,'2025','EU-27','held',null,now())`);
  await entry('energy_instrument_retired', { ref: 'EAC-2026-0007', actor: 'claims@example.com', actor_name: 'Osei Danquah', site: 'SITE-DEMO', summary: 'EAC-2026-0007 retired 250000 kWh against BP-DEMO-N6-2026H1, leaving 50000 kWh unmatched', event_at: new Date('2026-05-02T09:00:00Z'), effective_on: '2026-05-02' });

  // ---------- specifications, customers ----------
  const specRows = [
    { property: 'relative_viscosity', method: 'ISO 307', limit: 240, limit_bp: null, unit: 'ratio', basis: 'guaranteed' },
    { property: 'moisture', method: 'ISO 15512', limit: 10, limit_bp: null, unit: 'percent', basis: 'guaranteed' },
    { property: 'yellowness_index', method: 'ASTM E313', limit: 80, limit_bp: null, unit: 'index', basis: 'typical' },
    { property: 'ash_content', method: 'ISO 3451-1', limit: 30, limit_bp: null, unit: 'percent', basis: 'informational' },
  ];
  await q(`insert into specification values ('N6',2,$1,$2,'2025-09-15',3,now())`, [JSON.stringify(specRows), JSON.stringify({ reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' })]);
  await q(`insert into specification values ('N6',3,$1,$2,'2026-02-01',null,now())`, [JSON.stringify(specRows), JSON.stringify({ reference: 'virgin PA6 at relative viscosity 2.42', source: 'EcoBase 2025', dated: '2025-11-30' })]);
  await entry('specification_issued', { ref: 'SPEC-N6', actor: 'quality@example.com', actor_name: 'Marit Solheim', site: 'SITE-DEMO', summary: 'SPEC-N6 version 3 issued on 2026-02-01, superseding version 2', event_at: new Date('2026-02-01T09:00:00Z'), effective_on: '2026-02-01' });
  await q(`insert into customer values ('CUS-HELIOS','CUS-HELIOS','helios@example.com','SPEC-N6',3,'technical apparel yarn','textiles','en',now())`);
  await q(`insert into customer values ('CUS-VANTA','CUS-VANTA','vanta@example.com','SPEC-N6',2,'airbag fabric','automotive','en',now())`);
  await q(`insert into conformance(customer,application,spec_grade,spec_version,trials,outcome,dates) values
    ('CUS-HELIOS','technical apparel yarn','N6',3,$1,'passing','{"first_trial":"2026-02-20","retrial":"2026-03-05"}'),
    ('CUS-VANTA','airbag fabric','N6',2,$2,'in_trial','{"first_trial":"2026-02-25"}')`,
    [JSON.stringify([{ trial: 'yarn draw trial', date: '2026-02-20', outcome: 'pass' },{ trial: 'dye uptake trial', date: '2026-03-05', outcome: 'pass' }]),
     JSON.stringify([{ trial: 'airbag weave trial', date: '2026-02-25', outcome: 'in_progress' }])]);

  // ---------- contracts ----------
  await q(`insert into contract values ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'Volume re-quoted at the next review window',now())`);
  await q(`insert into contract values ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period',now())`);

  // ---------- certificates ----------
  const permStmt = 'This material is claimed by mass balance at 90.00 per cent recycled polyamide (90.00 per cent post consumer). It is not physically segregated.';
  const prohibStmt = 'You may not state that this material physically contains recycled content.';
  const conditions = [
    { condition: 'lot_released', satisfied: true, blocking_reference: null },
    { condition: 'no_open_deviation', satisfied: true, blocking_reference: null },
    { condition: 'no_unreviewed_override', satisfied: true, blocking_reference: null },
    { condition: 'period_closed', satisfied: false, blocking_reference: 'BP-PILOT-N6-2026H1' },
    { condition: 'balance_invariant_holds', satisfied: true, blocking_reference: null },
    { condition: 'carbon_figure_complete', satisfied: true, blocking_reference: null },
    { condition: 'signer_scope_covers_site', satisfied: true, blocking_reference: null },
    { condition: 'signer_did_not_enter_data', satisfied: true, blocking_reference: null },
  ];
  const cert1 = {
    number: 'CERT-PILOT-000001', version: 1, site: 'SITE-PILOT', grade: 'N6',
    lots: [{ reference: 'LOT-N6-0003', mass_g: 200000 }], recipient: 'CUS-HELIOS', recipient_name: 'Helios Fabrics',
    claim_type: 'mass_balance', content_bp: 9000, category_split: { post_consumer: 180000 }, period: 'BP-PILOT-N6-2026H1',
    carbon_figure: null, primary_share_bp: 6500, scheme: 'RCS-2026', registration: 'REG-RAVEL-0042', specification_version: 3,
    test_results: [{ property: 'relative_viscosity', method: 'ISO 307', value: 241, unit: 'ratio' }],
    permitted_statement: 'This material is claimed by mass balance at 90.00 per cent recycled polyamide (90.00 per cent post consumer). It is not physically segregated.',
    prohibited_statement: prohibStmt,
    signer: 'signer2@example.com', signed_on: '2026-03-02', signed_at: '2026-03-02T15:00:00Z',
    verification_url: 'https://ravel.example.com/verify/CERT-PILOT-000001',
    state: 'withdrawn',
    withdrawal: { reason: 'A collector category was corrected after acceptance', withdrawn_by: 'signer2@example.com', withdrawn_on: '2026-04-18', notified_recipients: ['CUS-HELIOS'], void_statements: [permStmt], derived_certificates: [] },
    conditions, provisional_factor: true, derived_certificates: [],
    input_versions: { conversion_factor: 'CF-PILOT-1', specification: 'SPEC-N6 v3', carbon_method: 'none' },
  };
  const cols = 'number,version,site,grade,lots,recipient,recipient_name,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,specification_version,test_results,permitted_statement,prohibited_statement,signer,signed_on,signed_at,verification_url,state,withdrawal,conditions,provisional_factor,derived_certificates,input_versions';
  await q(`insert into certificate (${cols}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [cert1.number, cert1.version, cert1.site, cert1.grade, JSON.stringify(cert1.lots), cert1.recipient, cert1.recipient_name, cert1.claim_type, cert1.content_bp, JSON.stringify(cert1.category_split), cert1.period, cert1.carbon_figure, cert1.primary_share_bp, cert1.scheme, cert1.registration, cert1.specification_version, JSON.stringify(cert1.test_results), cert1.permitted_statement, cert1.prohibited_statement, cert1.signer, cert1.signed_on, new Date(cert1.signed_at), cert1.verification_url, cert1.state, JSON.stringify(cert1.withdrawal), JSON.stringify(cert1.conditions), cert1.provisional_factor, cert1.derived_certificates, JSON.stringify(cert1.input_versions)]);
  await q(`insert into signoff_log(number,reauthenticated,at) values ('CERT-PILOT-000001',true,'2026-03-02T14:59:00Z')`);
  const cert2 = { ...cert1, number: 'CERT-PILOT-000002', recipient: 'CUS-VANTA', recipient_name: 'Vanta Automotive Textiles', state: 'issued', withdrawal: null, verification_url: 'https://ravel.example.com/verify/CERT-PILOT-000002', signed_on: '2026-03-02', signed_at: '2026-03-02T16:30:00Z', category_split: { post_consumer: 180000 } };
  await q(`insert into certificate (${cols}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
    [cert2.number, cert2.version, cert2.site, cert2.grade, JSON.stringify(cert2.lots), cert2.recipient, cert2.recipient_name, cert2.claim_type, cert2.content_bp, JSON.stringify(cert2.category_split), cert2.period, cert2.carbon_figure, cert2.primary_share_bp, cert2.scheme, cert2.registration, cert2.specification_version, JSON.stringify(cert2.test_results), cert2.permitted_statement, cert2.prohibited_statement, cert2.signer, cert2.signed_on, new Date(cert2.signed_at), cert2.verification_url, cert2.state, cert2.withdrawal ? JSON.stringify(cert2.withdrawal) : null, JSON.stringify(cert2.conditions), cert2.provisional_factor, cert2.derived_certificates, JSON.stringify(cert2.input_versions)]);
  await q(`insert into signoff_log(number,reauthenticated,at) values ('CERT-PILOT-000002',true,'2026-03-02T16:29:00Z')`);
  await entry('certificate_signed', { ref: 'CERT-PILOT-000001', actor: 'signer2@example.com', actor_name: 'Pavel Ostrowski', site: 'SITE-PILOT', summary: 'Certificate CERT-PILOT-000001 signed for Helios Fabrics', event_at: new Date('2026-03-02T15:00:00Z'), effective_on: '2026-03-02' });
  await entry('certificate_signed', { ref: 'CERT-PILOT-000002', actor: 'signer2@example.com', actor_name: 'Pavel Ostrowski', site: 'SITE-PILOT', summary: 'Certificate CERT-PILOT-000002 signed for Vanta Automotive Textiles', event_at: new Date('2026-03-02T16:30:00Z'), effective_on: '2026-03-02' });
  await entry('certificate_withdrawn', { ref: 'CERT-PILOT-000001', actor: 'signer2@example.com', actor_name: 'Pavel Ostrowski', site: 'SITE-PILOT', summary: 'Certificate CERT-PILOT-000001 withdrawn: A collector category was corrected after acceptance', event_at: new Date('2026-04-18T09:00:00Z'), effective_on: '2026-04-18' });
  await q(`insert into legal_hold(reference,record_seq,placed_on,placed_by) select 'HLD-0001', seq, '2026-04-19', 'auditor@example.com' from record_entry where kind = 'certificate_signed' and object_ref = 'CERT-PILOT-000001'`);
  await q(`update record_entry set legal_hold = true where kind = 'certificate_signed' and object_ref = 'CERT-PILOT-000001'`);
  await entry('legal_hold_placed', { ref: 'HLD-0001', actor: 'auditor@example.com', actor_name: 'Ruth Lindqvist', site: 'SITE-PILOT', summary: 'Legal hold HLD-0001 placed on the record entry for the signing of CERT-PILOT-000001', event_at: new Date('2026-04-19T09:00:00Z'), effective_on: '2026-04-19' });

  // ---------- inbound ----------
  const inbound = [
    ['INB-0001','weighbridge','2026-02-20T06:14:00Z',{ ticket: 'WB-DEMO-02-00214', device: 'WB-DEMO-02', calibration_state: 'lapsed', gross_g: 121000, tare_g: 1000, net_g: 120000, batch: 'BATCH-1004' }],
    ['INB-0002','control_system','2026-03-04T22:41:00Z',{ run: 'RUN-D-0001', temperature_c: 165, pressure_bar: 3, solvent_ratio: 6.4, recorded_by: 'DCS' }],
    ['INB-0003','laboratory','2026-03-06T09:02:00Z',{ lot: 'LOT-N6-0001', property: 'relative_viscosity', method: 'ISO 307', value: 2.42, unit: 'ratio' }],
  ];
  for (const [ref, src, at, payload] of inbound) {
    await q(`insert into inbound_record values ($1,$2,$3,$4,now())`, [ref, src, new Date(at), JSON.stringify(payload)]);
    await entry('inbound_record_received', { ref, summary: `Inbound record from ${src} kept verbatim`, event_at: new Date(at), effective_on: at.slice(0,10) });
  }

  // ---------- public site ----------
  const stats = [
    ['textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor','2024','Global'],
    ['plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel','2023','Global'],
    ['textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor','2024','EU-27'],
  ];
  for (const s of stats) await q(`insert into statistic values ($1,$2,$3,$4,$5)`, s);
  await q(`insert into position(title,location,department,contract_type,closes_on) values ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);
  const news = [
    ['Series A closes at 40 million euros','funding','Materials Weekly','2026-01-22','https://ravel.example.com/news/series-a','en'],
    ['Offtake agreement signed for demonstration output','partnership','Fibre Report','2026-03-11','https://ravel.example.com/news/offtake','en'],
    ['Depolymerisation yield published','technical','Chimie Circulaire','2026-05-06','https://ravel.example.com/news/yield','fr'],
  ];
  for (const n of news) await q(`insert into news_item(title,tag,outlet,published_on,link,language) values ($1,$2,$3,$4,$5,$6)`, n);
  await q(`insert into claim_substantiation(claim,route,first_published_on,evidence,method_version,approver,review_on) values
    ('Less than 1 per cent of textiles are recycled into new materials','/about','2026-01-10',$1,null,'quality@example.com','2027-01-10'),
    ('Low-carbon recycled Nylon 6 under mass balance','/product','2026-01-10',$2,'CM-PA6 v2','quality@example.com','2027-01-10')`,
    [JSON.stringify([{ source: 'Textile Flow Monitor', year: '2024', geography: 'Global' }]),
     JSON.stringify([{ source: 'Plant ledger BP-DEMO-N6-2026H1', year: '2026', geography: 'SITE-DEMO' }, { source: 'EcoBase 2025 comparator', year: '2025', geography: 'EU-27' }])]);

  // ---------- conversion factors published for 2025H2 carry-over ----------
  await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,origin_site,effective_on,event_at) values
    ('BP-DEMO-N6-2025H2','in','post_consumer',60000,'carry_over_in',null,null,null,'2025-07-01','2025-07-01T09:00:00Z')`);
  await q(`insert into credit_movement(balance_period,direction,category,mass_g,kind,batch,lot,origin_site,effective_on,event_at) values
    ('BP-DEMO-N6-2025H2','out','post_consumer',0,'none',null,null,null,'2025-12-31','2025-12-31T09:00:00Z')`);

  await q(`insert into seed_marker(id) values (1)`);
  console.log('seed complete');
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });

