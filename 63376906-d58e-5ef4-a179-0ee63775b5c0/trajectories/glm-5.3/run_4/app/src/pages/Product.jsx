import { TopBar, Footer } from '../components/Chrome.jsx';

const GRADES = [
  {
    name: 'Nylon 6',
    limitation: 'Recycled Nylon 6 came almost entirely from one source: discarded fishing nets.',
    claim: 'Recycled content allocated by mass balance under RCS.',
    type: 'mass balance',
    scheme: 'RCS-2026'
  },
  {
    name: 'Nylon 6,6',
    limitation: 'Nylon 6,6 had no recycling solution at all.',
    claim: 'Recycled content allocated by mass balance under RCS.',
    type: 'mass balance',
    scheme: 'RCS-2026'
  }
];

const INDUSTRIES = ['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'];

const FEATURES = [
  { h: 'Nylon in any form', p: 'Fishing net, carpet tile, airbag offcut, yarn waste: the process takes nylon in any form and returns it to caprolactam, the same intermediate the virgin route uses.' },
  { h: 'Virgin-quality output', p: 'The pellet meets the same specification a virgin plant meets: relative viscosity 2.40 or better, moisture 0.10 per cent or less, against a virgin reference at 2.42.' },
  { h: 'Traceable origin', p: 'Every lot carries the batches it came from, the runs that made it, and the certificate a customer files with their regulator.' }
];

export default function Product() {
  return (
    <div>
      <TopBar />
      <main>
        <section class="hero">
          <h1 class="reveal">Same material. Better origin.</h1>
          <p class="lede">We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.</p>
        </section>

        <section>
          <h2 class="reveal">Two grades</h2>
          <p>Each grade names its real limitation before its claim.</p>
          <div class="stack">
            {GRADES.map((g) => (
              <article class="card">
                <h3>{g.name}</h3>
                <p class="limitation">{g.limitation}</p>
                <p>{g.claim}</p>
                <p class="claim-meta">Claim type: <strong>{g.type}</strong> · Scheme: {g.scheme}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 class="reveal">Six industries</h2>
          <ul class="list-inline">
            {INDUSTRIES.map((i) => <li>{i}</li>)}
          </ul>
        </section>

        <section>
          <h2 class="reveal">Three features</h2>
          <div class="cols">
            {FEATURES.map((f) => (
              <article class="card">
                <h3>{f.h}</h3>
                <p>{f.p}</p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 class="reveal">Specification</h2>
          <p>The specification for grade N6, version 3, issued 2026-02-01.</p>
          <div class="table-wrap">
            <table class="spec">
              <caption>Specification SPEC-N6 v3 — one row per property</caption>
              <thead>
                <tr><th scope="col">Property</th><th scope="col">Method</th><th scope="col">Limit</th><th scope="col">Unit</th><th scope="col">Basis</th></tr>
              </thead>
              <tbody>
                <tr><td class="mono">relative_viscosity</td><td>ISO 307</td><td class="mono">2.40</td><td>ratio</td><td>guaranteed</td></tr>
                <tr><td class="mono">moisture</td><td>ISO 15512</td><td class="mono">0.10</td><td>percent</td><td>guaranteed</td></tr>
                <tr><td class="mono">yellowness_index</td><td>ASTM E313</td><td class="mono">8.0</td><td>index</td><td>typical</td></tr>
                <tr><td class="mono">ash_content</td><td>ISO 3451-1</td><td class="mono">0.30</td><td>percent</td><td>informational</td></tr>
              </tbody>
            </table>
          </div>
          <p>The virgin-quality comparison names the reference <strong>virgin PA6 at relative viscosity 2.42</strong>, sourced from EcoBase 2025 and dated 2025-11-30.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
