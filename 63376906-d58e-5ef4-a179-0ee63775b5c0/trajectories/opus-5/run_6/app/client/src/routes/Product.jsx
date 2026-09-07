import { Reveal, Loading, Empty, useAsync } from '../components/common.jsx';
import { api } from '../lib/api.js';

const GRADES = [
  {
    grade: 'Nylon 6',
    limitation: 'Recycled Nylon 6 came almost entirely from one source, discarded fishing nets.',
    claim: 'Ravel takes mixed post-consumer and pre-consumer polyamide 6 — apparel, carpet, offcuts, industrial waste — rather than a single clean stream, which is what makes the volume real rather than anecdotal.',
    claim_type: 'mass balance',
    scheme: 'RCS-2026',
  },
  {
    grade: 'Nylon 6,6',
    limitation: 'Nylon 6,6 had no recycling solution at all.',
    claim: 'It does not depolymerise on the same route as Nylon 6 and has been landfilled or burnt by default. Ravel recovers both monomers, which brings a material with no prior route into the same certified accounting as the first.',
    claim_type: 'mass balance',
    scheme: 'RCS-2026',
  },
];

const INDUSTRIES = [
  ['Textiles and apparel', 'Filament and staple yarn for performance and everyday garments, where the dye uptake and the tenacity have to match the incumbent exactly.'],
  ['Automotive', 'Airbag fabric, under-bonnet mouldings and structural components, where a change to a qualification-relevant parameter blocks rather than warns.'],
  ['Electrical and electronics', 'Connectors and housings that must hold their dimensional stability and their flame rating.'],
  ['Consumer goods', 'Durable mouldings, luggage, sports equipment and hardware.'],
  ['Industrial', 'Filtration media, conveyor components, ropes and technical fabrics.'],
  ['Construction', 'Cable management, fixings and reinforcement, where a long service life is the whole argument.'],
];

const FEATURES = [
  ['Nylon in any form', 'Fibre, film, fabric, moulding or offcut, dyed or undyed, blended or coated. The dissolution step is what makes the form irrelevant, so a collector does not have to sort to a standard nobody can hit.'],
  ['Virgin-quality output', 'The specification names a relative viscosity, a moisture limit and the method each is tested by, and every guaranteed limit is tested on every lot. The comparison is made against a named virgin reference, not against a claim.'],
  ['A record behind every claim', 'Every lot carries its genealogy back through four process stages to the batch, the collector and the approval in force on the day it arrived. The percentage is computed from a ledger; no route in our system accepts one from a person.'],
];

export default function Product() {
  const spec = useAsync(() => fetch('/api/specifications/N6/versions/3').then((r) => (r.ok ? r.json() : null)), []);
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who
            refuse to compromise.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <h2>Two grades</h2>
        <div className="grid grid-2" style={{ marginTop: '2rem' }}>
          {GRADES.map((g) => (
            <div className="card" key={g.grade}>
              <h3 className="t-h4">{g.grade}</h3>
              <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>
                The limitation this grade started from
              </p>
              <p>{g.limitation}</p>
              <p>{g.claim}</p>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Claim type</dt><dd>{g.claim_type}</dd>
                <dt>Scheme</dt><dd className="mono">{g.scheme}</dd>
              </dl>
              <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>
                The recycled-content percentage is stated per certificate, computed from the ledger for
                the lots that certificate covers, and never quoted as a headline figure for the grade.
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="page section">
        <h2>Industries</h2>
        <div className="grid grid-3" style={{ marginTop: '2rem' }}>
          {INDUSTRIES.map(([name, body]) => (
            <div key={name}>
              <h3 className="t-h4">{name}</h3>
              <p className="t-small">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page section">
        <h2>What the material does</h2>
        <div className="grid grid-3" style={{ marginTop: '2rem' }}>
          {FEATURES.map(([name, body]) => (
            <div key={name}>
              <h3 className="t-h4">{name}</h3>
              <p className="t-small">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page section">
        <h2>Specification</h2>
        <p style={{ marginTop: '1rem' }}>
          This is the current specification rather than a form that asks for it. A guaranteed limit is
          tested on every lot; a typical value is reported and not guaranteed; an informational value
          is neither.
        </p>
        {spec.loading ? <Loading what="the specification" /> : null}
        {spec.error || !spec.data ? <Empty>The specification could not be read from the record.</Empty> : null}
        {spec.data ? (
          <>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <caption className="label" style={{ textAlign: 'left', padding: '0.6rem 0.75rem' }}>
                  SPEC-{spec.data.grade} version {spec.data.version}, issued {spec.data.issued_on}
                </caption>
                <thead>
                  <tr><th scope="col">Property</th><th scope="col">Method</th><th scope="col" className="num">Limit</th><th scope="col">Unit</th><th scope="col">Basis</th></tr>
                </thead>
                <tbody>
                  {spec.data.properties.map((p) => (
                    <tr key={p.property}>
                      <th scope="row" style={{ color: 'var(--ink)', textTransform: 'none', fontFamily: 'var(--font-serif)', letterSpacing: 0, fontSize: 'var(--step-body-small-size)' }}>
                        {p.property.replace(/_/g, ' ')}
                      </th>
                      <td className="mono">{p.method}</td>
                      <td className="num">{p.limit}</td>
                      <td>{p.unit}</td>
                      <td>{p.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="t-small" style={{ marginTop: '1rem' }}>
              The virgin-quality comparison is made against{' '}
              <strong>{spec.data.virgin_reference.reference}</strong>, sourced from{' '}
              {spec.data.virgin_reference.source} and dated {spec.data.virgin_reference.date}.
            </p>
          </>
        ) : null}
      </section>
    </>
  );
}
