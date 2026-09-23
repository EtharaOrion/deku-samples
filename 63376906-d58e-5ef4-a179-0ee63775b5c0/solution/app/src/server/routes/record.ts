import { Hono } from 'hono';
import type { AppEnv } from '../auth/guard.js';
import { one, query, type Queryable } from '../db/pool.js';
import { all, nextReference, type InboundRow, type LegalHoldRow } from '../db/read.js';
import { checkChain, publicEntry, type RecordEntry } from '../record/entries.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { periodView } from '../answers/periods.js';
import {
  answerQuery,
  expiryRefusal,
  isRecordQuery,
  reconciliationOf,
  referencedUntil,
  retentionOf,
  type QueryParameters,
} from '../answers/record.js';
import { loadSources } from '../answers/sources.js';
import {
  json,
  listField,
  mutate,
  notFound,
  read,
  refuse,
  refusePagination,
  stringField,
  type Body,
} from './context.js';

export const recordRoutes = new Hono<AppEnv>();

const HOLD_ROLES = ['claims_manager', 'quality_manager', 'auditor'] as const;
const EXPORT_ACT = 'export';

function entries(q?: Queryable): Promise<RecordEntry[]> {
  return query<RecordEntry>('SELECT * FROM record_entry ORDER BY seq ASC', [], q);
}

async function entryOr404(seq: number, q?: Queryable): Promise<RecordEntry> {
  const entry = await one<RecordEntry>('SELECT * FROM record_entry WHERE seq = $1', [seq], q);
  if (!entry) notFound('record_entry', String(seq));
  return entry;
}

function sequence(raw: string): number {
  const seq = Number(raw);
  if (!Number.isInteger(seq) || seq < 1) notFound('record_entry', raw);
  return seq;
}

function holdOn(seq: number, holds: LegalHoldRow[]): LegalHoldRow | null {
  return holds.find((hold) => hold.seq === seq && hold.lifted_at === null) ?? null;
}

recordRoutes.get(
  '/record',
  read(async (c) => {
    const object = c.req.query('object');
    const rows = await entries();
    const scoped = object === undefined
      ? rows
      : rows.filter((entry) => entry.object === object || JSON.stringify(entry.content ?? {}).includes(object));
    return json(scoped.map(publicEntry));
  }),
);

recordRoutes.get(
  '/record/check',
  read(async () => json(checkChain(await entries()))),
);

recordRoutes.get(
  '/record/queries/:name',
  read(async (c) => {
    const refused = refusePagination(c);
    if (refused) return refused;
    const name = c.req.param('name');
    if (!isRecordQuery(name)) notFound('query', name);
    const parameters: QueryParameters = {
      batch: c.req.query('batch') ?? '',
      period: c.req.query('period') ?? '',
      person: c.req.query('person') ?? '',
      method_version: c.req.query('method_version') ?? '',
      auditor: c.req.query('auditor') ?? '',
    };
    const [s, rows] = await Promise.all([loadSources(), entries()]);
    return json(answerQuery(name, parameters, s, rows));
  }),
);

recordRoutes.get(
  '/record/:seq',
  read(async (c) => json(publicEntry(await entryOr404(sequence(c.req.param('seq')))))),
);

recordRoutes.get(
  '/record/:seq/retention',
  read(async (c) => {
    const seq = sequence(c.req.param('seq'));
    const [entry, s, holds] = await Promise.all([entryOr404(seq), loadSources(), all<LegalHoldRow>('legal_hold')]);
    return json(retentionOf(entry, referencedUntil(entry, s), holdOn(seq, holds)));
  }),
);

recordRoutes.post(
  '/record/:seq/legal-hold',
  mutate({ act: 'record.legal_hold_placed', roles: HOLD_ROLES }, async ({ c, client, body, person }) => {
    const seq = sequence(c.req.param('seq'));
    await entryOr404(seq, client);
    const reason = stringField(body, 'reason');
    const holds = await all<LegalHoldRow>('legal_hold', 'reference', client);
    if (holdOn(seq, holds)) refuse(409, 'legal_hold_in_force', `Record entry ${seq} is already under a legal hold.`, { seq });
    const reference = await nextReference('legal_hold', 'reference', 'HLD-', 4, client);
    const placed_at = nowIso();
    await client.query(
      `INSERT INTO legal_hold (reference, seq, reason, placed_by, placed_at, lifted_by, lifted_at) VALUES ($1,$2,$3,$4,$5,NULL,NULL)`,
      [reference, seq, reason, person, placed_at],
    );
    return {
      status: 201,
      object: String(seq),
      body: { reference, seq, reason, placed_by: person, placed_at, legal_hold: true },
      content: { reference, seq, reason },
    };
  }),
);

