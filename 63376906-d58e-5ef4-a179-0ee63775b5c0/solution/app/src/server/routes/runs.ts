import { Hono } from 'hono';
import { BYPRODUCT_DISPOSITIONS, INBOUND_SOURCES, OUTPUT_KINDS, RUN_TYPES, type RunType } from '../../shared/enums.js';
import type { AppEnv } from '../auth/guard.js';
import { CLAIM_TYPE_DEFAULT, GRADE_N6 } from '../db/constants.js';
import { all, byReference, exists, nextReference, type InboundRow, type OutputRow, type RunRow } from '../db/read.js';
import { RECIPES } from '../db/seed/operations.js';
import { dateOnly, nowIso } from '../answers/clock.js';
import { creditForConsumption } from '../answers/periods.js';
import { outputView, runView } from '../answers/runs.js';
import { loadSources } from '../answers/sources.js';
import {
  enumField,
  instantField,
  json,
  nonNegative,
  notFound,
  mutate,
  objectField,
  read,
  refuse,
  refuseTypedFigures,
  stringField,
} from './context.js';

export const runsRoutes = new Hono<AppEnv>();

const RUN_LETTER: Record<RunType, string> = {
  dissolution: 'D',
  depolymerisation: 'Y',
  purification: 'U',
  repolymerisation: 'R',
};

const OPERATOR_ROLES = ['plant_operator'] as const;

runsRoutes.get(
  '/runs',
  read(async () => {
    const s = await loadSources();
    return json(s.runList.map((run) => runView(run, s)));
  }),
);

runsRoutes.get(
  '/runs/:ref',
  read(async (c) => {
    const s = await loadSources();
    const run = s.runs.get(c.req.param('ref'));
    if (!run) notFound('run', c.req.param('ref'));
    return json(runView(run, s));
  }),
);

runsRoutes.post(
  '/runs',
  mutate({ act: 'run.start', roles: OPERATOR_ROLES }, async ({ client, body, person }) => {
    refuseTypedFigures(body, ['losses_g', 'within_tolerance']);
    const run_type = enumField(body, 'run_type', RUN_TYPES);
    const site = stringField(body, 'site');
    const equipment = stringField(body, 'equipment');
    const recipe_version = stringField(body, 'recipe_version');
    const operator = stringField(body, 'operator', false) || person;
    const started_at = instantField(body, 'started_at');
    const set_points_achieved = objectField(body, 'set_points_achieved', false);
    if (!(await exists('site', 'reference', site, client))) notFound('site', site);
    const reference = await nextReference('run', 'reference', `RUN-${RUN_LETTER[run_type]}-`, 4, client);
    const recipe = RECIPES[recipe_version] ?? null;
    await client.query(
      `INSERT INTO run (reference, run_type, site, equipment, recipe_version, recipe, set_points_achieved, operator, started_at, ended_at, state, losses_g, closed_by, event_at, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,'open',NULL,NULL,$9,$10,$11)`,
      [reference, run_type, site, equipment, recipe_version, JSON.stringify(recipe ?? {}), JSON.stringify(set_points_achieved), operator, started_at, nowIso(), dateOnly(started_at)],
    );
    const s = await loadSources(client);
    const run = s.runs.get(reference) as RunRow;
    return { status: 201, body: runView(run, s), object: reference };
  }),
);

async function openRun(reference: string, client: Parameters<typeof byReference>[2]): Promise<RunRow> {
  const run = await byReference<RunRow>('run', reference, client);
  if (!run) notFound('run', reference);
  if (run.state !== 'open') refuse(409, 'run_closed', `Run ${reference} is closed and refuses every write.`, { run: reference });
  return run;
}

