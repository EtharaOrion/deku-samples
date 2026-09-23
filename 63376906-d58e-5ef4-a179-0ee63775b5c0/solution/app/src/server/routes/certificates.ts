import { Hono } from 'hono';
import { CERTIFICATION_STATES, CLAIM_TYPE_LABEL, RESOLUTION_OUTCOMES } from '../../shared/enums.js';
import { STATEMENTS } from '../../shared/copy.js';
import { requireSiteScope, type AppEnv } from '../auth/guard.js';
import { verifyCredentials } from '../auth/session.js';
import { CERTIFICATE_ORDINAL_WIDTH } from '../db/constants.js';
import { byReference, nextReference, type CertificateRow, type SiteRow } from '../db/read.js';
import { dateOnly, nowIso, todayIso } from '../answers/clock.js';
import {
  certificateNumberPrefix,
  certView,
  contentPercent,
  certificationNow,
  conditionsFor,
  currentVersions,
  documentOf,
  firstUnsatisfied,
  permittedStatement,
  replayOf,
  unreproducibleReplay,
  withdrawalOf,
  type Condition,
} from '../answers/certificates.js';
import { currentSpecification } from '../answers/commerce.js';
import { impactOf, lotContent, periodOfLot, upstreamBatches } from '../answers/lots.js';
import { loadSources, type Sources } from '../answers/sources.js';
import { SUBJECTS } from '../mail.js';
import {
  dateField,
  enumField,
  json,
  mutate,
  notFound,
  read,
  refuse,
  refuseTypedFigures,
  stringField,
  text,
  type Body,
  type Ctx,
} from './context.js';

export const certificateRoutes = new Hono<AppEnv>();

const SIGNER_ROLES = ['certificate_signer'] as const;
const DERIVED_FIGURES = ['content_bp', 'percentage', 'waive_conditions'];

function conditionEntries(conditions: Condition[]): Body[] {
  return conditions.map((condition) => ({
    condition: condition.condition,
    statement: condition.statement,
    satisfied: condition.satisfied,
    blocking_reference: condition.blocking_reference,
  }));
}

function certificateOr404(number: string, s: Sources): CertificateRow {
  const certificate = s.certificates.find((row) => row.number === number);
  if (!certificate) notFound('certificate', number);
  return certificate;
}

function documentText(certificate: CertificateRow, s: Sources): string {
  if (certificate.state === 'withdrawn' || certificate.document === null) return documentOf(certificate, s);
  return certificate.document;
}

certificateRoutes.get(
  '/certificates',
  read(async () => {
    const s = await loadSources();
    return json(s.certificates.map((certificate) => certView(certificate, s)));
  }),
);

certificateRoutes.get(
  '/certificates/:number',
  read(async (c) => {
    const s = await loadSources();
    return json(certView(certificateOr404(c.req.param('number'), s), s));
  }),
);

certificateRoutes.get(
  '/certificates/:number/document',
  read(async (c) => {
    const s = await loadSources();
    return text(documentText(certificateOr404(c.req.param('number'), s), s));
  }),
);

certificateRoutes.get(
  '/certificates/:number/replay',
  read(async (c) => {
    const number = c.req.param('number');
    const s = await loadSources();
    const certificate = s.certificates.find((row) => row.number === number);
    if (!certificate) return json(unreproducibleReplay(number, `Certificate ${number} is not on record.`));
    return json(replayOf(certificate, s));
  }),
);

async function previewBody(c: Ctx): Promise<Body> {
  try {
    const raw = await c.req.text();
    const parsed: unknown = raw.trim() === '' ? {} : JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Body;
  } catch {
    return {};
  }
}

certificateRoutes.post(
  '/certificates/preview',
  read(async (c, session) => {
    const body = await previewBody(c);
    const reference = stringField(body, 'lot');
    const recipient = stringField(body, 'recipient');
    const s = await loadSources();
    const lot = s.lots.get(reference);
    if (!lot) notFound('lot', reference);
    const conditions = conditionsFor(lot, session, s);
    return json({
      lot: lot.reference,
      recipient,
      conditions: conditionEntries(conditions),
      all_satisfied: firstUnsatisfied(conditions) === null,
    });
  }, SIGNER_ROLES),
);

