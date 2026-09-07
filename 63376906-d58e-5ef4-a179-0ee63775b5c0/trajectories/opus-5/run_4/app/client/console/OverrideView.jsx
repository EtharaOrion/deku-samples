import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, words, Refusal } from '../ui.jsx';

export default function OverrideView({ session, params }) {
  const reference = params.reference;
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const o = useAsync(() => api(`/overrides/${reference}`), [reference, tick]);

  const canReview = (session?.roles || []).some((r) => ['quality_manager', 'claims_manager'].includes(r));

  async function review() {
    setBusy(true); setError(null);
    try {
      await api(`/overrides/${reference}/review`, { body: {} });
      setTick((t) => t + 1);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  const v = o.data;
  const isAuthoriser = v && session && v.authorised_by === session.email;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Override</p>
        <h1 class="t-h3 mono">{reference}</h1>
        {v ? (
          <p class="row">
            <StateWord word={v.reviewed ? 'Reviewed' : 'Unreviewed'} heavy={!v.reviewed} />
            <StateWord word="Permanent" quiet />
          </p>
        ) : null}
      </div>

      {o.loading ? <Loading what="the override" /> : null}
      {o.error ? <Empty>This override could not be read.</Empty> : null}
      <Refusal error={error} />

      {v ? (
        <>
          <div class="banner">
            <p class="t-eyebrow">On this lot for its life</p>
            <p style="margin-bottom:0"><strong>{v.statement}</strong></p>
          </div>

          <dl class="def">
            <dt>Separation broken</dt><dd class="mono">{v.separation}</dd>
            <dt>Reason</dt><dd>{v.reason}</dd>
            <dt>Lot</dt>
            <dd class="mono"><a href={`/console/lots/${v.lot}`}>{v.lot}</a></dd>
            <dt>Authorised by</dt><dd>{v.authorised_by}</dd>
            <dt>Authorised on</dt><dd class="mono">{v.authorised_on}</dd>
            <dt>Recorded by</dt><dd>{v.recorded_by}</dd>
            <dt>Reviewed</dt>
            <dd>
              {v.reviewed ? <>Yes, by {v.reviewed_by} at <span class="mono">{v.reviewed_at}</span></> : 'No'}
            </dd>
            <dt>Blocks signing</dt>
            <dd>
              {v.blocks_signing
                ? 'Yes. A certificate cannot be signed against this lot until a second person reviews this override.'
                : 'No longer. A second person has reviewed it.'}
            </dd>
          </dl>

          <p class="t-small" style="color:var(--muted)">
            A review sets reviewed true and removes nothing. The override is permanent, shows on
            the lot for its life and is counted on the balance screen.
          </p>

          {!v.reviewed ? (
            <section class="sheet" style="margin-top:2.5rem" aria-labelledby="rv">
              <h2 id="rv" class="t-h4">Review</h2>
              {isAuthoriser ? (
                <p class="banner" style="margin:0">
                  <strong>
                    You authorised this override, so you may not review it. A review is a second
                    person.
                  </strong>
                </p>
              ) : !canReview ? (
                <p class="banner" style="margin:0">
                  <strong>
                    A review is refused for anybody who is neither a quality manager nor a claims
                    manager. Your role is {(session?.roles || []).map(words).join(', ')}.
                  </strong>
                </p>
              ) : (
                <>
                  <p>
                    Reviewing records that a second person has seen this broken separation. It
                    removes nothing and it does not erase the override.
                  </p>
                  <p style="margin-bottom:0">
                    <button class="btn" type="button" onClick={review} disabled={busy}>
                      {busy ? 'Recording…' : 'Record my review'}{' '}
                      <span class="btn-arrow" aria-hidden="true">→</span>
                    </button>
                  </p>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
