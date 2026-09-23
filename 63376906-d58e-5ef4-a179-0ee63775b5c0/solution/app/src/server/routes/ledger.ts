import { Hono } from 'hono';
import { CATEGORIES, RESOLUTION_OUTCOMES, type Category } from '../../shared/enums.js';
import { STATEMENTS } from '../../shared/copy.js';
import type { AppEnv } from '../auth/guard.js';
import {
  all,
  byReference,
  exists,
  nextReference,
  type CertificateRow,
  type FactorRow,
  type PeriodRow,
  type ResolutionRow,
  type RestatementRow,
} from '../db/read.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { deviationsTouching } from '../answers/certificates.js';
import { lotView } from '../answers/lots.js';
import {
  BP_SCALE,
  carryOver,
  claimBasisOfLot,
  claimWithinAvailable,
  floorDivide,
  floorShare,
  lotsOfPeriod,
  periodView,
} from '../answers/periods.js';
import { loadSources, type Sources } from '../answers/sources.js';
import {
  dateField,
  enumField,
  integerField,
  json,
  mutate,
  nonNegative,
  notFound,
  read,
  refuse,
  refuseTypedFigures,
  stringField,
  type Body,
  type Work,
} from './context.js';

export const ledgerRoutes = new Hono<AppEnv>();

const CLAIMS_ROLES = ['claims_manager'] as const;
const CONSUMPTION_ROLES = ['plant_operator', 'claims_manager'] as const;
const TYPED_FIGURES = ['content_bp', 'percentage', 'available_g'];

type CategoryFigures = Record<Category, number>;

/** The period row is locked for the life of the transaction so availability is read and spent under one lock. */
async function lockPeriod(reference: string, client: Work['client']): Promise<PeriodRow> {
  const locked = await client.query<PeriodRow>('SELECT * FROM balance_period WHERE reference = $1 FOR UPDATE', [reference]);
  const period = locked.rows[0];
  if (!period) notFound('balance_period', reference);
  return period;
}

function refuseWhenClosed(period: PeriodRow): void {
  if (period.state === 'closed') {
    refuse(409, 'period_closed', STATEMENTS.periodClosed, { period: period.reference, closed_on: period.closed_on, cut_off: period.cut_off });
  }
}

function withinAvailable(period: PeriodRow, category: Category, requested_g: number, s: Sources): number {
  const available_g = s.figuresOf(period.reference).credits_available_g[category];
  if (claimWithinAvailable(available_g, requested_g)) {
    refuse(409, 'allocation_exceeds_available', STATEMENTS.allocationRefused(available_g, requested_g), { available_g, requested_g });
  }
  return available_g;
}

function underOneBasis(lot: string, category: Category, s: Sources): void {
  const in_force = claimBasisOfLot(s.movements, lot);
  if (in_force !== null && in_force !== category) {
    refuse(409, 'lot_carries_another_basis', STATEMENTS.basisRefused(lot, in_force, category), { lot, in_force, requested: category });
  }
}

function certificatesOfPeriod(period: string, s: Sources): CertificateRow[] {
  return s.certificates.filter((certificate) => certificate.period === period);
}

function zeroFigures(): CategoryFigures {
  const figures = {} as CategoryFigures;
  for (const category of CATEGORIES) figures[category] = 0;
  return figures;
}

ledgerRoutes.get('/balance-periods', read(async () => {
  const s = await loadSources();
  return json(s.periodList.map((period) => periodView(period, s)));
}));

ledgerRoutes.get('/balance-periods/:id', read(async (c) => {
  const reference = c.req.param('id');
  const s = await loadSources();
  const period = s.periods.get(reference);
  if (!period) notFound('balance_period', reference);
  return json(periodView(period, s));
}));