recordRoutes.delete(
  '/record/:seq/legal-hold',
  mutate({ act: 'record.legal_hold_lifted', roles: HOLD_ROLES, idempotency: false }, async ({ c, client, person }) => {
    const seq = sequence(c.req.param('seq'));
    await entryOr404(seq, client);
    const holds = await all<LegalHoldRow>('legal_hold', 'reference', client);
    const hold = holdOn(seq, holds);
    if (!hold) refuse(409, 'no_legal_hold_in_force', `No legal hold stands against record entry ${seq}.`, { seq });
    const lifted_at = nowIso();
    await client.query('UPDATE legal_hold SET lifted_by = $2, lifted_at = $3 WHERE reference = $1', [hold.reference, person, lifted_at]);
    return {
      status: 200,
      object: String(seq),
      body: { reference: hold.reference, seq, lifted_by: person, lifted_at, legal_hold: false },
      content: { reference: hold.reference, seq, lifted_at },
    };
  }),
);

recordRoutes.post(
  '/record/:seq/expire',
  mutate({ act: 'record.expire', roles: HOLD_ROLES }, async ({ c, client, person }) => {
    const seq = sequence(c.req.param('seq'));
    const [entry, s, holds] = await Promise.all([
      entryOr404(seq, client),
      loadSources(client),
      all<LegalHoldRow>('legal_hold', 'reference', client),
    ]);
    const retention = retentionOf(entry, referencedUntil(entry, s), holdOn(seq, holds));
    const refusal = expiryRefusal(retention, todayIso());
    if (refusal) refuse(409, refusal.rule, refusal.detail, { seq, retain_until: retention.retain_until });
    const deleted_on = todayIso();
    await client.query('UPDATE record_entry SET content = NULL, deleted_on = $2 WHERE seq = $1', [seq, deleted_on]);
    return {
      status: 200,
      object: String(seq),
      body: { seq, deleted: true, deleted_on, digest: entry.digest, retain_until: retention.retain_until, expired_by: person },
      content: { seq, deleted_on },
    };
  }),
);

const IMMUTABLE = 'nothing in the record is edited and nothing is removed from the sequence; a correction is a new entry naming what it corrects';

recordRoutes.on(['PATCH', 'PUT', 'DELETE'], '/record/:seq', mutate({ act: 'record.modify', idempotency: false }, async ({ c }) => {
  refuse(409, 'record_immutable', `Record entry ${c.req.param('seq')} cannot be changed: ${IMMUTABLE}.`);
}));

function scopeReferences(scope: { period: string | null; sites: string[]; grades: string[]; certificates: string[] }): Set<string> {
  const references = new Set<string>([...scope.sites, ...scope.grades, ...scope.certificates]);
  if (scope.period) references.add(scope.period);
  return references;
}

recordRoutes.post(
  '/exports',
  mutate({ act: EXPORT_ACT }, async ({ client, body, person }) => {
    const period = stringField(body, 'period', false) || null;
    const sites = listField(body, 'sites', false).map(String);
    const grades = listField(body, 'grades', false).map(String);
    const certificates = listField(body, 'certificates', false).map(String);
    const scope = { period, sites, grades, certificates };
    const counted = await one<{ n: number }>(`SELECT count(*) AS n FROM record_entry WHERE act = $1`, [EXPORT_ACT], client);
    const reference = `EXP-${String((counted?.n ?? 0) + 1).padStart(4, '0')}`;
    const read_at = nowIso();
    const references = scopeReferences(scope);
    const rows = (await entries(client)).filter((entry) => entry.object !== null && references.has(entry.object));
    const derivations: Body = {};
    if (period) {
      const s = await loadSources(client);
      const row = s.periods.get(period);
      if (row) derivations[period] = (periodView(row, s) as Record<string, unknown>).derivation ?? {};
    }
    return {
      status: 201,
      object: reference,
      body: {
        reference,
        scope,
        read_at,
        exported_by: person,
        derivations,
        digests: rows.map((entry) => ({ seq: entry.seq, digest: entry.digest })),
        entries: rows.map(publicEntry),
      },
      content: { reference, scope, read_at, entry_count: rows.length },
      at: read_at,
    };
  }),
);

recordRoutes.get(
  '/reconciliation',
  read(async () => {
    const [s, inbound] = await Promise.all([loadSources(), all<InboundRow>('inbound_record')]);
    return json(reconciliationOf(s, inbound, nowIso()));
  }),
);