certificateRoutes.post(
  '/certificates',
  mutate({ act: 'certificate.sign', roles: SIGNER_ROLES }, async ({ client, body, session }) => {
    refuseTypedFigures(body, DERIVED_FIGURES);
    const reference = stringField(body, 'lot');
    const recipient = stringField(body, 'recipient');
    const password = stringField(body, 'password');
    if (!session) refuse(401, 'unauthenticated', 'signing requires a session');
    const verdict = await verifyCredentials(session.email, password);
    if (!verdict.ok) refuse(403, 'reauthentication_failed', `Signing re-authenticates ${session.email}: ${verdict.detail}`);
    const before = await loadSources(client);
    const lot = before.lots.get(reference);
    if (!lot) notFound('lot', reference);
    requireSiteScope(session, lot.site, `sign a certificate at ${lot.site}`);
    const certification = certificationNow(lot.site, before);
    if (certification !== 'certified') {
      refuse(409, 'certification_suspended', `Certification of ${lot.site} is ${certification}; a suspended site issues no certificate.`, {
        site: lot.site,
        certification_state: certification,
      });
    }
    const conditions = conditionsFor(lot, session, before);
    const blocking = firstUnsatisfied(conditions);
    if (blocking) {
      refuse(409, 'condition_unsatisfied', `The issuing condition ${blocking.condition} is not satisfied: ${blocking.statement}`, {
        conditions: conditionEntries(conditions),
        condition: blocking.condition,
        blocking_reference: blocking.blocking_reference,
      });
    }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lot.site]);
    const number = await nextReference('certificate', 'number', certificateNumberPrefix(lot.site), CERTIFICATE_ORDINAL_WIDTH, client);
    const content = lotContent(lot, before);
    const specification = currentSpecification(lot.grade, before);
    const figure = before.figureFor(lot.reference);
    const method = figure ? before.methodOf(figure.method, figure.method_version) : null;
    const period = periodOfLot(lot, before);
    const results = before.testResults.filter((row) => row.lot === lot.reference);
    const carbon = figure
      ? {
          value_mg_per_kg: figure.value_mg_per_kg,
          boundary: method?.boundary ?? '',
          method_version: figure.method_version,
          uncertainty_bp: figure.uncertainty_bp,
        }
      : null;
    const signed_at = nowIso();
    await client.query(
      `INSERT INTO certificate (number, version, site, lot, lots, grade, specification_version, claim_type, content_bp, category_split,
         period, carbon, carbon_figure, primary_share_bp, recipient, test_results, signer, signed_at, state, withdrawn_on, withdrawal_reason,
         withdrawn_by, provisional_factor, input_versions, document, supersedes, recorded_at)
       VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'issued',NULL,NULL,NULL,$18,$19,NULL,NULL,$17)`,
      [
        number,
        lot.site,
        lot.reference,
        JSON.stringify([{ reference: lot.reference, mass_g: lot.mass_g }]),
        lot.grade,
        specification?.version ?? '',
        lot.claim_type,
        content.content_bp,
        JSON.stringify(content.category_split),
        period?.reference ?? null,
        JSON.stringify(carbon),
        figure?.reference ?? null,
        figure?.primary_share_bp ?? 0,
        recipient,
        JSON.stringify(results.map((row) => ({ reference: row.reference, property: row.property, method: row.method, value: row.value, unit: row.unit }))),
        session.email,
        signed_at,
        content.provisional_factor,
        JSON.stringify(currentVersions(lot, before)),
      ],
    );
    const after = await loadSources(client);
    const certificate = certificateOr404(number, after);
    const document = documentOf(certificate, after);
    await client.query('UPDATE certificate SET document = $2 WHERE number = $1', [number, document]);
    const view = certView(certificate, after);
    const permitted = permittedStatement(certificate.claim_type, certificate.content_bp);
    const address = after.partyEmail(recipient);
    return {
      status: 201,
      object: number,
      body: { ...view, conditions: conditionEntries(conditions) },
      content: { number, lot: lot.reference, recipient, conditions: conditionEntries(conditions) },
      mail: address
        ? [
            {
              to: address,
              subject: SUBJECTS.certificateIssued(number),
              text: [
                `Certificate ${number} has been issued to ${after.partyName(recipient, todayIso())}.`,
                `Claim type: ${CLAIM_TYPE_LABEL[certificate.claim_type]}.`,
                `Recycled content: ${contentPercent(certificate.content_bp)} per cent.`,
                permitted,
                STATEMENTS.verify(number),
              ].join('\n'),
            },
          ]
        : [],
      at: signed_at,
    };
  }),
);

