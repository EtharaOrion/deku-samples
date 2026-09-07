import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

export default function RunDetail({ reference }) {
  const run = useAsync(() => api.get(`/runs/${reference}`), [reference]);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Run</p>
      <h1 className="t-h3 mono">{reference}</h1>

      {run.loading ? <Loading what="this run" /> : null}
      {run.error ? <Empty>This run could not be read.</Empty> : null}

      {run.data ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <StateWord quiet={run.data.state === 'closed'} icon={run.data.state === 'closed' ? 'lock' : null}>
              {run.data.state}
            </StateWord>
            <StateWord quiet>{run.data.run_type}</StateWord>
            {run.data.within_tolerance === false ? <StateWord icon="warning">Outside recipe tolerance</StateWord> : null}
            {run.data.within_tolerance === true ? <StateWord quiet>Inside recipe tolerance</StateWord> : null}
            {run.data.open_deviation ? <StateWord icon="warning">Open deviation</StateWord> : null}
            {run.data.flags.map((f) => <StateWord icon="flag" key={f}>{f.replace(/_/g, ' ')}</StateWord>)}
          </div>

          {run.data.state === 'closed' ? (
            <p className="banner banner-quiet" role="note">
              This run is closed and refuses every write. A second close answers with a refusal and is
              itself recorded as an attempt.
            </p>
          ) : null}

          <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h2 className="t-h4">The run</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Site</dt><dd className="mono">{run.data.site}</dd>
                <dt>Equipment</dt><dd className="mono">{run.data.equipment}</dd>
                <dt>Operator</dt><dd>{run.data.operator}</dd>
                <dt>Started at</dt><dd className="mono">{run.data.started_at}</dd>
                <dt>Closed at</dt><dd className="mono">{run.data.closed_at || '—'}</dd>
                <dt>Mass in</dt><dd className="mono">{formatInt(run.data.mass_in_g)} g</dd>
                <dt>Mass out</dt><dd className="mono">{formatInt(run.data.mass_out_g)} g</dd>
                <dt>Losses</dt><dd className="mono">{run.data.losses_g === null ? '—' : `${formatInt(run.data.losses_g)} g`}</dd>
                <dt>Event at</dt><dd className="mono">{run.data.event_at}</dd>
                <dt>Recorded at</dt><dd className="mono">{run.data.recorded_at}</dd>
                <dt>Effective on</dt><dd className="mono">{run.data.effective_on}</dd>
              </dl>
              <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>{run.data.derivation}</p>
            </div>

            <div className="card">
              <h2 className="t-h4">Recipe version {run.data.recipe_version}</h2>
              {run.data.recipe ? (
                <>
                  <p className="label" style={{ marginTop: '1rem' }}>Set points, released and actual</p>
                  <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                    <table>
                      <thead>
                        <tr><th scope="col">Parameter</th><th scope="col" className="num">Released</th><th scope="col" className="num">Actual</th><th scope="col">Tolerance</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(run.data.recipe.set_points).map(([k, v]) => (
                          <tr key={k}>
                            <td>{k.replace(/_/g, ' ')}</td>
                            <td className="num">{v}</td>
                            <td className="num">{run.data.actual_set_points?.[k] ?? '—'}</td>
                            <td className="mono">
                              {run.data.recipe.tolerances[k] ? run.data.recipe.tolerances[k].join(' to ') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <dl className="dl" style={{ marginTop: '1rem' }}>
                    <dt>Residence</dt><dd className="mono">{run.data.recipe.residence_min} min</dd>
                    <dt>Released by</dt><dd>{run.data.recipe.released_by}</dd>
                  </dl>
                  <p className="label" style={{ marginTop: '1rem' }}>Reagents and ratios</p>
                  <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                    {(run.data.recipe.reagents || []).map((r) => (
                      <li key={r.reagent}>{r.reagent}: <span className="mono">{r.ratio_bp} bp</span></li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>

          <section className="section">
            <h2 className="t-h4">Consumptions</h2>
            {run.data.consumptions.length === 0 ? (
              <Empty>No inputs are recorded against this run.</Empty>
            ) : (
              <div className="table-scroll" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr><th scope="col">Reference</th><th scope="col">Input</th><th scope="col" className="num">Mass</th><th scope="col">Effective on</th></tr>
                  </thead>
                  <tbody>
                    {run.data.consumptions.map((c) => (
                      <tr key={c.reference}>
                        <td className="mono">{c.reference}</td>
                        <td>
                          {c.input_kind === 'batch'
                            ? <Link href={`/console/batches/${c.input_ref}`} className="ref">{c.input_ref}</Link>
                            : <span className="mono">{c.input_ref}</span>}
                          <span className="t-small" style={{ color: 'var(--muted)' }}> ({c.input_kind})</span>
                        </td>
                        <td className="num">{formatInt(c.mass_g)} g</td>
                        <td className="mono">{c.effective_on}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="section">
            <h2 className="t-h4">Outputs</h2>
            {run.data.outputs.length === 0 ? (
              <Empty>No outputs are recorded against this run.</Empty>
            ) : (
              <div className="table-scroll" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr><th scope="col">Reference</th><th scope="col">Kind</th><th scope="col" className="num">Mass</th><th scope="col">Disposition</th></tr>
                  </thead>
                  <tbody>
                    {run.data.outputs.map((o) => (
                      <tr key={o.reference}>
                        <td>
                          {o.kind === 'lot'
                            ? <Link href={`/console/lots/${o.reference}`} className="ref">{o.reference}</Link>
                            : <span className="mono">{o.reference}</span>}
                        </td>
                        <td>{o.kind}</td>
                        <td className="num">{formatInt(o.mass_g)} g</td>
                        <td>{o.disposition || '—'}{o.allocation_basis ? ` (basis: ${o.allocation_basis})` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {run.data.deviations.length ? (
            <section className="section">
              <h2 className="t-h4">Deviations</h2>
              <ul className="t-small" style={{ paddingLeft: '1.1rem', marginTop: '0.75rem' }}>
                {run.data.deviations.map((d) => (
                  <li key={d.reference}>
                    <span className="mono">{d.reference}</span>: {d.state}
                    {d.outcome ? `, ${d.outcome.replace(/_/g, ' ')}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
