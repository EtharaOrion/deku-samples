import { useState, useEffect } from 'preact/hooks';
import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

// Six figures rather than six verdicts. None is a badge and none is styled as passing.
export default function Reconciliation() {
  const [tick, setTick] = useState(0);
  const recon = useAsync(() => api.get('/reconciliation'), [tick]);
  const inbound = useAsync(() => api.get('/inbound'), [tick]);

  // refreshed on a schedule
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">Reconciliation</h1>
      <p style={{ marginTop: '0.75rem' }}>
        This is a screen of numbers expected to be non-zero. None of them is a verdict, and none is
        styled as passing. The mass balance residual is the headline.
      </p>

      {recon.loading ? <Loading what="the reconciliation figures" /> : null}
      {recon.error ? <Empty>The reconciliation figures could not be read.</Empty> : null}

      {recon.data ? (
        <>
          <section className="section">
            <h2 className="t-h4">Mass balance residual</h2>
            <p className="figure t-h3" style={{ marginTop: '0.75rem' }}>
              {formatInt(recon.data.mass_balance_residual_g)} g
            </p>
            <p className="t-small" style={{ color: 'var(--muted)' }}>
              {recon.data.detail.mass_balance.derivation}: mass in{' '}
              {formatInt(recon.data.detail.mass_balance.mass_in_g)} g, mass out{' '}
              {formatInt(recon.data.detail.mass_balance.mass_out_g)} g, losses{' '}
              {formatInt(recon.data.detail.mass_balance.losses_g)} g.
            </p>
          </section>

          <section className="section">
            <h2 className="t-h4">The other five figures</h2>
            <div className="figure-rows" style={{ marginTop: '1rem', maxWidth: '46rem' }}>
              <Row label="Credit margin" value={`${formatInt(recon.data.credit_margin_g)} g`} />
              <Row label="Consumptions on open runs" value={formatInt(recon.data.consumptions_on_open_runs)} />
              <Row label="Batches with broken custody" value={formatInt(recon.data.batches_with_broken_custody)} />
              <Row label="Certificates with superseded figures" value={formatInt(recon.data.certificates_with_superseded_figures)} />
              <Row label="Inbound sources reporting" value={`${recon.data.integration_ages.filter((a) => a.age_hours !== null).length} of ${recon.data.integration_ages.length}`} />
            </div>

            {recon.data.detail.batches_with_broken_custody.length ? (
              <>
                <p className="label" style={{ marginTop: '1.5rem' }}>Batches with broken custody</p>
                <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                  {recon.data.detail.batches_with_broken_custody.map((b) => (
                    <li key={b.reference}>
                      <Link href={`/console/batches/${b.reference}`} className="ref">{b.reference}</Link>:
                      missing {b.missing.join(', ')}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <p className="label" style={{ marginTop: '1.5rem' }}>Credit margin, per period</p>
            <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
              <table>
                <thead><tr><th scope="col">Period</th><th scope="col">Site</th><th scope="col">State</th><th scope="col" className="num">Margin</th></tr></thead>
                <tbody>
                  {recon.data.detail.credit_margin.map((p) => (
                    <tr key={p.period}>
                      <td><Link href={`/console/balance/${p.period}`} className="ref">{p.period}</Link></td>
                      <td className="mono">{p.site}</td>
                      <td>{p.state}</td>
                      <td className="num">{formatInt(p.credit_margin_g)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <h2 className="t-h4">Integration ages</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              A source that stops sending is detected by the age of its most recent record rather than
              by an error. A source that has never sent reports nothing rather than zero.
            </p>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr><th scope="col">Source</th><th scope="col" className="num">Age</th><th scope="col">Most recent record</th></tr>
                </thead>
                <tbody>
                  {recon.data.integration_ages.map((a) => (
                    <tr key={a.source}>
                      <td>{a.source.replace(/_/g, ' ')}</td>
                      <td className="num">{a.age_hours === null ? 'never sent' : `${formatInt(a.age_hours)} h`}</td>
                      <td className="mono">
                        {a.last_received_at ? String(a.last_received_at).slice(0, 19).replace('T', ' ') : a.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <h2 className="t-h4">What arrived, kept verbatim</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              The bytes exactly as they arrived, rather than the shape the app parsed them into: a
              disagreement with a supplier is settled by what came in. This app opens no outbound
              connection to any of the four sources.
            </p>
            {inbound.loading ? <Loading what="the inbound records" /> : null}
            {inbound.data && inbound.data.length === 0 ? <Empty>No inbound records have arrived.</Empty> : null}
            {inbound.data && inbound.data.length ? (
              <div className="stack" style={{ marginTop: '1rem' }}>
                {inbound.data.map((r) => (
                  <div className="card-quiet" key={r.reference}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="mono">{r.reference}</span>
                      <StateWord quiet>{r.source.replace(/_/g, ' ')}</StateWord>
                      <span className="mono t-small">{String(r.received_at).slice(0, 19).replace('T', ' ')}</span>
                    </div>
                    <pre className="document-body" style={{ marginTop: '0.5rem', fontSize: 'var(--step-eyebrow-size)', lineHeight: 'var(--step-eyebrow-lh)' }}>
                      {r.payload_verbatim}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '2rem' }}>
            Read at {recon.data.read_at}. This surface refreshes on a schedule.
          </p>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="figure-row">
      <div>{label}</div>
      <div className="figure-value">{value}</div>
    </div>
  );
}