ledgerRoutes.post('/balance-periods/:id/allocations', mutate({ act: 'period.allocate', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
  refuseTypedFigures(body, TYPED_FIGURES);
  const period = await lockPeriod(c.req.param('id'), client);
  refuseWhenClosed(period);
  const lot = stringField(body, 'lot');
  const category = enumField(body, 'category', CATEGORIES);
  const mass_g = nonNegative(body, 'mass_g');
  const s = await loadSources(client);
  if (!s.lots.has(lot)) notFound('lot', lot);
  underOneBasis(lot, category, s);
  withinAvailable(period, category, mass_g, s);
  const reference = await nextReference('credit_movement', 'reference', 'CRM-', 4, client);
  const at = nowIso();
  const on = todayIso();
  await client.query(
    `INSERT INTO credit_movement (reference, period, category, kind, mass_g, lot, batch, consumption, transfer, origin_site, recorded_by, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,'allocation',$4,$5,NULL,NULL,NULL,NULL,$6,$7,$7,$8)`,
    [reference, period.reference, category, mass_g, lot, person, at, on],
  );
  const after = await loadSources(client);
  const attached = after.lots.get(lot);
  const view: Body = attached ? lotView(attached, after) : {};
  const available_g = after.figuresOf(period.reference).credits_available_g[category];
  return {
    status: 201,
    object: period.reference,
    body: {
      reference,
      period: period.reference,
      lot,
      category,
      mass_g,
      content_bp: view.content_bp ?? 0,
      available_g,
      derivation: `${mass_g} g of ${category} credit attached to ${lot}; ${available_g} g remains available in ${period.reference}`,
    },
    content: { reference, lot, category, mass_g },
  };
}));

ledgerRoutes.post('/balance-periods/:id/transfers', mutate({ act: 'period.transfer', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
  refuseTypedFigures(body, TYPED_FIGURES);
  const origin = await lockPeriod(c.req.param('id'), client);
  refuseWhenClosed(origin);
  const to = stringField(body, 'to');
  const category = enumField(body, 'category', CATEGORIES);
  const mass_g = nonNegative(body, 'mass_g');
  const on = dateField(body, 'on', false) || todayIso();
  const destination = await byReference<PeriodRow>('balance_period', to, client);
  if (!destination) notFound('balance_period', to);
  const s = await loadSources(client);
  withinAvailable(origin, category, mass_g, s);
  const reference = await nextReference('transfer', 'reference', 'TRF-', 4, client);
  const at = nowIso();
  await client.query(
    `INSERT INTO transfer (reference, from_period, to_period, category, mass_g, recorded_by, event_at, recorded_at, effective_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8)`,
    [reference, origin.reference, destination.reference, category, mass_g, person, at, on],
  );
  const out = await nextReference('credit_movement', 'reference', 'CRM-', 4, client);
  await client.query(
    `INSERT INTO credit_movement (reference, period, category, kind, mass_g, lot, batch, consumption, transfer, origin_site, recorded_by, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,'transfer_out',$4,NULL,NULL,NULL,$5,$6,$7,$8,$8,$9)`,
    [out, origin.reference, category, mass_g, reference, origin.site, person, at, on],
  );
  const into = await nextReference('credit_movement', 'reference', 'CRM-', 4, client);
  await client.query(
    `INSERT INTO credit_movement (reference, period, category, kind, mass_g, lot, batch, consumption, transfer, origin_site, recorded_by, event_at, recorded_at, effective_on)
     VALUES ($1,$2,$3,'transfer_in',$4,NULL,NULL,NULL,$5,$6,$7,$8,$8,$9)`,
    [into, destination.reference, category, mass_g, reference, origin.site, person, at, on],
  );
  return {
    status: 201,
    object: origin.reference,
    body: { reference, from_period: origin.reference, to_period: destination.reference, category, mass_g, on, movements: { transfer_out: out, transfer_in: into } },
    content: { reference, to, category, mass_g, on },
  };
}));

