import { useEffect, useState } from 'preact/hooks';
import { Link } from 'preact-router';
import { Loading, Empty } from '../components/Chrome.jsx';
import { api } from '../api.js';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export default function Board({ user }) {
  const [runs, setRuns] = useState(null);

  useEffect(() => {
    api('/api/runs').then((r) => setRuns(r.ok ? r.data : []));
  }, []);

  return (
    <div>
      <h1 class="reveal">Process board</h1>
      <p class="lede">One column per stage, one card per run. The column a card sits in is named on the card.</p>
      {!runs && <Loading>Loading runs…</Loading>}
      {runs && runs.length === 0 && <Empty>No runs have been recorded.</Empty>}
      {runs && runs.length > 0 && (
        <div class="board">
          {STAGES.map((stage) => (
            <section class="board-col" aria-label={stage}>
              <h2 class="board-col-h">{stage}</h2>
              {(runs.filter((r) => r.run_type === stage) || []).map((r) => (
                <article class="run-card">
                  <p class="run-stage">Stage: {r.run_type}</p>
                  <h3 class="mono"><Link href={'/console/lots/' + r.reference}>{r.reference}</Link></h3>
                  <p class="mono">{r.state_word}{r.losses_g !== null ? ' · losses ' + r.losses_g + ' g' : ''}</p>
                  <p class="stat-meta">Site {r.site} · recipe {r.recipe_version}</p>
                </article>
              ))}
              {runs.filter((r) => r.run_type === stage).length === 0 && <p class="empty">No runs at this stage.</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
