import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import { Loading, Empty, StateWord, useAsync, formatInt } from '../../components/common.jsx';

// Agreement and disagreement render at identical weight, because a reader is
// looking for the second and must not be trained by the design to expect the first.
export default function Replay({ number }) {
  const replay = useAsync(() => api.get(`/certificates/${number}/replay`), [number]);

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Replay</p>
      <h1 className="t-h3 mono">{number}</h1>
      <p style={{ marginTop: '0.75rem' }}>
        This recomputes the certificate's figures from the versioned inputs recorded against it, and
        reports what it said, what recomputation says now, and the input that differs.
      </p>

      {replay.loading ? <Loading what="the replay" /> : null}
      {replay.error ? <Empty>This certificate could not be replayed.</Empty> : null}

      {replay.data && replay.data.reproducible === false ? (
        <div className="banner" role="note" style={{ marginTop: '1.5rem' }}>
          <div className="banner-title">Not reproducible</div>
          <p className="t-small">{replay.data.reason}</p>
          <ul className="t-small" style={{ paddingLeft: '1.1rem' }}>
            {replay.data.missing_inputs.map((m) => (
              <li key={m.input}>{m.input.replace(/_/g, ' ')}: <span className="mono">{m.reference}</span></li>
            ))}
          </ul>
          <p className="t-small" style={{ marginBottom: 0 }}>{replay.data.note}</p>
        </div>
      ) : null}

      {replay.data && replay.data.reproducible ? (
        <>
          <div style={{ marginTop: '1.5rem' }}>
            <StateWord>
              {replay.data.agrees
                ? 'The recomputation agrees with the issued figures'
                : 'The recomputation differs from the issued figures'}
            </StateWord>
          </div>
          <p className="t-small" style={{ marginTop: '0.75rem' }}>{replay.data.note}</p>

          <section className="section">
            <h2 className="t-h4">What it said, and what recomputation says now</h2>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Figure</th>
                    <th scope="col">Issued</th>
                    <th scope="col">Recomputed</th>
                    <th scope="col">Same</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(replay.data.issued).map((k) => {
                    const issued = replay.data.issued[k];
                    const now = replay.data.recomputed[k];
                    const same = JSON.stringify(issued) === JSON.stringify(now);
                    return (
                      <tr key={k}>
                        <td>{k.replace(/_/g, ' ')}</td>
                        <td className="mono">{render(issued)}</td>
                        <td className="mono">{render(now)}</td>
                        <td>{same ? 'yes' : 'no'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {replay.data.differing_input ? (
            <section className="section">
              <h2 className="t-h4">The input that moved</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Field</dt><dd>{replay.data.differing_input.field.replace(/_/g, ' ')}</dd>
                <dt>Issued</dt><dd className="mono">{render(replay.data.differing_input.issued)}</dd>
                <dt>Recomputed</dt><dd className="mono">{render(replay.data.differing_input.recomputed)}</dd>
              </dl>
            </section>
          ) : null}

          <section className="section">
            <h2 className="t-h4">Input versions the recomputation ran against</h2>
            <dl className="dl" style={{ marginTop: '1rem' }}>
              {Object.entries(replay.data.input_versions).map(([k, v]) => (
                <>
                  <dt key={`${k}-t`}>{k.replace(/_/g, ' ')}</dt>
                  <dd key={`${k}-d`} className="mono">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                </>
              ))}
            </dl>
          </section>

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '2rem' }}>
            Read at {replay.data.read_at}.{' '}
            <Link href={`/console/certificates/${number}`}>Back to the certificate</Link>
          </p>
        </>
      ) : null}
    </div>
  );
}

function render(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    return Object.entries(v).map(([k, n]) => `${k}: ${formatInt(n)} g`).join(', ') || '—';
  }
  if (typeof v === 'number') return formatInt(v);
  return String(v);
}
