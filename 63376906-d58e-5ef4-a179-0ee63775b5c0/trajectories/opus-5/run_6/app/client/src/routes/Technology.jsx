import { Reveal, Loading, Empty, Capacity, useAsync, formatInt } from '../components/common.jsx';

const ATTRIBUTES = [
  {
    name: 'Green chemicals & reagents',
    claim: true,
    evidence: 'The reagent set and its ratios are named in the released recipe version for every stage, and the reagent line of the carbon figure carries a supplier declaration dated inside the period rather than a published average.',
  },
  {
    name: 'Low temperature & pressure',
    claim: true,
    evidence: 'Dissolution runs at 160–170 °C and 2–4 bar, and repolymerisation at 250–262 °C and 1–3 bar, as released set points with stated tolerances. A run outside its tolerance raises a deviation whether or not the output passed its tests.',
  },
  {
    name: 'Low carbon impact',
    claim: true,
    evidence: 'The figure for the demonstration lot is 4,260,000 mg CO₂e per kg, cradle-to-gate, under CM-PA6 v2 at 1200 basis points of uncertainty, against virgin PA6 from EcoBase 2025 in EU-27. It is lower than that comparator.',
  },
  {
    name: 'Drop-in output',
    claim: false,
    evidence: 'The output runs on the incumbent equipment at the incumbent settings, to the specification on the product route.',
  },
  {
    name: 'Feedstock tolerance',
    claim: false,
    evidence: 'Mixed, dyed, blended and coated polyamide waste, rather than a single clean stream.',
  },
];

const CAPACITY = [
  { site: 'Pilot (2026)', kg: 40000, confidence: 'commissioned' },
  { site: 'Demonstration (2027)', kg: 400000, confidence: 'commissioned' },
  { site: 'Commercial Plant (2030+)', kg: 25000000, confidence: 'planned' },
];

export default function Technology() {
  const process = useAsync(() => fetch('/api/process').then((r) => (r.ok ? r.json() : null)), []);
  return (
    <>
      <section className="page section" style={{ paddingTop: '4rem' }}>
        <hr className="accent-rule" />
        <Reveal as="h1">Four steps, and a record of each</Reveal>
        <Reveal>
          <p className="t-body-big" style={{ maxWidth: '44rem', marginTop: '1.5rem' }}>
            Mixed polyamide waste goes in at one end and virgin-quality pellet comes out at the other.
            Between the two are four stages, and the mass entering and leaving each one is recorded
            after the run rather than modelled before it.
          </p>
        </Reveal>
      </section>

      <section className="page section">
        <h2>The process</h2>
        {process.loading ? <Loading what="the process diagram" /> : null}
        {process.error || !process.data ? <Empty>The process diagram could not be read from the record.</Empty> : null}
        {process.data ? (
          <>
            <p className="t-small" style={{ marginTop: '1rem', color: 'var(--muted)' }}>
              This diagram is generated from the four run types in the record, so it stays correct when a
              stage changes. The masses below are the totals of the seeded demonstration campaign.
            </p>
            <ol className="grid grid-2" style={{ marginTop: '1.5rem', listStyle: 'none', padding: 0 }}>
              {process.data.map((stage, i) => (
                <li key={stage.stage} className="card">
                  <p className="label">Step {i + 1}</p>
                  <h3 className="t-h4">{stage.label}</h3>
                  <p className="t-small">{stage.description}</p>
                  <dl className="dl" style={{ marginTop: '1rem' }}>
                    <dt>Mass in</dt><dd className="mono">{formatInt(stage.mass_in_g)} g</dd>
                    <dt>Mass out</dt><dd className="mono">{formatInt(stage.mass_out_g)} g</dd>
                    <dt>Losses</dt><dd className="mono">{formatInt(stage.losses_g)} g</dd>
                    <dt>Runs recorded</dt><dd className="mono">{stage.run_count}</dd>
                  </dl>
                </li>
              ))}
            </ol>
            <p className="t-small" style={{ marginTop: '1rem' }}>
              Losses reduce the claim. Material that disappears in processing does not carry its claim
              forward.
            </p>
          </>
        ) : null}
      </section>

      <section className="page section">
        <h2>Capacity</h2>
        <p style={{ marginTop: '1rem' }}>
          All capacity figures below are stated in <strong>tonnes per year</strong>, on a basis of
          8000 hours per year at 0.90 availability and 0.80 yield. A year is a calendar year. Every
          figure carries the confidence of the site it belongs to, because a planned plant and a
          commissioned one are not the same claim.
        </p>
        <div className="table-scroll" style={{ marginTop: '1.5rem' }}>
          <table>
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col" className="num">Nameplate</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {CAPACITY.map((row) => (
                <tr key={row.site}>
                  <th scope="row" style={{ color: 'var(--ink)', textTransform: 'none', fontFamily: 'var(--font-serif)', letterSpacing: 0, fontSize: 'var(--step-body-small-size)' }}>
                    {row.site}
                  </th>
                  <td className="num">
                    {row.confidence === 'planned' ? '>' : ''}{formatInt(row.kg / 1000)} tonnes per year
                  </td>
                  <td><Capacity kg={row.kg} confidence={row.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="page section">
        <h2>Five attributes</h2>
        <p style={{ marginTop: '1rem' }}>
          Three of these are claims about the environment, so each is stated with the evidence it
          rests on rather than as an adjective.
        </p>
        <div className="stack" style={{ marginTop: '1.5rem' }}>
          {ATTRIBUTES.map((a) => (
            <div className="card-quiet" key={a.name}>
              <h3 className="t-h4">{a.name}</h3>
              <p className="label" style={{ marginTop: '0.5rem' }}>
                {a.claim ? 'Evidence' : 'What this means'}
              </p>
              <p className="t-small" style={{ marginBottom: 0 }}>{a.evidence}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
