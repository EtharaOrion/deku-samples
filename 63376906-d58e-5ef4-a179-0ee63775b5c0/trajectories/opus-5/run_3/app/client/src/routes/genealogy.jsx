import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link, useMetadata } from '../router.jsx';
import { useFetch, flagWords } from './console.jsx';
import {
  StateWord, Refusal, Loading, Empty, Mark, formatG
} from '../components/primitives.jsx';

/** A graph, not a tree. A batch that reaches the lot by several paths is drawn
 *  once, and its edges carry mass rather than a percentage, because percentages
 *  of percentages across four hops compound into a figure nobody can reconcile.
 *
 *  The same facts render twice: as the graph, and as the nested list. The list
 *  is not a summary; it is the same information in another form, and it is what
 *  an auditor exports. At the narrowest width the graph becomes the list rather
 *  than shrinking. */
export function Genealogy({ reference }) {
  useMetadata({
    title: `Genealogy of ${reference}`,
    description: 'The traversal over the consumption records that reaches this lot, as a graph and as a nested list.'
  });
  const gen = useFetch(`/lots/${reference}/genealogy`, [reference]);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(null);
  const [refusal, setRefusal] = useState(null);

  async function runExport() {
    setExporting(true); setRefusal(null);
    try {
      const r = await api('/exports', {
        method: 'POST',
        body: { sites: [], grades: [], certificates: [], period: null, note: `genealogy of ${reference}` }
      });
      setExported(r);
      // Every export is itself an entry, so the download is a side effect of a
      // recorded act rather than a quiet read.
      const blob = new Blob([JSON.stringify({ genealogy: gen.data, export: r }, null, 2)],
        { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reference}-genealogy-${r.reference}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setRefusal(e.body);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">Genealogy</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
        <p class="t-small t-muted">
          A traversal over the consumption records, not a stored summary. A batch reached by
          several paths appears once, with the total mass it contributed. The edges carry mass
          rather than a percentage.
        </p>
      </header>

      {gen.loading && <Loading what="the genealogy" />}
      {gen.error && <Refusal refusal={gen.error} />}

      {gen.data && (
        <>
          {/* A flag anywhere in the graph is visible from the lot without
              expanding anything. */}
          {gen.data.flagged && (
            <div class="graph-flag-summary">
              <Mark kind="flag" label="Flagged in this graph" />
              <ul class="flag-list">
                {[...new Set(gen.data.nodes.flatMap((n) => n.flags))].map((f) => (
                  <li key={f}><StateWord word={flagWords(f)} /></li>
                ))}
              </ul>
            </div>
          )}

          <section class="sheet graph-section">
            <h2 class="t-h4">As a graph</h2>
            <GraphView data={gen.data} />
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">As a nested list</h2>
            <p class="t-small t-muted">
              The same nodes, the same masses, the same category splits and the same flags.
            </p>
            <NestedList node={gen.data.text_equivalent} />
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Export</h2>
            <p class="t-small t-muted">
              An export records its scope before the read and is itself an entry, whether or not
              it returns anything.
            </p>
            <button type="button" class="button-primary" onClick={runExport} disabled={exporting}>
              {exporting ? 'Recording the scope and reading' : 'Export this traversal'}
              <span class="arrow" aria-hidden="true">→</span>
            </button>
            {exported && (
              <div class="result-success" role="status">
                <p class="t-label">Exported</p>
                <p>
                  Export <span class="t-mono">{exported.reference}</span> carries{' '}
                  {exported.entries.length} record entries with their digests, and the chain
                  head digest <span class="t-mono">{exported.chain_head_digest?.slice(0, 16)}…</span>,
                  so its integrity can be established after it has left this system.
                </p>
              </div>
            )}
            <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />
          </section>
        </>
      )}
    </div>
  );
}

/** The graph is laid out by hop, drawn with real elements rather than a canvas,
 *  so every node is reachable by keyboard and readable by ear. At the narrowest
 *  width the whole section reflows to the nested list below it. */
function GraphView({ data }) {
  const order = { batch: 0, run: 1, output: 2, lot: 3 };
  const byKind = { batch: [], run: [], output: [], lot: [] };
  for (const n of data.nodes) (byKind[n.kind] || byKind.output).push(n);

  const columns = [
    { key: 'batch', title: 'Batches', nodes: byKind.batch },
    { key: 'run', title: 'Runs', nodes: byKind.run },
    { key: 'output', title: 'Outputs', nodes: byKind.output },
    { key: 'lot', title: 'Lot', nodes: byKind.lot }
  ];

  return (
    <div class="graph">
      {columns.map((col) => (
        <div key={col.key} class="graph-column">
          <h3 class="t-label graph-column-head">{col.title}</h3>
          {col.nodes.length === 0 ? (
            <p class="t-small t-muted">None at this hop.</p>
          ) : col.nodes.map((n) => (
            <article key={n.reference} class="graph-node" tabIndex={0}
              aria-label={`${n.kind} ${n.reference}, ${formatG(n.mass_g)} grams${n.flags.length ? `, flagged: ${n.flags.map(flagWords).join(', ')}` : ''}`}>
              <p class="t-label graph-node-kind">{n.kind}</p>
              <p class="t-mono graph-node-ref">{n.reference}</p>
              <p class="t-mono graph-node-mass">{formatG(n.mass_g)} g</p>
              {n.category_split && (
                <ul class="graph-split">
                  {Object.entries(n.category_split)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <li key={k} class="t-small">
                        {k.replace(/_/g, '-')} <span class="t-mono">{formatG(v)} g</span>
                      </li>
                    ))}
                </ul>
              )}
              {n.run_type && <p class="t-small t-muted">{n.run_type}</p>}
              {n.losses_g !== null && n.losses_g !== undefined && (
                <p class="t-small t-muted">losses <span class="t-mono">{formatG(n.losses_g)} g</span></p>
              )}
              {n.flags.map((f) => <StateWord key={f} word={flagWords(f)} />)}
            </article>
          ))}
        </div>
      ))}

      <div class="graph-edges">
        <h3 class="t-label">Edges, each carrying mass</h3>
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">Every edge in the graph, with the mass it carries</caption>
            <thead>
              <tr><th scope="col">From</th><th scope="col">To</th><th scope="col" class="num">Mass</th></tr>
            </thead>
            <tbody>
              {data.edges.map((e, i) => (
                <tr key={i}>
                  <td class="t-mono">{e.from}</td>
                  <td class="t-mono">{e.to}</td>
                  <td class="num">{formatG(e.mass_g)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NestedList({ node, depth = 0 }) {
  if (!node) return <Empty>This lot has no traversal behind it.</Empty>;
  return (
    <ul class="nested-list" style={depth === 0 ? '' : 'margin-left: var(--space-5)'}>
      <li>
        <span class="t-label">{node.kind}</span>{' '}
        <span class="t-mono">{node.reference}</span>{' '}
        {node.mass_g !== null && node.mass_g !== undefined && (
          <span class="t-mono t-muted">{formatG(node.mass_g)} g</span>
        )}
        {node.edge_mass_g !== undefined && (
          <span class="t-small t-muted"> (contributed {formatG(node.edge_mass_g)} g)</span>
        )}
        {node.category_split && (
          <span class="t-small t-muted">
            {' '}[{Object.entries(node.category_split).filter(([, v]) => v > 0)
              .map(([k, v]) => `${k.replace(/_/g, '-')} ${formatG(v)} g`).join(', ') || 'no split'}]
          </span>
        )}
        {(node.flags || []).map((f) => <StateWord key={f} word={flagWords(f)} />)}
        {node.children?.length > 0 && node.children.map((child, i) => (
          <NestedList key={`${child.reference}-${i}`} node={child} depth={depth + 1} />
        ))}
      </li>
    </ul>
  );
}
