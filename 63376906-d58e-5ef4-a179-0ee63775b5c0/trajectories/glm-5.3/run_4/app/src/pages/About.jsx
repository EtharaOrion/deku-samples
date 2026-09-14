import { useEffect, useState } from 'preact/hooks';
import { TopBar, Footer, Loading } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function About() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/statistics').then((r) => setStats(r.ok ? r.data : [])); }, []);
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero"><h1 class="reveal">About Ravel</h1></section>
        <section>
          <h2 class="reveal">The hard facts</h2>
          <p>Three statistics, each with its source, its year and its geography beside it rather than in a footer.</p>
          {!stats && <Loading>Loading figures…</Loading>}
          <div class="stack">
            {(stats || []).map((s) => (
              <article class="card">
                <p class="stat-value">{s.value}</p>
                <p class="stat-meta">Source: {s.source} · Year: {s.year} · Geography: {s.geography}</p>
              </article>
            ))}
          </div>
        </section>
        <section>
          <h2 class="reveal">The company</h2>
          <p>Ravel operates a chemical recycling plant that returns mixed polyamide waste to virgin-quality pellet. The material is deliberately indistinguishable from the incumbent: the buyer is not paying for the pellet, but for its origin, and origin cannot be measured in a pellet. It exists only as a record.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
