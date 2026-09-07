import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words, Refusal } from '../ui.jsx';

const KIND_ORDER = { batch: 0, run: 1, intermediate: 2, byproduct: 2, lot: 3, certificate: 4 };

function Graph({ nodes, edges }) {
  // Laid out in columns by kind, so a batch reached by several paths is drawn
  // once and its edges carry mass rather than a percentage.
  const cols = [[], [], [], [], []];
  for (const n of nodes) cols[KIND_ORDER[n.kind] ?? 2].push(n);
  const colW = 240;
  const rowH = 96;
  const pad = 20;
  const width = cols.filter((c) => c.length).length * colW + pad * 2;
  const height = Math.max(...cols.map((c) => c.length), 1) * rowH + pad * 2;

  const pos = new Map();
  let ci = 0;
  cols.forEach((col) => {
    if (!col.length) return;
    col.forEach((n, ri) => {
      pos.set(n.reference, {
        x: pad + ci * colW + 10,
        y: pad + ri * rowH + (Math.max(...cols.map((c) => c.length)) - col.length) * rowH / 2,
      });
    });
    ci++;
  });

  return (
    <div class="table-scroll" style="padding:0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Genealogy graph: ${nodes.length} nodes and ${edges.length} edges. The same facts are given as a nested list beneath.`}
        style="min-width:100%;display:block;background:var(--paper)"
      >
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + 190, y1 = a.y + 26, x2 = b.x, y2 = b.y + 26;
          const mx = (x1 + x2) / 2;
          return (
            <g key={i}>
              <path
                d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
                fill="none" stroke="var(--muted)" stroke-width="1.25"
              />
              <text x={mx} y={(y1 + y2) / 2 - 4} font-size="11" fill="var(--muted)"
                text-anchor="middle" font-family="var(--mono)">
                {Number(e.mass_g).toLocaleString('en-GB')} g
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.reference);
          if (!p) return null;
          const flagged = (n.flags || []).length > 0;
          return (
            <g key={n.reference}>
              <rect
                x={p.x} y={p.y} width="190" height="52" rx="5"
                fill="var(--ground)" stroke="var(--ink)" stroke-width={flagged ? 2 : 1}
              />
              <text x={p.x + 10} y={p.y + 19} font-size="12" font-family="var(--mono)" fill="var(--ink)">
                {n.reference.length > 20 ? n.reference.slice(0, 19) + '…' : n.reference}
              </text>
              <text x={p.x + 10} y={p.y + 35} font-size="11" fill="var(--muted)" font-family="var(--grotesk)">
                {words(n.kind)} · {Number(n.mass_g).toLocaleString('en-GB')} g
              </text>
              {flagged ? (
                <text x={p.x + 10} y={p.y + 48} font-size="10" fill="var(--ink)" font-family="var(--grotesk)">
                  ⚑ {n.flags.join(', ').slice(0, 30)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TreeNode({ node }) {
  return (
    <li>
      <p style="margin:0">
        <span class="mono"><strong>{node.reference}</strong></span>{' '}
        <span class="t-label" style="text-transform:none">
          {words(node.kind)} · {grams(node.mass_g)}
          {node.edge_mass_g !== undefined ? <> · contributing {grams(node.edge_mass_g)}</> : null}
        </span>
      </p>
      {node.category_split && Object.keys(node.category_split).length ? (
        <p class="t-small mono" style="margin:0.15rem 0 0;color:var(--muted)">
          {Object.entries(node.category_split)
            .map(([k, v]) => `${words(k)}: ${Number(v).toLocaleString('en-GB')} g`)
            .join(' · ')}
        </p>
      ) : null}
      {(node.flags || []).length ? (
        <p class="row" style="gap:0.35rem;margin:0.35rem 0 0">
          {node.flags.map((f) => (
            <StateWord key={f} word={f} icon={<Icon name="flag" label="Flag" />} />
          ))}
        </p>
      ) : null}
      {node.repeat_of_node ? (
        <p class="t-small" style="margin:0.25rem 0 0;color:var(--muted)">
          Already listed above. This node is reached by more than one path and appears once with
          its total mass.
        </p>
      ) : null}
      {(node.children || []).length ? (
        <ul>{node.children.map((c) => <TreeNode key={c.reference + String(c.edge_mass_g)} node={c} />)}</ul>
      ) : null}
    </li>
  );
}

export default function Genealogy({ session, params }) {
  const reference = params.reference;
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const g = useAsync(() => api(`/lots/${reference}/genealogy`), [reference]);

  async function doExport() {
    setBusy(true); setError(null);
    try {
      // Every export is itself an entry.
      const r = await api('/exports', { body: { lots: [reference], what: 'genealogy' } });
      setExported(r);
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${r.reference}-${reference}-genealogy.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Genealogy</p>
        <h1 class="t-h3 mono">{reference}</h1>
        <p class="t-big">
          A graph, not a tree. A batch that reaches this lot by several paths is drawn once, with
          its total contributed mass, and every edge carries a mass rather than a percentage.
        </p>
        <p class="row">
          <a class="btn btn-quiet" href={`/console/lots/${reference}`}>The lot</a>
          <button class="btn" type="button" onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export this genealogy'} <span class="btn-arrow" aria-hidden="true">→</span>
          </button>
        </p>
      </div>

      <Refusal error={error} />

      {exported ? (
        <div class="banner" role="status">
          <p class="t-eyebrow">Exported</p>
          <p style="margin-bottom:0">
            Export <span class="mono">{exported.reference}</span> carries{' '}
            <span class="mono">{exported.entry_count}</span> record entries with their digests and
            anchors. The export is itself an entry in the record, and its scope was recorded before
            the read.
          </p>
        </div>
      ) : null}

      {g.loading ? <Loading what="the genealogy" /> : null}
      {g.error ? <Empty>This genealogy could not be read.</Empty> : null}

      {g.data ? (
        <>
          {/* A flag anywhere in the graph is visible from the lot without
              expanding anything. */}
          {g.data.flagged ? (
            <div class="banner" role="alert">
              <p class="t-eyebrow">Flagged</p>
              <p style="margin-bottom:0">
                <strong>Something in this genealogy is flagged:</strong>{' '}
                {g.data.flag_words.join('; ')}. A flag on a batch is repeated on every run that
                consumed it and on every lot downstream.
              </p>
            </div>
          ) : (
            <p class="t-small" style="color:var(--muted)">Nothing in this genealogy is flagged.</p>
          )}

          <section aria-labelledby="graph" style="margin-top:2rem">
            <h2 id="graph" class="t-h4">As a graph</h2>
            <div class="graph-wrap">
              <Graph nodes={g.data.nodes} edges={g.data.edges} />
            </div>
            <p class="t-small tree-wrap" style="color:var(--muted)">
              At this width the graph is given as the nested list below rather than shrunk. The
              list is not a summary; it is the same information in another form.
            </p>
          </section>

          <section aria-labelledby="tree" style="margin-top:2.5rem">
            <h2 id="tree" class="t-h4">As a nested list</h2>
            <p class="t-small" style="color:var(--muted)">
              The same nodes, the same masses, the same category splits and the same flags.
            </p>
            <ul class="tree">
              <TreeNode node={g.data.text_equivalent} />
            </ul>
          </section>

          <section aria-labelledby="nodes" style="margin-top:2.5rem">
            <h2 id="nodes" class="t-h4">Every node</h2>
            <div class="table-scroll">
              <table>
                <caption>
                  {g.data.nodes.length} nodes and {g.data.edges.length} edges, traversed over the
                  consumption records. No stored summary.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Kind</th>
                    <th scope="col" class="num">Mass</th>
                    <th scope="col">Category split</th>
                    <th scope="col">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {g.data.nodes.map((n) => (
                    <tr key={n.reference}>
                      <th scope="row" class="mono">{n.reference}</th>
                      <td>{words(n.kind)}</td>
                      <td class="num">{Number(n.mass_g).toLocaleString('en-GB')}</td>
                      <td class="mono t-small">
                        {Object.entries(n.category_split || {})
                          .map(([k, v]) => `${words(k)} ${Number(v).toLocaleString('en-GB')} g`)
                          .join('; ') || '—'}
                      </td>
                      <td>
                        {(n.flags || []).length
                          ? n.flags.map((f) => <StateWord key={f} word={f} icon={<Icon name="flag" label="Flag" />} />)
                          : <span class="t-small" style="color:var(--muted)">none</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
