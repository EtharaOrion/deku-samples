import { useEffect, useState } from 'preact/hooks';
import { useApi, useMeta, Link, grams, words } from '../lib.jsx';
import { Loading, Empty, Word } from '../components/Bits.jsx';

// Six figures, refreshed on a schedule, with the mass balance residual as the
// headline. It is a screen of numbers expected to be non-zero, and it shows
// this period against the last three rather than a status.
export function Reconciliation() {
  useMeta('Reconciliation — Ravel console', 'Six figures rather than six verdicts.');
  const r = useApi('/reconciliation');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTick((n) => n + 1);
      r.reload();
    }, 60000);
    return () => clearInterval(t);
  }, []);

  if (r.loading && !r.data) return <Loading what="the reconciliation figures" />;
  if (r.error) return <Empty>The reconciliation figures could not be loaded.</Empty>;
  const d = r.data;

  return (
    <>
      <h1 class="display-2">Reconciliation</h1>
      <p class="note" style="margin-top:0.5rem">
        Six figures rather than six verdicts. None is a badge and none is styled as passing. These are expected to be
        non-zero. Refreshed every minute; last read at {d.read_at}.
      </p>

      <section class="card" style="margin-top:1.5rem">
        <p class="t-eyebrow">The headline</p>
        <h2 style="margin-top:0.375rem">Mass balance residual</h2>
        <p class="figure-value" style="margin-top:0.5rem">{grams(d.mass_balance_residual_g)}</p>
        <p class="note">{d.derivation?.mass_balance_residual_g}</p>
      </section>

      <div class="grid-2" style="margin-top:1.25rem">
        <Figure label="Credit margin" value={grams(d.credit_margin_g)} note={d.derivation?.credit_margin_g} />
        <Figure label="Consumptions on open runs" value={String(d.consumptions_on_open_runs)} note="A consumption recorded against a run that has not been closed." />
        <Figure label="Batches with broken custody" value={String(d.batches_with_broken_custody)} note="A batch missing a custody link is non-claimable until late evidence arrives." />
        <Figure label="Certificates with superseded figures" value={String(d.certificates_with_superseded_figures)} note="A figure is never silently recomputed; a recomputation is the recorded act that changes it." />
      </div>

      <section class="card" style="margin-top:1.25rem">
        <h2>Integration ages</h2>
        <p class="note">
          A source that stops sending is detected by the age of its most recent record rather than by an error. A source
          that has never sent reads as no record rather than as zero.
        </p>
        <div class="scroller" style="margin-top:0.75rem">
          <table>
            <caption class="visually-hidden">The age in hours of the most recent record from each inbound source</caption>
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" class="num">Age in hours</th>
                <th scope="col">Last received</th>
              </tr>
            </thead>
            <tbody>
              {d.integration_ages.map((x) => (
                <tr key={x.source}>
                  <td>{words(x.source)}</td>
                  <td class="num">
                    {x.age_hours === null ? <span class="note">no record</span> : x.age_hours.toLocaleString('en-GB')}
                  </td>
                  <td class="mono">
                    {x.last_received_at ? String(x.last_received_at).slice(0, 19).replace('T', ' ') : <span class="note">never sent</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h2>This period against the last three</h2>
        <div class="scroller" style="margin-top:0.75rem">
          <table>
            <caption class="visually-hidden">The credit margin by period</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">State</th>
                <th scope="col" class="num">Credit margin</th>
              </tr>
            </thead>
            <tbody>
              {(d.history || []).map((h) => (
                <tr key={h.period}>
                  <td>
                    <Link href={`/console/balance/${h.period}`} class="mono">{h.period}</Link>
                  </td>
                  <td class="mono">{h.from}</td>
                  <td class="mono">{h.to}</td>
                  <td>
                    <Word quiet={h.state === 'open'}>{words(h.state)}</Word>
                  </td>
                  <td class="num">{Number(h.credit_margin_g).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Figure({ label, value, note }) {
  return (
    <section class="figure-block">
      <p class="t-label-small muted">{label}</p>
      <p class="figure-value" style="margin-top:0.375rem">{value}</p>
      {note ? <p class="note" style="margin-top:0.375rem">{note}</p> : null}
    </section>
  );
}
