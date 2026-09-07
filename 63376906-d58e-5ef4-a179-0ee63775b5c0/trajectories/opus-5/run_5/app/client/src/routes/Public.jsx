import { useState } from 'preact/hooks';
import { useApi, api, Link, Reveal, useMeta, words, dateOf, kg, bp, bpAsPercent, idempotencyKey } from '../lib.jsx';
import { Word, Loading, Empty, CapacityFigure, ContentFigure, IconWarning } from '../components/Bits.jsx';
import { PlantDiagram } from '../components/PlantDiagram.jsx';

/* ------------------------------------------------------------------- home */

export function Home() {
  useMeta('Ravel — Tomorrow\'s materials. Made from today\'s waste.', 'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon. Every claim rests on a record you can verify.');
  return (
    <>
      <section class="section">
        <div class="page">
          <Reveal as="h1" class="display">Tomorrow's materials. Made from today's waste.</Reveal>
          <Reveal>
            <p class="t-body-big" style="margin-top:1.25rem">
              Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
            </p>
            <p style="margin-top:1.5rem">
              <Link href="/product" class="btn btn-primary">
                See the product <span class="arrow" aria-hidden="true">→</span>
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <div class="accent-rule" />
          <Reveal as="h2" class="display-2">Nylon that goes on and on and on</Reveal>
          <Reveal>
            <p style="margin-top:1rem">
              Nylon is a good material used badly. It is strong, it takes dye, it lasts, and almost none of it comes back.
              Mechanical recycling shortens the chain a little each time, so a fibre that began as apparel becomes a filler
              and then becomes nothing. Chemical recycling returns the polymer to its monomer, which is the same molecule
              whatever it was before, so the loop closes without the ratchet downwards.
            </p>
            <p>
              The material we produce is deliberately indistinguishable from the incumbent. That is the point, and it is
              also the difficulty: a buyer cannot see the difference, so the difference has to be recorded rather than
              demonstrated. <span class="highlight-mark">Origin cannot be measured in a pellet.</span> It exists only as a record.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <div class="accent-rule" />
          <Reveal as="h2" class="display-2">The power of green chemistry</Reveal>
          <Reveal>
            <p style="margin-top:1rem">
              Four stages take mixed waste back to pellet: dissolution, depolymerisation, purification and repolymerisation.
              They run at low temperature and low pressure against published recipe thresholds, with reagents named and
              rationed by ratio rather than described as proprietary. Every run records what it did after it did it, and
              every figure on a certificate can be walked back to the batches that produced it.
            </p>
            <p>
              <Link href="/technology">Read the process, stage by stage, with mass in and mass out</Link>.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <div class="accent-rule" />
          <Reveal as="h2" class="display-2">We're closing the loop</Reveal>
          <Reveal>
            <p style="margin-top:1rem">
              Closing a loop is an accounting problem as much as a chemical one. Material that disappears in processing
              does not carry its claim forward, so losses reduce the claim rather than being smoothed over the year.
              A batch from a collector whose approval had lapsed on the day it arrived is processed as non-claimable input,
              whatever the collector's status is today. A certificate is refused when any one of eight conditions fails,
              and none of the eight can be waived by anybody at this company.
            </p>
            <p>
              That is unglamorous, and it is the whole business. The buyer is not paying for the pellet. The buyer is
              paying for origin, and the unit of value is the certificate rather than the tonne. Ravel publishes the
              verification address on every certificate it issues, so a customer's own auditor can check a document
              without asking us for anything.
            </p>
            <p>
              <Link href="/about">The hard facts behind this</Link> and{' '}
              <Link href="/contact">how to supply us or buy from us</Link>.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- product */

export function Product() {
  useMeta('Product — Same material. Better origin.', 'Low-carbon, virgin-quality recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise. Grades, industries, and the published specification.');
  const spec = useApi('/specifications/SPEC-N6/versions/3');
  return (
    <>
      <section class="section">
        <div class="page">
          <Reveal as="h1" class="display">Same material. Better origin.</Reveal>
          <Reveal>
            <p class="t-body-big" style="margin-top:1.25rem">
              We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">Two grades</Reveal>
          <div class="grid-2" style="margin-top:1.5rem">
            <Reveal as="div" class="card">
              <p class="t-eyebrow accent-mark">Grade</p>
              <h3>Nylon 6</h3>
              <p class="t-body-small" style="margin-top:0.75rem">
                <strong>The limitation first.</strong> Recycled Nylon 6 came almost entirely from one source, discarded
                fishing nets. That is a narrow, clean and heavily contested feedstock, and it does not scale to the volume
                the industry uses. Our route takes mixed post-consumer and pre-consumer textile waste instead, which is
                dirtier, more variable, and far more plentiful.
              </p>
              <p class="t-body-small">
                The claim on any given lot is stated as a percentage with its claim type beside it, never on its own.
              </p>
              <p class="t-body-small">
                The recycled-content claim on a lot is stated with its type and its scheme beside it. A lot certified
                today under this route carries a <strong>mass_balance</strong> claim under scheme{' '}
                <span class="mono">RCS-2026</span>, producer registration <span class="mono">REG-RAVEL-0042</span>. The
                percentage itself belongs to a lot rather than to a grade, so it is stated on the certificate and verified
                at <span class="mono">ravel.example.com/verify/&#123;number&#125;</span> rather than advertised here.
              </p>
            </Reveal>
            <Reveal as="div" class="card">
              <p class="t-eyebrow accent-mark">Grade</p>
              <h3>Nylon 6,6</h3>
              <p class="t-body-small" style="margin-top:0.75rem">
                <strong>The limitation first.</strong> Nylon 6,6 had no recycling solution at all. It does not depolymerise
                under the conditions that work for Nylon 6, and mechanical routes degrade it quickly. Until now the honest
                answer for a 6,6 airbag fabric or a 6,6 connector was that the material had nowhere to go.
              </p>
              <p class="t-body-small">
                Our 6,6 route is at pilot scale and its claims are stated at pilot scale, with the provisional conversion
                factor named on every certificate that rests on one.
              </p>
              <p style="margin-top:0.75rem">
                <Word>Pilot scale</Word> <Word quiet>Provisional factor</Word>
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">Industries</Reveal>
          <Reveal>
            <div class="grid-3" style="margin-top:1.5rem">
              {['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'].map((x) => (
                <div key={x} class="card">
                  <h3 class="t-h4">{x}</h3>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">Three features</Reveal>
          <div class="grid-3" style="margin-top:1.5rem">
            <Reveal as="div" class="card">
              <h3>Nylon in any form</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                Carpet, apparel, offcuts, netting, film, mixed and coated streams. The process takes nylon in any form
                because it dissolves the polymer rather than sorting the article, and the intake record names the form
                that actually arrived.
              </p>
            </Reveal>
            <Reveal as="div" class="card">
              <h3>Drop-in without requalification</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                The pellet meets the same guaranteed limits as the virgin grade it replaces, so a converter changes a
                supply line rather than a process. Where a change would touch a qualification-relevant parameter, it is a
                change notice with a stated notice period before it is released.
              </p>
            </Reveal>
            <Reveal as="div" class="card">
              <h3>A claim that survives an audit</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                Every percentage is computed from a ledger of credit movements rather than entered by a person, and every
                certificate replays from the versioned inputs recorded against it. Disagreement is an ordinary answer.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">The specification</Reveal>
          <p class="note" style="margin-top:0.5rem">
            This is the specification itself rather than a request button. SPEC-N6 version 3, issued {spec.data ? dateOf(spec.data.issued_on) : '—'}.
          </p>
          {spec.loading ? <Loading what="the specification" /> : null}
          {spec.error ? <p class="empty">The specification could not be loaded. Write to sales@example.com and we will send it.</p> : null}
          {spec.data ? (
            <>
              <div class="scroller" style="margin-top:1rem">
                <table>
                  <caption class="visually-hidden">SPEC-N6 version 3, one row per property</caption>
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
                        <td>{words(p.property)}</td>
                        <td class="mono">{p.method}</td>
                        <td class="num">{p.limit}</td>
                        <td>{p.unit}</td>
                        <td>
                          {words(p.basis)}
                          {p.basis === 'guaranteed' ? <span class="note"> — tested on every lot</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="note" style="margin-top:1rem">
                The virgin-quality comparison names {spec.data.virgin_reference.reference}, sourced from{' '}
                {spec.data.virgin_reference.source} and dated {dateOf(spec.data.virgin_reference.date)}.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------- technology */

const CAPACITY_ROWS = [
  { label: 'Pilot (2026)', site: 'SITE-PILOT' },
  { label: 'Demonstration (2027)', site: 'SITE-DEMO' },
  { label: 'Commercial Plant (2030+)', site: 'SITE-COMM' },
];

export function Technology() {
  useMeta('Technology — Four stages, at low temperature and low pressure', 'Dissolution, depolymerisation, purification and repolymerisation, with the capacity table, its unit, its basis and its definition of the year.');
  const claims = useApi('/claim-register');
  return (
    <>
      <section class="section">
        <div class="page">
          <Reveal as="h1" class="display">The power of green chemistry</Reveal>
          <Reveal>
            <p class="t-body-big" style="margin-top:1.25rem">
              Four stages return mixed polyamide waste to virgin-quality pellet.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">The process</Reveal>
          <Reveal>
            <PlantDiagram />
          </Reveal>
          <div class="grid-2" style="margin-top:1.5rem">
            {[
              ['Dissolution', 'A benign solvent takes the polyamide into solution and leaves the elastane, the coatings, the dyes and the foreign matter behind. Mass in and mass out are recorded, and the difference is a loss rather than a rounding.'],
              ['Depolymerisation', 'The chain is taken back to monomer. This is the step that removes the ratchet downwards: the monomer is the same molecule whatever the article was, so quality does not decline with each cycle.'],
              ['Purification', 'The monomer is purified to polymer grade. A byproduct leaves here, and a sold byproduct takes a stated share of the claim and of the emissions on the period\'s allocation basis.'],
              ['Repolymerisation', 'The monomer is polymerised to the target viscosity and cut to pellet. The lot is tested against the guaranteed limits before any disposition is set.'],
            ].map(([h, b]) => (
              <Reveal as="div" key={h} class="card">
                <h3>{h}</h3>
                <p class="t-body-small" style="margin-top:0.5rem">{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">Capacity</Reveal>
          <p class="note" style="margin-top:0.5rem">
            The unit is stated once here and not repeated per row: <strong>tonnes of pellet per year</strong>. The year is
            defined by the basis below, and every row carries its confidence because a capacity figure without one is a
            wish rather than a figure.
          </p>
          <p class="note">Basis, identical on all three: 8000 hours per year, 0.90 availability, 0.80 yield. Last revised 2026-06-30.</p>
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">Capacity by site, in tonnes of pellet per year, each with its confidence</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col" class="num">Nameplate</th>
                  <th scope="col">Confidence</th>
                  <th scope="col" class="num">Contracted</th>
                  <th scope="col" class="num">Uncommitted</th>
                </tr>
              </thead>
              <tbody>
                {CAPACITY_ROWS.map((row) => (
                  <CapacityRow key={row.site} {...row} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">Five attributes</Reveal>
          <p class="note" style="margin-top:0.5rem">Three of these are claims, and each of the three carries its evidence.</p>
          <div class="grid-2" style="margin-top:1.25rem">
            <div class="card">
              <h3>Green chemicals &amp; reagents</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                <Evidence claims={claims} route="/technology" claim="Green chemicals and reagents" />
              </p>
            </div>
            <div class="card">
              <h3>Low temperature &amp; pressure</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                <Evidence claims={claims} route="/technology" claim="Low temperature and pressure" />
              </p>
            </div>
            <div class="card">
              <h3>Low carbon impact</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                <Evidence claims={claims} route="/technology" claim="Low carbon impact" />
              </p>
            </div>
            <div class="card">
              <h3>Nylon in any form</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                Carpet, apparel, offcuts, netting and coated streams all enter the same first stage. This is a description
                of the process rather than an environmental claim, so it carries no substantiation record.
              </p>
            </div>
            <div class="card">
              <h3>Drop-in quality</h3>
              <p class="t-body-small" style="margin-top:0.5rem">
                The pellet meets the guaranteed limits in SPEC-N6. This is a specification statement rather than an
                environmental claim; the specification itself is on the <Link href="/product">product route</Link>.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Evidence({ claims, route, claim }) {
  if (claims.loading) return <span class="note">Loading the substantiation record.</span>;
  const row = (claims.data || []).find((x) => x.route === route && x.claim === claim);
  if (!row) return <span class="note">No substantiation record stands behind this claim, so it is not made here.</span>;
  return (
    <>
      {row.evidence}
      <br />
      <span class="note">
        Method version {row.method_version}. Approved by {row.approver}. Reviewed by {dateOf(row.review_date)}.
        {row.evidence_expired ? ' The evidence behind this claim has expired and it is under review.' : ''}
      </span>
    </>
  );
}

function CapacityRow({ label, site }) {
  const cap = useApi(`/sites/${site}/capacity`);
  if (cap.loading) {
    return (
      <tr>
        <td>{label}</td>
        <td colSpan="4" class="note">Loading the capacity figure.</td>
      </tr>
    );
  }
  if (cap.error || !cap.data) {
    return (
      <tr>
        <td>{label}</td>
        <td colSpan="4" class="note">A capacity figure renders with its confidence, and neither could be loaded.</td>
      </tr>
    );
  }
  const d = cap.data;
  const tonnes = (n) => `${Math.floor(Number(n) / 1000).toLocaleString('en-GB')}`;
  return (
    <tr>
      <th scope="row" style="font-family:var(--serif);text-transform:none;letter-spacing:0;color:var(--ink);font-size:var(--size-body-small);font-weight:600">
        {label}
      </th>
      <td class="num">{site === 'SITE-COMM' ? `>${tonnes(d.nameplate_kg)}` : tonnes(d.nameplate_kg)}</td>
      <td>
        <Word firm={d.confidence === 'planned'}>{words(d.confidence)}</Word>
      </td>
      <td class="num">{tonnes(d.contracted_kg)}</td>
      <td class="num">
        {tonnes(d.uncommitted_kg)}
        {d.uncommitted_kg < 0 ? <span class="note"> oversubscribed</span> : null}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ about */

export function About() {
  useMeta('About — The hard facts', 'Three published figures, each with its source, its year and its geography stated beside it rather than in a footer.');
  const stats = useApi('/statistics');
  return (
    <>
      <section class="section">
        <div class="page">
          <Reveal as="h1" class="display">The hard facts</Reveal>
          <Reveal>
            <p class="t-body-big" style="margin-top:1.25rem">
              Three figures, each with its source, its year and its geography beside it.
            </p>
          </Reveal>
        </div>
      </section>
      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          {stats.loading ? <Loading what="the published figures" /> : null}
          {stats.error ? <Empty>The published figures could not be loaded.</Empty> : null}
          {stats.data && !stats.data.length ? <Empty>No figure is published on this route.</Empty> : null}
          <div class="grid-3">
            {(stats.data || []).map((s) => (
              <Reveal as="div" key={s.key} class="card">
                <p class="t-body-big">{s.value}</p>
                <hr class="rule" style="margin:1rem 0" />
                <p class="t-label-small muted">Source: {s.source}</p>
                <p class="t-label-small muted">Year: {s.year}</p>
                <p class="t-label-small muted">Geography: {s.geography}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <Reveal as="h2" class="display-2">What we are</Reveal>
          <Reveal>
            <p style="margin-top:1rem">
              Ravel Materials SAS operates a chemical recycling plant that returns mixed polyamide waste to virgin-quality
              pellet. We do not run the plant from this system. We record what a run did, after the run, and we produce the
              claims and the certificates that a customer files with their own regulator.
            </p>
            <p>
              The company holds three sites at different confidences, and it says so in public: a commissioned pilot, a
              commissioned demonstration plant, and a planned commercial plant whose contracted volume already exceeds its
              nameplate. That last figure is uncomfortable and it is published rather than quietly netted.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- careers */

export function Careers() {
  useMeta('Careers — Why this problem matters', 'Open positions at Ravel, with the count rendered from the collection it labels.');
  const pos = useApi('/positions');
  const count = pos.data ? pos.data.length : null;
  return (
    <>
      <section class="section">
        <div class="page">
          <Reveal as="h1" class="display">Why this problem matters</Reveal>
          <Reveal>
            <p style="margin-top:1.25rem">
              Less than one per cent of textiles are recycled into new materials, and more than eight per cent of textile
              waste is incinerated each year in the EU-27. Those two sentences describe a material that the world makes in
              enormous quantity, uses briefly, and then destroys. Nylon is a particularly bad case, because it is durable
              enough to last for decades and is thrown away in months.
            </p>
            <p>
              The chemistry to close that loop is understood. What is not solved is the accounting: proving that a pellet
              which is deliberately identical to the incumbent came from waste rather than from oil, in a way that survives
              an audit by somebody who has every reason to disbelieve it. That is a records problem, a arithmetic problem
              and a discipline problem, and it is the reason this company exists.
            </p>
            <p>
              If you would rather build the boring system that makes the claim true than the demo that makes it look true,
              we would like to hear from you.
            </p>
          </Reveal>
        </div>
      </section>
      <section class="section" style="border-top:1px solid var(--rule)">
        <div class="page">
          <h2 class="display-2">
            {count === null ? 'Open positions' : `${count} open position${count === 1 ? '' : 's'}`}
          </h2>
          {pos.loading ? <Loading what="the open positions" /> : null}
          {pos.error ? <Empty>The open positions could not be loaded. Write to careers@example.com.</Empty> : null}
          {pos.data && !pos.data.length ? <Empty>There is no open position at the moment.</Empty> : null}
          <div class="grid-2" style="margin-top:1.25rem">
            {(pos.data || []).map((p) => (
              <div key={p.reference} class="card">
                <h3>{p.title}</h3>
                <p class="t-body-small" style="margin-top:0.5rem">
                  {p.location} · {p.department} · {p.contract_type}
                </p>
                <p class="note">Applications close {dateOf(p.closes_on)}.</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------- news */

const TAGS = ['funding', 'partnership', 'technical', 'recognition'];

export function News() {
  useMeta('News — Ravel', 'Coverage of Ravel, each item with its outlet, its date, its link and its language.');
  const news = useApi('/news');
  const [tag, setTag] = useState(null);
  const items = (news.data || []).filter((x) => !tag || x.tag === tag);
  return (
    <section class="section">
      <div class="page">
        <Reveal as="h1" class="display">News</Reveal>
        <p class="note" style="margin-top:1rem">
          One event is listed once with its coverage. An item in another language says so before you click.
        </p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin:1.25rem 0">
          <button type="button" class="btn" aria-pressed={tag === null} onClick={() => setTag(null)}>
            All
          </button>
          {TAGS.map((t) => (
            <button key={t} type="button" class="btn" aria-pressed={tag === t} onClick={() => setTag(t)}>
              {t}
            </button>
          ))}
        </div>
        {news.loading ? <Loading what="the news items" /> : null}
        {news.error ? <Empty>The news items could not be loaded.</Empty> : null}
        {news.data && !items.length ? <Empty>There is no item under this tag.</Empty> : null}
        <div class="stack">
          {items.map((n) => (
            <article key={n.reference} class="card">
              <p class="t-eyebrow accent-mark">{n.tag}</p>
              <h2 class="t-h4" style="margin-top:0.375rem">{n.title}</h2>
              <p class="t-body-small" style="margin-top:0.5rem">
                {n.outlet} · <span class="mono">{dateOf(n.date)}</span>
                {n.language !== 'en' ? (
                  <>
                    {' '}
                    <Word>In {n.language === 'fr' ? 'French' : n.language}</Word>
                  </>
                ) : null}
              </p>
              <p style="margin-top:0.5rem">
                <a href={n.link} rel="noopener noreferrer">
                  Read at {n.outlet}
                </a>
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- contact */

const TYPES = [
  ['waste_supply', 'Waste supply'],
  ['polymer_purchase', 'Polymer purchase'],
  ['partnership', 'Partnership'],
  ['press', 'Press'],
];

export function Contact() {
  useMeta('Contact — Four enquiry types, four destinations', 'Each enquiry type has its own destination address and its own stated response time.');
  const dests = useApi('/enquiry-destinations');
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', organisation: '', message: '' });
  const [state, setState] = useState({ status: 'idle', result: null, error: null });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', result: null, error: null });
    try {
      const result = await api('/enquiries', { method: 'POST', body: form, key: idempotencyKey('enq') });
      setState({ status: 'sent', result, error: null });
    } catch (error) {
      setState({ status: 'failed', result: null, error });
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.currentTarget.value }));

  return (
    <section class="section">
      <div class="page">
        <Reveal as="h1" class="display">Contact</Reveal>
        <p class="t-body-big" style="margin-top:1.25rem">
          Four enquiry types, four destinations, four stated response times.
        </p>

        <div class="scroller" style="margin-top:1.5rem">
          <table>
            <caption class="visually-hidden">Enquiry types, destinations and response times</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Destination</th>
                <th scope="col" class="num">Response</th>
              </tr>
            </thead>
            <tbody>
              {(dests.data || []).map((d) => (
                <tr key={d.type}>
                  <td>{words(d.type)}</td>
                  <td class="mono">{d.destination}</td>
                  <td class="num">{d.response_days} working day{d.response_days === 1 ? '' : 's'}</td>
                </tr>
              ))}
              {dests.loading ? (
                <tr>
                  <td colSpan="3" class="note">Loading the destinations.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <form onSubmit={submit} style="margin-top:2rem;max-width:38rem" novalidate>
          <h2 class="display-2">Write to us</h2>
          <div class="field">
            <label for="enq-type">Enquiry type</label>
            <select id="enq-type" value={form.type} onChange={set('type')}>
              {TYPES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div class="field">
            <label for="enq-name">Your name</label>
            <input id="enq-name" value={form.name} onInput={set('name')} required autocomplete="name" />
          </div>
          <div class="field">
            <label for="enq-email">Your email address</label>
            <input id="enq-email" type="email" value={form.email} onInput={set('email')} required autocomplete="email" />
          </div>
          <div class="field">
            <label for="enq-org">Organisation</label>
            <input id="enq-org" value={form.organisation} onInput={set('organisation')} autocomplete="organization" />
          </div>
          <div class="field">
            <label for="enq-msg">Message</label>
            <textarea id="enq-msg" rows="5" value={form.message} onInput={set('message')} required />
          </div>
          <p class="note">
            Ravel Materials SAS receives this data to answer your enquiry. An enquiry is kept for 24 months, a
            waste-supply or polymer enquiry for 36 months and a press enquiry for 12 months. Write to{' '}
            <a href="mailto:privacy@example.com">privacy@example.com</a> to have it removed. The full statement is on the{' '}
            <Link href="/privacy">privacy route</Link>.
          </p>
          <button type="submit" class="btn btn-primary" disabled={state.status === 'sending'}>
            {state.status === 'sending' ? 'Sending' : 'Send this enquiry'} <span class="arrow" aria-hidden="true">→</span>
          </button>
        </form>

        {state.status === 'sent' && state.result ? (
          <div class="banner" role="status" style="max-width:38rem">
            <h3>Your enquiry has been received.</h3>
            <p>
              Its reference is <span class="mono">{state.result.reference}</span>. It has been routed to{' '}
              <span class="mono">{state.result.destination}</span> and a person there will answer within{' '}
              {state.result.response_days} working day{state.result.response_days === 1 ? '' : 's'}. A confirmation with
              this reference has been sent to the address you gave.
            </p>
          </div>
        ) : null}

        {state.status === 'failed' ? (
          <div class="banner" role="alert" style="max-width:38rem">
            <h3>Your enquiry was not sent.</h3>
            <p>{state.error?.body?.detail || state.error?.message || 'The form could not reach us.'}</p>
            <p>
              You can correct the fields above and try again. If it keeps failing, this form is not the only way to reach
              us: write directly to <a href="mailto:sales@example.com">sales@example.com</a> for a polymer enquiry, or to{' '}
              <a href="mailto:feedstock@example.com">feedstock@example.com</a> for a waste-supply enquiry, and quote the
              message you were trying to send.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- privacy */

export function Privacy() {
  useMeta('Privacy — Ravel Materials SAS', 'Who receives your data, what it is used for, how long it is kept and how to have it removed.');
  return (
    <section class="section">
      <div class="page">
        <h1 class="display">Privacy</h1>
        <div class="stack" style="margin-top:1.5rem">
          <h2 class="t-h4">The controller</h2>
          <p>
            Ravel Materials SAS is the controller of the personal data described here. Its registered address is 14 rue des
            Fabriques, 69007 Lyon, France. A rights request is made to{' '}
            <a href="mailto:privacy@example.com">privacy@example.com</a> and is answered within one month.
          </p>

          <h2 class="t-h4">What is kept, and for how long</h2>
          <div class="scroller">
            <table>
              <caption class="visually-hidden">Retention in months for every purpose</caption>
              <thead>
                <tr>
                  <th scope="col">Purpose</th>
                  <th scope="col" class="num">Retention</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['An enquiry', 24],
                  ['A waste-supply enquiry', 36],
                  ['A polymer enquiry', 36],
                  ['A press enquiry', 12],
                  ['An account and its acts', 120],
                  ['The operational record', 180],
                ].map(([p, m]) => (
                  <tr key={p}>
                    <td>{p}</td>
                    <td class="num">{m} months</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 class="t-h4">The operational record names individuals</h2>
          <p>
            The record this company keeps names the person who booked in a batch, entered a test result, set a disposition,
            signed a certificate or refused an act. It is retained under a certification-scheme obligation and a statutory
            obligation, and it is <strong>not erased on request</strong>: a certificate issued today may be read by a
            regulator in ten years, and a record with the names removed would not support it.
          </p>
          <p>
            A former employee's contact detail <strong>is</strong> erased on request. The identifier inside the record
            resolves to a name through a separate store with its own retention, and it is that store the erasure acts on.
          </p>

          <h2 class="t-h4">Disclosure</h2>
          <p>
            A security issue is disclosed to <a href="mailto:security@example.com">security@example.com</a>. We answer
            every report and we do not pursue a good-faith researcher.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- verify */

export function Verify({ number }) {
  useMeta(`Verify ${number} — Ravel`, `The verification answer for certificate ${number}.`, true);
  const v = useApi(`/verify/${encodeURIComponent(number)}`);
  return (
    <section class="section">
      <div class="page" style="max-width:52rem">
        <p class="t-eyebrow">Certificate verification</p>
        <h1 class="display-2" style="margin-top:0.5rem">
          <span class="mono">{number}</span>
        </h1>

        {v.loading ? <Loading what="the verification answer" /> : null}
        {v.error ? <Empty>The verification answer could not be loaded. Try again shortly.</Empty> : null}

        {v.data && v.data.found === false ? (
          <div class="card" style="margin-top:1.5rem">
            <p class="t-body-big">There is no such certificate.</p>
            <p class="t-body-small" style="margin-top:0.75rem">
              No certificate with the number <span class="mono">{number}</span> has been issued by Ravel. Check the number
              against the document you hold. If you believe a certificate with this number should exist, write to{' '}
              <a href="mailto:sales@example.com">sales@example.com</a> quoting the number and the date on your copy.
            </p>
            <dl style="margin-top:1rem">
              <Row label="Found" value="no" />
              <Row label="Number" value={number} mono />
              <Row label="State" value="—" />
              <Row label="Issued on" value="—" />
              <Row label="Withdrawn on" value="—" />
              <Row label="Site" value="—" />
              <Row label="Grade" value="—" />
              <Row label="Claim type" value="—" />
              <Row label="Recipient" value="—" />
            </dl>
          </div>
        ) : null}

        {v.data && v.data.found ? (
          <div class="card" style="margin-top:1.5rem">
            {v.data.state === 'withdrawn' ? (
              <div class="banner" role="status" style="margin-top:0">
                <h3>Withdrawn</h3>
                <p>
                  This certificate was withdrawn on {dateOf(v.data.withdrawn_on)}. Reason: {v.data.withdrawal_reason}.
                </p>
                <p class="note">
                  A withdrawal is a fact about this document. There is no replacement to forward you to; if a replacement
                  exists it carries its own number and its own verification address.
                </p>
              </div>
            ) : (
              <p class="t-body-big">This certificate was issued by Ravel and stands.</p>
            )}
            <dl style="margin-top:1rem">
              <Row label="Found" value="yes" />
              <Row label="Number" value={v.data.number} mono />
              <Row label="State" value={words(v.data.state)} />
              <Row label="Issued on" value={dateOf(v.data.issued_on)} mono />
              <Row label="Withdrawn on" value={v.data.withdrawn_on ? dateOf(v.data.withdrawn_on) : '—'} mono />
              <Row label="Site" value={v.data.site} mono />
              <Row label="Grade" value={v.data.grade} mono />
              <Row label="Claim type" value={words(v.data.claim_type)} />
              <Row label="Recipient" value={v.data.recipient_name} />
            </dl>
            <p class="note" style="margin-top:1rem">
              This answer states what it states and nothing else. It carries no yield, no collector, no genealogy and no
              carbon breakdown, because those are the producer's records rather than facts a stranger is entitled to.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div style="display:flex;gap:1rem;padding:0.5rem 0;border-bottom:1px solid var(--rule)">
      <dt class="t-label-small muted" style="min-width:9rem">{label}</dt>
      <dd class={mono ? 'mono' : ''} style="margin:0;font-size:var(--size-body-small);line-height:var(--lh-body-small)">
        {value}
      </dd>
    </div>
  );
}

export function NotFound({ path }) {
  useMeta('Not found — Ravel', 'There is no route at this address.');
  return (
    <section class="section">
      <div class="page">
        <h1 class="display-2">There is no route at this address.</h1>
        <p style="margin-top:1rem">
          Nothing is served at <span class="mono">{path}</span>. The routes on this site are{' '}
          <Link href="/">home</Link>, <Link href="/product">product</Link>, <Link href="/technology">technology</Link>,{' '}
          <Link href="/about">about</Link>, <Link href="/careers">careers</Link>, <Link href="/news">news</Link>,{' '}
          <Link href="/contact">contact</Link> and <Link href="/privacy">privacy</Link>, plus a public verification
          address at <span class="mono">/verify/&#123;number&#125;</span>.
        </p>
      </div>
    </section>
  );
}
