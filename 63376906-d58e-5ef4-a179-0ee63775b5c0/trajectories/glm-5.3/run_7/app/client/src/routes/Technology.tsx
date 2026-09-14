import { Reveal } from '../components/Reveal';
import { CapacityFigure } from '../components/Figures';

const steps = [
  { name: 'Dissolution', in_g: 600000, out_g: 480000, note: 'Mixed waste dissolved and filtered; elastane, coatings and foreign matter leave here.' },
  { name: 'Depolymerisation', in_g: 850000, out_g: 800000, note: 'Polyamide returned to monomer at low temperature and pressure.' },
  { name: 'Purification', in_g: 800000, out_g: 760000, note: 'Monomer purified; a sold byproduct leaves here and takes its share of claim and emissions.' },
  { name: 'Repolymerisation', in_g: 720000, out_g: 700000, note: 'Monomer polymerised to virgin-quality pellet and tested before release.' }
];

export default function Technology() {
  return (
    <div>
      <section class="shell hero">
        <Reveal as="h1">Dissolution, depolymerisation, purification, repolymerisation</Reveal>
        <Reveal as="p" class="lede">Four stages, each recorded after the fact. This diagram is generated from the four run types, so it stays correct when a stage changes.</Reveal>
      </section>

      <section class="shell section">
        <Reveal as="h2">The plant, drawn rather than photographed</Reveal>
        <div class="card">
          <div class="genealogy-scroll">
            <svg class="genealogy-svg" viewBox="0 0 960 240" role="img" aria-label="Plant diagram carrying mass in and mass out per stage">
              {steps.map((s, i) => {
                const x = 30 + i * 235;
                return (
                  <g key={s.name}>
                    <rect x={x} y="70" width="180" height="80" rx="6" fill="none" stroke="var(--ink)" stroke-width="1.5" />
                    <text x={x + 90} y="100" text-anchor="middle" font-family="Archivo, sans-serif" font-size="13" fill="var(--ink)">{s.name}</text>
                    <text x={x + 90} y="125" text-anchor="middle" font-family="Space Mono, monospace" font-size="12" fill="var(--ink)">{s.in_g / 1000}t in · {s.out_g / 1000}t out</text>
                    {i < steps.length - 1 ? (
                      <path d={`M${x + 180} 110 h 55 m-8 -5 l 8 5 -8 5`} fill="none" stroke="var(--ink)" stroke-width="1.5" />
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          <h3 class="sr-only" style="position:absolute;left:-9999px">Text equivalent</h3>
          <ol class="nested" style="margin-top:1rem">
            {steps.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong> — mass in <span class="figures">{s.in_g.toLocaleString('en-GB')} g</span>, mass out <span class="figures">{s.out_g.toLocaleString('en-GB')} g</span>. {s.note}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">Capacity</Reveal>
        <p class="measure">The unit is stated once: kilograms of nameplate capacity per year. The year is defined by 8000 operating hours at 0.90 availability and 0.80 yield, which is the basis carried by every row.</p>
        <div class="table-scroll">
          <table class="sheet">
            <caption class="label" style="text-align:left;padding-bottom:0.5rem">Capacity by site, each with its confidence</caption>
            <thead>
              <tr><th scope="col">Site</th><th scope="col" class="num">Nameplate</th><th scope="col">Basis</th><th scope="col">Confidence</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Commercial Plant (2030+)</td>
                <td class="num">&gt;25,000 tonnes per year</td>
                <td>8000 h/yr, 0.90 availability, 0.80 yield</td>
                <td><CapacityFigure value_kg={25000000} confidence="planned" label="nameplate" /></td>
              </tr>
              <tr>
                <td>Demonstration (2026)</td>
                <td class="num">400 tonnes per year</td>
                <td>8000 h/yr, 0.90 availability, 0.80 yield</td>
                <td><CapacityFigure value_kg={400000} confidence="commissioned" label="nameplate" /></td>
              </tr>
              <tr>
                <td>Pilot (2026)</td>
                <td class="num">40 tonnes per year</td>
                <td>8000 h/yr, 0.90 availability, 0.80 yield</td>
                <td><CapacityFigure value_kg={40000} confidence="commissioned" label="nameplate" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="shell section">
        <Reveal as="h2">Five attributes</Reveal>
        <div class="grid three">
          <Reveal as="div" class="card">
            <h3>Green chemicals & reagents</h3>
            <p class="label">Evidence: supplier EPD set 2025</p>
            <p>Reagents are chosen and evidenced as environmental product declarations, and each emission factor carries its own source and year in the carbon method.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Low temperature & pressure</h3>
            <p class="label">Evidence: recipe set points, published thresholds</p>
            <p>Dissolution runs near 165 °C and 3 bar. Temperature and pressure appear in a published claim, so a recipe revision that moves either outside the published threshold is a change notice before it is released.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Low carbon impact</h3>
            <p class="label">Evidence: ISO 14067, CM-PA6 v2, EcoBase 2025 comparator</p>
            <p>The figure for a released lot carries its boundary, method version and uncertainty, and the comparator is named by dataset, year and region.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Drop-in chemistry</h3>
            <p class="label">Evidence: specification SPEC-N6 v3 against a named virgin reference</p>
            <p>Recycled pellets photographed beside conventional pellets at the same scale under the same light argue this better than a sentence can.</p>
          </Reveal>
          <Reveal as="div" class="card">
            <h3>Traceable origin</h3>
            <p class="label">Evidence: batch genealogy, traversed rather than summarised</p>
            <p>A batch reaches a lot across four hops by several paths, and the traversal is a graph over the consumption records, not a stored summary.</p>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
