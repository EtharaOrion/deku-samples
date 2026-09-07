import { api } from '../../lib/api.js';
import { Loading, Empty, StateWord, useAsync } from '../../components/common.jsx';

export default function Collectors() {
  const collectors = useAsync(() => api.get('/collectors'), []);
  const contracts = useAsync(() => api.get('/contracts'), []);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <h1 className="t-h3">Collectors and contracts</h1>
      <p style={{ marginTop: '0.75rem' }}>
        A collector's approval is a dated period, so the question "what was true last March" has an
        answer. A grant inside fourteen days of its expiry is reported as expiring; nothing renews
        silently.
      </p>

      {collectors.loading ? <Loading what="the collectors" /> : null}
      {collectors.error ? <Empty>The collectors could not be read.</Empty> : null}
      {collectors.data && collectors.data.length === 0 ? <Empty>No collectors are recorded.</Empty> : null}

      {collectors.data && collectors.data.length ? (
        <div className="stack" style={{ marginTop: '2rem' }}>
          {collectors.data.map((c) => (
            <article className="card" key={c.reference}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <h2 className="t-h4">{c.name}</h2>
                <span className="mono t-small">{c.reference}</span>
                {c.expiring ? <StateWord icon="warning">Expiring</StateWord> : null}
                {c.findings.length ? <StateWord icon="flag">{c.findings.length} finding{c.findings.length === 1 ? '' : 's'}</StateWord> : null}
              </div>

              {c.expiry_note ? (
                <p className="t-small statement" style={{ marginTop: '0.5rem' }}>{c.expiry_note}</p>
              ) : null}

              <dl className="dl" style={{ marginTop: '0.75rem' }}>
                <dt>Country</dt><dd className="mono">{c.country}</dd>
                <dt>Registration</dt><dd className="mono">{c.registration}</dd>
                <dt>Registration expiry</dt><dd className="mono">{c.registration_expiry}</dd>
                <dt>Scheme status</dt><dd>{c.scheme_status.replace(/_/g, ' ')}</dd>
                <dt>Collection sites</dt><dd>{(c.collection_site_types || []).join(', ') || '—'}</dd>
                <dt>Declared streams</dt><dd>{(c.declared_streams || []).join(', ') || '—'}</dd>
              </dl>

              <p className="label" style={{ marginTop: '1rem' }}>Approval periods</p>
              <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                <table>
                  <thead>
                    <tr><th scope="col">State</th><th scope="col">Valid from</th><th scope="col">Valid to</th><th scope="col">Condition</th></tr>
                  </thead>
                  <tbody>
                    {c.approval_periods.map((p, i) => (
                      <tr key={i}>
                        <td>{p.state}</td>
                        <td className="mono">{p.valid_from}</td>
                        <td className="mono">{p.valid_to}</td>
                        <td className="t-small">
                          {p.condition
                            ? <>{p.condition}, closing by <span className="mono">{p.condition_closes_on}</span></>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {c.findings.length ? (
                <>
                  <p className="label" style={{ marginTop: '1rem' }}>Findings</p>
                  <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                    {c.findings.map((f) => (
                      <li key={f.reference}>
                        <span className="mono">{f.reference}</span> ({f.state}, raised {f.raised_on}
                        {f.due_on ? `, due ${f.due_on}` : ''}): {f.detail}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}

      <section className="section">
        <h2 className="t-h4">Contract projections</h2>
        <p className="t-small" style={{ marginTop: '0.5rem' }}>
          Delivered, the running content, the floor and the average the remaining volume must reach. An
          unreachable floor is reported and never refused.
        </p>
        {contracts.loading ? <Loading what="the contracts" /> : null}
        {contracts.data && contracts.data.length === 0 ? <Empty>No contracts are recorded.</Empty> : null}
        {contracts.data && contracts.data.length ? (
          <div className="stack" style={{ marginTop: '1rem' }}>
            {contracts.data.map((p) => (
              <div className="card-quiet" key={p.contract}>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="mono">{p.contract}</span>
                  <StateWord quiet={p.state === 'on_track'}>
                    {p.state === 'unreachable'
                      ? `Unreachable${p.unreachable_on ? ` since ${p.unreachable_on}` : ''}`
                      : 'On track'}
                  </StateWord>
                  {/* a planned site flag cannot be dismissed */}
                  {p.planned_site_flag ? <StateWord icon="flag">Planned site</StateWord> : null}
                </div>
                {p.planned_statement ? (
                  <p className="t-small" style={{ marginTop: '0.5rem' }}>{p.planned_statement}</p>
                ) : null}
                <div className="figure-rows" style={{ marginTop: '0.75rem' }}>
                  <div className="figure-row"><div>Delivered</div><div className="figure-value">{p.delivered_kg} kg</div></div>
                  <div className="figure-row"><div>Committed</div><div className="figure-value">{p.committed_kg} kg</div></div>
                  <div className="figure-row"><div>Running content</div><div className="figure-value">{p.running_content_bp} bp</div></div>
                  <div className="figure-row"><div>Floor</div><div className="figure-value">{p.floor_bp} bp</div></div>
                  <div className="figure-row">
                    <div>The average the remaining volume must reach</div>
                    <div className="figure-value">{p.required_remaining_bp === null ? '—' : `${p.required_remaining_bp} bp`}</div>
                  </div>
                </div>
                <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>{p.derivation}</p>
                <p className="t-small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  If the contract falls short: {p.shortfall_consequence}. This was stated at signature.
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
