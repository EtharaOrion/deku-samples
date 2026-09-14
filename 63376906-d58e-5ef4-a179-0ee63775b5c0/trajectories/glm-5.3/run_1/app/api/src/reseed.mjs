import { exec, pool } from './db.js';
import fs from 'node:fs';
const tables = ['meta','users','sites','site_certifications','parties','party_versions','collectors','approval_periods','findings','weighing_devices','recipes','batches','custodies','runs','consumptions','outputs','lots','test_results','deviations','overrides','balance_periods','credit_movements','allocations','conversion_factors','carbon_methods','carbon_figures','energy_instruments','energy_retirements','specifications','specification_issues','customers','conformances','change_notices','change_notice_acknowledgements','contracts','contract_allocations','certificates','certificate_sequences','restatements','resolutions','transfers','idempotency_keys','inbound_records','enquiries','record_entries','legal_holds','exports','sessions','positions','news_items','statistics','claim_substantiations','mails','rate_limits','overrides_review_log'];
await exec('TRUNCATE ' + tables.join(', ') + ' RESTART IDENTITY CASCADE');
await exec(fs.readFileSync(new URL('../../schema/001_tables.sql', import.meta.url).pathname, 'utf8'));
const seed = (await import('./seed.js')).default;
await seed();
const { one } = await import('./db.js');
for (const t of ['users','batches','runs','lots','record_entries','certificates','credit_movements','inbound_records']) {
  console.log(t, (await one('SELECT count(*) n FROM ' + t)).n);
}
await pool.end();
