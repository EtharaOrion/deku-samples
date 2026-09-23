import type { JSX } from 'preact';
import { STATEMENTS, VERIFY } from '../../shared/copy';
import { WarningMark } from '../components/marks';
import { Reveal } from '../components/reveal';
import { words } from '../format';
import type { VerifyView } from '../routes';

export function VerifyPage({ answer }: { answer: VerifyView }): JSX.Element {
  const withdrawn = answer.state === 'withdrawn';

  return (
    <section class="section hero">
      <span class="eyebrow eyebrow-accent">{VERIFY.headline}</span>
      <Reveal>
        <h1 class="hero__title">{answer.number}</h1>
      </Reveal>

      {withdrawn ? (
        <p class="lede">
          <WarningMark label="Withdrawn" />
        </p>
      ) : null}

      <p class="lede">
        {answer.found ? VERIFY.found : VERIFY.notFound(answer.number)}
      </p>

      {withdrawn && answer.withdrawn_on ? (
        <p>{STATEMENTS.withdrawn(answer.withdrawn_on, answer.withdrawal_reason ?? 'not stated')}</p>
      ) : null}

      <dl class="pair-list">
        <div>
          <dt>{VERIFY.numberLabel}</dt>
          <dd class="mono">{answer.number}</dd>
        </div>
        <div>
          <dt>{VERIFY.stateLabel}</dt>
          <dd>{answer.state ? words(answer.state) : 'not on the register'}</dd>
        </div>
        <div>
          <dt>{VERIFY.issuedLabel}</dt>
          <dd class="mono">{answer.issued_on ?? 'not on the register'}</dd>
        </div>
        <div>
          <dt>{VERIFY.siteLabel}</dt>
          <dd class="mono">{answer.site ?? 'not on the register'}</dd>
        </div>
        <div>
          <dt>{VERIFY.gradeLabel}</dt>
          <dd class="mono">{answer.grade ?? 'not on the register'}</dd>
        </div>
        <div>
          <dt>{VERIFY.claimTypeLabel}</dt>
          <dd>{answer.claim_type ? words(answer.claim_type) : 'not on the register'}</dd>
        </div>
        <div>
          <dt>{VERIFY.recipientLabel}</dt>
          <dd>{answer.recipient_name ?? 'not on the register'}</dd>
        </div>
      </dl>

      <p class="meta-line">{VERIFY.noForwarding}</p>
      <p class="meta-line">{VERIFY.intro}</p>
    </section>
  );
}
