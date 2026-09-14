import { useEffect, useState } from 'preact/hooks';
import { TopBar, Footer, Loading } from '../components/Chrome.jsx';
import { api } from '../api.js';

export default function News() {
  const [items, setItems] = useState(null);
  useEffect(() => { api('/api/news').then((r) => setItems(r.ok ? r.data : [])); }, []);
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero"><h1 class="reveal">News</h1></section>
        <section>
          {!items && <Loading>Loading news…</Loading>}
          <div class="stack">
            {(items || []).map((n) => (
              <article class="card">
                <p class="tag">{n.tag}</p>
                <h3>{n.title}</h3>
                <p class="stat-meta">
                  {n.outlet} · {n.dated}
                  {n.language !== 'en' ? <span> · This item is in French ({n.language})</span> : null}
                </p>
                <p><a class="mono" href={n.link}>{n.link}</a></p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
