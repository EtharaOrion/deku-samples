import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

const canon = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
};
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const ZERO = '0'.repeat(64);

let digestState = ZERO;

async function rec(c, kind, object_ref, actor, site, content, when) {
  const payload = canon({ kind, object_ref: object_ref || null, actor: actor || null, site: site || null, content: content || {} });
  const digest = sha256(digestState + '\n' + payload);
  const prev = digestState;
  digestState = digest;
  const r = await c.query(
    `INSERT INTO record_entries (actor, site, kind, object_ref, content, digest, prev_digest, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING seq`,
    [actor || null, site || null, kind, object_ref || null, JSON.stringify(content || {}), digest, prev, when]
  );
  return Number(r.rows[0].seq);
}


const custody = (collector, site, on) => ([
  { kind: 'collection_site', date: on, party: collector },
  { kind: 'collector', date: on, party: collector },
  { kind: 'transport', date: on, party: 'TFR-Nord' },
  { kind: 'arrival', date: on, party: 'Ravel' },
  { kind: 'weighing', date: on, party: 'Ravel' },
  { kind: 'acceptance', date: on, party: 'Ravel' }
]);

function partyNameOf(ref, on) {
  if (ref === 'COL-BRINE' && on >= '2026-08-01') return 'Brine Circular Materials';
  if (ref === 'COL-BRINE') return 'Brine Textile Recovery';
  if (ref === 'COL-ALDER') return 'Alder Reclaim';
  return 'Cinder Industrial Offcuts';
}

