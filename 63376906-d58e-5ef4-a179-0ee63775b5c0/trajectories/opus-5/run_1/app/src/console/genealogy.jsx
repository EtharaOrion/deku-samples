import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useFetch } from './console.jsx';
import { State, Empty, Loading, Refusal, Mark, formatInt } from '../components/ui.jsx';

// The nested list is not a summary; it is the same information in another form.
function TreeNode({ node }) {
  return (
    <li>
      <div class={`node ${node.flags && node.flags.length ? 'node--flagged' : ''}`}>
        <p class="label" style="margin-bottom:0.2rem">{node.kind}</p>
        <p class="mono">{node.reference}</p>
        <p class="mono note">{formatInt(node.mass_g)} g</p>
        {node.edge_mass_g !== undefined ? (
          <p class="mono note">{formatInt(node.edge_mass_g)} g along this edge</p>
        ) : null}
        <p class="note">
          {Object.keys(node.category_split || {}).length
            ? Object.entries(node.category_split)
                .map(([k, v]) => `${k.replace(/_/g, '-')}: ${formatInt(v)} g`).join(' · ')
            : 'no category split'}
        </p>
        {node.repeated_path ? (
          <p class="note">Reached again by another path; counted once above.</p>
        ) : null}
        {(node.flags || []).map((f) => (
          <p key={f} style="margin-top:0.3rem">
            <State word={f.replace(/_/g, ' ')} strong>
              <Mark kind="warning" label="" />
            </State>
          </p>
        ))}
      </div>
      {node.children && node.children.length ? (
        <ul>
          {node.children.map((c, i) => <TreeNode node={c} key={c.reference + i} />)}
        </ul>
      ) : null}
    </li>
  );
}

// The graph, drawn in columns by depth. A batch reached by several paths is
// drawn once, and its edges carry mass rather than a percentage.
function Graph({ nodes, edges, lot }) {
  const depthOf = new Map();
  const assign = (ref, depth, seen) => {
    const current = depthOf.get(ref);
    if (current === undefined || depth > current) depthOf.set(ref, depth);
    if (seen.has(ref)) return;
    const next = new Set(seen); next.add(ref);
    for (const e of edges.filter((x) => x.to === ref)) assign(e.from, depth + 1, next);
  };
  assign(lot, 0, new Set());
  const maxDepth = Math.max(0, ...depthOf.values());
  const columns = [];
  for (let d = maxDepth; d >= 0; d--) {
    columns.push(nodes.filter((n) => depthOf.get(n.reference) === d));
  }
  return (
    <div class="scroller" style="margin-top:1rem">
      <div style={`display:grid;grid-template-columns:repeat(${columns.length},minmax(13rem,1fr));gap:1rem;min-width:${columns.length * 14}rem`}>
        {columns.map((col, i) => (
          <div class="stack-s" key={i}>
            <p class="label">
              {i === columns.length - 1 ? 'lot' : i === 0 ? 'batches' : `hop ${i}`}
            </p>
            {col.map((n) => {
              const out = edges.filter((e) => e.from === n.reference);
              return (
                <div class={`node ${n.flags && n.flags.length ? 'node--flagged' : ''}`} key={n.reference}>
                  <p class="label" style="margin-bottom:0.2rem">{n.kind}</p>
                  <p class="mono">{n.reference}</p>
                  <p class="mono note">{formatInt(n.mass_g)} g</p>
                  <p class="note">
                    {Object.entries(n.category_split || {})
                      .map(([k, v]) => `${k.replace(/_/g, '-')}: ${formatInt(v)} g`).join(' · ') || '—'}
                  </p>
                  {out.map((e) => (
                    <p class="mono note" key={e.to}>
                      <Mark kind="arrow" label={`${formatInt(e.mass_g)} g to ${e.to}`} />
                    </p>
                  ))}
                  {(n.flags || []).map((f) => (
                    <p key={f} style="margin-top:0.3rem">
                      <State word={f.replace(/_/g, ' ')} strong>
                        <Mark kind="warning" label="" />
                      </State>
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Genealogy({ reference }) {
  const g = useFetch(`/lots/${reference}/genealogy`, [reference]);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api('/exports', { method: 'POST', body: { lots: [reference] } });
      setExported(r);
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${r.reference}-${reference}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const d = g.data;
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Genealogy</p>
        <h1 class="mono" style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {reference}
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          A graph, not a tree. A batch that reaches the lot by several paths is drawn once, and its
          edges carry mass rather than a percentage.
        </p>
      </section>

      {g.loading ? <Loading what="this genealogy" /> : null}
      {g.error ? <Empty>No lot at this address.</Empty> : null}

      {d ? (
        <>
          <section class="section">
            <p style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
              {d.flagged ? (
                <>
                  <State word="flagged" strong><Mark kind="flag" label="" /></State>
                  {d.flags.map((f) => (
                    <State word={f.replace(/_/g, ' ')} strong key={f} />
                  ))}
                </>
              ) : (
                <State word="no flag anywhere in this graph" />
              )}
            </p>
            <p class="note" style="margin-top:0.5rem">
              Read at <span class="mono">{d.read_at}</span>.
            </p>
            <p style="margin-top:1rem">
              <button class="button" onClick={doExport} disabled={busy}>
                {busy ? 'Exporting…' : 'Export this genealogy'}{' '}
                <span class="arrow" aria-hidden="true">→</span>
              </button>
            </p>
            {exported ? (
              <div class="banner" role="status" style="margin-top:1rem">
                <p class="banner__title">The export is itself an entry.</p>
                <p style="margin-top:0.4rem">
                  Export <span class="mono">{exported.reference}</span> carries{' '}
                  {exported.anchor_references.length} entries with their digests, read at{' '}
                  <span class="mono">{exported.read_at}</span>. The scope was recorded before
                  the read.
                </p>
              </div>
            ) : null}
            {error ? (
              <div style="margin-top:1rem">
                <Refusal title="The export was refused.">
                  <p>{error.message}</p>
                </Refusal>
              </div>
            ) : null}
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">As a graph</h2>
            <div class="wide-only">
              <Graph nodes={d.nodes} edges={d.edges} lot={d.lot} />
            </div>
            <p class="narrow-only note" style="margin-top:0.75rem">
              At this width the graph is the nested list below, which carries the same nodes, the
              same masses, the same category splits and the same flags.
            </p>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">As a nested list</h2>
            <p class="note" style="margin-top:0.5rem">
              The same facts, in another form. This is what an auditor exports.
            </p>
            <ul class="tree" style="margin-top:1rem">
              <TreeNode node={d.text_equivalent} />
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