ledgerRoutes.post('/balance-periods/:id/close', mutate({ act: 'period.close', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
  refuseTypedFigures(body, ['carried_forward_g', 'expired_g']);
  const period = await lockPeriod(c.req.param('id'), client);
  refuseWhenClosed(period);
  const s = await loadSources(client);
  const lots = lotsOfPeriod(period, s);
  const pending = lots.filter((lot) => lot.disposition === 'pending');
  if (pending.length > 0) {
    refuse(409, 'lot_without_disposition', `${period.reference} holds ${pending.map((lot) => lot.reference).join(', ')} without a disposition.`, {
      lots: pending.map((lot) => lot.reference),
    });
  }
  const open = [...new Set(lots.flatMap((lot) => deviationsTouching(lot, s).filter((d) => d.state === 'open').map((d) => `${d.reference}|${lot.reference}`)))];
  if (open.length > 0) {
    const deviations = [...new Set(open.map((entry) => entry.split('|')[0] as string))];
    const held = [...new Set(open.map((entry) => entry.split('|')[1] as string))];
    refuse(409, 'deviation_open', `${period.reference} cannot close: ${deviations.join(', ')} is open against ${held.join(', ')}.`, { deviations, lots: held });
  }
  const restatements = s.restatements.filter((row) => row.period === period.reference && row.state === 'open');
  if (restatements.length > 0) {
    refuse(409, 'restatement_open', `${period.reference} cannot close while ${restatements.map((row) => row.reference).join(', ')} is open.`, {
      restatements: restatements.map((row) => row.reference),
    });
  }
  const applied = s.methods.filter((method) => method.state === 'current' && method.published_by === person);
  if (applied.length > 0) {
    refuse(409, 'publisher_not_closer', `${person} published ${applied.map((m) => `${m.reference}/${m.version}`).join(', ')} and may not close the period applying it.`, {
      separation: 'publisher_not_closer',
    });
  }
  const figures = s.figuresOf(period.reference);
  const carried_forward_g = zeroFigures();
  const expired_g = zeroFigures();
  const on = todayIso();
  const at = nowIso();
  for (const category of CATEGORIES) {
    const settled = carryOver(figures.credits_in_g[category], figures.credits_available_g[category], period.carry_over_limit_bp);
    carried_forward_g[category] = settled.carried_g;
    expired_g[category] = settled.expired_g;
    for (const [kind, mass_g] of [['carried_out', settled.carried_g], ['expired', settled.expired_g]] as const) {
      if (mass_g <= 0) continue;
      const reference = await nextReference('credit_movement', 'reference', 'CRM-', 4, client);
      await client.query(
        `INSERT INTO credit_movement (reference, period, category, kind, mass_g, lot, batch, consumption, transfer, origin_site, recorded_by, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,$4,$5,NULL,NULL,NULL,NULL,NULL,$6,$7,$7,$8)`,
        [reference, period.reference, category, kind, mass_g, person, at, on],
      );
    }
  }
  await client.query(`UPDATE balance_period SET state = 'closed', closed_on = $2, cut_off = $2, closed_by = $3 WHERE reference = $1`, [period.reference, on, person]);
  return {
    status: 201,
    body: {
      reference: period.reference,
      state: 'closed',
      closed_on: on,
      cut_off: on,
      carried_forward_g,
      expired_g,
      derivation: `carry forward is floored at ${period.carry_over_limit_bp} bp of the credit that entered ${period.reference}; the remainder expires`,
    },
    content: { closed_on: on, cut_off: on, carried_forward_g, expired_g },
  };
}));

ledgerRoutes.post('/balance-periods/:id/reopen', mutate({ act: 'period.reopen', roles: CLAIMS_ROLES }, async ({ c, client }) => {
  const period = await lockPeriod(c.req.param('id'), client);
  refuse(409, 'period_closed', STATEMENTS.periodClosed, { period: period.reference, closed_on: period.closed_on });
}));

ledgerRoutes.on(['PATCH', 'PUT', 'DELETE'], '/balance-periods/:id', mutate({ act: 'period.amend', idempotency: false }, async ({ c, client }) => {
  const period = await lockPeriod(c.req.param('id'), client);
  refuse(409, 'period_immutable', `${period.reference} is a ledger of movements; it is never edited in place.`, { period: period.reference });
}));