export async function seedBody(pool) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const existing = await c.query(`SELECT v FROM app_meta WHERE k='seeded'`);
    if (existing.rows.length) {
      console.log('already seeded');
      await c.query('COMMIT');
      return;
    }

    // sites
    const sites = [
      ['SITE-PILOT','Pilot','commissioned',40000,24000,'certified'],
      ['SITE-DEMO','Demonstration','commissioned',400000,320000,'certified'],
      ['SITE-COMM','Commercial','planned',25000000,26000000,'not_certified']
    ];
    for (const [reference,name,confidence,nameplate,contracted,cert] of sites) {
      await c.query(`INSERT INTO sites VALUES ($1,$2,$3,$4,$5,$6,'8000 hours per year, 0.90 availability, 0.80 yield','2026-06-30')`,
        [reference,name,confidence,nameplate,contracted,cert]);
    }

    // grants
    const grants = [
      ['plant@example.com','plant_operator','SITE-DEMO'],
      ['plant@example.com','plant_operator','SITE-PILOT'],
      ['analyst@example.com','lab_analyst','SITE-DEMO'],
      ['analyst@example.com','lab_analyst','SITE-PILOT'],
      ['quality@example.com','quality_manager','SITE-DEMO'],
      ['quality@example.com','quality_manager','SITE-PILOT'],
      ['claims@example.com','claims_manager','SITE-DEMO'],
      ['claims@example.com','claims_manager','SITE-PILOT'],
      ['signer@example.com','certificate_signer','SITE-DEMO'],
      ['signer@example.com','certificate_signer','SITE-PILOT'],
      ['signer2@example.com','certificate_signer','SITE-PILOT'],
      ['auditor@example.com','auditor','SITE-DEMO'],
      ['auditor@example.com','auditor','SITE-PILOT']
    ];
    for (const g of grants) await c.query(`INSERT INTO grants VALUES ($1,$2,$3,'2027-06-30')`, g);

    // people as parties (identifier -> name in a separate store)
    const people = {
      'plant@example.com': 'Ines Bekele',
      'analyst@example.com': 'Tomas Vlach',
      'quality@example.com': 'Marit Solheim',
      'claims@example.com': 'Osei Danquah',
      'signer@example.com': 'Hana Ferreira',
      'signer2@example.com': 'Pavel Ostrowski',
      'auditor@example.com': 'Ruth Lindqvist'
    };
    for (const [email,name] of Object.entries(people)) {
      await c.query(`INSERT INTO parties (reference,kind,current_name) VALUES ($1,'person',$2)`, [email,name]);
      await c.query(`INSERT INTO party_versions (party,name,effective_from) VALUES ($1,$2,'2026-01-01')`, [email,name]);
    }

    // collectors
    const collectors = [
      ['COL-ALDER','Alder Reclaim','PT','WCR-PT-4471','2027-03-31',['kerbside','drop_off'],'mixed nylon','certified'],
      ['COL-BRINE','Brine Textile Recovery','NL','WCR-NL-2208','2027-01-31',['industrial_laundry'],'post-industrial offcuts','certified'],
      ['COL-CINDER','Cinder Industrial Offcuts','FR','WCR-FR-6613','2026-12-31',['factory'],'pre-consumer offcuts','conditional']
    ];
    for (const [ref,name,country,reg,exp,types,streams,status] of collectors) {
      await c.query(`INSERT INTO parties (reference,kind,current_name,country,registration,registration_expiry) VALUES ($1,'collector',$2,$3,$4,$5)`,
        [ref,name,country,reg,exp]);
      await c.query(`INSERT INTO collectors_extra (reference,site_types,streams,scheme_status) VALUES ($1,$2,$3,$4)`,
        [ref, JSON.stringify(types), JSON.stringify(streams.split(' ')), status]);
    }
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'COL-BRINE','Brine Textile Recovery','2026-01-01')`);
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'COL-BRINE','Brine Circular Materials','2026-08-01')`);
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'COL-ALDER','Alder Reclaim','2026-01-01')`);
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'COL-CINDER','Cinder Industrial Offcuts','2026-01-01')`);

    const approvals = [
      ['COL-ALDER','approved','2026-01-01','2026-12-31',null,null],
      ['COL-BRINE','approved','2026-01-01','2026-06-30',null,null],
      ['COL-CINDER','conditional','2026-01-01','2026-12-31','Sampling plan for coated streams to be agreed','2026-10-31']
    ];
    for (const a of approvals) await c.query(`INSERT INTO approval_periods (collector,state,valid_from,valid_to,condition,condition_closes_on) VALUES ($1,$2,$3,$4,$5,$6)`, a);

    await c.query(`INSERT INTO devices VALUES ('WB-DEMO-01','SITE-DEMO','2026-05-01')`);
    await c.query(`INSERT INTO devices VALUES ('WB-DEMO-02','SITE-DEMO','2025-02-01')`);

    // record entries in chronological order of the acts
    // 1. collector approvals
    await rec(c,'collector_approved','COL-ALDER','quality@example.com',null,{state:'approved',valid_from:'2026-01-01',valid_to:'2026-12-31'},'2026-01-05T09:00:00Z');
    await rec(c,'collector_approved','COL-BRINE','quality@example.com',null,{state:'approved',valid_from:'2026-01-01',valid_to:'2026-06-30'},'2026-01-06T09:00:00Z');
    await rec(c,'collector_approved','COL-CINDER','quality@example.com',null,{state:'conditional',valid_from:'2026-01-01',valid_to:'2026-12-31',condition:'Sampling plan for coated streams to be agreed'},'2026-01-07T09:00:00Z');

    // 2. batches
    const batches = [
      { ref:'BATCH-1001', coll:'COL-ALDER', site:'SITE-DEMO', grade:'N6', cat:'post_consumer', received:'2026-02-10', net:500000, moist:1000, meth:'oven drying to constant mass', dev:'WB-DEMO-01',
        comp:{polymer:'PA6',fraction_bp:9200,basis:'sampled',elastane_bp:400},
        contam:{non_nylon_bp:300,elastane_bp:400,coatings:'none',colour_load:'low',foreign_matter:'traces'}, createdBy:'analyst@example.com' },
      { ref:'BATCH-1002', coll:'COL-ALDER', site:'SITE-DEMO', grade:'N6', cat:'pre_consumer', received:'2026-02-12', net:300000, moist:0, meth:'oven drying to constant mass', dev:'WB-DEMO-01',
        comp:{polymer:'PA6',fraction_bp:9800,basis:'declared'},
        contam:{non_nylon_bp:100,elastane_bp:0,coatings:'none',colour_load:'low',foreign_matter:'none'}, createdBy:'plant@example.com' },
      { ref:'BATCH-1003', coll:'COL-BRINE', site:'SITE-DEMO', grade:'N6', cat:'post_consumer', received:'2026-07-05', net:200000, moist:500, meth:'oven drying to constant mass', dev:'WB-DEMO-01',
        comp:{polymer:'PA6',fraction_bp:9500,basis:'declared'},
        contam:{non_nylon_bp:200,elastane_bp:100,coatings:'none',colour_load:'medium',foreign_matter:'none'}, createdBy:'plant@example.com' },
      { ref:'BATCH-1004', coll:'COL-CINDER', site:'SITE-DEMO', grade:'N6', cat:'pre_consumer', received:'2026-02-20', net:120000, moist:0, meth:'oven drying to constant mass', dev:'WB-DEMO-02',
        comp:{polymer:'PA6',fraction_bp:9900,basis:'declared',measured_fraction_bp:9100},
        contam:{non_nylon_bp:500,elastane_bp:0,coatings:'none',colour_load:'low',foreign_matter:'none'}, createdBy:'plant@example.com' },
      { ref:'BATCH-1005', coll:'COL-ALDER', site:'SITE-DEMO', grade:'N6', cat:'post_consumer', received:'2026-03-02', net:100000, moist:0, meth:'oven drying to constant mass', dev:'WB-DEMO-01',
        comp:{polymer:'PA6',fraction_bp:9000,basis:'declared'},
        contam:{non_nylon_bp:400,elastane_bp:300,coatings:'none',colour_load:'medium',foreign_matter:'traces'}, createdBy:'plant@example.com' }
    ];

    const gross = { 'BATCH-1001': 505000, 'BATCH-1002': 302000, 'BATCH-1003': 202000, 'BATCH-1004': 121000, 'BATCH-1005': 101000 };
    const tare = { 'BATCH-1001': 10000, 'BATCH-1002': 2000, 'BATCH-1003': 2000, 'BATCH-1004': 1000, 'BATCH-1005': 1000 };
    for (const b of batches) {
      const cust = b.ref === 'BATCH-1005'
        ? custody(b.coll, b.site, b.received).filter((l) => l.kind !== 'transport')
        : custody(b.coll, b.site, b.received);
      await c.query(`INSERT INTO batches (reference,collector,site,grade,category,received_on,gross_g,tare_g,net_g,moisture_bp,moisture_method,device,composition,contamination,custody,accepted_g,collector_name,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [b.ref,b.coll,b.site,b.grade,b.cat,b.received,gross[b.ref],tare[b.ref],b.net,b.moist,b.meth,b.dev,JSON.stringify(b.comp),JSON.stringify(b.contam),JSON.stringify(cust),b.net,partyNameOf(b.coll,b.received),b.createdBy]);
      await rec(c,'batch_booked',b.ref,b.createdBy,b.site,{collector:b.coll,category:b.cat,net_g:b.net,moisture_bp:b.moist,device:b.dev,received_on:b.received},b.received+'T08:00:00Z');
    }

    // collector finding on COL-CINDER from BATCH-1004 composition departure
    await c.query(`INSERT INTO collector_findings (collector, opened_on, detail) VALUES ('COL-CINDER','2026-02-22',$1)`,
      [JSON.stringify({batch:'BATCH-1004', declared_fraction_bp:9900, measured_fraction_bp:9100, departure_bp:800, tolerance_bp:500})]);
    await rec(c,'collector_finding','COL-CINDER','analyst@example.com',null,{batch:'BATCH-1004',declared_fraction_bp:9900,measured_fraction_bp:9100,departure_bp:800},'2026-02-22T10:00:00Z');

    // balance periods
    const bps = [
      ['BP-DEMO-N6-2025H2','SITE-DEMO','N6','2025-07-01','2025-12-31','closed',2000,'2026-01-15','2026-01-10',{post_consumer:15000,pre_consumer:5000},{post_consumer:60000,pre_consumer:20000}],
      ['BP-DEMO-N6-2026H1','SITE-DEMO','N6','2026-01-01','2026-06-30','open',2000,null,null,{},{}],
      ['BP-PILOT-N6-2026H1','SITE-PILOT','N6','2026-01-01','2026-06-30','open',2000,null,null,{},{}]
    ];
    for (const [id,site,grade,from,to,state,limit,closedOn,cutOff,cf,ex] of bps) {
      await c.query(`INSERT INTO balance_periods VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'mass',$10,$11)`,
        [id,site,grade,from,to,state,limit,closedOn,cutOff,JSON.stringify(cf),JSON.stringify(ex)]);
    }

    // conversion factors
    await c.query(`INSERT INTO conversion_factors VALUES ('CF-DEMO-1','SITE-DEMO',8000,'2026-01-01','2026-03-31',1000000,800000,false,'claims@example.com','2026-04-01')`);
    await c.query(`INSERT INTO conversion_factors VALUES ('CF-PILOT-1','SITE-PILOT',7500,null,null,0,0,true,'claims@example.com','2026-01-15')`);
    await rec(c,'conversion_factor_published','CF-DEMO-1','claims@example.com','SITE-DEMO',{factor_bp:8000,derived_in_g:1000000,derived_out_g:800000,window:{from:'2026-01-01',to:'2026-03-31'}},'2026-04-01T10:00:00Z');
    await rec(c,'conversion_factor_published','CF-PILOT-1','claims@example.com','SITE-PILOT',{factor_bp:7500,provisional:true},'2026-01-15T10:00:00Z');

    // recipes
    const recipes = [
      ['RCP-DISS-2','dissolution',{temperature:165,pressure:3},{temperature:[160,170],pressure:[2,4]},{sodium_hydroxide_g_per_kg:12},45],
      ['RCP-DEPO-4','depolymerisation',{temperature:245,pressure:5},{temperature:[240,250],pressure:[4,6]},{sodium_hydroxide_g_per_kg:18},90],
      ['RCP-PURI-1','purification',{temperature:120,pressure:2},{temperature:[115,125],pressure:[1,3]},{activated_carbon_g_per_kg:6},60],
      ['RCP-REPO-3','repolymerisation',{temperature:260,pressure:1},{temperature:[255,265],pressure:[1,2]},{caprolactam_purity_bp:9990},120]
    ];
    for (const [v,t,sp,tol,rea,res] of recipes) {
      await c.query(`INSERT INTO recipes VALUES ($1,$2,$3,$4,$5,$6,'quality@example.com','2026-01-10')`,
        [v,t,JSON.stringify(sp),JSON.stringify(tol),JSON.stringify(rea),res]);
    }

    // runs
    const runs = [
      ['RUN-D-0001','dissolution','SITE-DEMO','VESS-D-1','RCP-DISS-2','plant@example.com','2026-02-15T08:00:00Z','2026-02-15T16:00:00Z',120000,{temperature:165,pressure:3},true],
      ['RUN-D-0002','dissolution','SITE-DEMO','VESS-D-1','RCP-DISS-2','plant@example.com','2026-02-25T08:00:00Z','2026-02-25T16:00:00Z',60000,{temperature:163,pressure:3},true],
      ['RUN-D-0003','dissolution','SITE-DEMO','VESS-D-2','RCP-DISS-2','plant@example.com','2026-03-05T08:00:00Z','2026-03-05T14:00:00Z',30000,{temperature:168,pressure:4},true],
      ['RUN-Y-0001','depolymerisation','SITE-DEMO','VESS-Y-1','RCP-DEPO-4','plant@example.com','2026-03-10T08:00:00Z','2026-03-11T08:00:00Z',50000,{temperature:246,pressure:5},true],
      ['RUN-U-0001','purification','SITE-DEMO','VESS-U-1','RCP-PURI-1','plant@example.com','2026-03-15T08:00:00Z','2026-03-16T08:00:00Z',40000,{temperature:121,pressure:2},true],
      ['RUN-R-0001','repolymerisation','SITE-DEMO','VESS-R-1','RCP-REPO-3','plant@example.com','2026-03-20T08:00:00Z','2026-03-21T08:00:00Z',20000,{temperature:259,pressure:1},true]
    ];
    for (const [ref,t,site,eq,rv,op,started,closed,losses,ach,within] of runs) {
      await c.query(`INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,achieved,within_tolerance,period)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'BP-DEMO-N6-2026H1')`,
        [ref,t,site,eq,rv,op,started,closed,losses,JSON.stringify(ach),within]);
    }

    const consumptions = [
      ['RUN-D-0001','BATCH-1001','batch',300000],
      ['RUN-D-0001','BATCH-1002','batch',300000],
      ['RUN-D-0002','BATCH-1003','batch',190000],
      ['RUN-D-0002','BATCH-1004','batch',120000],
      ['RUN-D-0003','BATCH-1001','batch',150000],
      ['RUN-Y-0001','OUT-D-0001','intermediate',480000],
      ['RUN-Y-0001','OUT-D-0002','intermediate',250000],
      ['RUN-Y-0001','OUT-D-0003','intermediate',120000],
      ['RUN-U-0001','OUT-Y-0001','intermediate',800000],
      ['RUN-R-0001','OUT-U-0001','intermediate',720000]
    ];
    const consDates = { 'RUN-D-0001':'2026-02-15','RUN-D-0002':'2026-02-25','RUN-D-0003':'2026-03-05','RUN-Y-0001':'2026-03-10','RUN-U-0001':'2026-03-15','RUN-R-0001':'2026-03-20' };
    for (const [run,input_ref,kind,mass] of consumptions) {
      const eff = consDates[run];
      await c.query(`INSERT INTO consumptions (run,input_ref,input_kind,mass_g,effective_on) VALUES ($1,$2,$3,$4,$5)`,[run,input_ref,kind,mass,eff]);
    }
    const outputs = [
      ['OUT-D-0001','RUN-D-0001','intermediate',480000],
      ['OUT-D-0002','RUN-D-0002','intermediate',250000],
      ['OUT-D-0003','RUN-D-0003','intermediate',120000],
      ['OUT-Y-0001','RUN-Y-0001','intermediate',800000],
      ['OUT-U-0001','RUN-U-0001','intermediate',720000],
      ['OUT-U-0002','RUN-U-0001','byproduct',40000]
    ];
    for (const [ref,run,kind,mass] of outputs) {
      await c.query(`INSERT INTO outputs VALUES ($1,$2,$3,$4,$5)`,[ref,run,kind,mass,kind==='byproduct'?'sold':null]);
    }
    // RUN-R-0001 produced the two lots as outputs of its own
    await c.query(`INSERT INTO outputs VALUES ('LOT-N6-0001','RUN-R-0001','lot',400000,null)`);
    await c.query(`INSERT INTO outputs VALUES ('LOT-N6-0002','RUN-R-0001','lot',300000,null)`);
    await c.query(`INSERT INTO lots (reference,site,grade,mass_g,disposition,claim_type,produced_by,flags,created_by,disposition_by,disposition_on)
      VALUES ('LOT-N6-0001','SITE-DEMO','N6',400000,'released','mass_balance','RUN-R-0001','[]','plant@example.com','quality@example.com','2026-03-22')`);
    await c.query(`INSERT INTO lots (reference,site,grade,mass_g,disposition,claim_type,produced_by,flags,created_by) VALUES ('LOT-N6-0002','SITE-DEMO','N6',300000,'quarantined','mass_balance','RUN-R-0001','[]','plant@example.com')`);
    // LOT-N6-0003 was produced at the pilot site under its own run
    await c.query(`INSERT INTO runs (reference,run_type,site,equipment,recipe_version,operator,started_at,closed_at,losses_g,achieved,within_tolerance,period)
      VALUES ('RUN-R-PILOT-1','repolymerisation','SITE-PILOT','VESS-PILOT-1','RCP-REPO-3','plant@example.com','2026-02-20T08:00:00Z','2026-02-21T08:00:00Z',10000,'{"temperature":258,"pressure":1}',true,'BP-PILOT-N6-2026H1')`);
    await c.query(`INSERT INTO consumptions (run,input_ref,input_kind,mass_g,effective_on) VALUES ('RUN-R-PILOT-1','BATCH-PILOT-0001','batch',210000,'2026-02-20')`);
    await c.query(`INSERT INTO outputs VALUES ('LOT-N6-0003','RUN-R-PILOT-1','lot',200000,null)`);
    await c.query(`INSERT INTO lots (reference,site,grade,mass_g,disposition,claim_type,produced_by,flags,created_by,disposition_by,disposition_on)
      VALUES ('LOT-N6-0003','SITE-PILOT','N6',200000,'released','mass_balance','RUN-R-PILOT-1','[]','plant@example.com','quality@example.com','2026-02-28')`);

    // deviations
    await c.query(`INSERT INTO deviations (reference,state,subjects,description,raised_by,recorded_at) VALUES ('DEV-0001','open',$1,'Purity drift on the purification train','plant@example.com','2026-03-16T09:00:00Z')`,
      [JSON.stringify(['RUN-U-0001','LOT-N6-0002'])]);
    await c.query(`INSERT INTO deviations (reference,state,subjects,description,raised_by,outcome,closed_at,recorded_at) VALUES ('DEV-0002','closed',$1,'Dissolution pressure excursion','plant@example.com','cause_not_established','2026-02-26T09:00:00Z','2026-02-26T09:00:00Z')`,
      [JSON.stringify(['RUN-D-0002'])]);
    await rec(c,'deviation_raised','DEV-0001','plant@example.com','SITE-DEMO',{subjects:['RUN-U-0001','LOT-N6-0002']},'2026-03-16T09:00:00Z');
    await rec(c,'deviation_closed','DEV-0002','quality@example.com','SITE-DEMO',{outcome:'cause_not_established'},'2026-02-26T09:00:00Z');

    // override
    await c.query(`INSERT INTO overrides VALUES ('OVR-0001','analyst_not_dispositioner','Night shift analyst dispositioned the lot because no second qualified person was on site','LOT-N6-0001','quality@example.com','2026-03-18',false,null,null)`);
    await rec(c,'override_recorded','OVR-0001','quality@example.com','SITE-DEMO',{separation:'analyst_not_dispositioner',lot:'LOT-N6-0001',authorised_by:'quality@example.com'},'2026-03-18T22:00:00Z');

    // test results
    await c.query(`INSERT INTO test_results (subject,property,method,instrument,analyst,value,unit,uncertainty_bp,recorded_at) VALUES
      ('LOT-N6-0001','relative_viscosity','ISO 307','VIS-2','analyst@example.com',2.45,'ratio',300,'2026-03-21T10:00:00Z'),
      ('LOT-N6-0001','moisture','ISO 15512','MB-1','analyst@example.com',0.08,'percent',200,'2026-03-21T10:30:00Z'),
      ('LOT-N6-0003','relative_viscosity','ISO 307','VIS-2','analyst@example.com',2.41,'ratio',300,'2026-02-27T10:00:00Z')`);
    await rec(c,'test_result','LOT-N6-0001','analyst@example.com','SITE-DEMO',{property:'relative_viscosity',method:'ISO 307',value:2.45},'2026-03-21T10:00:00Z');

    // credit movements for BP-DEMO-N6-2026H1 (granted at consumption, dry mass x 8000bp)
    const creditRows = [
      ['BP-DEMO-N6-2026H1','post_consumer',360000,'consumption','BATCH-1001','2026-02-15'],
      ['BP-DEMO-N6-2026H1','pre_consumer',240000,'consumption','BATCH-1002','2026-02-15'],
      ['BP-DEMO-N6-2026H1','pre_consumer',96000,'consumption','BATCH-1004','2026-02-25'],
      ['BP-DEMO-N6-2025H2','post_consumer',75000,'consumption','prior','2025-09-01'],
      ['BP-DEMO-N6-2025H2','pre_consumer',25000,'consumption','prior','2025-09-01']
    ];
    for (const [period,cat,mass,kind,ref,eff] of creditRows) {
      await c.query(`INSERT INTO credit_movements (period,category,direction,mass_g,kind,movement_ref,effective_on) VALUES ($1,$2,'in',$3,$4,$5,$6)`,[period,cat,mass,kind,ref,eff]);
    }
    // BATCH-1003 was consumed non-claimable: it enters the period as non-claimable input, never as credit
    await c.query(`INSERT INTO credit_movements (period,category,direction,mass_g,kind,origin_site,movement_ref,effective_on)
      VALUES ('BP-DEMO-N6-2026H1','non_claimable','in',190000,'non_claimable_input','NON_CLAIMABLE','BATCH-1003','2026-02-25')`);
    await rec(c,'period_closed','BP-DEMO-N6-2025H2','claims@example.com','SITE-DEMO',{carried_forward_g:{post_consumer:15000,pre_consumer:5000},expired_g:{post_consumer:60000,pre_consumer:20000}},'2026-01-15T10:00:00Z');

    // carbon methods
    await c.query(`INSERT INTO carbon_methods VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-11-10',2)`);
    await c.query(`INSERT INTO carbon_methods VALUES ('CM-PA6',2,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2026-01-20',null)`);
    const ef = [
      ['CM-PA6',2,'collection_and_transport',310000,'primary','Ravel logistics metering',2026],
      ['CM-PA6',2,'process_energy',1850000,'primary','Site utility meters',2026],
      ['CM-PA6',2,'reagents',1180000,'supplier_specific','Supplier EPDs',2025],
      ['CM-PA6',2,'water_and_effluent',240000,'primary','Site utility meters',2026],
      ['CM-PA6',2,'waste_and_residues',330000,'secondary','EcoBase 2025',2025],
      ['CM-PA6',2,'outbound_transport',410000,'secondary','EcoBase 2025',2025],
      ['CM-PA6',2,'byproduct_credit',-60000,'primary','Ravel allocation basis',2026]
    ];
    for (const f of ef) await c.query(`INSERT INTO emission_factors (method_id,method_version,line,mg_per_kg,tag,source,year) VALUES ($1,$2,$3,$4,$5,$6,$7)`,f);
    await c.query(`INSERT INTO energy_lines VALUES ('CM-PA6',2,1850000,620000)`);
    await c.query(`INSERT INTO carbon_methods VALUES ('CM-PA6',1,'ISO 14067','1 kg of pellet','cradle-to-gate','mass','Ilse Grootveld','2025-11-10',2) ON CONFLICT DO NOTHING`);
    const ef1 = [
      ['CM-PA6',1,'collection_and_transport',330000,'primary','Ravel logistics metering',2025],
      ['CM-PA6',1,'process_energy',1950000,'primary','Site utility meters',2025],
      ['CM-PA6',1,'reagents',1240000,'supplier_specific','Supplier EPDs',2024],
      ['CM-PA6',1,'water_and_effluent',250000,'primary','Site utility meters',2025],
      ['CM-PA6',1,'waste_and_residues',340000,'secondary','EcoBase 2024',2024],
      ['CM-PA6',1,'outbound_transport',430000,'secondary','EcoBase 2024',2024],
      ['CM-PA6',1,'byproduct_credit',-58000,'primary','Ravel allocation basis',2025]
    ];
    for (const f of ef1) await c.query(`INSERT INTO emission_factors (method_id,method_version,line,mg_per_kg,tag,source,year) VALUES ($1,$2,$3,$4,$5,$6,$7)`,f);
    await c.query(`INSERT INTO energy_lines VALUES ('CM-PA6',1,1950000,650000)`);
    await rec(c,'carbon_method_published','CM-PA6:v2','quality@example.com',null,{id:'CM-PA6',version:2,standard:'ISO 14067',boundary:'cradle-to-gate',supersedes:1},'2026-01-20T09:00:00Z');

    // carbon figure for LOT-N6-0001
    const breakdown = [
      {line:'collection_and_transport',mg_per_kg:310000,tag:'primary'},
      {line:'process_energy',mg_per_kg:1850000,tag:'primary'},
      {line:'reagents',mg_per_kg:1180000,tag:'supplier_specific'},
      {line:'water_and_effluent',mg_per_kg:240000,tag:'primary'},
      {line:'waste_and_residues',mg_per_kg:330000,tag:'secondary'},
      {line:'outbound_transport',mg_per_kg:410000,tag:'secondary'},
      {line:'byproduct_credit',mg_per_kg:-60000,tag:'primary'}
    ];
    const inputVersions = {
      carbon_method: 'CM-PA6 v2',
      emission_factors: ef.map((f) => ({line:f[2],source:f[5],year:f[6],mg_per_kg:f[3]})),
      comparator: {material:'virgin PA6',dataset:'EcoBase 2025',dataset_year:2025,region:'EU-27'},
      energy: {location_mg_per_kg:1850000,market_mg_per_kg:620000}
    };
    await c.query(`INSERT INTO carbon_figures VALUES ('CFG-0001','LOT-N6-0001',4260000,1200,6500,'cradle-to-gate','CM-PA6',2,$1,$2,$3,true,1,null,null,null,null,'BP-DEMO-N6-2026H1')`,
      [JSON.stringify({material:'virgin PA6',dataset:'EcoBase 2025',dataset_year:2025,region:'EU-27'}),JSON.stringify(breakdown),JSON.stringify(inputVersions)]);

    // energy instruments
    await c.query(`INSERT INTO energy_instruments VALUES ('EAC-2026-0007',250000,2026,'EU-27','retired')`);
    await c.query(`INSERT INTO energy_instruments VALUES ('EAC-2025-0031',100000,2025,'EU-27','held')`);
    await c.query(`INSERT INTO energy_period_totals VALUES ('BP-DEMO-N6-2026H1',300000)`);
    await c.query(`INSERT INTO energy_retirements (instrument,period,quantity_kwh,retired_on) VALUES ('EAC-2026-0007','BP-DEMO-N6-2026H1',250000,'2026-04-02')`);
    await rec(c,'energy_retired','EAC-2026-0007','claims@example.com','SITE-DEMO',{period:'BP-DEMO-N6-2026H1',quantity_kwh:250000},'2026-04-02T10:00:00Z');

    // specifications
    const specRows = [
      ['relative_viscosity','ISO 307',2.40,'ratio','guaranteed'],
      ['moisture','ISO 15512',0.10,'percent','guaranteed'],
      ['yellowness_index','ASTM E313',8.0,'index','typical'],
      ['ash_content','ISO 3451-1',0.30,'percent','informational']
    ];
    for (const v of [2,3]) {
      await c.query(`INSERT INTO specifications VALUES ('N6',$1,$2,'virgin PA6 at relative viscosity 2.42','EcoBase 2025','2025-11-30',$3,$4)`,
        [v, v===3?'2026-02-01':'2025-08-01', JSON.stringify(specRows), v===3]);
    }
    await c.query(`INSERT INTO spec_issues (grade,version,customer,issued_on) VALUES ('N6',3,'CUS-HELIOS','2026-02-01')`);
    await c.query(`INSERT INTO spec_issues (grade,version,customer,issued_on) VALUES ('N6',2,'CUS-VANTA','2025-08-05')`);

    // customers
    await c.query(`INSERT INTO parties (reference,kind,current_name,email,contact,application,industry,region) VALUES
      ('CUS-HELIOS','customer','Helios Textiles','helios@example.com','helios@example.com','technical apparel yarn','textiles','EU-27'),
      ('CUS-VANTA','customer','Vanta Automotive','vanta@example.com','vanta@example.com','airbag fabric','automotive','EU-27')`);
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'CUS-HELIOS','Helios Textiles','2026-01-01')`);
    await c.query(`INSERT INTO party_versions VALUES (DEFAULT,'CUS-VANTA','Vanta Automotive','2026-01-01')`);
    await c.query(`INSERT INTO conformances (customer,application,grade,version,trials,outcome) VALUES
      ('CUS-HELIOS','technical apparel yarn','N6',3,$1,'passed'),
      ('CUS-VANTA','airbag fabric','N6',2,$2,'in_trial')`,
      [JSON.stringify([{trial:'spinning trial',date:'2026-02-20',outcome:'passed'},{trial:'dyeing trial',date:'2026-03-01',outcome:'passed'}]),
       JSON.stringify([{trial:'airbag fabric weave trial',date:'2025-09-15',outcome:'in_trial'}])]);

    // contracts
    await c.query(`INSERT INTO contracts VALUES ('CON-HELIOS-1','CUS-HELIOS','SITE-DEMO','2026-H1',200,5000,0,'renegotiation of the shortfall volume at the following period price',null,null)`);
    await c.query(`INSERT INTO contracts VALUES ('CON-VANTA-1','CUS-VANTA','SITE-COMM','2029-H1',1000,3000,0,'a make-good volume in the following period',null,null)`);

    // certificates: pilot sequence 1 and 2
    const permitted = (claim, pctBp, cat) => {
      const pct = (pctBp/100).toString();
      return `This material is claimed by mass balance. It is not physically segregated. It carries ${pct} per cent recycled content by mass balance.`;
    };
    const prohibited = `You may not state that this material physically contains recycled content.`;
    const permittedStatement = (content_bp, claim_type) =>
      `This material is claimed by ${claim_type === 'mass_balance' ? 'mass balance' : claim_type}. It is not physically segregated. Recycled content: ${(content_bp/100).toFixed(2)} per cent by mass balance.`;
    const doc1 = `RAVEL RECYCLED POLYMER CERTIFICATE
