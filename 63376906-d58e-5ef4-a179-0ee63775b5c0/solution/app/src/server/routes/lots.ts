import { Hono } from 'hono';
import { DEVIATION_OUTCOMES, DISPOSITIONS, SEPARATIONS } from '../../shared/enums.js';
import type { AppEnv } from '../auth/guard.js';
import { GRADE_N6, OVERRIDE_REASON_FLOOR_CHARS } from '../db/constants.js';
import {
  all,
  byReference,
  byVersion,
  exists,
  nextReference,
  type DeviationRow,
  type LotRow,
  type OverrideRow,
  type SpecificationRow,
  type TestResultRow,
} from '../db/read.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { deviationsTouching } from '../answers/certificates.js';
import { blendLots, carbonOf, genealogyOf, lotContent, lotView, yieldOf, type BlendComponent } from '../answers/lots.js';
import { loadSources, type Sources } from '../answers/sources.js';
import {
  enumField,
  integerField,
  json,
  listField,
  mutate,
  notFound,
  read,
  refuse,
  refusePagination,
  refuseTypedFigures,
  stringField,
  type Body,
} from './context.js';

export const lotsRoutes = new Hono<AppEnv>();

const YIELD_ROLES = ['plant_operator', 'quality_manager', 'claims_manager', 'lab_analyst'] as const;
const LABORATORY_ROLES = ['lab_analyst', 'quality_manager'] as const;
const DEVIATION_ROLES = ['quality_manager', 'plant_operator'] as const;
const REVIEW_ROLES = ['quality_manager', 'claims_manager'] as const;
const BLEND_ROLES = ['claims_manager', 'quality_manager'] as const;

function lotOf(reference: string, s: Sources): LotRow {
  const lot = s.lots.get(reference);
  if (!lot) notFound('lot', reference);
  return lot;
}

function specifiedMethod(property: string, s: Sources): string | null {
  const spec = s.specifications
    .filter((row: SpecificationRow) => row.grade === GRADE_N6 && row.state === 'current')
    .sort(byVersion)
    .at(-1);
  const row = spec?.properties.find((entry) => String(entry.property) === property);
  return row ? String(row.method) : null;
}

function blendComponent(lot: LotRow, s: Sources): BlendComponent {
  const content = lotContent(lot, s);
  return {
    lot: lot.reference,
    mass_g: lot.mass_g,
    content_bp: content.content_bp,
    claim_type: lot.claim_type,
    site: lot.site,
    provisional_factor: content.provisional_factor,
    sites: lot.sites,
  };
}

lotsRoutes.get('/lots', read(async () => {
  const s = await loadSources();
  return json(s.lotList.map((lot) => lotView(lot, s)));
}));

lotsRoutes.get('/lots/:ref', read(async (c) => {
  const s = await loadSources();
  return json(lotView(lotOf(c.req.param('ref'), s), s));
}));

lotsRoutes.get('/lots/:ref/genealogy', read(async (c) => {
  const refused = refusePagination(c);
  if (refused) return refused;
  const s = await loadSources();
  return json(genealogyOf(lotOf(c.req.param('ref'), s), s));
}));

lotsRoutes.get('/lots/:ref/yield', read(async (c) => {
  const s = await loadSources();
  return json(yieldOf(lotOf(c.req.param('ref'), s), s));
}, YIELD_ROLES));

lotsRoutes.get('/lots/:ref/carbon', read(async (c) => {
  const s = await loadSources();
  const requested = c.req.query('method_version');
  return json(carbonOf(lotOf(c.req.param('ref'), s), s, requested));
}));

lotsRoutes.post('/lots/:ref/carbon', mutate({ act: 'lot.carbon' }, async ({ c }) => {
  refuse(409, 'carbon_figure_not_typed', `The carbon figure of ${c.req.param('ref')} is computed from its breakdown and cannot be typed.`);
}));

lotsRoutes.post('/lots/:ref/content', mutate({ act: 'lot.content' }, async ({ c }) => {
  refuse(409, 'content_not_typed', `The recycled content of ${c.req.param('ref')} is derived from the ledger and cannot be written.`);
}));