ledgerRoutes.post('/balance-periods/:id/consumptions', mutate({ act: 'period.consume', roles: CONSUMPTION_ROLES }, async ({ c, client, body, person }) => {
  const period = await lockPeriod(c.req.param('id'), client);
  stringField(body, 'run');
  stringField(body, 'input');
  nonNegative(body, 'mass_g');
  if (period.state !== 'closed') {
    refuse(400, 'consumption_belongs_on_a_run', `Consumption against an open period is recorded on the run; POST /api/runs/{reference}/consumptions.`, {
      period: period.reference,
    });
  }
  const s = await loadSources(client);
  const certificates = certificatesOfPeriod(period.reference, s).map((certificate) => certificate.number);
  const reference = await nextReference('restatement', 'reference', 'RST-', 4, client);
  const reason = 'Late consumption recorded against closed period';
  const at = nowIso();
  await client.query(
    `INSERT INTO restatement (reference, period, reason, revised_factor_bp, certificates, content_movements, state, opened_by, opened_at, effective_on)
     VALUES ($1,$2,$3,NULL,$4,'[]','open',$5,$6,$7)`,
    [reference, period.reference, reason, JSON.stringify(certificates), person, at, todayIso()],
  );
  return {
    status: 409,
    act: 'restatement.open',
    object: period.reference,
    body: { error: 'period_closed', outcome: 'restatement_opened', restatement: reference, period: period.reference, certificates, detail: STATEMENTS.periodClosed },
    content: { restatement: reference, reason },
  };
}));

ledgerRoutes.post('/balance-periods/:id/restatements', mutate({ act: 'restatement.open', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
  const reference = c.req.param('id');
  const period = await byReference<PeriodRow>('balance_period', reference, client);
  if (!period) notFound('balance_period', reference);
  const reason = stringField(body, 'reason');
  const revised_factor_bp = body.revised_factor_bp === undefined ? null : integerField(body, 'revised_factor_bp');
  const s = await loadSources(client);
  const affected = certificatesOfPeriod(period.reference, s);
  const factor = s.factorFor(period.site);
  const factor_bp = factor?.factor_bp ?? BP_SCALE;
  const content_movements = revised_factor_bp === null
    ? []
    : affected.map((certificate) => ({
        certificate: certificate.number,
        content_bp: certificate.content_bp,
        corrected_content_bp: floorDivide(certificate.content_bp * revised_factor_bp, factor_bp),
      }));
  const opened = await nextReference('restatement', 'reference', 'RST-', 4, client);
  const at = nowIso();
  const certificates = affected.map((certificate) => certificate.number);
  await client.query(
    `INSERT INTO restatement (reference, period, reason, revised_factor_bp, certificates, content_movements, state, opened_by, opened_at, effective_on)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9)`,
    [opened, period.reference, reason, revised_factor_bp, JSON.stringify(certificates), JSON.stringify(content_movements), person, at, todayIso()],
  );
  return {
    status: 201,
    object: period.reference,
    body: {
      reference: opened,
      period: period.reference,
      reason,
      revised_factor_bp,
      state: 'open',
      certificates,
      content_movements,
      derivation: `corrected content is floor(content x ${revised_factor_bp ?? factor_bp} / ${factor_bp}) against the factor in force`,
    },
    content: { reference: opened, reason, certificates },
  };
}));

ledgerRoutes.get('/restatements', read(async () => json(await all<RestatementRow>('restatement'))));

ledgerRoutes.get('/restatements/:ref', read(async (c) => {
  const reference = c.req.param('ref');
  const restatement = await byReference<RestatementRow>('restatement', reference);
  if (!restatement) notFound('restatement', reference);
  return json(restatement);
}));

