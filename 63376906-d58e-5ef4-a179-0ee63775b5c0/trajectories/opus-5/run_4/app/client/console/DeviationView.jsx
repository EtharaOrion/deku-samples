import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, words, Refusal } from '../ui.jsx';

export default function DeviationView({ session, params }) {
  const reference = params.reference;
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const d = useAsync(() => api(`/deviations/${reference}`), [reference, tick]);

  const canClose = (session?.roles || []).includes('quality_manager');

  async function close(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const f = new FormData(e.target);
    try {
      await api(`/deviations/${reference}/close`, {
        body: { outcome: f.get('outcome'), reason: f.get('reason') },
      });
      setTick((t) => t + 1);
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  const v = d.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Deviation</p>
        <h1 class="t-h3 mono">{reference}</h1>
        {v ? (
          <p class="row">
            <StateWord word={words(v.state)} heavy={v.state === 'open'} />
            {v.outcome ? <StateWord word={words(v.outcome)} quiet /> : null}
          </p>
        ) : null}
      </div>

      {d.loading ? <Loading what="the deviation" /> : null}
      {d.error ? <Empty>This deviation could not be read.</Empty> : null}
      <Refusal error={error} />

      {v ? (
        <>
          <h2 class="t-h4">{v.title}</h2>
          <p class="t-big">{v.detail}</p>
          <dl class="def">
            <dt>State</dt><dd>{words(v.state)}</dd>
            <dt>Outcome</dt>
            <dd>
              {v.outcome ? words(v.outcome) : 'none yet'}
              {v.outcome === 'cause_not_established' ? (
                <span class="t-small" style="display:block;color:var(--muted)">
                  Both outcomes are honest and neither is hidden.
                </span>
              ) : null}
            </dd>
            <dt>Raised by</dt><dd>{v.raised_by}</dd>
            <dt>Raised at</dt><dd class="mono">{v.raised_at}</dd>
            <dt>Closed by</dt><dd>{v.closed_by || '—'}</dd>
            <dt>Closed at</dt><dd class="mono">{v.closed_at || '—'}</dd>
            <dt>Close reason</dt><dd>{v.close_reason || '—'}</dd>
            <dt>Affects</dt>
            <dd class="mono">
              {v.affects.map((a) => (
                <>
                  <a href={a.kind === 'lot' ? `/console/lots/${a.reference}` : `/console/runs/${a.reference}`}>
                    {a.reference}
                  </a>{' '}
                  <span class="t-small">({a.kind})</span><br />
                </>
              ))}
            </dd>
          </dl>
          <p class="t-small" style="color:var(--muted)">
            A deviation travels with every lot it touches and appears on the internal view of any
            certificate issued against that lot.
          </p>

          {canClose && v.state === 'open' ? (
            <section class="sheet" style="margin-top:2.5rem" aria-labelledby="cl">
              <h2 id="cl" class="t-h4">Close this deviation</h2>
              <form onSubmit={close}>
                <div class="field">
                  <label class="t-label" for="outcome">Outcome</label>
                  <select id="outcome" name="outcome" required>
                    <option value="root_cause_found">Root cause found</option>
                    <option value="cause_not_established">Cause not established</option>
                  </select>
                </div>
                <div class="field">
                  <label class="t-label" for="reason">Reason</label>
                  <textarea id="reason" name="reason" rows="3"></textarea>
                </div>
                <p style="margin-top:1.25rem;margin-bottom:0">
                  <button class="btn" type="submit" disabled={busy}>
                    {busy ? 'Closing…' : 'Close'} <span class="btn-arrow" aria-hidden="true">→</span>
                  </button>
                </p>
              </form>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
