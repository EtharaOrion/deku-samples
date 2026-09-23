import { Hono } from 'hono';
import { ENQUIRY_TYPES } from '../../shared/enums.js';
import { STATEMENTS } from '../../shared/copy.js';
import type { AppEnv } from '../auth/guard.js';
import { ENQUIRY_ROUTING, VERIFY_RATE_LIMIT_PER_MINUTE } from '../db/constants.js';
import { transaction } from '../db/pool.js';
import { all, byReference, nextReference, type EnquiryRow, type SiteRow } from '../db/read.js';
import { nowIso, todayIso } from '../answers/clock.js';
import { loadSources } from '../answers/sources.js';
import { certificationNow, unknownVerifyAnswer, verifyAnswer } from '../answers/certificates.js';
import { SUBJECTS } from '../mail.js';
import { appendEntry, countRecentActsBy } from '../record/entries.js';
import { enumField, json, mutate, notFound, open, read, refuse, stringField } from './context.js';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/health', () => json({ status: 'ok', read_at: nowIso() }));

publicRoutes.get('/statistics', open(async () => json(await all('statistic', 'key'))));
publicRoutes.get('/positions', open(async () => json(await all('position', 'reference'))));
publicRoutes.get('/news', open(async () => json(await all('news_item', 'date'))));
publicRoutes.get('/claim-register', open(async () => json(await all('claim_substantiation', 'reference'))));

publicRoutes.post(
  '/enquiries',
  mutate({ act: 'enquiry.receive', anonymous: true, idempotency: false }, async ({ client, body }) => {
    const type = enumField(body, 'type', ENQUIRY_TYPES);
    const name = stringField(body, 'name');
    const email = stringField(body, 'email');
    const organisation = stringField(body, 'organisation', false);
    const message = stringField(body, 'message', false);
    const routing = ENQUIRY_ROUTING[type];
    if (!routing) refuse(400, 'invalid_payload', `${type} routes to no destination`);
    const reference = await nextReference('enquiry', 'reference', 'ENQ-', 4, client);
    const received_at = nowIso();
    await client.query(
      `INSERT INTO enquiry (reference, type, name, organisation, email, message, destination, response_days, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [reference, type, name, organisation, email, message, routing.destination, routing.response_days, received_at],
    );
    return {
      status: 201,
      object: reference,
      content: { reference, type, destination: routing.destination },
      body: { reference, type, destination: routing.destination, response_days: routing.response_days, received_at },
      mail: [
        {
          to: email,
          subject: SUBJECTS.enquiryReceived(reference),
          text: `Thank you, ${name}. Your ${type.replace('_', ' ')} enquiry ${reference} has reached ${routing.destination}. You will hear back within ${routing.response_days} working days.`,
        },
      ],
    };
  }),
);

publicRoutes.get('/enquiries', read(async () => json(await all<EnquiryRow>('enquiry', 'reference'))));

const VERIFY_ACT = 'certificate.verify';
const VERIFY_WINDOW_SECONDS = 60;

// The read itself is the entry the limit counts, so the count and the entry are
// taken under one transaction and no caller can slip between them.
async function recordVerifyRead(caller: string, number: string): Promise<boolean> {
  return transaction(async (client) => {
    const taken = await countRecentActsBy(client, VERIFY_ACT, caller, VERIFY_WINDOW_SECONDS);
    const within = taken < VERIFY_RATE_LIMIT_PER_MINUTE;
    await appendEntry(client, {
      person: 'anonymous',
      act: VERIFY_ACT,
      object: number,
      outcome: within ? 'recorded' : 'refused',
      content: { caller, number },
      response_status: within ? 200 : 429,
    });
    return within;
  });
}

publicRoutes.get('/verify/:number', async (c) => {
  const caller = c.req.header('x-forwarded-for') ?? c.req.header('cf-connecting-ip') ?? 'anonymous';
  const number = c.req.param('number');
  if (!(await recordVerifyRead(caller, number))) {
    return json({ error: 'rate_limited', detail: STATEMENTS.verifyRateLimited }, 429);
  }
  const s = await loadSources();
  const cert = s.certificates.find((row) => row.number === number);
  return json(cert ? verifyAnswer(cert, s) : unknownVerifyAnswer(number));
});

function siteView(site: SiteRow, certification_state: string) {
  return {
    reference: site.reference,
    name: site.name,
    confidence: site.confidence,
    certification_state,
    nameplate_kg: site.nameplate_kg,
    contracted_kg: site.contracted_kg,
    certification_history: site.certification_history,
  };
}

publicRoutes.get('/sites', read(async () => {
  const s = await loadSources();
  return json([...s.sites.values()].map((site) => siteView(site, certificationNow(site.reference, s))));
}));

publicRoutes.get('/sites/:ref', read(async (c) => {
  const s = await loadSources();
  const site = s.sites.get(c.req.param('ref'));
  if (!site) return notFound('site', c.req.param('ref'));
  return json(siteView(site, certificationNow(site.reference, s)));
}));

publicRoutes.get('/sites/:ref/capacity', read(async (c) => {
  const site = await byReference<SiteRow>('site', c.req.param('ref'));
  if (!site) return notFound('site', c.req.param('ref'));
  const uncommitted_kg = site.nameplate_kg - site.contracted_kg;
  return json({
    site: site.reference,
    name: site.name,
    nameplate_kg: site.nameplate_kg,
    basis: site.capacity_basis,
    contracted_kg: site.contracted_kg,
    uncommitted_kg,
    confidence: site.confidence,
    last_revised: site.capacity_revised_on,
    read_on: todayIso(),
    derivation: {
      uncommitted_kg: `nameplate_kg ${site.nameplate_kg} minus contracted_kg ${site.contracted_kg} = ${uncommitted_kg}`,
      basis: site.capacity_basis,
    },
  });
}));
