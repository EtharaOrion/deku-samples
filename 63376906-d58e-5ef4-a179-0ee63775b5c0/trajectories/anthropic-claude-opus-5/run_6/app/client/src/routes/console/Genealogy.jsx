import { useState } from 'preact/hooks';
import { api, getUser } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, useAsync, formatInt, Refusal, Icon,
} from '../../components/common.jsx';

const ORDER = ['batch', 'run', 'output', 'lot'];

export default function Genealogy({ reference }) {
  const [direction, setDirection] = useState('backwards');
  const gen = useAsync(() => api.get(`/lots/${reference}/genealogy`), [reference]);
  const user = getUser();
  const canExport = (user?.roles || []).includes('auditor');

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Genealogy</p>
      <h1 className="t-h3 mono">{reference}</h1>
      <p style={{ marginTop: '0.75rem' }}>
        A graph and not a tree. A batch that reaches this lot by several paths is drawn once, with the
        total mass it contributed, and every edge carries a mass rather than a percentage.
      </p>

      {gen.loading ? <Loading what="the genealogy" /> : null}
      {gen.error ? <Empty>The genealogy could not be read.</Empty> : null}

      {gen.data ? (
        <>
          {/* a flag anywhere in the graph is visible from the lot without expanding anything */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {gen.data.flagged ? (
              <StateWord icon="flag">Something in this genealogy is flagged</StateWord>
            ) : (
              <StateWord quiet>Nothing in this genealogy is flagged</StateWord>
            )}
            <StateWord quiet icon="arrow-back">
              {direction === 'backwards' ? 'Reading backwards, from the lot to the batches' : 'Reading forwards'}
            </StateWord>
          </div>

          {gen.data.flagged ? (
            <ul className="t-small" style={{ marginTop: '0.75rem', paddingLeft: '1.1rem' }}>
              {[...new Set(gen.data.nodes.flatMap((n) => n.flags))].map((f) => (
                <li key={f}>
                  {f === 'lapsed_calibration'
                    ? 'A weighing device calibration had lapsed on a batch upstream of this lot.'
                    : f === 'non_claimable'
                      ? 'Non-claimable material is present upstream of this lot.'
                      : f === 'custody_link_missing'
                        ? 'A custody link is missing on a batch upstream of this lot.'
                        : f}
                </li>
              ))}
            </ul>
          ) : null}

          {/* the graph earns a wide viewport; at the narrowest width it becomes the
              nested list below rather than shrinking */}
          <p className="graph-reflow-note t-small section" style={{ color: 'var(--muted)' }}>
            At this width the graph is rendered as the nested list below, which carries the same
            nodes, the same masses, the same category splits and the same flags.
          </p>
          <section className="section graph-section">
            <h2 className="t-h4">As a graph</h2>
            <div className="graph-scroll" style={{ marginTop: '1rem' }}>
              <div className="graph-columns">
                {ORDER.map((kind) => {
                  const nodes = gen.data.nodes.filter((n) => n.kind === kind);
                  if (!nodes.length) return null;
                  return (
                    <div className="graph-column" key={kind}>
                      <p className="label">{kind}</p>
                      {nodes.map((n) => (
                        <div className={`graph-node ${n.flags.length ? 'is-flagged' : ''}`} key={n.id}>
                          <div className="mono">{n.reference}</div>
                          <div className="figure t-small">{formatInt(n.mass_g)} g</div>
                          <CategorySplit split={n.category_split} />
                          {n.flags.map((f) => (
                            <div key={f} style={{ marginTop: '0.3rem' }}>
                              <StateWord icon="flag">{f.replace(/_/g, ' ')}</StateWord>
                            </div>
                          ))}
                          {n.kind === 'run' ? (
                            <div className="t-small" style={{ color: 'var(--muted)', marginTop: '0.3rem' }}>
                              {n.run_type}, losses {formatInt(n.losses_g)} g
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>
              {gen.data.edges.length} edges, each carrying a mass. The same facts are below as a nested
              list; the list is not a summary.
            </p>
          </section>

          {/* the same facts twice: as the graph and as a nested list */}
          <section className="section">
            <h2 className="t-h4">As a nested list</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              The same nodes, the same masses, the same category splits and the same flags.
            </p>
            <ul className="nested-list" style={{ marginTop: '1rem' }}>
              <NestedNode node={gen.data.text_equivalent} />
            </ul>
          </section>

          <section className="section">
            <h2 className="t-h4">Every edge</h2>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr><th scope="col">From</th><th scope="col">To</th><th scope="col" className="num">Mass</th></tr>
                </thead>
                <tbody>
                  {gen.data.edges.map((e, i) => (
                    <tr key={`${e.from}-${e.to}-${i}`}>
                      <td className="mono">{e.from}</td>
                      <td className="mono">{e.to}</td>
                      <td className="num">{formatInt(e.mass_g)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {canExport ? <Export reference={reference} /> : null}

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '2rem' }}>
            {gen.data.derivation}. Read at {gen.data.read_at}.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CategorySplit({ split }) {
  const entries = Object.entries(split || {}).filter(([, v]) => v);
  if (!entries.length) return null;
  return (
    <div className="t-small" style={{ color: 'var(--muted)', marginTop: '0.25rem' }}>
      {entries.map(([k, v]) => (
        <div key={k} className="mono" style={{ fontSize: 'var(--step-eyebrow-size)', lineHeight: 'var(--step-eyebrow-lh)' }}>
          {k.replace(/_/g, '-')}: {formatInt(v)} g
        </div>
      ))}
    </div>
  );
}

function NestedNode({ node }) {
  if (!node) return null;
  return (
    <li>
      <span className="label" style={{ display: 'inline' }}>{node.kind}</span>{' '}
      <span className="mono">{node.reference}</span>{' '}
      <span className="figure">{formatInt(node.mass_g)} g</span>
      {node.edge_mass_g !== undefined ? (
        <span className="t-small" style={{ color: 'var(--muted)' }}>
          {' '}(contributing {formatInt(node.edge_mass_g)} g)
        </span>
      ) : null}
      <CategorySplit split={node.category_split} />
      {node.flags.length ? (
        <div style={{ marginTop: '0.25rem' }}>
          {node.flags.map((f) => <StateWord icon="flag" key={f}>{f.replace(/_/g, ' ')}</StateWord>)}
        </div>
      ) : null}
      {node.children && node.children.length ? (
        <ul>
          {node.children.map((c, i) => <NestedNode node={c} key={`${c.kind}-${c.reference}-${i}`} />)}
        </ul>
      ) : null}
    </li>
  );
}

// Every export is itself an entry.
function Export({ reference }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function run() {
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await api.post('/exports', { sites: [], grades: [], certificates: [], note: `genealogy of ${reference}` });
      setDone(res);
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${res.reference}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2 className="t-h4">Export</h2>
      <p className="t-small" style={{ marginTop: '0.5rem' }}>
        The export is self-contained, carries its derivations and the digests of the entries in its
        scope, and is itself an entry in the record. An export that returns nothing is recorded too.
      </p>
      <Refusal error={error} title="The export was refused" />
      {done ? (
        <div className="banner banner-quiet" role="status">
          <div className="banner-title">Export recorded</div>
          <p className="t-small" style={{ marginBottom: 0 }}>
            <span className="mono">{done.reference}</span> covers {done.entry_count} entries
            {done.returned_nothing ? ', and returned nothing, which is recorded' : ''}. Anchored at
            sequence <span className="mono">{done.anchor.first_seq}</span> to{' '}
            <span className="mono">{done.anchor.last_seq}</span>.
          </p>
        </div>
      ) : null}
      <button type="button" className="button" onClick={run} disabled={busy} style={{ marginTop: '0.75rem' }}>
        {busy ? 'Exporting…' : 'Export this scope'}{' '}
        <span className="arrow" aria-hidden="true"><Icon name="arrow" /></span>
      </button>
    </section>
  );
}
