import { useEffect, useState } from 'preact/hooks';
import { TopBar, Footer, Loading } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function Careers() {
  const [positions, setPositions] = useState(null);
  useEffect(() => { api('/api/positions').then((r) => setPositions(r.ok ? r.data : [])); }, []);
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero"><h1 class="reveal">Careers</h1></section>
        <section>
          <h2 class="reveal">Why this problem matters</h2>
          <p>Less than 1 per cent of textiles are recycled into new materials. More than 8 per cent of textile waste is incinerated each year in the EU-27. Plastics production emits 1.8 gigatonnes of carbon dioxide equivalent a year. None of these numbers fixes itself, and the material that could fix two of them is being landfilled today.</p>
        </section>
        <section>
          <h2 class="reveal">Open positions</h2>
          <p>There {positions && positions.length === 1 ? 'is' : 'are'} {positions ? positions.length : ''} open {positions && positions.length === 1 ? 'position' : 'positions'} at Ravel.</p>
          {!positions && <Loading>Loading positions…</Loading>}
          <div class="stack">
            {(positions || []).map((p) => (
              <article class="card">
                <h3>{p.title}</h3>
                <p class="stat-meta">{p.location} · {p.department} · {p.contract_type} · closes {p.closes_on}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
