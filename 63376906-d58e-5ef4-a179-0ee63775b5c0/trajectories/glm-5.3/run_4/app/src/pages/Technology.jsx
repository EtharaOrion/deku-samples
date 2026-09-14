import { useEffect, useState } from 'preact/hooks';
import { TopBar, Footer, Loading } from '../components/Chrome.jsx';
import { api } from '../api.js';

const STEPS = [
  { name: 'Dissolution', note: 'Nylon dissolves out of the mixed waste at low temperature, leaving contamination behind.' },
  { name: 'Depolymerisation', note: 'The dissolved polymer is broken back to caprolactam, its monomer.' },
  { name: 'Purification', note: 'The monomer stream is purified to virgin-intermediate quality.' },
  { name: 'Repolymerisation', note: 'Purified caprolactam is polymerised back into pellet.' }
];

const ATTRIBUTES = [
  { name: 'Green chemicals & reagents', evidence: 'Reagent selection audited under carbon method CM-PA6 v2, published 2026-01-20 against ISO 14067.' },
  { name: 'Low temperature & pressure', note: 'Dissolution runs at 165 °C and 3 bar, inside a recipe tolerance of 160–170 °C and 2–4 bar.' },
  { name: 'Low carbon impact', evidence: '4,260,000 mg CO2e per kg of pellet, cradle-to-gate, uncertainty 1,200 basis points, against virgin PA6 from EcoBase 2025, EU-27.' },
  { name: 'Virgin-quality output', note: 'Specification SPEC-N6 v3, guaranteed limits tested on every lot.' },
  { name: 'Traceable origin', note: 'Genealogy traverses the consumption records from lot back to batch, four hops, both directions.' }
];

export default function Technology() {
  const [sites, setSites] = useState(null);

  useEffect(() => {
    api('/api/sites').then((r) => setSites(r.ok ? r.data : []));
  }, []);

  return (
    <div>
      <TopBar />
      <main>
        <section class="hero">
          <h1 class="reveal">Technology</h1>
          <p class="lede">Four stages return mixed polyamide waste to virgin-quality pellet. The diagram carries mass in and mass out per stage.</p>
        </section>

        <section>
          <h2 class="reveal">The four process steps</h2>
          <ol class="process">
            {STEPS.map((s, i) => (
              <li class="process-step">
                <span class="process-stage" aria-hidden="true">{i + 1}</span>
                <h3>{s.name}</h3>
                <p>{s.note}</p>
              </li>
            ))}
          </ol>
          <p class="text-equiv">Text equivalent: Dissolution, then Depolymerisation, then Purification, then Repolymerisation. Mass in and mass out are recorded per run and summed per stage on the reconciliation view.</p>
        </section>

        <section>
          <h2 class="reveal">Capacity</h2>
          <p>Nameplate capacity is stated in tonnes per year: 8,000 hours per year, 0.90 availability, 0.80 yield.</p>
          <div class="table-wrap">
            <table class="spec">
              <caption>Capacity by site, with the confidence each figure carries</caption>
              <thead>
                <tr><th scope="col">Site</th><th scope="col">Nameplate</th><th scope="col">Confidence</th></tr>
              </thead>
              <tbody>
                {(sites || []).map((s) => (
                  <tr>
                    <td>{s.name}</td>
                    <td class="mono">{s.reference === 'SITE-COMM' ? '>25,000 tonnes per year' : (s.nameplate_kg / 1000) + ' tonnes per year'}</td>
                    <td>{s.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sites && <Loading>Loading capacity…</Loading>}
        </section>

        <section>
          <h2 class="reveal">Five attributes</h2>
          <div class="stack">
            {ATTRIBUTES.map((a) => (
              <article class="card">
                <h3>{a.name}</h3>
                <p>{a.evidence || a.note}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