certificateRoutes.post(
  '/certificates/:number/withdraw',
  mutate({ act: 'certificate.withdraw', roles: SIGNER_ROLES }, async ({ c, client, body, person, session }) => {
    const number = c.req.param('number');
    const reason = stringField(body, 'reason');
    const before = await loadSources(client);
    const certificate = certificateOr404(number, before);
    if (!session) refuse(401, 'unauthenticated', 'a withdrawal requires a session');
    requireSiteScope(session, certificate.site, `withdraw a certificate at ${certificate.site}`);
    if (certificate.state === 'withdrawn') {
      refuse(409, 'certificate_already_withdrawn', `Certificate ${number} was withdrawn on ${certificate.withdrawn_on ?? ''}.`, { number });
    }
    const withdrawn_on = todayIso();
    await client.query(
      `UPDATE certificate SET state = 'withdrawn', withdrawn_on = $2, withdrawal_reason = $3, withdrawn_by = $4 WHERE number = $1`,
      [number, withdrawn_on, reason, person],
    );
    const after = await loadSources(client);
    const withdrawn = certificateOr404(number, after);
    const lot = after.lots.get(withdrawn.lot);
    const traversal = lot
      ? upstreamBatches(lot, after).map((batch) => {
          const impact = impactOf(batch.reference, after);
          return `${batch.reference}: lots ${impact.lots.join(', ') || 'none'}; certificates ${impact.certificates.join(', ') || 'none'}; recipients ${impact.recipients.join(', ') || 'none'}`;
        })
      : [];
    const derived = after.certificates.filter((row) => row.supersedes === number).map((row) => row.number);
    const answer = withdrawalOf(
      withdrawn,
      reason,
      person,
      withdrawn_on,
      { reference: withdrawn.recipient, name: after.partyName(withdrawn.recipient, todayIso()), email: after.partyEmail(withdrawn.recipient) },
      derived,
      traversal,
    );
    const address = after.partyEmail(withdrawn.recipient);
    return {
      status: 200,
      object: number,
      body: answer,
      content: { number, reason, withdrawn_on, withdrawn_by: person },
      mail: address
        ? [
            {
              to: address,
              subject: SUBJECTS.certificateWithdrawn(number),
              text: [
                STATEMENTS.withdrawn(withdrawn_on, reason),
                `Certificate ${number} is withdrawn and the statements below are void:`,
                ...answer.void_statements,
              ].join('\n'),
            },
          ]
        : [],
    };
  }),
);

function resolutionsFor(number: string): Body {
  const resolutions: Body = {};
  for (const outcome of RESOLUTION_OUTCOMES) {
    resolutions[outcome] = {
      outcome,
      certificate: number,
      statement: `Certificate ${number} may be resolved as ${outcome} under the restatement that follows this certification change.`,
    };
  }
  return resolutions;
}

certificateRoutes.post(
  '/sites/:ref/certification',
  mutate({ act: 'site.certification', roles: ['quality_manager'] }, async ({ c, client, body }) => {
    const reference = c.req.param('ref');
    const site = await byReference<SiteRow>('site', reference, client);
    if (!site) notFound('site', reference);
    const state = enumField(body, 'state', CERTIFICATION_STATES);
    const effective_from = dateField(body, 'effective_from');
    const recorded_on = dateField(body, 'recorded_on', false) || todayIso();
    const reason = stringField(body, 'reason', false) || null;
    const entry = { state, effective_from, recorded_on, reason };
    await client.query(
      `UPDATE site SET certification_history = certification_history || $2::jsonb WHERE reference = $1`,
      [reference, JSON.stringify([entry])],
    );
    const s = await loadSources(client);
    const window = state === 'certified'
      ? []
      : s.certificates
          .filter((certificate) => certificate.site === reference && dateOnly(certificate.signed_at) >= effective_from)
          .map((certificate) => ({
            number: certificate.number,
            signed_at: certificate.signed_at,
            state: certificate.state,
            resolutions: resolutionsFor(certificate.number),
          }));
    return {
      status: 201,
      object: reference,
      body: { site: reference, state, effective_from, recorded_on, reason, certificates_in_window: window },
      content: entry,
    };
  }),
);
