import { Hono } from 'hono';
import { APPROVAL_STATES, CATEGORIES, COMPOSITION_BASES, CUSTODY_KINDS } from '../../shared/enums.js';
import type { AppEnv } from '../auth/guard.js';
import { GRADE_N6 } from '../db/constants.js';
import {
  all,
  byReference,
  exists,
  nextReference,
  where,
  type BatchRow,
  type CollectorRow,
  type CustodyLink,
  type PartyVersionRow,
} from '../db/read.js';
import { batchView, collectorView } from '../answers/batches.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { impactOf } from '../answers/lots.js';
import { loadSources } from '../answers/sources.js';
import {
  dateField,
  enumField,
  integerField,
  json,
  listField,
  mutate,
  nonNegative,
  notFound,
  objectField,
  read,
  refuse,
  refusePagination,
  refuseTypedFigures,
  stringField,
  type Body,
} from './context.js';

export const feedstockRoutes = new Hono<AppEnv>();

feedstockRoutes.get('/collectors', read(async () => {
  const [s, collectors] = await Promise.all([loadSources(), all<CollectorRow>('collector')]);
  return json(collectors.map((c) => collectorView(c, s.approvals.filter((p) => p.collector === c.reference), s)));
}));

feedstockRoutes.get('/collectors/:ref', read(async (c) => {
  const ref = c.req.param('ref');
  const [s, collector] = await Promise.all([loadSources(), byReference<CollectorRow>('collector', ref)]);
  if (!collector) notFound('collector', ref);
  return json(collectorView(collector, s.approvals.filter((p) => p.collector === ref), s));
}));

