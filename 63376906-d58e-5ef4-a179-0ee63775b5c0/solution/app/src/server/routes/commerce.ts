import { Hono } from 'hono';
import { STATEMENTS } from '../../shared/copy.js';
import type { AppEnv } from '../auth/guard.js';
import {
  all,
  byReference,
  nextReference,
  type ChangeNoticeRow,
  type ConformanceRow,
  type ContractAllocationRow,
  type ContractRow,
} from '../db/read.js';
import { nowIso, todayIso } from '../answers/clock.js';
import {
  allocationView,
  changeNoticeView,
  conformanceView,
  contractView,
  currentSpecification,
  customerReferences,
  customerView,
  noticeReach,
  projectionOf,
  specificationView,
} from '../answers/commerce.js';
import { loadSources } from '../answers/sources.js';
import { SUBJECTS } from '../mail.js';
import {
  booleanField,
  json,
  mutate,
  nonNegative,
  notFound,
  read,
  refuse,
  stringField,
} from './context.js';

export const commerceRoutes = new Hono<AppEnv>();

const QUALITY_ROLES = ['quality_manager'] as const;
const CLAIMS_ROLES = ['claims_manager'] as const;

commerceRoutes.get(
  '/specifications',
  read(async () => {
    const s = await loadSources();
    return json(s.specifications.map(specificationView));
  }),
);

commerceRoutes.get(
  '/specifications/:grade',
  read(async (c) => {
    const grade = c.req.param('grade');
    const s = await loadSources();
    const specification = currentSpecification(grade, s);
    if (!specification) notFound('specification', grade);
    return json({
      ...specificationView(specification),
      versions: s.specifications.filter((row) => row.grade === grade).map((row) => row.version),
    });
  }),
);

commerceRoutes.get(
  '/specifications/:grade/versions/:version',
  read(async (c) => {
    const grade = c.req.param('grade');
    const version = c.req.param('version');
    const s = await loadSources();
    const specification = s.specifications.find((row) => row.grade === grade && row.version === version);
    if (!specification) notFound('specification_version', `${grade}/${version}`);
    return json(specificationView(specification));
  }),
);

