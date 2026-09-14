import { useEffect, useState } from 'preact/hooks';
import { Loading, Banner } from '../components/Chrome.jsx';
import { api } from '../api.js';

const SOURCES = ['weighbridge', 'control_system', 'laboratory', 'customer_reporting'];

export default function Reconciliation({ user }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  function load() {
    setData(null);
    api('/api/reconciliation').then((r) => {
      if (r.ok) setData(r.data);
      else setError(r.data);
    });
  }

  useEffect(load, []);

  return (
    <div>
      <h1 class="reveal">Reconciliation</h1>
      <p class="lede">Six figures, refreshed on a schedule. None is a verdict and none is styled as passing.</p>
      <button class="btn btn-quiet" type="button" onClick={load}>Refresh now</button>
      {error && <Banner kind="refused">The reconciliation figures could not be read ({error.error}).</Banner>}
      {!data && !error && <Loading>Loading reconciliation…</Loading>}
      {data && (
        <>
          <section class="figure-headline">
            <h2>Mass balance residual</h2>
            <p class="figure-value mono">{data.mass_balance_residual_g} g</p>
            <p class="stat-meta">A screen of numbers expected to be non-zero, showing this period rather than a status.</p>
          </section>
          <div class="cols">
            <section class="card">
              <h3>Credit margin</h3>
              <p class="figure-value mono">{data.credit_margin_g} g</p>
            </section>
            <section class="card">
              <h3>Consumptions on open runs</h3>
              <p class="figure-value mono">{data.consumptions_on_open_runs}</p>
            </section>
            <section class="card">
              <h3>Batches with broken custody</h3>
              {data.batches_with_broken_custody.length === 0
                ? <p>None</p>
                : data.batches_with_broken_custody.map((b) => <p class="mono">{b}</p>)}
            </section>
            <section class="card">
              <h3>Certificates with superseded figures</h3>
              <p class="figure-value mono">{data.certificates_with_superseded_figures}</p>
            </section>
          </div>
          <section>
            <h2>Integration ages</h2>
            <p>The age of the most recent record from each source. A source that has never sent reports nothing rather than zero.</p>
            <div class="table-wrap">
              <table class="spec">
                <caption>Age in hours of the most recent record from each inbound source</caption>
                <thead><tr><th scope="col">Source</th><th scope="col">Age (hours)</th></tr></thead>
                <tbody>
                  {SOURCES.map((s) => (
                    <tr><td>{s}</td><td class="mono">{data.integration_ages[s] === null ? 'never sent' : data.integration_ages[s]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p class="stat-meta">Read at {data.read_at}. The read names the moment it saw.</p>
        </>
      )}
    </div>
  );
}
