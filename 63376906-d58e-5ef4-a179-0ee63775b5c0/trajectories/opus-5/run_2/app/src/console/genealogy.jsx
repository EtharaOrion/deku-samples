import { useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useResource, ReadAt } from './shared.jsx';
import { Link, useMeta } from '../lib/router.jsx';
import { Loading, Empty, Word, Reveal, Mark, Refusal } from '../components/common.jsx';
import { grams, words } from '../lib/format.js';

/* A graph, not a tree. A batch that reaches the lot by several paths is drawn
   once, and its edges carry mass rather than a percentage. The same facts are
   given twice: as the graph and as the nested list. */
export function Genealogy({ reference }) {
  useMeta(`Ravel — genealogy of ${reference}`, 'The traversal over the consumption records.', { noindex: true });
  const gen = useResource(`/lots/${reference}/genealogy`);
  const [exported, setExported] = useState(null);
  const [error, setError] = useState(null);
  const g = gen.data;

  const doExport = async () => {
    setError(null);
    try {
      setExported(await api('/exports', { method: 'POST', body: { lots: [reference] } }));
    } catch (e) { setError(e); }
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Genealogy</p>
      <Reveal as="h1" class="t-h3 mono">{reference}</Reveal>

      {gen.loading && <Loading what="the genealogy" />}
      {gen.error && <p class="note">This genealogy could not be read.</p>}

      {g && (
        <>
          {/* A flag anywhere in the graph is visible from the lot without
              expanding anything. */}
          {g.flagged && (
            <div class="banner" role="status">
              <p class="label" style="margin:0 0 .35rem">Flagged upstream</p>
              <p style="margin:0">
                Something in this lot's genealogy carries a flag. Every flag is named on the node
                that carries it below.
              </p>
            </div>
          )}

          <p class="note" style="max-width:44rem">
            This is a traversal over the consumption records rather than a stored summary. A batch
            reached by several paths appears once with the total mass it contributed. Edges carry
            mass, not percentages, because percentages of percentages across four hops compound
            into a figure nobody can reconcile.
          </p>

          {/* The graph. At the narrowest width the graph becomes the nested
              list rather than shrinking, which is why both are always present
              and the graph is hidden below the breakpoint. */}
          <section class="graph-view">
            <h2 class="t-h4">As a graph</h2>
            <div class="scroll-x">
              <GraphDiagram graph={g} />
            </div>
          </section>

          <section>
            <h2 class="t-h4">As a nested list</h2>
            <p class="note">
              The same nodes, the same masses, the same category splits and the same flags.
              This is not a summary; it is the same information in another form.
            </p>
            <NestedList node={g.text_equivalent} />
          </section>

          <section>
            <h2 class="t-h4">Every node</h2>
            <div class="scroll-x">
              <table>
                <thead>
                  <tr><th>Kind</th><th>Reference</th><th class="num">Mass</th>
                    <th>Category split</th><th>Flags</th></tr>
                </thead>
                <tbody>
                  {g.nodes.map((n) => (
                    <tr key={n.reference}>
                      <td>{words(n.kind)}</td>
                      <td class="mono">{n.reference}</td>
                      <td class="num mono">{grams(n.mass_g)}</td>
                      <td class="mono">
                        {Object.entries(n.category_split || {}).length === 0
                          ? '—'
                          : Object.entries(n.category_split).map(([k, v]) => (
                            <div key={k}>{words(k)} {grams(v)}</div>
                          ))}
                      </td>
                      <td>
                        {(n.flags || []).length === 0
                          ? <span class="note">none</span>
                          : n.flags.map((f) => (
                            <span key={f} style="margin-right:.35rem">
                              <Word><Mark kind={f.includes('calibration') ? 'warning' : 'flag'} label={words(f)} /></Word>
                            </span>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="no-print">
            <h2 class="t-h4">Export</h2>
            <p class="note">Every export is itself an entry in the record.</p>
            <Refusal error={error} />
            <button onClick={doExport}>
              <Mark kind="arrow" label="Export this traversal" />
            </button>
            {exported && (
              <div class="banner" role="status" style="margin-top:1rem">
                <p class="label" style="margin:0 0 .35rem">Export recorded</p>
                <p style="margin:0">
                  Reference <span class="mono">{exported.reference}</span>, carrying{' '}
                  {exported.entries.length} record entries anchored at digest{' '}
                  <span class="mono" style="word-break:break-all">{exported.anchor.last_digest?.slice(0, 32)}…</span>
                </p>
              </div>
            )}
          </section>

          <ReadAt at={g.read_at} />
        </>
      )}
    </div>
  );
}

// A drawn graph: nodes in columns by depth, edges labelled with mass.
function GraphDiagram({ graph }) {
  const { nodes, edges } = graph;
  const byRef = new Map(nodes.map((n) => [n.reference, n]));
  const depth = new Map();
  const incoming = new Map();
  for (const e of edges) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  const compute = (ref, seen = new Set()) => {
    if (depth.has(ref)) return depth.get(ref);
    if (seen.has(ref)) return 0;
    seen.add(ref);
    const ins = incoming.get(ref) || [];
    const d = ins.length === 0 ? 0 : Math.max(...ins.map((e) => compute(e.from, seen) + 1));
    depth.set(ref, d);
    return d;
  };
  for (const n of nodes) compute(n.reference);
  const maxDepth = Math.max(0, ...[...depth.values()]);
  const columns = [];
  for (let d = 0; d <= maxDepth; d++) {
    columns.push(nodes.filter((n) => depth.get(n.reference) === d));
  }

  return (
    <div style="display:flex;gap:1.5rem;align-items:flex-start;min-width:min-content;padding-bottom:.5rem">
      {columns.map((col, i) => (
        <div key={i} style="min-width:14rem">
          <p class="label" style="margin:0 0 .5rem">
            {i === 0 ? 'Feedstock' : i === maxDepth ? 'Lot' : `Hop ${i}`}
          </p>
          {col.map((n) => {
            const ins = incoming.get(n.reference) || [];
            return (
              <div key={n.reference} class="card" style="margin-bottom:.75rem">
                <p class="mono" style="margin:0 0 .25rem"><strong>{n.reference}</strong></p>
                <p class="label" style="margin:0 0 .35rem">{words(n.kind)}</p>
                <p class="figure note" style="margin:0 0 .35rem">{grams(n.mass_g)}</p>
                {Object.entries(n.category_split || {}).map(([k, v]) => (
                  <p key={k} class="note figure" style="margin:0">{words(k)}: {grams(v)}</p>
                ))}
                {(n.flags || []).map((f) => (
                  <p key={f} style="margin:.35rem 0 0">
                    <Word><Mark kind={f.includes('calibration') ? 'warning' : 'flag'} label={words(f)} /></Word>
                  </p>
                ))}
                {ins.length > 0 && (
                  <p class="note" style="margin:.35rem 0 0">
                    {ins.map((e) => (
                      <span key={e.from} style="display:block" class="figure">
                        ← {e.from} {grams(e.mass_g)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function NestedList({ node, depth = 0 }) {
  if (!node) return <Empty>This lot has no recorded genealogy.</Empty>;
  // The indent stops growing after a few hops so four hops still fit a narrow
  // phone without the document scrolling sideways.
  const indent = depth === 0 ? 0 : Math.min(depth, 3) * 0.4 + 0.4;
  return (
    <ul class="nested-list" style={`list-style:none;padding-left:${indent}rem;margin:0`}>
      <li style="padding:.4rem 0 .4rem .6rem;border-left:1px solid var(--ink-hairline);min-width:0;overflow-wrap:anywhere">
        <span class="mono"><strong>{node.reference}</strong></span>{' '}
        <span class="label" style="text-transform:none">{words(node.kind)}</span>{' '}
        <span class="figure">{grams(node.mass_g)}</span>
        {node.repeated && <> <Word quiet>already shown above</Word></>}
        {Object.entries(node.category_split || {}).map(([k, v]) => (
          <span key={k} class="note figure" style="display:block">{words(k)}: {grams(v)}</span>
        ))}
        {(node.flags || []).map((f) => (
          <span key={f} style="display:block;margin-top:.2rem">
            <Word><Mark kind={f.includes('calibration') ? 'warning' : 'flag'} label={words(f)} /></Word>
          </span>
        ))}
        {node.inputs?.length > 0 && node.inputs.map((child, i) => (
          <div key={i}>
            <span class="note figure" style="display:block;margin-top:.35rem">
              contributed {grams(child.edge_mass_g)}
            </span>
            <NestedList node={child.node} depth={depth + 1} />
          </div>
        ))}
      </li>
    </ul>
  );
}

/* The same component runs backwards from a batch. */
export function Impact({ reference }) {
  useMeta(`Ravel — impact of ${reference}`, 'Every lot, certificate and recipient this batch reaches.', { noindex: true });
  const impact = useResource(`/batches/${reference}/impact`);
  const d = impact.data;
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Reverse traversal</p>
      <Reveal as="h1" class="t-h3 mono">{reference}</Reveal>
      <p class="note" style="max-width:44rem">
        <Mark kind="arrow" label="Running forwards from this batch" />: every lot containing any of
        it, every certificate resting on those lots, and every recipient. This is a complete set
        and is never paginated.
      </p>
      {impact.loading && <Loading what="the reverse traversal" />}
      {d && (
        <>
          <section>
            <h2 class="t-h4">Lots</h2>
            {d.lots.length === 0 && <Empty>This batch has reached no lot.</Empty>}
            {d.lots.length > 0 && (
              <div class="scroll-x">
                <table>
                  <thead><tr><th>Lot</th><th>Site</th><th class="num">Mass</th><th>Disposition</th><th>Claim type</th></tr></thead>
                  <tbody>
                    {d.lots.map((l) => (
                      <tr key={l.reference}>
                        <td class="mono"><Link href={`/console/lots/${l.reference}/genealogy`}>{l.reference}</Link></td>
                        <td class="mono">{l.site}</td>
                        <td class="num mono">{grams(l.mass_g)}</td>
                        <td><Word quiet>{words(l.disposition)}</Word></td>
                        <td><Word>{words(l.claim_type)}</Word></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h2 class="t-h4">Certificates</h2>
            {d.certificates.length === 0 && <Empty>No certificate rests on these lots.</Empty>}
            {d.certificates.length > 0 && (
              <div class="scroll-x">
                <table>
                  <thead><tr><th>Number</th><th>State</th><th>Recipient</th></tr></thead>
                  <tbody>
                    {d.certificates.map((x) => (
                      <tr key={x.number}>
                        <td class="mono"><Link href={`/console/certificates/${x.number}`}>{x.number}</Link></td>
                        <td><Word>{words(x.state)}</Word></td>
                        <td>{x.recipient_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h2 class="t-h4">Recipients</h2>
            {d.recipients.length === 0 && <Empty>No recipient holds a certificate on this batch.</Empty>}
            <ul>{d.recipients.map((r) => <li key={r.reference}>{r.name} <span class="mono note">{r.reference}</span></li>)}</ul>
          </section>
          <ReadAt at={d.read_at} />
        </>
      )}
    </div>
  );
}
