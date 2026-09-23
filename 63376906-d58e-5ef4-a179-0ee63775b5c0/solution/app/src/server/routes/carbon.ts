import { Hono } from 'hono';
import { ALLOCATION_BASES } from '../../shared/enums.js';
import { STATEMENTS } from '../../shared/copy.js';
import type { AppEnv } from '../auth/guard.js';
import {
  all,
  byReference,
  byVersion,
  nextReference,
  type CarbonFigureRow,
  type CarbonMethodRow,
  type EnergyInstrumentRow,
  type PeriodRow,
} from '../db/read.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { periodOfLot, retirementRefusal } from '../answers/lots.js';
import { loadSources, type Sources } from '../answers/sources.js';
import {
  enumField,
  json,
  mutate,
  nonNegative,
  notFound,
  objectField,
  read,
  refuse,
  stringField,
  type Body,
} from './context.js';

export const carbonRoutes = new Hono<AppEnv>();

const RETIREMENT_ROLES = ['claims_manager', 'quality_manager'] as const;
const RECOMPUTE_ROLES = ['quality_manager', 'claims_manager'] as const;

function versionsOf(reference: string, methods: CarbonMethodRow[]): CarbonMethodRow[] {
  return methods.filter((method) => method.reference === reference).sort(byVersion);
}

function methodSummary(reference: string, methods: CarbonMethodRow[]): Body {
  const versions = versionsOf(reference, methods);
  const current = versions.filter((method) => method.state === 'current').slice(-1)[0] ?? versions.slice(-1)[0];
  return {
    reference,
    standard: current?.standard ?? null,
    allocation_basis: current?.allocation_basis ?? null,
    current_version: current?.version ?? null,
    versions: versions.map((method) => ({ version: method.version, state: method.state, published_on: method.published_on, boundary: method.boundary })),
  };
}

function meteredKwhOn(period: PeriodRow, s: Sources): number {
  return s.figures
    .filter((figure) => figure.superseded_by === null && s.lots.get(figure.lot)?.site === period.site)
    .reduce((sum, figure) => sum + figure.energy.metered_kwh, 0);
}

function comparatorRegion(period: PeriodRow, s: Sources, fallback: string): string {
  const figure = s.figures.find((row) => row.superseded_by === null && s.lots.get(row.lot)?.site === period.site);
  return figure?.comparator.region ?? fallback;
}

carbonRoutes.get('/carbon-methods', read(async () => {
  const methods = await all<CarbonMethodRow>('carbon_method', 'reference');
  const references = [...new Set(methods.map((method) => method.reference))];
  return json(references.map((reference) => methodSummary(reference, methods)));
}));

carbonRoutes.get('/carbon-methods/:id', read(async (c) => {
  const reference = c.req.param('id');
  const methods = await all<CarbonMethodRow>('carbon_method', 'reference');
  if (!methods.some((method) => method.reference === reference)) notFound('carbon_method', reference);
  return json(methodSummary(reference, methods));
}));

carbonRoutes.get('/carbon-methods/:id/versions/:version', read(async (c) => {
  const reference = c.req.param('id');
  const version = c.req.param('version');
  const s = await loadSources();
  const method = s.methodOf(reference, version);
  if (!method) notFound('carbon_method_version', `${reference}/${version}`);
  return json(method);
}));

carbonRoutes.post('/carbon-methods/:id/versions', mutate({ act: 'carbon_method.publish', roles: ['quality_manager'] }, async ({ c, client, body, person }) => {
  const reference = c.req.param('id');
  const version = stringField(body, 'version');
  const standard = stringField(body, 'standard');
  const functional_unit = stringField(body, 'functional_unit');
  const boundary = stringField(body, 'boundary');
  const allocation_basis = enumField(body, 'allocation_basis', ALLOCATION_BASES);
  const reviewer = stringField(body, 'reviewer');
  const data_quality_rules = objectField(body, 'data_quality_rules', false);
  const emission_factors = Array.isArray(body.emission_factors) ? body.emission_factors : [];
  const s = await loadSources(client);
  if (s.methodOf(reference, version)) {
    refuse(409, 'method_version_exists', `${reference} version ${version} is already published; a version supersedes rather than overwrites.`, { version });
  }
  const on = todayIso();
  await client.query(
    `INSERT INTO carbon_method (reference, version, standard, functional_unit, boundary, allocation_basis, reviewer, published_on, published_by, data_quality_rules, emission_factors, state, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'current',$12)`,
    [reference, version, standard, functional_unit, boundary, allocation_basis, reviewer, on, person, JSON.stringify(data_quality_rules), JSON.stringify(emission_factors), nowIso()],
  );
  await client.query(`UPDATE carbon_method SET state = 'superseded' WHERE reference = $1 AND version <> $2 AND state = 'current'`, [reference, version]);
  const stored = await loadSources(client);
  return {
    status: 201,
    object: `${reference}/${version}`,
    body: (stored.methodOf(reference, version) ?? {}) as Body,
    content: { reference, version, allocation_basis, published_by: person },
  };
}));