Certificate number: CERT-PILOT-000001
Version: 1

Site: SITE-PILOT (Pilot)
Grade: N6
Lot: LOT-N6-0003
Lot mass: 200000 g

Claim
Claim type: mass_balance
Recycled content: 90.00 per cent
Category split: post_consumer 180000 g

Carbon footprint
Value: 4260000 mg CO2e per kg
Boundary: cradle-to-gate
Method version: CM-PA6 v2
Uncertainty: 1200 basis points

Permitted statement
This material is claimed by mass balance. It is not physically segregated. It carries 90.00 per cent recycled content.

Prohibited statement
You may not state that this material physically contains recycled content.

Signer: Pavel Ostrowski (signer2@example.com)
Signed on: 2026-03-02
Scheme: RCS-2026
Registration: REG-RAVEL-0042

Withdrawn on 2026-04-18. Reason: A collector category was corrected after acceptance.
Verify this certificate at ravel.example.com/verify/CERT-PILOT-000001.
`;
    await c.query(`INSERT INTO certificates (number,version,site,lot,lot_mass_g,recipient,recipient_name,recipient_contact,grade,specification_version,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,conditions,state,provisional_factor,derived_from,withdrawn_reason,withdrawn_by,withdrawn_on,notified_recipients,void_statements,derived_certificates,batch_traversal,input_versions,document)
      VALUES ('CERT-PILOT-000001',1,'SITE-PILOT','LOT-N6-0003',200000,'CUS-HELIOS','Helios Textiles','helios@example.com','N6',3,'mass_balance',9000,$1,'BP-PILOT-N6-2026H1','CFG-PILOT-1',6500,'RCS-2026','REG-RAVEL-0042',$2,$3,$4,'signer2@example.com','2026-03-02T10:00:00Z',$5,'withdrawn',true,null,'A collector category was corrected after acceptance','signer2@example.com','2026-04-18T10:00:00Z',$6,$7,$8,$9,$10,$11)`,
      [JSON.stringify({post_consumer:180000}),
       JSON.stringify([{property:'relative_viscosity',method:'ISO 307',value:2.41,unit:'ratio'}]),
       'This material is claimed by mass balance. It is not physically segregated. It carries 90.00 per cent recycled content.',
       'You may not state that this material physically contains recycled content.',
       JSON.stringify([{condition:'lot_released',satisfied:true},{condition:'no_open_deviation',satisfied:true},{condition:'no_unreviewed_override',satisfied:true},{condition:'period_closed',satisfied:false},{condition:'balance_invariant_holds',satisfied:true},{condition:'carbon_figure_complete',satisfied:true},{condition:'signer_scope',satisfied:true},{condition:'signer_not_data_enterer',satisfied:true}]),
       JSON.stringify([{reference:'CUS-HELIOS',name:'Helios Textiles',contact:'helios@example.com'}]),
       JSON.stringify(['This material is claimed by mass balance. It is not physically segregated.','This material carries 90.00 per cent recycled content.']),
       JSON.stringify([]),
       JSON.stringify({batches:['BATCH-PILOT-0001'],lots:['LOT-N6-0003'],recipients:['CUS-HELIOS']}),
       JSON.stringify({carbon_method:'CM-PA6 v2',specification:'SPEC-N6 v3',conversion_factor:'CF-PILOT-1'}),
       doc1]);
    await c.query(`INSERT INTO cert_sequences VALUES ('SITE-PILOT',2)`);
    await rec(c,'certificate_signed','CERT-PILOT-000001','signer2@example.com','SITE-PILOT',{lot:'LOT-N6-0003',recipient:'CUS-HELIOS',content_bp:9000},'2026-03-02T10:00:00Z');
    const doc2 = `RAVEL RECYCLED POLYMER CERTIFICATE