runsRoutes.post(
  '/runs/:ref/consumptions',
  mutate({ act: 'run.consume', roles: OPERATOR_ROLES }, async ({ c, client, body, person }) => {
    const run = await openRun(c.req.param('ref'), client);
    const input = stringField(body, 'input');
    const mass_g = nonNegative(body, 'mass_g');
    const batch = await byReference('batch', input, client);
    const output = batch ? null : await byReference<OutputRow>('output', input, client);
    if (!batch && !output) notFound('input', input);
    const reference = await nextReference('consumption', 'reference', 'CON-', 4, client);
    const effective_on = dateOnly(run.started_at);
    await client.query(
      `INSERT INTO consumption (reference, run, input, mass_g, recorded_by, event_at, recorded_at, effective_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reference, run.reference, input, mass_g, person, run.started_at, nowIso(), effective_on],
    );
    const s = await loadSources(client);
    const batchRow = batch ? s.batches.get(input) : undefined;
    const credit = batchRow ? creditForConsumption(batchRow, mass_g, run, s) : null;
    let movement: string | null = null;
    if (credit) {
      movement = await nextReference('credit_movement', 'reference', 'CRM-', 4, client);
      await client.query(
        `INSERT INTO credit_movement (reference, period, category, kind, mass_g, lot, batch, consumption, transfer, origin_site, recorded_by, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,'consumption_credit',$4,NULL,$5,$6,NULL,NULL,$7,$8,$9,$10)`,
        [movement, credit.period, credit.category, credit.mass_g, input, reference, person, run.started_at, nowIso(), effective_on],
      );
    }
    return {
      status: 201,
      body: {
        reference,
        run: run.reference,
        input,
        mass_g,
        effective_on,
        credit: credit ? { ...credit, movement } : null,
        derivation: credit ? `credit ${credit.mass_g} g = ${mass_g} g at conversion factor ${credit.factor}` : 'no credit: input is not a claimable batch in an open period',
      },
      object: run.reference,
      content: { reference, input, mass_g, credit_movement: movement },
    };
  }),
);

runsRoutes.post(
  '/runs/:ref/outputs',
  mutate({ act: 'run.output', roles: OPERATOR_ROLES }, async ({ c, client, body, person }) => {
    const run = await openRun(c.req.param('ref'), client);
    const kind = enumField(body, 'kind', OUTPUT_KINDS);
    const mass_g = nonNegative(body, 'mass_g');
    const disposition = kind === 'byproduct' ? enumField(body, 'disposition', BYPRODUCT_DISPOSITIONS) : null;
    const requested = stringField(body, 'reference', false);
    const now = nowIso();
    const produced_on = dateOnly(run.started_at);
    let reference = requested;
    if (kind === 'lot') {
      reference = reference || (await nextReference('lot', 'reference', `LOT-${GRADE_N6}-`, 4, client));
    } else {
      reference = reference || (await nextReference('output', 'reference', `OUT-${RUN_LETTER[run.run_type]}-`, 4, client));
    }
    if (await exists('output', 'reference', reference, client)) refuse(409, 'output_reference_taken', `Output ${reference} already exists.`, { reference });
    await client.query(
      `INSERT INTO output (reference, run, kind, mass_g, disposition, recorded_by, event_at, recorded_at, effective_on) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [reference, run.reference, kind, mass_g, disposition, person, run.started_at, now, produced_on],
    );
    if (kind === 'lot') {
      await client.query(
        `INSERT INTO lot (reference, grade, site, mass_g, output, components, sites, disposition, claim_type, dispositioned_by, dispositioned_at, produced_on, event_at, recorded_at, effective_on)
         VALUES ($1,$2,$3,$4,$1,'[]',$5,'pending',$6,NULL,NULL,$7,$8,$9,$7)`,
        [reference, GRADE_N6, run.site, mass_g, JSON.stringify([run.site]), CLAIM_TYPE_DEFAULT, produced_on, run.started_at, now],
      );
    }
    const s = await loadSources(client);
    const output = s.outputs.get(reference) as OutputRow;
    return { status: 201, body: outputView(output, s), object: run.reference, content: { reference, kind, mass_g, disposition } };
  }),
);

