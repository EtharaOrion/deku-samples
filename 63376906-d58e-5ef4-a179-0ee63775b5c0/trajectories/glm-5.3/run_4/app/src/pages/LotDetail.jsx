import { useEffect, useState } from 'preact/hooks';
import { Link } from 'preact-router';
import { Loading, Banner, Empty } from '../components/Chrome.jsx';
import { api } from '../api.js';

function NodeRow({ node, depth }) {
  return (
    <li class={'tree-node depth-' + Math.min(depth, 4)}>
      <p class="mono">
        {node.kind} {node.reference} · {node.mass_g} g
        {node.category_split && Object.keys(node.category_split).length > 0
          ? ' · ' + Object.entries(node.category_split).map(([k, v]) => k + ' ' + v + ' g').join(', ')
          : ''}
      </p>
      {(node.flags || []).map((f) => <p class="state-word">{f}</p>)}
      {node.children && node.children.length > 0 && (
        <ul class="tree">{node.children.map((c) => <NodeRow node={c} depth={depth + 1} />)}</ul>
      )}
    </li>
  );
}

export default function LotDetail({ user, lot, view }) {
  const [gene, setGene] = useState(null);
  const [carbon, setCarbon] = useState(null);
  const [error, setError] = useState(null);
  const isGraph = view !== 'list';

  useEffect(() => {
    setGene(null);
    api('/api/lots/' + lot + '/genealogy').then((r) => {
      if (r.ok) setGene(r.data); else setError(r.data);
    });
  }, [lot]);

  useEffect(() => {
    setCarbon(null);
    api('/api/lots/' + lot + '/carbon').then((r) => setCarbon(r.ok ? r.data : null));
  }, [lot]);

  return (
    <div>
      <h1 class="reveal">Lot {lot}</h1>
      <nav class="tabs" aria-label="Genealogy view">
        <Link class={'tab' + (isGraph ? ' tab-active' : '')} href={'/console/lots/' + lot + '/genealogy'}>Graph</Link>
        <Link class={'tab' + (!isGraph ? ' tab-active' : '')} href={'/console/lots/' + lot + '/list'}>Nested list</Link>
      </nav>

      {!gene && !error && <Loading>Loading genealogy…</Loading>}
      {error && <Banner kind="refused">The genealogy could not be read ({error.error}).</Banner>}

      {gene && (
        <>
          <section>
            <h2>{isGraph ? 'Graph' : 'Nested list'}</h2>
            <p>A graph, not a tree: a batch that reaches the lot by several paths is drawn once, with its total mass.</p>
            {gene.flagged && <p class="state-word">Something in this graph is flagged. See the flagged nodes below.</p>}
            {isGraph ? (
              <div class="graph">
                {gene.nodes.map((n) => (
                  <article class={'graph-node' + ((n.flags || []).length ? ' graph-node-flagged' : '')}>
                    <p class="graph-node-kind">{n.kind}</p>
                    <h3 class="mono">{n.reference}</h3>
                    <p class="mono">{n.mass_g} g</p>
                    {n.category_split && Object.keys(n.category_split).length > 0 && (
                      <p>{Object.entries(n.category_split).map(([k, v]) => k + ': ' + v + ' g').join(' · ')}</p>
                    )}
                    {(n.flags || []).map((f) => <p class="state-word">{f}</p>)}
                  </article>
                ))}
              </div>
            ) : (
              <ul class="tree">
                {(gene.text_equivalent || []).map((n) => <NodeRow node={n} depth={0} />)}
              </ul>
            )}
          </section>

          <section>
            <h2>Edges</h2>
            <p>Edges carry mass, never a percentage, because percentages of percentages across four hops compound into a figure nobody can reconcile.</p>
            <div class="table-wrap">
              <table class="spec">
                <caption>Every edge, with its mass in grams</caption>
                <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col">Mass</th></tr></thead>
                <tbody>
                  {gene.edges.map((e) => (
                    <tr><td class="mono">{e.from}</td><td class="mono">{e.to}</td><td class="mono">{e.mass_g} g</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {carbon && (
        <section class="card">
          <h2>Carbon figure</h2>
          <p><span class="figure-value mono">{carbon.value_mg_per_kg} mg CO2e per kg</span></p>
          <p>Boundary: {carbon.boundary} · Method version: <span class="mono">{carbon.method_version}</span> · Uncertainty: <span class="mono">{carbon.uncertainty_bp} bp</span></p>
          <p>Comparator: {carbon.comparator.material} from dataset {carbon.comparator.dataset} ({carbon.comparator.dataset_year}), region {carbon.comparator.region}.</p>
          <p>Primary share <span class="mono">{carbon.primary_share_bp} bp</span> · {carbon.default_led ? 'default-led' : 'not default-led'}</p>
          {carbon.energy_location_mg_per_kg !== null && (
            <p>Energy: location-based <span class="mono">{carbon.energy_location_mg_per_kg}</span> and market-based <span class="mono">{carbon.energy_market_mg_per_kg}</span> mg CO2e per kg, together.</p>
          )}
          {carbon.comparator && carbon.value_mg_per_kg < 4260000 && (
            <p class="stat-meta">This figure is lower than {carbon.comparator.material} from {carbon.comparator.dataset}.</p>
          )}
        </section>
      )}
    </div>
  );
}