ledgerRoutes.post('/restatements/:ref/resolutions', mutate({ act: 'restatement.resolve', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
  const reference = c.req.param('ref');
  const restatement = await byReference<RestatementRow>('restatement', reference, client);
  if (!restatement) notFound('restatement', reference);
  const certificate = stringField(body, 'certificate');
  const outcome = enumField(body, 'outcome', RESOLUTION_OUTCOMES);
  const reason = stringField(body, 'reason');
  if (!restatement.certificates.includes(certificate)) {
    refuse(400, 'certificate_not_affected', `${certificate} is not among the certificates ${reference} enumerates; one resolution names one certificate.`, {
      certificates: restatement.certificates,
    });
  }
  const resolved = await all<ResolutionRow>('resolution', 'reference', client);
  const already = resolved.filter((row) => row.restatement === reference);
  if (already.some((row) => row.certificate === certificate)) {
    refuse(409, 'resolution_exists', `${certificate} already took a resolution under ${reference}; each certificate takes exactly one.`, { certificate });
  }
  const opened = await nextReference('resolution', 'reference', 'RES-', 4, client);
  const at = nowIso();
  await client.query(
    `INSERT INTO resolution (reference, restatement, certificate, outcome, reason, resolved_by, resolved_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [opened, reference, certificate, outcome, reason, person, at],
  );
  const settled = new Set([...already.map((row) => row.certificate), certificate]);
  const closes = restatement.certificates.every((number) => settled.has(number));
  if (closes) await client.query(`UPDATE restatement SET state = 'closed' WHERE reference = $1`, [reference]);
  return {
    status: 201,
    object: reference,
    body: { reference: opened, restatement: reference, certificate, outcome, reason, restatement_state: closes ? 'closed' : 'open' },
    content: { reference: opened, certificate, outcome },
  };
}));

ledgerRoutes.get('/conversion-factors', read(async () => json(await all<FactorRow>('conversion_factor'))));

ledgerRoutes.get('/conversion-factors/:ref', read(async (c) => {
  const reference = c.req.param('ref');
  const factor = await byReference<FactorRow>('conversion_factor', reference);
  if (!factor) notFound('conversion_factor', reference);
  return json(factor);
}));

ledgerRoutes.post('/conversion-factors', mutate({ act: 'conversion_factor.publish', roles: CLAIMS_ROLES }, async ({ client, body, person }) => {
  const site = stringField(body, 'site');
  const factor_bp = nonNegative(body, 'factor_bp');
  const derived_from = dateField(body, 'derived_from', false) || null;
  const derived_to = dateField(body, 'derived_to', false) || null;
  const derived_in_g = nonNegative(body, 'derived_in_g', false);
  const derived_out_g = nonNegative(body, 'derived_out_g', false);
  if (!(await exists('site', 'reference', site, client))) notFound('site', site);
  const existing = await all<FactorRow>('conversion_factor', 'reference', client);
  const forSite = existing.filter((row) => row.site === site);
  if (derived_in_g > 0) {
    const derived_bp = floorShare(derived_out_g, derived_in_g, BP_SCALE);
    if (derived_bp !== factor_bp) {
      refuse(409, 'factor_not_derived', `${derived_out_g} g out of ${derived_in_g} g in is ${derived_bp} bp; a factor is the arithmetic of its own window rather than ${factor_bp} bp.`, {
        derived_bp,
        factor_bp,
      });
    }
  }
  const version = forSite.reduce((highest, row) => (row.version > highest ? row.version : highest), 0) + 1;
  const suffix = site.split('-').slice(1).join('-');
  const reference = `CF-${suffix}-${version}`;
  const provisional = derived_in_g === 0;
  const on = todayIso();
  await client.query(
    `INSERT INTO conversion_factor (reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, published_by, published_on, superseded_by, recorded_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12)`,
    [reference, site, version, factor_bp, derived_from, derived_to, derived_in_g, derived_out_g, provisional, person, on, nowIso()],
  );
  await client.query('UPDATE conversion_factor SET superseded_by = $2 WHERE site = $1 AND reference <> $2 AND superseded_by IS NULL', [site, reference]);
  const stored = await byReference<FactorRow>('conversion_factor', reference, client);
  return { status: 201, object: reference, body: (stored ?? {}) as Body, content: { reference, site, factor_bp, version } };
}));