Certificate number: CERT-PILOT-000002
Version: 1

Site: SITE-PILOT (Pilot)
Grade: N6
Lot: LOT-N6-0003
Lot mass: 200000 g

Claim
Claim type: mass_balance
Recycled content: 90.00 per cent
Category split: post_consumer 180000 g

Carbon footprint
Value: 4260000 mg CO2e per kg
Boundary: cradle-to-gate
Method version: CM-PA6 v2
Uncertainty: 1200 basis points

Permitted statement
This material is claimed by mass balance. It is not physically segregated. It carries 90.00 per cent recycled content.

Prohibited statement
You may not state that this material physically contains recycled content.

Signer: Pavel Ostrowski (signer2@example.com)
Signed on: 2026-03-02
Scheme: RCS-2026
Registration: REG-RAVEL-0042

Verify this certificate at ravel.example.com/verify/CERT-PILOT-000002.
`;
    await c.query(`INSERT INTO certificates (number,version,site,lot,lot_mass_g,recipient,recipient_name,recipient_contact,grade,specification_version,claim_type,content_bp,category_split,period,carbon_figure,primary_share_bp,scheme,registration,test_results,permitted_statement,prohibited_statement,signer,signed_at,conditions,state,provisional_factor,document)
      VALUES ('CERT-PILOT-000002',1,'SITE-PILOT','LOT-N6-0003',200000,'CUS-VANTA','Vanta Automotive','vanta@example.com','N6',3,'mass_balance',9000,$1,'BP-PILOT-N6-2026H1','CFG-PILOT-1',6500,'RCS-2026','REG-RAVEL-0042',$2,$3,$4,'signer2@example.com','2026-03-02T11:00:00Z',$5,'issued',true,$6)`,
      [JSON.stringify({post_consumer:180000}),
       JSON.stringify([{property:'relative_viscosity',method:'ISO 307',value:2.41,unit:'ratio'}]),
       'This material is claimed by mass balance. It is not physically segregated. It carries 90.00 per cent recycled content.',
       'You may not state that this material physically contains recycled content.',
       JSON.stringify([{condition:'lot_released',satisfied:true},{condition:'no_open_deviation',satisfied:true},{condition:'no_unreviewed_override',satisfied:true},{condition:'period_closed',satisfied:false},{condition:'balance_invariant_holds',satisfied:true},{condition:'carbon_figure_complete',satisfied:true},{condition:'signer_scope',satisfied:true},{condition:'signer_not_data_enterer',satisfied:true}]),
       doc2]);
    await rec(c,'certificate_signed','CERT-PILOT-000002','signer2@example.com','SITE-PILOT',{lot:'LOT-N6-0003',recipient:'CUS-VANTA',content_bp:9000},'2026-03-02T11:00:00Z');
    await rec(c,'certificate_withdrawn','CERT-PILOT-000001','signer2@example.com','SITE-PILOT',{reason:'A collector category was corrected after acceptance',notified:['CUS-HELIOS']},'2026-04-18T10:00:00Z');

    // pilot period credit (so the pilot ledger holds the credit the certificates attach)
    await c.query(`INSERT INTO credit_movements (period,category,direction,mass_g,kind,movement_ref,effective_on) VALUES
      ('BP-PILOT-N6-2026H1','post_consumer','in',180000,'consumption','BATCH-PILOT-0001','2026-02-20'),
      ('BP-PILOT-N6-2026H1','post_consumer','out',180000,'allocation','LOT-N6-0003','2026-03-02')`);

    // transfer TRF-0001: from pilot to demo on 2026-05-12
    await c.query(`INSERT INTO transfers VALUES ('TRF-0001','BP-PILOT-N6-2026H1','BP-DEMO-N6-2026H1',50000,'post_consumer','2026-05-12','claims@example.com')`);
    // The transfer is recorded as an act; its ledger movements land when the transfer route is used.
    // Seed state keeps credits_in at 360000 pc / 336000 pre for the DEMO period.
    await rec(c,'transfer_recorded','TRF-0001','claims@example.com','SITE-PILOT',{from:'BP-PILOT-N6-2026H1',to:'BP-DEMO-N6-2026H1',mass_g:50000},'2026-05-12T09:00:00Z');

    // inbound records (payload verbatim)
    const inbound = [
      ['INB-0001','weighbridge','2026-02-20T06:14:00Z',{"device":"WB-DEMO-02","ticket":"WB-2026-0447","net_kg":121.0,"calibrated_on":"2025-02-01","batch":"BATCH-1004"}],
      ['INB-0002','control_system','2026-03-04T22:41:00Z',{"run":"RUN-D-0001","temperature":165,"pressure":3,"residence_minutes":46}],
      ['INB-0003','laboratory','2026-03-06T09:02:00Z',{"lot":"LOT-N6-0001","property":"relative_viscosity","method":"ISO 307","value":2.45,"instrument":"VIS-2"}]
    ];
    for (const [ref,src,when,payload] of inbound) {
      await c.query(`INSERT INTO inbound_records (reference,source,received_at,payload_verbatim,payload) VALUES ($1,$2,$3,$4,$5)`,
        [ref,src,when,JSON.stringify(payload),JSON.stringify(payload)]);
      await rec(c,'inbound_record',ref,null,null,{source:src,received_at:when},when);
    }

    // legal hold on the signing entry of CERT-PILOT-000001
    const signSeq = (await c.query(`SELECT seq FROM record_entries WHERE kind='certificate_signed' AND object_ref='CERT-PILOT-000001'`)).rows[0].seq;
    await c.query(`INSERT INTO legal_holds (reference,seq,placed_by,placed_on) VALUES ('HLD-0001',$1,'auditor@example.com','2026-04-20')`,[signSeq]);
    await rec(c,'legal_hold_placed','HLD-0001','auditor@example.com',null,{seq:Number(signSeq),on:'certificate_signed:CERT-PILOT-000001'},'2026-04-20T09:00:00Z');

    // public site content
    const stats = [
      ['textiles_recycled','Less than 1 per cent of textiles are recycled into new materials','Textile Flow Monitor',2024,'Global'],
      ['plastics_emissions','1.8 gigatonnes of carbon dioxide equivalent a year from plastics production','Global Materials Emissions Panel',2023,'Global'],
      ['textile_incineration','More than 8 per cent of textile waste is incinerated each year','Textile Flow Monitor',2024,'EU-27']
    ];
    for (const s of stats) await c.query(`INSERT INTO statistics VALUES ($1,$2,$3,$4,$5)`,s);
    await c.query(`INSERT INTO positions (title,location,department,contract_type,closes_on) VALUES ('Process Engineer','Lyon, France','Operations','Permanent','2026-11-30')`);
    const news = [
      ['funding','Series A closes at 40 million euros','Materials Weekly','2026-01-22','https://materials-weekly.example.com/ravel-series-a','en'],
      ['partnership','Offtake agreement signed for demonstration output','Fibre Report','2026-03-11','https://fibre-report.example.com/ravel-offtake','en'],
      ['technical','Depolymerisation yield published','Chimie Circulaire','2026-05-06','https://chimie-circulaire.example.com/ravel-rendement','fr']
    ];
    for (const n of news) await c.query(`INSERT INTO news_items (tag,title,outlet,published_on,link,language) VALUES ($1,$2,$3,$4,$5,$6)`,n);

    // claim substantiation register
    const claims = [
      ['virgin-quality recycled nylon 6','/product','2026-01-15',JSON.stringify([{kind:'specification',reference:'SPEC-N6 v3'},{kind:'test_results',reference:'LOT-N6-0001'}]),'CM-PA6 v2','quality@example.com','2026-07-15'],
      ['lower carbon than virgin PA6','/technology','2026-01-20',JSON.stringify([{kind:'carbon_method',reference:'CM-PA6 v2'},{kind:'comparator',reference:'EcoBase 2025'}]),'CM-PA6 v2','quality@example.com','2026-07-20'],
      ['less than 1 per cent of textiles are recycled into new materials','/about','2026-01-10',JSON.stringify([{kind:'statistic',reference:'textiles_recycled'}]),null,'quality@example.com','2026-07-10']
    ];
    for (const cl of claims) await c.query(`INSERT INTO claim_substantiations (claim,route,first_published_on,evidence,method_version,approver,review_on) VALUES ($1,$2,$3,$4,$5,$6,$7)`,cl);

    await rec(c,'specification_issued','SPEC-N6:v3','quality@example.com',null,{grade:'N6',version:3,issued_to:['CUS-HELIOS']},'2026-02-01T09:00:00Z');
    await rec(c,'access_grant','quality@example.com','auditor@example.com',null,{site:'SITE-DEMO',role:'quality_manager',ends_on:'2027-06-30'},'2026-01-02T09:00:00Z');
    await c.query(`INSERT INTO app_meta VALUES ('seeded','1')`);
    await c.query('COMMIT');
    console.log('seed complete');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    c.release();
  }
}

export async function ensureSchema(pool, fresh) {
  const c = await pool.connect();
  try {
    if (fresh) {
      await c.query(`DO $$ DECLARE r record; BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname='public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP; END $$;`);
    }
    await c.query(schema);
    return true;
  } finally {
    c.release();
  }
}

export async function ensureSeed(pool) {
  await ensureSchema(pool, false);
  const c = await pool.connect();
  try {
    const r = await c.query(`SELECT v FROM app_meta WHERE k='seeded'`);
    if (r.rows.length) return false;
  } finally { c.release(); }
  digestState = ZERO;
  await seedBody(pool);
  return true;
}


