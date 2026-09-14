import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG } from '../format.js';

// The genealogy: a graph and a nested list, the same facts twice.
export function Genealogy({ reference, me }) {
  const [data, setData] = useState(undefined);
  const [view, setView] = useState('graph');
  const [exportBanner, setExportBanner] = useState(null);
  useEffect(() => {
    api(`/api/lots/${reference}/genealogy`).then((r) => setData(r.ok ? r.data : null));
  }, [reference]);
  if (data === undefined) return <Loading>Loading the traversal…</Loading>;
  if (data === null) return <Empty>There is no lot with that reference.</Empty>;

  const nodes = data.nodes || [];
  const batches = nodes.filter((n) => n.kind === 'batch');
  const flagged = data.flagged;

  async function doExport() {
    const { newIdempotencyKey } = await import('../api.js');
    const r = await api('/api/exports', {
      method: 'POST', key: newIdempotencyKey('export'),
      body: { sites: [], grades: [], certificates: [], period: null }
    });
    setExportBanner(r.ok
      ? { text: `Export ${r.data.reference} recorded. It carries ${r.data.entries.length} entry digests and is itself an entry.` }
      : { text: 'The export was refused: ' + (r.data?.message || 'not permitted for this account.'), refused: true });
  }

  return (
    <div>
      <h1>Genealogy of <Ref>{reference}</Ref></h1>
      <Banner>
        A traversal over the consumption records, not a stored summary. A batch reached by several paths
        appears once with its total mass. {flagged
          ? 'Something in this graph is flagged; the flag is visible without expanding anything.'
          : 'Nothing in this graph is flagged.'}
      </Banner>
      {exportBanner ? <Banner kind={exportBanner.refused ? 'refused' : 'note'}>{exportBanner.text}</Banner> : null}

      <div class="wizard-steps" role="tablist" aria-label="Genealogy view">
        <button class="btn secondary" type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')}>Graph</button>
        <button class="btn secondary" type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>Nested list</button>
      </div>

      {view === 'graph' ? (
        <div class="sheet">
          <h2>Graph</h2>
          <div class="graph">
            <div class="node" style="border-width:2px">
              <div class="ref"><Ref>{reference}</Ref> — lot</div>
              <div class="figure">{fmtG(nodes.find((n) => n.reference === reference)?.mass_g)}</div>
            </div>
            {nodes.filter((n) => n.reference !== reference).map((n) => (
              <div class="node" data-flagged={n.flags?.length ? 'true' : 'false'}>
                <div class="ref"><Ref>{n.reference}</Ref> — {n.kind === 'run' ? `${n.run_type} run` : n.kind}</div>
                <div class="figure">{fmtG(n.mass_g)}</div>
                <div class="small">
                  {Object.entries(n.category_split || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtG(v)}`).join(' · ') || '—'}
                </div>
                {(n.flags || []).length ? <div>{n.flags.map((f) => <WordState state={f} />)}</div> : null}
              </div>
            ))}
          </div>
          <h3>Edges</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th class="figure">Mass</th></tr></thead>
              <tbody>
                {(data.edges || []).map((e, i) => (
                  <tr key={i}><td><Ref>{e.from}</Ref></td><td><Ref>{e.to}</Ref></td><td class="figure">{fmtG(e.mass_g)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div class="sheet">
          <h2>Nested list</h2>
          <p class="small">The same nodes, the same masses, the same category splits and the same flags.</p>
          {(data.text_equivalent || []).length === 0 ? <Empty>Nothing reached this lot.</Empty> : (
            <ul class="tree">
              {(data.text_equivalent || []).map((root, i) => <TextBranch node={root} key={i} />)}
            </ul>
          )}
        </div>
      )}

      <div class="sheet">
        <h2>Batches</h2>
        {batches.length === 0 ? <Empty>No batch reaches this lot.</Empty> : (
          <ul>
            {batches.map((b) => (
              <li><Link href={`/console/batches/${b.reference}`}><Ref>{b.reference}</Ref></Link> — {fmtG(b.mass_g)} — {b.claimable ? 'claimable' : 'non-claimable'}</li>
            ))}
          </ul>
        )}
      </div>

      {me?.roles?.includes('auditor') ? (
        <p><button class="btn" type="button" onClick={doExport}>Export this traversal</button></p>
      ) : null}
      <p class="small">Read at {data.read_at}.</p>
    </div>
  );
}

function TextBranch({ node }) {
  return (
    <li>
      <div><Ref>{node.reference}</Ref> — {node.kind === 'run' ? 'run' : node.kind} — <span class="figure">{fmtG(node.mass_g)}</span>
        {Object.keys(node.category_split || {}).length ? (
          <span class="small"> ({Object.entries(node.category_split).map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtG(v)}`).join(' · ')})</span>
        ) : null}
        {(node.flags || []).length ? <span> {node.flags.map((f) => <WordState state={f} />)}</span> : null}
      </div>
      {(node.contributes_to || []).length ? (
        <ul class="tree">{node.contributes_to.map((c, i) => <TextBranch node={c} key={i} />)}</ul>
      ) : null}
    </li>
  );
}
