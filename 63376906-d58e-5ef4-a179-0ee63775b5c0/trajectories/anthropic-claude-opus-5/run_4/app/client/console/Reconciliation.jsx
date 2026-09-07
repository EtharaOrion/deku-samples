import { useState, useEffect } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, grams, words } from '../ui.jsx';

/**
 * Six figures rather than six verdicts. None is a badge and none is styled as
 * passing. It is a screen of numbers expected to be non-zero.
 */
export default function Reconciliation({ session }) {
  const [tick, setTick] = useState(0);
  const r = useAsync(() => api('/reconciliation'), [tick]);

  // Refreshed on a schedule.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const d = r.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Reconciliation</p>
        <h1 class="t-h3">Six figures</h1>
        <p class="t-big">
          Not six verdicts. These numbers are expected to be non-zero; the question is whether each
          is the size you would expect, not whether it has been cleared.
        </p>
        {d ? (
          <p class="t-small" style="color:var(--muted)">
            Refreshed every minute. This read saw the records at <span class="mono">{d.read_at}</span>.
          </p>
        ) : null}
      </div>

      {r.loading && !d ? <Loading what="the reconciliation figures" /> : null}
      {r.error ? <Empty>The reconciliation figures could not be read.</Empty> : null}

      {d ? (
        <>
          <section aria-labelledby="head">
            <h2 id="head" class="t-h4">Mass balance residual</h2>
            <p class="figure mono" style="font-size:var(--size-h3);line-height:var(--lh-h3)">
              {d.mass_balance_residual_g.toLocaleString('en-GB')} g
            </p>
            <p class="t-small" style="color:var(--muted);max-width:var(--measure)">
              {d.derivation.mass_balance_residual_g}. A residual of zero across every run would
              mean the losses recorded at each close account for every gram, which is what you
              would expect and not a thing to celebrate.
            </p>
          </section>

          <section aria-labelledby="five" style="margin-top:2.5rem">
            <h2 id="five" class="t-h4">The other five</h2>
            <div class="figure-rows">
              <div class="figure-row">
                <p class="t-label" style="margin:0">Credit margin</p>
                <p class="figure mono" style="margin:0">{d.credit_margin_g.toLocaleString('en-GB')} g</p>
                <p class="t-small" style="margin:0">{d.derivation.credit_margin_g}</p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Consumptions on open runs</p>
                <p class="figure mono" style="margin:0">{d.consumptions_on_open_runs}</p>
                <p class="t-small" style="margin:0">Recorded against a run that has not been closed.</p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Batches with broken custody</p>
                <p class="figure mono" style="margin:0">{d.batches_with_broken_custody}</p>
                <p class="t-small" style="margin:0">
                  {d.batches_with_broken_custody_detail.map((b) => (
                    <><span class="mono">{b.batch}</span>: {b.missing.join(', ')}<br /></>
                  ))}
                </p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Certificates with superseded figures</p>
                <p class="figure mono" style="margin:0">{d.certificates_with_superseded_figures}</p>
                <p class="t-small" style="margin:0">
                  {d.certificates_with_superseded_figures_detail.join(', ') || 'None.'}
                </p>
              </div>
              <div class="figure-row">
                <p class="t-label" style="margin:0">Integration ages</p>
                <p class="figure mono" style="margin:0">{d.integration_ages.length} sources</p>
                <p class="t-small" style="margin:0">Listed in full below.</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="ages" style="margin-top:2.5rem">
            <h2 id="ages" class="t-h4">Inbound sources</h2>
            <p class="t-small" style="color:var(--muted)">
              A source that stops sending is detected by the age of its most recent record rather
              than by an error, and a source that has never sent reads as never rather than as zero.
            </p>
            <div class="table-scroll">
              <table>
                <caption>Four sources. None of them is called out to; every one reaches the app the same way.</caption>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col">Last received</th>
                    <th scope="col" class="num">Age, hours</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {d.integration_ages.map((a) => (
                    <tr key={a.source}>
                      <th scope="row">{words(a.source)}</th>
                      <td class="mono t-small">{a.last_received_at || '—'}</td>
                      <td class="num">{a.age_hours === null ? 'null' : a.age_hours.toLocaleString('en-GB')}</td>
                      <td>
                        {a.never_sent
                          ? <StateWord word="Never sent" heavy />
                          : <StateWord word="Has sent" quiet />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="hist" style="margin-top:2.5rem">
            <h2 id="hist" class="t-h4">This period against the last three</h2>
            <div class="table-scroll">
              <table>
                <caption>Rather than a status.</caption>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                    <th scope="col" class="num">Credit margin</th>
                    <th scope="col" class="num">Non-claimable input</th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.period}>
                      <th scope="row" class="mono">
                        <a href={`/console/balance/${h.period}`}>{h.period}</a>
                      </th>
                      <td class="mono">{h.from}</td>
                      <td class="mono">{h.to}</td>
                      <td class="num">{h.credit_margin_g.toLocaleString('en-GB')}</td>
                      <td class="num">{h.non_claimable_input_g.toLocaleString('en-GB')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
