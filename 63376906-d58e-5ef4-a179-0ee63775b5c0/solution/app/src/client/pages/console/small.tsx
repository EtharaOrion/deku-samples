/**
 * The two records an issuing condition points at: an override, which a second
 * person reviews and nobody removes, and a deviation, which travels with every
 * lot it touches.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { STATEMENTS } from '../../../shared/copy';
import { Mark } from '../../components/marks';
import { Banner, Empty, Loading } from '../../components/status';
import { words } from '../../format';
import type { Identity } from '../../routes';
import { detailOf, holdsRole, post, useFetch } from './hooks';
import type { DeviationView, OverrideView } from './views';

export function OverrideScreen({
  reference,
  identity,
}: {
  reference: string;
  identity: Identity | null;
}): JSX.Element {
  const override = useFetch<OverrideView>(`/overrides/${reference}`);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const held = override.data;
  const mayReview = holdsRole(identity, 'quality_manager') || holdsRole(identity, 'claims_manager');

  async function review(): Promise<void> {
    setRefusal(null);
    setWorking(true);
    try {
      const answer = await post<OverrideView>(`/overrides/${reference}/review`, {});
      setReviewed(`${answer.reference} was reviewed by ${answer.reviewed_by ?? 'the reader'}. The override itself is removed by nobody.`);
      override.reload();
    } catch (error) {
      setRefusal(detailOf(error));
    }
    setWorking(false);
  }

  return (
    <section class="section">
      <span class="eyebrow">Override</span>
      <h1 class="console-title mono">{reference}</h1>

      {override.loading ? <Loading what={`override ${reference}`} /> : null}
      {override.error ? <Empty sentence={`Override ${reference} could not be read: ${override.error}.`} /> : null}

      {held ? (
        <>
          <p>{STATEMENTS.overridden(held.authorised_by, held.authorised_on)}</p>
          <p>
            {held.reviewed
              ? 'This override has been reviewed by somebody other than its authoriser. It stands on the lot for the life of the lot regardless.'
              : 'This is an unreviewed override. It blocks signing until a second person reviews it, and reviewing it removes nothing.'}
          </p>
          <dl class="pair-list">
            <div>
              <dt>Separation broken</dt>
              <dd>{words(held.separation)}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{held.reason ?? 'no reason is recorded'}</dd>
            </div>
            <div>
              <dt>Lot</dt>
              <dd class="mono">
                {held.lot ? <a href={`/console/lots/${held.lot}`}>{held.lot}</a> : 'none'}
              </dd>
            </div>
            <div>
              <dt>Authorised by</dt>
              <dd>{`${held.authorised_by} on ${held.authorised_on}`}</dd>
            </div>
            <div>
              <dt>Standing</dt>
              <dd>{held.reviewed ? 'reviewed' : 'unreviewed override'}</dd>
            </div>
            <div>
              <dt>Reviewed by</dt>
              <dd>{held.reviewed_by ?? 'nobody yet'}</dd>
            </div>
          </dl>

          {refusal ? <Banner word="Refused">{`This review was not recorded: ${refusal}.`}</Banner> : null}
          {reviewed ? <Banner word="Reviewed">{reviewed}</Banner> : null}

          {mayReview && !held.reviewed ? (
            <button type="button" class="button-quiet" onClick={review} disabled={working}>
              <Mark name="arrow" labelFirst label={working ? 'Recording the review …' : 'Review this override'} />
            </button>
          ) : null}
          {!mayReview ? <p>Reviewing an override requires the quality manager or the claims manager role.</p> : null}
        </>
      ) : null}
    </section>
  );
}

export function DeviationScreen({ reference }: { reference: string }): JSX.Element {
  const deviation = useFetch<DeviationView>(`/deviations/${reference}`);
  const held = deviation.data;

  return (
    <section class="section">
      <span class="eyebrow">Deviation</span>
      <h1 class="console-title mono">{reference}</h1>

      {deviation.loading ? <Loading what={`deviation ${reference}`} /> : null}
      {deviation.error ? <Empty sentence={`Deviation ${reference} could not be read: ${deviation.error}.`} /> : null}

      {held ? (
        <>
          <p>
            {held.state === 'open'
              ? 'This is an open deviation. It travels with every lot it touches, it blocks a disposition and a period close, and it appears on the internal view of any certificate issued against those lots.'
              : 'This deviation is closed. Both outcomes are honest answers and neither is hidden.'}
          </p>
          <dl class="pair-list">
            <div>
              <dt>Description</dt>
              <dd>{held.description}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{held.state === 'open' ? 'open deviation' : 'closed'}</dd>
            </div>
            <div>
              <dt>Outcome</dt>
              <dd>{held.outcome === null ? 'none while it stands open' : words(held.outcome)}</dd>
            </div>
            <div>
              <dt>Runs touched</dt>
              <dd class="mono">{held.runs.length === 0 ? 'none' : held.runs.join(', ')}</dd>
            </div>
            <div>
              <dt>Lots touched</dt>
              <dd class="mono">
                {held.lots.length === 0
                  ? 'none'
                  : held.lots.map((lot) => (
                      <a key={lot} href={`/console/lots/${lot}`}>
                        {`${lot} `}
                      </a>
                    ))}
              </dd>
            </div>
            <div>
              <dt>Raised</dt>
              <dd>{`${held.raised_by} at ${held.raised_at}`}</dd>
            </div>
            <div>
              <dt>Closed</dt>
              <dd>{held.closed_by === null ? 'not closed' : `${held.closed_by} at ${held.closed_at ?? 'a moment not recorded'}`}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </section>
  );
}