lotsRoutes.post('/lots/:ref/blend', mutate({ act: 'lot.blend', roles: BLEND_ROLES }, async ({ c, client, body, person }) => {
  refuseTypedFigures(body, ['content_bp', 'mass_g', 'claim_type']);
  const reference = c.req.param('ref');
  const partner = stringField(body, 'with');
  const s = await loadSources(client);
  const base = lotOf(reference, s);
  const other = lotOf(partner, s);
  const blend = blendLots([blendComponent(base, s), blendComponent(other, s)]);
  const blended = await nextReference('lot', 'reference', `LOT-${GRADE_N6}-`, 4, client);
  const on = todayIso();
  const at = nowIso();
  await client.query(
    `INSERT INTO lot (reference, grade, site, mass_g, output, components, sites, disposition, claim_type, dispositioned_by, dispositioned_at, produced_on, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,$4,NULL,$5,$6,'pending',$7,NULL,NULL,$8,$9,$9,$8)`,
    [blended, GRADE_N6, base.site, blend.mass_g, JSON.stringify(blend.components), JSON.stringify(blend.sites), blend.claim_type, on, at],
  );
  return {
    status: 201,
    object: blended,
    body: {
      reference: blended,
      mass_g: blend.mass_g,
      content_bp: blend.content_bp,
      claim_type: blend.claim_type,
      sites: blend.sites,
      provisional_factor: blend.provisional_factor,
      components: blend.components,
      derivation: {
        content_bp: `floor(sum of component mass x content over ${blend.mass_g} g) = ${blend.content_bp} bp`,
        claim_type: `the weaker of ${base.claim_type} and ${other.claim_type}`,
        blended_by: person,
      },
    },
    content: { reference: blended, components: blend.components },
  };
}));

lotsRoutes.post('/lots/:ref/disposition', mutate({ act: 'lot.disposition', roles: ['quality_manager'] }, async ({ c, client, body, person }) => {
  refuseTypedFigures(body, ['content_bp']);
  const reference = c.req.param('ref');
  const disposition = enumField(body, 'disposition', DISPOSITIONS);
  const s = await loadSources(client);
  const lot = lotOf(reference, s);
  const entered = s.testResults.filter((row) => row.lot === reference && (row.analyst === person || row.recorded_by === person));
  if (entered.length > 0) {
    refuse(409, 'analyst_not_dispositioner', `${person} entered ${entered[0]?.reference} on ${reference} and may not disposition that lot.`, {
      separation: 'analyst_not_dispositioner',
      test_results: entered.map((row) => row.reference),
    });
  }
  const open = deviationsTouching(lot, s).filter((deviation) => deviation.state === 'open');
  if (open.length > 0) {
    refuse(409, 'deviation_open', `${reference} is held by the open deviation ${open.map((d) => d.reference).join(', ')}.`, {
      lot: reference,
      deviations: open.map((d) => d.reference),
    });
  }
  const at = nowIso();
  await client.query('UPDATE lot SET disposition = $2, dispositioned_by = $3, dispositioned_at = $4 WHERE reference = $1', [reference, disposition, person, at]);
  const after = await loadSources(client);
  return { status: 201, body: lotView(lotOf(reference, after), after), content: { disposition, dispositioned_by: person, dispositioned_at: at } };
}));

lotsRoutes.get('/test-results', read(async () => json(await all<TestResultRow>('test_result'))));

lotsRoutes.post('/test-results', mutate({ act: 'test_result.record', roles: LABORATORY_ROLES }, async ({ client, body, person }) => {
  refuseTypedFigures(body, ['method_mismatch', 'usable_for_release']);
  const property = stringField(body, 'property');
  const method = stringField(body, 'method');
  const instrument = stringField(body, 'instrument');
  const analyst = stringField(body, 'analyst', false) || person;
  const value = stringField(body, 'value');
  const unit = stringField(body, 'unit');
  const uncertainty_bp = integerField(body, 'uncertainty_bp');
  const lot = stringField(body, 'lot', false) || null;
  const batch = stringField(body, 'batch', false) || null;
  if (!lot && !batch) refuse(400, 'invalid_payload', 'a result names the lot or the batch it was taken from');
  if (lot && !(await exists('lot', 'reference', lot, client))) notFound('lot', lot);
  if (batch && !(await exists('batch', 'reference', batch, client))) notFound('batch', batch);
  const s = await loadSources(client);
  const specified = specifiedMethod(property, s);
  const method_mismatch = specified !== null && specified !== method;
  const usable_for_release = !method_mismatch;
  const reference = await nextReference('test_result', 'reference', 'TR-', 4, client);
  const at = nowIso();
  const on = todayIso();
  await client.query(
    `INSERT INTO test_result (reference, lot, batch, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release, recorded_by, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15)`,
    [reference, lot, batch, property, method, instrument, analyst, value, unit, uncertainty_bp, method_mismatch, usable_for_release, person, at, on],
  );
  const stored = await byReference<TestResultRow>('test_result', reference, client);
  return {
    status: 201,
    object: lot ?? batch ?? reference,
    body: { ...stored, method_mismatch, usable_for_release, specified_method: specified },
    content: { reference, property, method, method_mismatch },
  };
}));

lotsRoutes.get('/deviations', read(async () => json(await all<DeviationRow>('deviation'))));