runsRoutes.post(
  '/runs/:ref/close',
  mutate({ act: 'run.close', roles: OPERATOR_ROLES }, async ({ c, client, body, person }) => {
    refuseTypedFigures(body, ['losses_g', 'within_tolerance']);
    const reference = c.req.param('ref');
    const run = await byReference<RunRow>('run', reference, client);
    if (!run) notFound('run', reference);
    if (run.state !== 'open') refuse(409, 'run_already_closed', `Run ${reference} is already closed; this second close is recorded as an attempt.`, { run: reference });
    const ended_at = stringField(body, 'ended_at', false) ? instantField(body, 'ended_at') : nowIso();
    const before = await loadSources(client);
    const view = runView(run, before);
    const losses_g = view.losses_g as number;
    if (losses_g < 0) refuse(409, 'outputs_exceed_inputs', `Run ${reference} produced more than it consumed; losses cannot be negative.`, { losses_g });
    await client.query(`UPDATE run SET state = 'closed', ended_at = $2, losses_g = $3, closed_by = $4 WHERE reference = $1`, [reference, ended_at, losses_g, person]);
    let deviation: string | null = null;
    if (view.within_tolerance === false) {
      deviation = await nextReference('deviation', 'reference', 'DEV-', 4, client);
      await client.query(
        `INSERT INTO deviation (reference, description, state, outcome, runs, lots, raised_by, raised_at, closed_by, closed_at, effective_on) VALUES ($1,$2,'open',NULL,$3,'[]',$4,$5,NULL,NULL,$6)`,
        [deviation, `Set points on run ${reference} fell outside the recipe tolerance at close.`, JSON.stringify([reference]), person, nowIso(), dateOnly(ended_at)],
      );
    }
    return {
      status: 201,
      body: {
        reference,
        state: 'closed',
        ended_at,
        losses_g,
        within_tolerance: view.within_tolerance,
        deviation,
        derivation: view.derivation,
      },
      content: { ended_at, losses_g, state: 'closed', deviation },
    };
  }),
);

runsRoutes.post(
  '/runs/:ref/corrections',
  mutate({ act: 'run.correct', roles: ['plant_operator', 'quality_manager', 'claims_manager'] }, async ({ c, client, body }) => {
    const run = c.req.param('ref');
    if (!(await exists('run', 'reference', run, client))) notFound('run', run);
    const corrects = stringField(body, 'corrects', false) || run;
    const note = stringField(body, 'note');
    const counted = await client.query<{ n: number }>(`SELECT count(*) AS n FROM record_entry WHERE act = 'run.correct' AND object = $1`, [run]);
    const reference = `COR-${run}-${(counted.rows[0]?.n ?? 0) + 1}`;
    return { status: 201, body: { reference, run, corrects, note, recorded_at: nowIso() }, content: { reference, corrects, note } };
  }),
);

runsRoutes.get(
  '/outputs',
  read(async () => {
    const s = await loadSources();
    return json(s.outputList.map((output) => outputView(output, s)));
  }),
);

runsRoutes.get(
  '/outputs/:ref',
  read(async (c) => {
    const s = await loadSources();
    const output = s.outputs.get(c.req.param('ref'));
    if (!output) notFound('output', c.req.param('ref'));
    return json(outputView(output, s));
  }),
);

runsRoutes.get(
  '/inbound',
  read(async () => json(await all<InboundRow>('inbound_record', 'reference'))),
);

runsRoutes.post(
  '/inbound/:source',
  mutate({ act: 'inbound.receive' }, async ({ c, client, body, person }) => {
    const source = c.req.param('source');
    if (!INBOUND_SOURCES.includes(source as (typeof INBOUND_SOURCES)[number])) notFound('inbound_source', source);
    const received_at = instantField(body, 'received_at');
    const payload = objectField(body, 'payload');
    const reference = await nextReference('inbound_record', 'reference', 'INB-', 4, client);
    const payload_verbatim = JSON.stringify(payload);
    await client.query(`INSERT INTO inbound_record (reference, source, received_at, payload_verbatim, recorded_by, recorded_at) VALUES ($1,$2,$3,$4,$5,$6)`, [reference, source, received_at, payload_verbatim, person, nowIso()]);
    return { status: 201, body: { reference, source, received_at, payload_verbatim }, object: reference, content: { source, received_at } };
  }),
);