feedstockRoutes.post('/collectors/:ref/approvals', mutate({ act: 'collector.approve', roles: ['quality_manager'] }, async ({ c, client, body, person }) => {
  const ref = c.req.param('ref');
  const collector = await byReference<CollectorRow>('collector', ref, client);
  if (!collector) notFound('collector', ref);
  const booked = await where<BatchRow>('batch', 'collector', ref, 'reference', client);
  if (booked.some((b) => b.booked_by === person)) {
    refuse(409, 'booker_not_approver', `${person} booked a batch from ${ref} and cannot approve that collector`, { separation: 'booker_not_approver' });
  }
  const state = enumField(body, 'state', APPROVAL_STATES);
  const validFrom = dateField(body, 'valid_from');
  const validTo = dateField(body, 'valid_to', false) || null;
  const condition = stringField(body, 'condition', false) || null;
  const closes = dateField(body, 'condition_closes_on', false) || null;
  const reference = await nextReference('approval_period', 'reference', 'AP-', 4, client);
  await client.query(
    `INSERT INTO approval_period (reference, collector, state, valid_from, valid_to, condition, condition_closes_on, recorded_by, recorded_at, effective_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [reference, ref, state, validFrom, validTo, condition, closes, person, nowIso(), validFrom],
  );
  const s = await loadSources(client);
  return {
    status: 201,
    object: ref,
    body: { reference, ...collectorView(collector, s.approvals.filter((p) => p.collector === ref), s) },
  };
}));

feedstockRoutes.get('/batches', read(async () => {
  const s = await loadSources();
  return json(s.batchList.map((b) => batchView(b, s)));
}));

feedstockRoutes.get('/batches/:ref', read(async (c) => {
  const ref = c.req.param('ref');
  const s = await loadSources();
  const batch = s.batches.get(ref);
  if (!batch) notFound('batch', ref);
  return json(batchView(batch, s));
}));

feedstockRoutes.get('/batches/:ref/impact', read(async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const ref = c.req.param('ref');
  const s = await loadSources();
  if (!s.batches.has(ref)) notFound('batch', ref);
  return json(impactOf(ref, s));
}));

feedstockRoutes.on(['PATCH', 'PUT'], '/batches/:ref', mutate({ act: 'batch.recategorise', idempotency: false }, async ({ c, client }) => {
  const ref = c.req.param('ref');
  if (!(await exists('batch', 'reference', ref, client))) notFound('batch', ref);
  refuse(409, 'category_fixed_after_acceptance', `The category of ${ref} was fixed at acceptance and cannot change`, { rule: 'category_fixed_after_acceptance' });
}));

function custodyLink(raw: unknown): CustodyLink {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refuse(400, 'invalid_payload', 'custody entries must be objects');
  }
  const link = raw as Body;
  const kind = enumField(link, 'kind', CUSTODY_KINDS);
  const on = dateField(link, 'on', false) || dateField(link, 'date', false);
  if (!on) refuse(400, 'invalid_payload', 'custody entries need a date');
  const party = stringField(link, 'party');
  const arrived = dateField(link, 'arrived_on', false) || undefined;
  return arrived ? { kind, on, party, arrived_on: arrived } : { kind, on, party };
}

feedstockRoutes.post('/batches', mutate({ act: 'batch.book', roles: ['plant_operator'] }, async ({ client, body, person }) => {
  refuseTypedFigures(body, ['dry_mass_g', 'claimable', 'content_bp']);
  const collector = stringField(body, 'collector');
  const site = stringField(body, 'site');
  const category = enumField(body, 'category', CATEGORIES);
  const gross = nonNegative(body, 'gross_g');
  const tare = nonNegative(body, 'tare_g');
  const net = nonNegative(body, 'net_g');
  const moisture = nonNegative(body, 'moisture_bp');
  const moistureMethod = stringField(body, 'moisture_method');
  const device = stringField(body, 'device');
  const receivedOn = dateField(body, 'received_on');
  const composition = objectField(body, 'composition');
  const contamination = objectField(body, 'contamination');
  const custody = listField(body, 'custody').map(custodyLink);
  stringField(composition, 'polymer');
  integerField(composition, 'fraction_bp');
  enumField(composition, 'basis', COMPOSITION_BASES);
  integerField(contamination, 'non_nylon_bp');
  integerField(contamination, 'elastane_bp');
  if (moisture > 10000) refuse(400, 'invalid_payload', 'moisture_bp cannot exceed 10000');
  if (net > gross) refuse(409, 'mass_not_consistent', 'net_g cannot exceed gross_g');
  if (!(await exists('collector', 'reference', collector, client))) notFound('collector', collector);
  if (!(await exists('site', 'reference', site, client))) notFound('site', site);
  if (!(await exists('weighing', 'reference', device, client))) notFound('weighing_device', device);
  const reference = await nextReference('batch', 'reference', 'BATCH-', 4, client);
  const at = nowIso();
  await client.query(
    `INSERT INTO batch (reference, collector, site, grade, category, gross_g, tare_g, net_g, moisture_bp, moisture_method, device, received_on,
       composition, contamination, custody, rejected_g, booked_by, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$16,$17,$18,$19)`,
    [reference, collector, site, GRADE_N6, category, gross, tare, net, moisture, moistureMethod, device, receivedOn,
      JSON.stringify(composition), JSON.stringify(contamination), JSON.stringify(custody), person, `${receivedOn}T00:00:00.000Z`, at, receivedOn],
  );
  const s = await loadSources(client);
  const batch = s.batches.get(reference) as BatchRow;
  return { status: 201, object: reference, body: batchView(batch, s) };
}));

feedstockRoutes.post('/batches/:ref/custody', mutate({ act: 'batch.custody', roles: ['plant_operator', 'quality_manager'] }, async ({ c, client, body }) => {
  const ref = c.req.param('ref');
  const batch = await byReference<BatchRow>('batch', ref, client);
  if (!batch) notFound('batch', ref);
  const link = custodyLink(body);
  if (!link.arrived_on) link.arrived_on = todayIso();
  const custody = [...batch.custody.filter((l) => l.kind !== link.kind), link];
  await client.query('UPDATE batch SET custody = $2 WHERE reference = $1', [ref, JSON.stringify(custody)]);
  const s = await loadSources(client);
  return { status: 201, body: batchView(s.batches.get(ref) as BatchRow, s), content: link as unknown as Body };
}));

feedstockRoutes.post('/batches/:ref/reject', mutate({ act: 'batch.reject', roles: ['plant_operator', 'quality_manager'] }, async ({ c, client, body }) => {
  const ref = c.req.param('ref');
  const batch = await byReference<BatchRow>('batch', ref, client);
  if (!batch) notFound('batch', ref);
  const rejected = nonNegative(body, 'rejected_g');
  const reason = stringField(body, 'reason');
  const destination = stringField(body, 'destination');
  if (rejected > batch.net_g) {
    refuse(409, 'rejected_mass_exceeds_delivery', `accepted and rejected mass must equal the delivered ${batch.net_g} g`, {
      delivered_g: batch.net_g,
      rejected_g: rejected,
    });
  }
  await client.query('UPDATE batch SET rejected_g = $2, rejected_reason = $3, rejected_destination = $4 WHERE reference = $1', [ref, rejected, reason, destination]);
  const s = await loadSources(client);
  return { status: 201, body: batchView(s.batches.get(ref) as BatchRow, s) };
}));

feedstockRoutes.get('/parties', read(async () => json(await all<PartyVersionRow>('party_version', 'effective_from'))));

feedstockRoutes.get('/parties/:ref/versions', read(async (c) => {
  const ref = c.req.param('ref');
  const versions = await where<PartyVersionRow>('party_version', 'party', ref, 'effective_from');
  if (versions.length === 0) notFound('party', ref);
  return json(versions.map((v) => ({ reference: v.reference, party: v.party, name: v.name, effective_from: v.effective_from, kind: v.kind })));
}));

feedstockRoutes.post('/parties/:ref/versions', mutate({ act: 'party.version', roles: ['quality_manager', 'claims_manager'] }, async ({ c, client, body, person }) => {
  const ref = c.req.param('ref');
  const versions = await where<PartyVersionRow>('party_version', 'party', ref, 'effective_from', client);
  if (versions.length === 0) notFound('party', ref);
  const name = stringField(body, 'name');
  const effectiveFrom = dateField(body, 'effective_from');
  const first = versions[0] as PartyVersionRow;
  const reference = await nextReference('party_version', 'reference', 'PV-', 4, client);
  await client.query(
    `INSERT INTO party_version (reference, party, kind, name, effective_from, email, application, industry, recorded_by, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [reference, ref, first.kind, name, effectiveFrom, first.email, first.application, first.industry, person, nowIso()],
  );
  return { status: 201, body: { reference, party: ref, name, effective_from: effectiveFrom, kind: first.kind } };
}));
