/**
 * One certificate at its permanent address, and the withdrawal that enumerates
 * its blast radius before anybody confirms anything.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { STATEMENTS } from '../../../shared/copy';
import { CarbonFigure, RecycledContent } from '../../components/figures';
import { Mark } from '../../components/marks';
import { Banner, Empty, Loading } from '../../components/status';
import { grams, percent, words } from '../../format';
import type { Identity } from '../../routes';
import { detailOf, holdsRole, post, useFetch } from './hooks';
import type { CertificateView, WithdrawalView } from './artefacts';
import { categorySplitText } from './states';

const CONSEQUENCES = [
  'The recipient is notified by mail',
  'The permitted and prohibited statements become void',
  'Derived certificates are enumerated',
  'Batches feeding the lot are traversed',
  'The public verification page states the withdrawal',
];

function Withdrawal({
  certificate,
  onWithdrawn,
}: {
  certificate: CertificateView;
  onWithdrawn: (answer: WithdrawalView) => void;
}): JSX.Element {
  const [begun, setBegun] = useState(false);
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function confirm(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    if (reason.trim() === '') {
      setRefusal('a withdrawal carries a reason, and this one was empty');
      return;
    }
    setWorking(true);
    try {
      onWithdrawn(await post<WithdrawalView>(`/certificates/${certificate.number}/withdraw`, { reason }));
    } catch (error) {
      setRefusal(detailOf(error));
    }
    setWorking(false);
  }

  if (!begun) {
    return (
      <button type="button" class="button-quiet" onClick={() => setBegun(true)}>
        <Mark name="arrow" labelFirst label="Begin withdrawal" />
      </button>
    );
  }

  return (
    <div class="form-column stack">
      <h2 class="console-heading">Withdrawal</h2>
      <p>
        {`This withdrawal is one action with five consequences. It reaches ${certificate.recipient_name} by name, and the statements listed below stop being available to them the moment it lands.`}
      </p>

      <h3 class="console-subheading">Who is notified</h3>
      <ul class="list-marked">
        <li>{`${certificate.recipient_name}, ${certificate.recipient}`}</li>
      </ul>

      <h3 class="console-subheading">Statements that become void</h3>
      <ul class="list-marked">
        <li class="permitted-statement">{certificate.permitted_statement}</li>
        <li class="permitted-statement">{certificate.prohibited_statement}</li>
      </ul>

      <h3 class="console-subheading">The five consequences</h3>
      <ol class="list-marked">
        {CONSEQUENCES.map((consequence) => (
          <li key={consequence}>{consequence}</li>
        ))}
      </ol>

      {refusal ? <Banner word="Refused">{`This withdrawal was not recorded: ${refusal}.`}</Banner> : null}

      <form class="form" onSubmit={confirm} noValidate>
        <div class="field">
          <label class="field__label" for="withdrawal-reason">
            Reason, the only free text a certificate carries
          </label>
          <textarea
            id="withdrawal-reason"
            class="field__control"
            value={reason}
            onInput={(event) => setReason((event.currentTarget as HTMLTextAreaElement).value)}
          />
        </div>
        <button type="submit" class="submit" disabled={working}>
          <Mark name="arrow" labelFirst label={working ? 'Withdrawing …' : 'Confirm withdrawal'} />
        </button>
      </form>
    </div>
  );
}

function Detail({ certificate }: { certificate: CertificateView }): JSX.Element {
  const lines: { label: string; value: JSX.Element | string }[] = [
    { label: 'Number', value: <span class="mono">{certificate.number}</span> },
    { label: 'Version', value: <span class="mono">{String(certificate.version)}</span> },
    { label: 'State', value: words(certificate.state) },
    { label: 'Site', value: <span class="mono">{certificate.site}</span> },
    { label: 'Grade', value: <span class="mono">{certificate.grade}</span> },
    {
      label: 'Lots',
      value: (
        <span class="mono">
          {certificate.lots.map((lot) => (
            <a key={lot.reference} href={`/console/lots/${lot.reference}`}>
              {`${lot.reference} at ${grams(lot.mass_g)} `}
            </a>
          ))}
        </span>
      ),
    },
    { label: 'Specification version', value: <span class="mono">{certificate.specification_version}</span> },
    { label: 'Claim type', value: words(certificate.claim_type) },
    {
      label: 'Recycled content',
      value: (
        <RecycledContent
          content_bp={certificate.content_bp}
          claim_type={certificate.claim_type}
          scheme={certificate.scheme}
        />
      ),
    },
    { label: 'Category split', value: <span class="mono">{categorySplitText(certificate.category_split)}</span> },
    {
      label: 'Balance period',
      value: certificate.period ? (
        <a class="mono" href={`/console/balance/${certificate.period}`}>
          {certificate.period}
        </a>
      ) : (
        'none'
      ),
    },
    {
      label: 'Carbon',
      value: certificate.carbon ? (
        <CarbonFigure
          value_mg_per_kg={certificate.carbon.value_mg_per_kg}
          boundary={certificate.carbon.boundary}
          method_version={certificate.carbon.method_version}
          uncertainty_bp={certificate.carbon.uncertainty_bp}
        />
      ) : (
        'no carbon figure is recorded against this certificate'
      ),
    },
    {
      label: 'Primary data share',
      value: <span class="mono">{percent(certificate.primary_share_bp ?? 0)}</span>,
    },
    { label: 'Scheme', value: <span class="mono">{certificate.scheme}</span> },
    { label: 'Registration', value: <span class="mono">{certificate.registration}</span> },
    {
      label: 'Permitted statement',
      value: <span class="permitted-statement">{certificate.permitted_statement}</span>,
    },
    {
      label: 'Prohibited statement',
      value: <span class="permitted-statement">{certificate.prohibited_statement}</span>,
    },
    { label: 'Recipient', value: `${certificate.recipient_name}, ${certificate.recipient}` },
    { label: 'Signer', value: certificate.signer },
    { label: 'Signed at', value: <span class="mono">{certificate.signed_at}</span> },
    { label: 'Verification address', value: <span class="mono">{certificate.verification_url}</span> },
    {
      label: 'Conversion factor',
      value: certificate.provisional_factor
        ? 'provisional, and every certificate resting on it says so'
        : 'derived from a stated window',
    },
  ];
  return (
    <dl class="pair-list">
      {lines.map((line) => (
        <div key={line.label}>
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CertificateScreen({
  number,
  identity,
}: {
  number: string;
  identity: Identity | null;
}): JSX.Element {
  const certificate = useFetch<CertificateView>(`/certificates/${number}`);
  const [withdrawn, setWithdrawn] = useState<WithdrawalView | null>(null);
  const answer = certificate.data;
  const maySign = holdsRole(identity, 'certificate_signer');

  return (
    <section class="section">
      <span class="eyebrow">Certificate</span>
      <h1 class="console-title mono">{number}</h1>

      {certificate.loading ? <Loading what={`certificate ${number}`} /> : null}
      {certificate.error ? (
        <Empty sentence={`Certificate ${number} could not be read: ${certificate.error}.`} />
      ) : null}

      {answer ? (
        <>
          {answer.state === 'withdrawn' && answer.withdrawn_on !== null ? (
            <Banner word="Withdrawn">
              {STATEMENTS.withdrawn(answer.withdrawn_on, answer.withdrawal_reason ?? 'no reason was recorded')}
            </Banner>
          ) : null}
          <p>
            {`This document states what ${answer.recipient_name} may and may not say about the material. Every field below is derived from the record, and the address resolves for as long as the certificate exists.`}
          </p>
          <Detail certificate={answer} />

          {maySign && answer.state === 'issued' && withdrawn === null ? (
            <Withdrawal
              certificate={answer}
              onWithdrawn={(taken) => {
                setWithdrawn(taken);
                certificate.reload();
              }}
            />
          ) : null}

          {withdrawn ? (
            <div class="stack-wide">
              <Banner word="Withdrawn">
                {STATEMENTS.withdrawn(withdrawn.withdrawn_on, withdrawn.reason)}
              </Banner>
              <h2 class="console-heading">What that withdrawal did</h2>
              <h3 class="console-subheading">Recipients notified</h3>
              <ul class="list-marked">
                {withdrawn.notified_recipients.map((recipient) => (
                  <li key={recipient.reference}>{`${recipient.name}, ${recipient.email ?? 'no address on record'}`}</li>
                ))}
              </ul>
              <h3 class="console-subheading">Statements now void</h3>
              <ul class="list-marked">
                {withdrawn.void_statements.map((statement) => (
                  <li key={statement}>{statement}</li>
                ))}
              </ul>
              <h3 class="console-subheading">Derived certificates</h3>
              {withdrawn.derived_certificates.length === 0 ? (
                <Empty sentence="No certificate was derived from this one." />
              ) : (
                <ul class="list-marked">
                  {withdrawn.derived_certificates.map((derived) => (
                    <li key={derived} class="mono">
                      {derived}
                    </li>
                  ))}
                </ul>
              )}
              <h3 class="console-subheading">Batches traversed</h3>
              {withdrawn.batch_traversal.length === 0 ? (
                <Empty sentence="No batch feeds the lot this certificate rests on." />
              ) : (
                <ul class="list-marked">
                  {withdrawn.batch_traversal.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
