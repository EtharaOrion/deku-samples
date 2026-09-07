import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, Empty, ContentFigure } from '../ui.jsx';

const INDUSTRIES = [
  ['Textiles and apparel', 'Filament and staple yarn where the article is dyed, worn and eventually returned.'],
  ['Automotive', 'Airbag fabric, under-bonnet parts and structural components, where a qualification takes a year.'],
  ['Electrical and electronics', 'Connectors and housings that must hold their dimension at temperature.'],
  ['Consumer goods', 'Articles where the buyer reads the label and expects the label to be true.'],
  ['Industrial', 'Conveyor, cable and engineered parts specified on a data sheet rather than a brand.'],
  ['Construction', 'Long-life components where the material outlives the company that supplied it.'],
];

export default function Product() {
  useTitle(
    'Product — Same material. Better origin.',
    'Low-carbon, virgin-quality recycled Nylon 6 and 6,6, with the specification published beside the claim, its type and its scheme.'
  );
  const spec = useAsync(() => api('/specifications/N6/versions/3'));

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">Product</p>
        <h1>Same material. Better origin.</h1>
        <p class="t-big">
          We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who
          refuse to compromise.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Two grades, and what each one could not do before</h2>
        <div class="grid grid-2">
          <div class="sheet">
            <p class="t-eyebrow">Nylon 6</p>
            <h3 class="t-h4">The limitation first</h3>
            <p>
              Recycled Nylon 6 came almost entirely from one source: discarded fishing nets. That
              is a narrow, geographically concentrated stream, and it is nowhere near the volume
              the market asks for. A supply chain resting on one waste stream is a supply chain
              with one point of failure.
            </p>
            <p>
              Ravel dissolves mixed polyamide waste instead: post-consumer apparel, carpet and
              pre-consumer offcuts, contaminated, coloured and blended. The claim on the pellet
              names which category it came from and how much.
            </p>
          </div>
          <div class="sheet">
            <p class="t-eyebrow">Nylon 6,6</p>
            <h3 class="t-h4">The limitation first</h3>
            <p>
              Nylon 6,6 had no recycling solution at all. Mechanical routes degrade it, and the
              chemistry that returns it to its two monomers was not economic at any scale worth
              running.
            </p>
            <p>
              The same dissolution and depolymerisation route reaches 6,6, which is what makes it
              a platform rather than a single product. It is at pilot scale, and the capacity
              table says so with its confidence beside it.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Three features</h2>
        <div class="grid grid-3">
          <div class="card">
            <h3 class="t-h4">Nylon in any form</h3>
            <p class="t-small">
              Carpet, apparel, netting, offcuts and industrial waste all enter the same
              dissolution step. Colour, coatings and elastane content are recorded at intake
              rather than being a reason to refuse the batch.
            </p>
          </div>
          <div class="card">
            <h3 class="t-h4">Virgin-quality output</h3>
            <p class="t-small">
              Every guaranteed limit on the specification is tested on every lot, against the
              method the specification names. A result produced by a different method is kept as
              evidence and never reaches a disposition.
            </p>
          </div>
          <div class="card">
            <h3 class="t-h4">A claim you can file</h3>
            <p class="t-small">
              The certificate states the claim type beside the percentage and states, in words,
              what the recipient may and may not say. A regulator reads the same document you do.
            </p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The specification</h2>
        <p class="t-big">
          Published here rather than behind a request. The version is <span class="mono">SPEC-N6 v3</span>,
          issued on <span class="mono">2026-02-01</span>. Version 2 is superseded and stays readable.
        </p>
        {spec.loading ? <Loading what="the specification" /> : null}
        {spec.error ? <Empty>The specification could not be read just now.</Empty> : null}
        {spec.data ? (
          <>
            <div class="table-scroll">
              <table>
                <caption>
                  A guaranteed limit is tested on every lot. A typical figure is representative and
                  an informational figure is neither.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Property</th>
                    <th scope="col">Method</th>
                    <th scope="col" class="num">Limit</th>
                    <th scope="col">Unit</th>
                    <th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.data.properties.map((p) => (
                    <tr key={p.property}>
                      <th scope="row" style="text-transform:capitalize">{p.property.replace(/_/g, ' ')}</th>
                      <td class="mono">{p.method}</td>
                      <td class="num">{p.limit}</td>
                      <td>{p.unit}</td>
                      <td>{p.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style="margin-top:1rem">
              The virgin-quality comparison is made against{' '}
              <strong>{spec.data.virgin_reference.reference}</strong>, sourced from{' '}
              {spec.data.virgin_reference.source} and dated{' '}
              <span class="mono">{spec.data.virgin_reference.date}</span>.
            </p>
          </>
        ) : null}
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The recycled-content claim, beside the grade it applies to</h2>
        <div class="table-scroll">
          <table>
            <caption>
              A percentage renders with its claim type. A mass-balance claim is a bookkeeping
              claim about a site over a period, not a statement about the molecules in the bag.
            </caption>
            <thead>
              <tr>
                <th scope="col">Grade</th>
                <th scope="col">Claim</th>
                <th scope="col">Scheme</th>
                <th scope="col">What it permits</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" class="mono">N6</th>
                <td><ContentFigure content_bp={9000} claim_type="mass_balance" /></td>
                <td class="mono">RCS-2026</td>
                <td>
                  This material is claimed by mass balance. It is not physically segregated.
                  You may not state that this material physically contains recycled content.
                </td>
              </tr>
              <tr>
                <th scope="row" class="mono">N66</th>
                <td class="t-small">At pilot scale. No lot has been released, so no percentage is published.</td>
                <td class="mono">RCS-2026</td>
                <td class="t-small">A claim is published when a lot carries one.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Six industries</h2>
        <div class="grid grid-3">
          {INDUSTRIES.map(([name, detail]) => (
            <div key={name}>
              <h3 class="t-h4">{name}</h3>
              <p class="t-small">{detail}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
