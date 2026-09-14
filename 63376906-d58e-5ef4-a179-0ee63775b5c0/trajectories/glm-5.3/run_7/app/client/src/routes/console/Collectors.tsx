// Collectors: approval periods, conditions, findings, party names by date.
import { useEffect, useState } from 'preact/hooks';
import { api, fmtDate } from '../../lib/api';
import { Loading, Empty, StateWord } from '../../components/Figures';

type Period = { state: string; valid_from: string; valid_to: string; condition?: string | null; condition_closes_on?: string | null; expiring?: boolean };
type Finding = { reference: string; description: string; departure_bp: number; state: string; opened_on: string };
type Collector = {
  reference: string; name: string; country: string; registration: string; registration_expiry: string;
  collection_site_types: string[]; declared_streams: string[]; scheme_status: string;
  findings: Finding[]; approval_periods: Period[];
};

export default function Collectors() {
  const [collectors, setCollectors] = useState<Collector[] | null>(null);
  useEffect(() => { api<Collector[]>('/collectors').then(setCollectors).catch(() => setCollectors([])); }, []);

  if (!collectors) return <div class="console-shell"><Loading what="The collectors" /></div>;
  if (collectors.length === 0) return <div class="console-shell"><Empty what="collectors" /></div>;

  return (
    <div class="console-shell">
      <h1>Collectors</h1>
      <p class="measure">An approval is a dated period. A batch resolves its claimability against the approval in force on its receipt date, never a current flag.</p>
      {collectors.map((c) => (
        <section class="card" key={c.reference} style="margin-bottom:1.5rem">
          <h2 class="mono" style="font-size:var(--step-h4-size)">{c.reference}</h2>
          <p class="label">{c.name} · {c.country} · {c.registration}, expires {c.registration_expiry}</p>
          <p class="label">Streams: {c.declared_streams.join(', ')}. Site types: {c.collection_site_types.join(', ')}.</p>
          <h3 style="font-size:var(--step-body-size)">Approval periods</h3>
          <div class="table-scroll">
            <table class="sheet">
              <thead><tr><th scope="col">State</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Condition</th><th scope="col">Closes by</th></tr></thead>
              <tbody>
                {c.approval_periods.map((p, i) => (
                  <tr key={i}>
                    <td><StateWord state={p.state} />{p.expiring ? <span class="label"> expiring</span> : null}</td>
                    <td>{p.valid_from}</td>
                    <td>{p.valid_to}</td>
                    <td>{p.condition || '—'}</td>
                    <td>{p.condition_closes_on || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 style="font-size:var(--step-body-size);margin-top:1rem">Findings</h3>
          {c.findings.length === 0 ? <p class="notice">No findings stand against this collector.</p> : (
            <ul>
              {c.findings.map((f) => (
                <li key={f.reference}><span class="mono">{f.reference}</span> — {f.description} <span class="label">departure {f.departure_bp} bp, {f.state}, opened {fmtDate(f.opened_on)}</span></li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