carbonRoutes.on(['PATCH', 'PUT', 'DELETE'], '/carbon-methods/:id/versions/:version', mutate({ act: 'carbon_method.amend', idempotency: false }, async ({ c }) => {
  const reference = c.req.param('id');
  const version = c.req.param('version');
  refuse(409, 'method_version_immutable', `${reference} version ${version} is immutable once a figure has been computed against it; publish a new version instead.`, {
    reference,
    version,
  });
}));

carbonRoutes.post('/carbon-figures/:id/recompute', mutate({ act: 'carbon_figure.recompute', roles: RECOMPUTE_ROLES }, async ({ c, client, body, person }) => {
  const reference = c.req.param('id');
  const figure = await byReference<CarbonFigureRow>('carbon_figure', reference, client);
  if (!figure) notFound('carbon_figure', reference);
  const reason = stringField(body, 'reason');
  const s = await loadSources(client);
  const lot = s.lots.get(figure.lot);
  if (!lot) notFound('lot', figure.lot);
  const period = periodOfLot(lot, s);
  if (period && period.state === 'closed') {
    const open = s.restatements.filter((row) => row.period === period.reference && row.state === 'open');
    if (open.length === 0) {
      refuse(409, 'period_closed', STATEMENTS.periodClosed, { period: period.reference, lot: lot.reference });
    }
  }
  const recomputed = await nextReference('carbon_figure', 'reference', 'CFG-', 4, client);
  const on = todayIso();
  await client.query(
    `INSERT INTO carbon_figure (reference, lot, version, method, method_version, value_mg_per_kg, uncertainty_bp, primary_share_bp, breakdown, energy, comparator, input_versions, reason, computed_by, computed_on, superseded_by, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NULL,$16)`,
    [recomputed, figure.lot, figure.version + 1, figure.method, figure.method_version, figure.value_mg_per_kg, figure.uncertainty_bp, figure.primary_share_bp,
      JSON.stringify(figure.breakdown), JSON.stringify(figure.energy), JSON.stringify(figure.comparator), JSON.stringify(figure.input_versions), reason, person, on, nowIso()],
  );
  await client.query('UPDATE carbon_figure SET superseded_by = $2 WHERE reference = $1', [reference, recomputed]);
  const certificates = s.certificates.filter((certificate) => certificate.lot === figure.lot).map((certificate) => certificate.number);
  return {
    status: 201,
    object: figure.lot,
    body: {
      reference: recomputed,
      version: figure.version + 1,
      lot: figure.lot,
      supersedes: reference,
      computed_by: person,
      computed_on: on,
      reason,
      certificates,
      derivation: `${recomputed} recomputes ${reference} under ${figure.method}/${figure.method_version}; the superseded figure stays readable`,
    },
    content: { reference: recomputed, supersedes: reference, reason },
  };
}));

carbonRoutes.get('/energy-instruments', read(async () => json(await all<EnergyInstrumentRow>('energy_instrument'))));

carbonRoutes.get('/energy-instruments/:ref', read(async (c) => {
  const reference = c.req.param('ref');
  const instrument = await byReference<EnergyInstrumentRow>('energy_instrument', reference);
  if (!instrument) notFound('energy_instrument', reference);
  return json(instrument);
}));

carbonRoutes.post('/energy-instruments/:ref/retire', mutate({ act: 'energy_instrument.retire', roles: RETIREMENT_ROLES }, async ({ c, client, body, person }) => {
  const reference = c.req.param('ref');
  const instrument = await byReference<EnergyInstrumentRow>('energy_instrument', reference, client);
  if (!instrument) notFound('energy_instrument', reference);
  const periodReference = stringField(body, 'period');
  const quantity_kwh = body.quantity_kwh === undefined ? instrument.quantity_kwh : nonNegative(body, 'quantity_kwh');
  const s = await loadSources(client);
  const period = s.periods.get(periodReference);
  if (!period) notFound('balance_period', periodReference);
  const instruments = await all<EnergyInstrumentRow>('energy_instrument', 'reference', client);
  const alreadyRetired_kwh = instruments
    .filter((row) => row.state === 'retired' && row.period === period.reference && row.reference !== reference)
    .reduce((sum, row) => sum + row.quantity_kwh, 0);
  const refusal = retirementRefusal(
    instrument,
    period.starts_on,
    comparatorRegion(period, s, instrument.region),
    meteredKwhOn(period, s),
    alreadyRetired_kwh,
    quantity_kwh,
  );
  if (refusal) refuse(409, refusal.rule, refusal.detail, { instrument: reference, period: period.reference });
  const on = todayIso();
  await client.query(`UPDATE energy_instrument SET state = 'retired', period = $2, retired_by = $3, retired_on = $4 WHERE reference = $1`, [reference, period.reference, person, on]);
  return {
    status: 201,
    object: reference,
    body: { ...instrument, state: 'retired', period: period.reference, retired_by: person, retired_on: on, quantity_kwh },
    content: { period: period.reference, quantity_kwh, retired_on: on },
  };
}));
