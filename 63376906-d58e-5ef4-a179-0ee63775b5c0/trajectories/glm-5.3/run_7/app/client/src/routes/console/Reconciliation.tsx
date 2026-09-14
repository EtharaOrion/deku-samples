// Reconciliation: six figures, refreshed on a schedule, none a verdict.
import { useEffect, useState } from 'preact/hooks';
import { api } from '../../lib/api';
import { Loading } from '../../components/Figures';

export default function Reconciliation() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    const load = () => api<any>('/reconciliation').then(setData).catch(() => setData(null));
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, []);

  if (!data) return <div class="console-shell"><Loading what="The six figures" /></div>;

  const headline = data.mass_balance_residual_g;
  const ages = data.integration_ages || [];

  return (
    <div class="console-shell">
      <h1>Reconciliation</h1>
      <p class="measure">Six figures rather than six verdicts. This is a screen of numbers expected to be non-zero, shown against this period rather than as a status.</p>

      <section>
        <div class="stat">
          <p class="label">Headline — mass balance residual</p>
          <p class="value figures">{Number(headline).toLocaleString('en-GB')} g</p>
          <p class="meta">{data.derivation?.mass_balance_residual_g}</p>
        </div>
      </section>

      <section>
        <h2>The remaining five</h2>
        <ul class="figure-list">
          <li><span class="label">Credit margin</span><span class="figures">{Number(data.credit_margin_g).toLocaleString('en-GB')} g</span></li>
          <li><span class="label">Consumptions on open runs</span><span class="figures">{data.consumptions_on_open_runs}</span></li>
          <li><span class="label">Batches with broken custody</span><span class="figures">{data.batches_with_broken_custody}</span></li>
          <li><span class="label">Certificates with superseded figures</span><span class="figures">{data.certificates_with_superseded_figures}</span></li>
        </ul>
      </section>

      <section>
        <h2>Integration ages</h2>
        <p class="label">A source that stops sending is detected by the age of its most recent record rather than by an error. A source that has never sent reads null.</p>
        <ul class="figure-list">
          {ages.map((a: any) => (
            <li key={a.source}>
              <span class="label">{a.source.replace(/_/g, ' ')}</span>
              <span class="figures">{a.age_hours === null ? 'null — never sent' : a.age_hours + ' hours'}</span>
            </li>
          ))}
        </ul>
      </section>
      <p class="label">Read at {data.read_at}</p>
    </div>
  );
}