lotsRoutes.get('/deviations/:ref', read(async (c) => {
  const reference = c.req.param('ref');
  const deviation = await byReference<DeviationRow>('deviation', reference);
  if (!deviation) notFound('deviation', reference);
  return json(deviation);
}));

lotsRoutes.post('/deviations', mutate({ act: 'deviation.raise', roles: DEVIATION_ROLES }, async ({ client, body, person }) => {
  const description = stringField(body, 'description');
  const runs = listField(body, 'runs', false).map(String);
  const lots = listField(body, 'lots', false).map(String);
  const reference = await nextReference('deviation', 'reference', 'DEV-', 4, client);
  const at = nowIso();
  await client.query(
    `INSERT INTO deviation (reference, description, state, outcome, runs, lots, raised_by, raised_at, closed_by, closed_at, effective_on)
     VALUES ($1,$2,'open',NULL,$3,$4,$5,$6,NULL,NULL,$7)`,
    [reference, description, JSON.stringify(runs), JSON.stringify(lots), person, at, todayIso()],
  );
  return { status: 201, object: reference, body: { reference, description, state: 'open', outcome: null, runs, lots, raised_by: person, raised_at: at } };
}));

lotsRoutes.post('/deviations/:ref/close', mutate({ act: 'deviation.close', roles: ['quality_manager'] }, async ({ c, client, body, person }) => {
  const reference = c.req.param('ref');
  const deviation = await byReference<DeviationRow>('deviation', reference, client);
  if (!deviation) notFound('deviation', reference);
  if (deviation.state !== 'open') refuse(409, 'deviation_already_closed', `Deviation ${reference} is already closed.`, { deviation: reference });
  const outcome = enumField(body, 'outcome', DEVIATION_OUTCOMES);
  const at = nowIso();
  await client.query(`UPDATE deviation SET state = 'closed', outcome = $2, closed_by = $3, closed_at = $4 WHERE reference = $1`, [reference, outcome, person, at]);
  return { status: 201, body: { ...deviation, state: 'closed', outcome, closed_by: person, closed_at: at }, content: { outcome } };
}));

lotsRoutes.get('/overrides', read(async () => json(await all<OverrideRow>('override'))));

lotsRoutes.get('/overrides/:ref', read(async (c) => {
  const reference = c.req.param('ref');
  const override = await byReference<OverrideRow>('override', reference);
  if (!override) notFound('override', reference);
  return json(override);
}));

lotsRoutes.post('/overrides', mutate({ act: 'override.authorise', roles: REVIEW_ROLES }, async ({ client, body, person }) => {
  const separation = enumField(body, 'separation', SEPARATIONS);
  const reason = stringField(body, 'reason');
  if (reason.length < OVERRIDE_REASON_FLOOR_CHARS) {
    refuse(400, 'reason_too_short', `An override reason states why in at least ${OVERRIDE_REASON_FLOOR_CHARS} characters; this one carries ${reason.length}.`, {
      characters: reason.length,
      floor: OVERRIDE_REASON_FLOOR_CHARS,
    });
  }
  const lot = stringField(body, 'lot');
  const authorised_by = stringField(body, 'authorised_by', false) || person;
  if (!(await exists('lot', 'reference', lot, client))) notFound('lot', lot);
  const reference = await nextReference('override', 'reference', 'OVR-', 4, client);
  const on = todayIso();
  const at = nowIso();
  await client.query(
    `INSERT INTO override (reference, separation, reason, lot, authorised_by, authorised_on, reviewed, reviewed_by, reviewed_at, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,false,NULL,NULL,$7)`,
    [reference, separation, reason, lot, authorised_by, on, at],
  );
  return {
    status: 201,
    object: lot,
    body: { reference, separation, reason, lot, authorised_by, authorised_on: on, reviewed: false, reviewed_by: null, reviewed_at: null },
  };
}));

lotsRoutes.post('/overrides/:ref/review', mutate({ act: 'override.review', roles: REVIEW_ROLES }, async ({ c, client, person }) => {
  const reference = c.req.param('ref');
  const override = await byReference<OverrideRow>('override', reference, client);
  if (!override) notFound('override', reference);
  if (override.authorised_by === person) {
    refuse(409, 'reviewer_is_authoriser', `${person} authorised ${reference}; the review is a separate act by a second person.`, {
      separation: override.separation,
      authorised_by: override.authorised_by,
    });
  }
  const at = nowIso();
  await client.query('UPDATE override SET reviewed = true, reviewed_by = $2, reviewed_at = $3 WHERE reference = $1', [reference, person, at]);
  return { status: 201, body: { ...override, reviewed: true, reviewed_by: person, reviewed_at: at } as Body, content: { reviewed_by: person, reviewed_at: at } };
}));
