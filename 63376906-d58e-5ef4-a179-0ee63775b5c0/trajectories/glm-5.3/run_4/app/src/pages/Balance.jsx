import { useEffect, useState } from 'preact/hooks';
import { Link } from 'preact-router';
import { Loading, Banner } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function Balance({ user, id }) {
  const [period, setPeriod] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/api/balance-periods/' + id).then((r) => {
      if (r.ok) setPeriod(r.data); else setError(r.data);
    });
  }, [id]);

  return (
    <div>
      <h1 class="reveal">Balance period {id}</h1>
      {!period && !error && <Loading>Loading the ledger…</Loading>}
      {error && <Banner kind="refused">This period could not be read ({error.error}).</Banner>}
      {period && (
        <>
          <p class="lede">{period.site} · grade {period.grade} · {period.period.from} to {period.period.to} · <strong>{period.state_word}</strong></p>
          {period.state === 'closed' && <p class="state-word">This period is closed. Corrections require a restatement.</p>}

          <section>
            <h2>Credits, per category</h2>
            <p>There is no input control on this screen. Every figure is derived and every figure links to the records it came from.</p>
            <div class="cols">
              {['post_consumer', 'pre_consumer'].map((cat) => (
                <section class="card">
                  <h3>{cat}</h3>
                  <p>Credits in: <span class="figure-value mono">{period[cat].credits_in_g} g</span></p>
                  <p>Credits out: <span class="figure-value mono">{period[cat].credits_out_g} g</span></p>
                  <p>Credits available: <span class="figure-value mono">{period[cat].credits_available_g} g</span></p>
                  <p class="stat-meta">The two categories are never netted.</p>
                </section>
              ))}
            </div>
            {(period.inbound_credits || []).length > 0 && (
              <section class="card">
                <h3>Inbound credits</h3>
                <p>Transfers arrive as inbound credits naming their origin, never as fresh credit.</p>
                {period.inbound_credits.map((t) => (
                  <p class="mono">{t.reference}: {t.mass_g} g from {t.origin_site} · fresh credit {String(t.fresh_credit)}</p>
                ))}
              </section>
            )}
          </section>

          <section>
            <h2>Three counts</h2>
            <p>None is a badge to be cleared: overrides this period, open restatements, and findings.</p>
            <div class="cols">
              <div class="card"><h3>Overrides</h3><p class="figure-value mono">{period.override_count}</p></div>
              <div class="card"><h3>Open restatements</h3><p class="figure-value mono">{period.open_restatement_count}</p></div>
              <div class="card"><h3>Open findings</h3><p class="figure-value mono">{period.open_finding_count}</p></div>
            </div>
          </section>

          <section>
            <h2>Non-claimable input</h2>
            <p><span class="figure-value mono">{period.non_claimable_input_g} g</span></p>
            <p class="stat-meta">Material that was processed but carried no claim.</p>
          </section>

          {period.state === 'closed' && (
            <section>
              <h2>Carry-over settlement</h2>
              <p>Carried forward: post-consumer <span class="mono">{period.carried_forward_g.post_consumer} g</span>, pre-consumer <span class="mono">{period.carried_forward_g.pre_consumer} g</span>.</p>
              <p>Expired: post-consumer <span class="mono">{period.expired_g.post_consumer} g</span>, pre-consumer <span class="mono">{period.expired_g.pre_consumer} g</span>.</p>
              <p class="stat-meta">Closed on {period.closed_on}, cut-off {period.cut_off}. The period cannot be reopened.</p>
            </section>
          )}

          <section>
            <h2>Derivation</h2>
            <p>A balance is the sum of its movements and is never held as a total.</p>
            <div class="table-wrap">
              <table class="spec">
                <caption>The movements this balance is made of</caption>
                <thead><tr><th scope="col">Kind</th><th scope="col">Category</th><th scope="col">Direction</th><th scope="col">Mass</th><th scope="col">Batch or lot</th></tr></thead>
                <tbody>
                  {period.derivation.map((m) => (
                    <tr>
                      <td>{m.kind}</td>
                      <td>{m.category}</td>
                      <td>{m.direction}</td>
                      <td class="mono">{m.mass_g} g</td>
                      <td class="mono">{m.batch || m.lot || m.transfer || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