commerceRoutes.post(
  '/specifications/:grade/versions/:version/issue',
  mutate({ act: 'specification.issue', roles: QUALITY_ROLES }, async ({ c, client, body, person }) => {
    const grade = c.req.param('grade');
    const version = c.req.param('version');
    const customer = stringField(body, 'customer');
    const s = await loadSources(client);
    const specification = s.specifications.find((row) => row.grade === grade && row.version === version);
    if (!specification) notFound('specification_version', `${grade}/${version}`);
    if (!customerReferences(s).includes(customer)) notFound('customer', customer);
    const reference = await nextReference('conformance', 'reference', 'CNF-', 4, client);
    const issued_on = todayIso();
    await client.query(
      `INSERT INTO conformance (reference, customer, grade, version, issued_on, issued_by, recorded_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reference, customer, grade, version, issued_on, person, nowIso()],
    );
    const stored = await byReference<ConformanceRow>('conformance', reference, client);
    return {
      status: 201,
      object: customer,
      body: stored ? conformanceView(stored) : { reference, customer, grade, version, issued_on, issued_by: person },
      content: { reference, customer, grade, version },
    };
  }),
);

commerceRoutes.get(
  '/customers',
  read(async () => {
    const [s, conformances] = await Promise.all([loadSources(), all<ConformanceRow>('conformance')]);
    return json(customerReferences(s).map((reference) => customerView(reference, conformances, s)).filter((row) => row !== null));
  }),
);

commerceRoutes.get(
  '/customers/:ref',
  read(async (c) => {
    const reference = c.req.param('ref');
    const [s, conformances] = await Promise.all([loadSources(), all<ConformanceRow>('conformance')]);
    const view = customerView(reference, conformances, s);
    if (!view) notFound('customer', reference);
    return json(view);
  }),
);

commerceRoutes.get(
  '/change-notices',
  read(async () => json((await all<ChangeNoticeRow>('change_notice')).map(changeNoticeView))),
);

commerceRoutes.get(
  '/change-notices/:ref',
  read(async (c) => {
    const reference = c.req.param('ref');
    const notice = await byReference<ChangeNoticeRow>('change_notice', reference);
    if (!notice) notFound('change_notice', reference);
    return json(changeNoticeView(notice));
  }),
);

commerceRoutes.post(
  '/change-notices',
  mutate({ act: 'change_notice.raise', roles: QUALITY_ROLES }, async ({ client, body, person }) => {
    const what_changes = stringField(body, 'what_changes');
    const against_version = stringField(body, 'against_version');
    const parameter = stringField(body, 'parameter', false) || null;
    const qualification_relevant = booleanField(body, 'qualification_relevant', false);
    const [s, conformances] = await Promise.all([loadSources(client), all<ConformanceRow>('conformance', 'reference', client)]);
    const reach = noticeReach(qualification_relevant, conformances, s);
    const reference = await nextReference('change_notice', 'reference', 'CN-', 4, client);
    const raised_at = nowIso();
    await client.query(
      `INSERT INTO change_notice (reference, what_changes, against_version, parameter, qualification_relevant, specifications_affected,
         customers_affected, qualifications_affected, notice_period_days, notified, waived, state, raised_by, raised_at, released_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'[]','[]','open',$10,$11,NULL)`,
      [
        reference,
        what_changes,
        against_version,
        parameter,
        qualification_relevant,
        JSON.stringify(reach.specifications_affected),
        JSON.stringify(reach.customers_affected),
        JSON.stringify(reach.qualifications_affected),
        reach.notice_period_days,
        person,
        raised_at,
      ],
    );
    const stored = await byReference<ChangeNoticeRow>('change_notice', reference, client);
    if (!stored) notFound('change_notice', reference);
    return { status: 201, object: reference, body: changeNoticeView(stored), content: { reference, what_changes, against_version, ...reach } };
  }),
);

async function noticeOr404(reference: string, client: Parameters<typeof byReference>[2]): Promise<ChangeNoticeRow> {
  const notice = await byReference<ChangeNoticeRow>('change_notice', reference, client);
  if (!notice) notFound('change_notice', reference);
  return notice;
}

commerceRoutes.post(
  '/change-notices/:ref/notify',
  mutate({ act: 'change_notice.notify', roles: QUALITY_ROLES }, async ({ c, client, body }) => {
    const reference = c.req.param('ref');
    const notice = await noticeOr404(reference, client);
    const customer = stringField(body, 'customer');
    if (!notice.customers_affected.includes(customer)) {
      refuse(409, 'customer_not_affected', `${customer} is owed no notice under ${reference}.`, { customers_affected: notice.customers_affected });
    }
    const notified = notice.notified.includes(customer) ? notice.notified : [...notice.notified, customer];
    await client.query('UPDATE change_notice SET notified = $2 WHERE reference = $1', [reference, JSON.stringify(notified)]);
    const s = await loadSources(client);
    const address = s.partyEmail(customer);
    const stored = await noticeOr404(reference, client);
    return {
      status: 201,
      object: reference,
      body: changeNoticeView(stored),
      content: { reference, customer, notified },
      mail: address
        ? [
            {
              to: address,
              subject: SUBJECTS.changeNotice(reference),
              text: [
                `Change notice ${reference} against ${notice.against_version}: ${notice.what_changes}.`,
                STATEMENTS.changeNotice(notice.qualifications_affected.length),
                `The notice period is ${notice.notice_period_days} days.`,
              ].join('\n'),
            },
          ]
        : [],
    };
  }),
);

commerceRoutes.post(
  '/change-notices/:ref/waive',
  mutate({ act: 'change_notice.waive', roles: QUALITY_ROLES }, async ({ c, client, body }) => {
    const reference = c.req.param('ref');
    const notice = await noticeOr404(reference, client);
    const customer = stringField(body, 'customer');
    const reason = stringField(body, 'reason');
    if (!notice.customers_affected.includes(customer)) {
      refuse(409, 'customer_not_affected', `${customer} is owed no notice under ${reference}.`, { customers_affected: notice.customers_affected });
    }
    const waived = notice.waived.includes(customer) ? notice.waived : [...notice.waived, customer];
    await client.query('UPDATE change_notice SET waived = $2 WHERE reference = $1', [reference, JSON.stringify(waived)]);
    const stored = await noticeOr404(reference, client);
    return { status: 201, object: reference, body: changeNoticeView(stored), content: { reference, customer, reason, waived } };
  }),
);

commerceRoutes.post(
  '/change-notices/:ref/release',
  mutate({ act: 'change_notice.release', roles: QUALITY_ROLES }, async ({ c, client }) => {
    const reference = c.req.param('ref');
    const notice = await noticeOr404(reference, client);
    const outstanding = notice.customers_affected.filter((customer) => !notice.notified.includes(customer) && !notice.waived.includes(customer));
    if (outstanding.length > 0) {
      refuse(409, 'customers_not_notified', `Change notice ${reference} cannot release: ${outstanding.join(', ')} have neither been notified nor waived.`, {
        outstanding,
        notified: notice.notified,
        waived: notice.waived,
      });
    }
    const blocked = notice.qualifications_affected.filter((customer) => !notice.waived.includes(customer));
    if (notice.qualification_relevant && blocked.length > 0) {
      refuse(409, 'automotive_qualification_blocks', `Change notice ${reference} touches a qualification-relevant parameter for ${blocked.join(', ')}; the change blocks until each waives.`, {
        qualifications_affected: notice.qualifications_affected,
        blocked,
      });
    }
    const released_at = nowIso();
    await client.query(`UPDATE change_notice SET state = 'released', released_at = $2 WHERE reference = $1`, [reference, released_at]);
    const stored = await noticeOr404(reference, client);
    return { status: 201, object: reference, body: changeNoticeView(stored), content: { reference, released_at } };
  }),
);

commerceRoutes.get(
  '/contracts',
  read(async () => {
    const [s, contracts, allocations] = await Promise.all([
      loadSources(),
      all<ContractRow>('contract'),
      all<ContractAllocationRow>('allocation'),
    ]);
    return json(contracts.map((contract) => contractView(contract, allocations, s)));
  }),
);

commerceRoutes.get(
  '/contracts/:id',
  read(async (c) => {
    const reference = c.req.param('id');
    const [s, contract, allocations] = await Promise.all([
      loadSources(),
      byReference<ContractRow>('contract', reference),
      all<ContractAllocationRow>('allocation'),
    ]);
    if (!contract) notFound('contract', reference);
    return json(contractView(contract, allocations, s));
  }),
);

commerceRoutes.get(
  '/contracts/:id/projection',
  read(async (c) => {
    const reference = c.req.param('id');
    const [s, contract, allocations] = await Promise.all([
      loadSources(),
      byReference<ContractRow>('contract', reference),
      all<ContractAllocationRow>('allocation'),
    ]);
    if (!contract) notFound('contract', reference);
    const projection = projectionOf(contract, allocations, s);
    if (!projection) notFound('site', contract.site);
    return json(projection);
  }),
);

commerceRoutes.post(
  '/contracts/:id/allocations',
  mutate({ act: 'contract.allocate', roles: CLAIMS_ROLES }, async ({ c, client, body, person }) => {
    const reference = c.req.param('id');
    const contract = await byReference<ContractRow>('contract', reference, client);
    if (!contract) notFound('contract', reference);
    const lot = stringField(body, 'lot');
    const mass_kg = nonNegative(body, 'mass_kg');
    const favoured_over = stringField(body, 'favoured_over', false) || null;
    const s = await loadSources(client);
    if (!s.lots.has(lot)) notFound('lot', lot);
    const allocations = await all<ContractAllocationRow>('allocation', 'reference', client);
    if (allocations.some((row) => row.contract === reference && row.lot === lot)) {
      refuse(409, 'lot_already_attached', `Lot ${lot} is already attached to contract ${reference}; a claim is attached once.`, { contract: reference, lot });
    }
    const allocation = await nextReference('allocation', 'reference', 'ALC-', 4, client);
    const recorded_at = nowIso();
    const effective_on = todayIso();
    await client.query(
      `INSERT INTO allocation (reference, contract, lot, mass_kg, decided_by, favoured_over, recorded_by, recorded_at, effective_on)
       VALUES ($1,$2,$3,$4,$5,$6,$5,$7,$8)`,
      [allocation, reference, lot, mass_kg, person, favoured_over, recorded_at, effective_on],
    );
    const stored = await byReference<ContractAllocationRow>('allocation', allocation, client);
    return {
      status: 201,
      object: reference,
      body: stored
        ? { ...allocationView(stored), contract: reference }
        : { reference: allocation, contract: reference, lot, mass_kg, decided_by: person, favoured_over, recorded_at, effective_on },
      content: { reference: allocation, contract: reference, lot, mass_kg, decided_by: person, favoured_over },
    };
  }),
);
