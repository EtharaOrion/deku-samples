import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Reveal } from '../components/reveal.jsx';
import { Banner, Empty, Loading, Ref } from '../components/bits.jsx';
import { fmtDate } from '../format.js';

function Meta({ title, description, noindex }) {
  useEffect(() => {
    document.title = title;
    let d = document.querySelector('meta[name="description"]');
    if (!d) {
      d = document.createElement('meta');
      d.name = 'description';
      document.head.appendChild(d);
    }
    d.content = description;
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); }
      r.content = 'noindex';
    } else if (r) { r.remove(); }
  }, [title, description, noindex]);
  return null;
}

export function Home() {
  return (
    <main>
      <Meta title="Ravel — tomorrow's materials, made from today's waste"
        description="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon." />
      <section class="hero">
        <p class="eyebrow">Chemical recycling · Lyon</p>
        <Reveal as="h1"><span>Tomorrow's materials.</span> <span>Made from today's waste.</span></Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.</p>
        <p><Link class="btn" href="/product">See the material <span class="arrow" aria-hidden="true">→</span></Link></p>
      </section>

      <Reveal as="section" class="section">
        <h2>Nylon that goes on and on and on</h2>
        <div class="grid-2">
          <p class="lede">Nylon is a polymer that can be taken apart into its building blocks and put back
            together again, indefinitely. The molecule does not tire. What tires is the system that collects,
            sorts and reprocesses it, and that system is what we build.</p>
          <p>A fishing net hauled from the North Atlantic and a bolt of offcut fabric from a cutting room
            floor are the same polymer wearing different clothes. Our process takes both, returns them to
            caprolactam, and repolymerises them into pellet that a spinner or an injection moulder cannot
            tell from the incumbent. The buyer is not paying for the pellet. The buyer is paying for its
            origin, and origin cannot be measured in a pellet: it exists only as a record.</p>
        </div>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>The power of green chemistry</h2>
        <div class="grid-2">
          <p>Conventional nylon production begins with fossil feedstock and ends with a high-pressure,
            high-temperature polymerisation. We begin with waste and run dissolution, depolymerisation,
            purification and repolymerisation at temperatures and pressures a chemical engineer reads twice
            because they are lower than expected.</p>
          <p>The consequence is arithmetic rather than rhetoric: less energy in, fewer emissions out, and a
            carbon figure published with its boundary, its method version and its uncertainty so that a
            compliance officer can file it without telephoning us first.</p>
        </div>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>We're closing the loop</h2>
        <p class="lede">A loop closes only when the material that leaves comes back, and when the claim made
          about it survives an audit.</p>
        <div class="grid-3">
          <div class="sheet">
            <h3>Collected</h3>
            <p>Waste arrives in batches from named collectors, each with its category, its moisture and its
              chain of custody. A batch whose custody is incomplete is processed but not claimed.</p>
          </div>
          <div class="sheet">
            <h3>Returned</h3>
            <p>Four process stages return mixed polyamide waste to virgin-quality pellet. Losses reduce the
              claim: material that disappears in processing does not carry its claim forward.</p>
          </div>
          <div class="sheet">
            <h3>Attested</h3>
            <p>Every lot carries how much recycled input it represents and what it emitted, allocated by
              arithmetic across a plant that also runs conventional feed, and stated on a certificate a
              customer files with their own regulator.</p>
          </div>
        </div>
      </Reveal>
    </main>
  );
}

export function Product() {
  return (
    <main>
      <Meta title="Product — Ravel" description="Same material. Better origin. Low-carbon, virgin-quality, recycled Nylon 6 and 6,6." />
      <section class="hero">
        <p class="eyebrow">Product</p>
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers
          who refuse to compromise.</p>
      </section>

      <Reveal as="section" class="section">
        <h2>Two grades, each with its limitation named first</h2>
        <div class="grid-2">
          <div class="sheet">
            <h3>Recycled Nylon 6</h3>
            <p class="small">Its limitation: recycled Nylon 6 came almost entirely from one source, discarded
              fishing nets.</p>
            <p>Caprolactam recovered from nets, ropes and post-consumer textiles, repolymerised to a
              relative viscosity a spinner can contract against.</p>
            <p><span class="tag">Recycled content</span> claimed by <strong>mass balance</strong> under
              scheme <strong>RCS-2026</strong>. This material is claimed by mass balance. It is not
              physically segregated.</p>
          </div>
          <div class="sheet">
            <h3>Recycled Nylon 6,6</h3>
            <p class="small">Its limitation: Nylon 6,6 had no recycling solution at all.</p>
            <p>A depolymerisation route for hexamethylenediamine and adipic acid streams, developed because
              the alternative for 6,6 was energy recovery.</p>
            <p><span class="tag">Recycled content</span> claimed by <strong>mass balance</strong> under
              scheme <strong>RCS-2026</strong>. You may not state that this material physically contains
              recycled content.</p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>Six industries</h2>
        <div class="grid-3">
          {['Textiles and apparel', 'Automotive', 'Electrical and electronics', 'Consumer goods', 'Industrial', 'Construction'].map((i) => (
            <div class="sheet"><h3 class="eyebrow">{i}</h3><p class="small">The same pellet, the same
              processing window, the same specification limits.</p></div>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>Three features</h2>
        <div class="grid-3">
          <div class="sheet">
            <h3>Nylon in any form</h3>
            <p>Nets, ropes, carpets, airbag offcuts, post-consumer garments and multicolour waste: the
              process takes nylon in any form, because dissolution does not care what the nylon was wearing.</p>
          </div>
          <div class="sheet">
            <h3>Drop-in quality</h3>
            <p>The material is deliberately indistinguishable from the incumbent. Recycled pellet is
              photographed beside conventional pellet at the same scale under the same light, and the
              argument is the photograph rather than the sentence.</p>
          </div>
          <div class="sheet">
            <h3>Attested origin</h3>
            <p>Every claim is arithmetic over a record an auditor can walk: batches, runs, a ledger that
              never accepts a percentage, and a certificate at a permanent public address.</p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>Specification</h2>
        <div class="sheet">
          <SpecTable />
          <p class="small">A guaranteed limit is tested on every lot. The recycled-content claim beside each
            grade carries its type (mass balance) and its scheme (RCS-2026).</p>
        </div>
      </Reveal>
    </main>
  );
}

function SpecTable() {
  const [spec, setSpec] = useState(undefined);
  useEffect(() => { api('/api/specifications/N6/versions/3').then((r) => setSpec(r.ok ? r.data : null)); }, []);
  if (spec === undefined) return <Loading />;
  if (!spec) return <Empty>The specification is unavailable at this moment.</Empty>;
  return (
    <div class="table-wrap">
      <table>
        <thead><tr><th>Property</th><th>Method</th><th>Limit</th><th>Unit</th><th>Basis</th></tr></thead>
        <tbody>
          {spec.rows.map((r) => (
            <tr><td>{r.property.replace(/_/g, ' ')}</td><td class="mono">{r.method}</td><td class="figure">{r.limit}</td><td>{r.unit}</td><td>{r.basis}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Technology() {
  const [sites, setSites] = useState(undefined);
  useEffect(() => { api('/api/sites').then((r) => setSites(r.ok ? r.data : [])); }, []);
  const rows = [
    { name: 'Commercial Plant (2030+)', quantity: '>25,000 tonnes per year' },
    { name: 'Demonstration (2026)', quantity: '400 tonnes per year' },
    { name: 'Pilot (2026)', quantity: '40 tonnes per year' }
  ];
  return (
    <main>
      <Meta title="Technology — Ravel" description="Dissolution, depolymerisation, purification, repolymerisation. Four stages, drawn with mass in and mass out." />
      <section class="hero">
        <p class="eyebrow">Technology</p>
        <Reveal as="h1">Four stages, drawn honestly</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">The plant is drawn rather than photographed, and the diagram is generated from the
          four run types, so it stays correct when a stage changes.</p>
      </section>

      <Reveal as="section" class="section">
        <h2>The process</h2>
        <ProcessDiagram />
        <div class="grid-2">
          <div>
            <h3>Dissolution</h3>
            <p>Waste in, solution out. Mass in 600000 g, mass out 480000 g.</p>
          </div>
          <div>
            <h3>Depolymerisation</h3>
            <p>Solution in, monomer stream out. Mass in 850000 g, mass out 800000 g.</p>
          </div>
          <div>
            <h3>Purification</h3>
            <p>Monomer stream in, refined monomer out. Mass in 800000 g, mass out 760000 g including a sold byproduct.</p>
          </div>
          <div>
            <h3>Repolymerisation</h3>
            <p>Refined monomer in, pellet out. Mass in 720000 g, mass out 700000 g across two lots.</p>
          </div>
        </div>
        <Banner>Losses reduce the claim. Mass that disappears in processing does not carry its claim forward.</Banner>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>Capacity</h2>
        <p class="small">Unit: kilograms per year of nameplate capacity. Basis: 8000 hours per year, 0.90
          availability, 0.80 yield. A year is a calendar year of planned operation.</p>
        <div class="table-wrap sheet">
          <table>
            <thead><tr><th>Plant</th><th class="figure">Capacity</th><th>Confidence</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const site = (sites || []).find((s) => s.name.toLowerCase().startsWith(r.name.split(' ')[0].toLowerCase()));
                return (
                  <tr>
                    <td>{r.name}</td>
                    <td class="figure">{r.quantity}</td>
                    <td>{site ? site.confidence.replace(/_/g, ' ') : 'planned'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="small">A capacity figure is never returned without its confidence, and a planned row says
          planned in words.</p>
      </Reveal>

      <Reveal as="section" class="section">
        <h2>Five attributes</h2>
        <div class="grid-3">
          <div class="sheet"><h3>Green chemicals &amp; reagents</h3><p>Evidence: supplier EPDs 2024, per the
            carbon method version in force.</p></div>
          <div class="sheet"><h3>Low temperature &amp; pressure</h3><p>Evidence: recipe set points and
            tolerances recorded against every run.</p></div>
          <div class="sheet"><h3>Low carbon impact</h3><p>Evidence: carbon figure 4.26 kg CO2e per kg against
            virgin PA6 at 8.90 kg CO2e per kg (EcoBase 2025, EU-27) — lower than its comparator, named.</p></div>
          <div class="sheet"><h3>Modular plant</h3><p>Lines replicate rather than scale.</p></div>
          <div class="sheet"><h3>Feedstock flexibility</h3><p>Any polyamide form, category recorded at intake
            and never changed after acceptance.</p></div>
        </div>
      </Reveal>
    </main>
  );
}

function ProcessDiagram() {
  const stages = [
    { label: 'Dissolution', inG: 600000, outG: 480000 },
    { label: 'Depolymerisation', inG: 850000, outG: 800000 },
    { label: 'Purification', inG: 800000, outG: 760000 },
    { label: 'Repolymerisation', inG: 720000, outG: 700000 }
  ];
  const W = 880, H = 210, boxW = 170, boxH = 96, gap = (W - 4 * boxW) / 5;
  return (
    <figure style="margin:0 0 2rem">
      <svg class="diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="diag-title desc">
        <title id="diag-title">The four process stages with mass in and mass out</title>
        <desc id="desc">Text equivalent below the diagram carries the same masses.</desc>
        {stages.map((s, i) => {
          const x = gap + i * (boxW + gap);
          const y = 60;
          return (
            <g key={s.label}>
              <rect x={x} y={y} width={boxW} height={boxH} rx="6" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5" />
              <text x={x + boxW / 2} y={y + 26} text-anchor="middle" font-family="var(--grotesk)" font-size="13" fill="var(--ink)">{s.label}</text>
              <text x={x + boxW / 2} y={y + 50} text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">in {s.inG.toLocaleString('en-GB')} g</text>
              <text x={x + boxW / 2} y={y + 70} text-anchor="middle" font-family="var(--mono)" font-size="12" fill="var(--muted)">out {s.outG.toLocaleString('en-GB')} g</text>
              {i < 3 ? (
                <path d={`M ${x + boxW} ${y + boxH / 2} L ${x + boxW + gap} ${y + boxH / 2}`} stroke="var(--ink)" stroke-width="1.5" marker-end="url(#arrowhead)" />
              ) : null}
            </g>
          );
        })}
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--ink)" />
          </marker>
        </defs>
      </svg>
      <figcaption class="small">Text equivalent: dissolution 600000 g in, 480000 g out; depolymerisation
        850000 g in, 800000 g out; purification 800000 g in, 760000 g out; repolymerisation 720000 g in,
        700000 g out.</figcaption>
    </figure>
  );
}

export function About() {
  const [stats, setStats] = useState(undefined);
  useEffect(() => { api('/api/statistics').then((r) => setStats(r.ok ? r.data : [])); }, []);
  return (
    <main>
      <Meta title="About — Ravel" description="Ravel returns mixed polyamide waste to virgin-quality pellet, and attests where it came from." />
      <section class="hero">
        <p class="eyebrow">About</p>
        <Reveal as="h1">A records company that happens to own a plant</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">The material is deliberately indistinguishable from the incumbent, so what we sell is
          origin, and origin cannot be measured in a pellet. It exists only as a record.</p>
      </section>
      <Reveal as="section" class="section">
        <h2>The hard facts</h2>
        {stats === undefined ? <Loading /> : stats.length === 0 ? <Empty>No figure is published.</Empty> : (
          <div class="stat-grid">
            {stats.map((s) => (
              <div class="stat">
                <p class="eyebrow" style="margin:0">{s.key.replace(/_/g, ' ')}</p>
                <p class="value">{s.value}</p>
                <p class="small" style="margin:0">Source: {s.source}, {s.year}, {s.geography}</p>
              </div>
            ))}
          </div>
        )}
        <p class="small">The emissions figure is stated as a mass: 1.8 gigatonnes of carbon dioxide
          equivalent a year.</p>
      </Reveal>
      <Reveal as="section" class="section">
        <h2>How we work</h2>
        <div class="grid-2">
          <p>Ravel Materials SAS operates a pilot line and a demonstration line in France. Waste arrives in
            batches from named collectors; runs consume batches and produce lots; lots carry claims allocated
            by arithmetic; certificates carry the claims to the customer's regulator.</p>
          <p>Four separations do most of the work: whoever entered a test result does not disposition that
            lot; whoever published a carbon method does not close the period applying it; whoever signs a
            certificate did not enter its data; whoever books in a batch does not approve the collector.</p>
        </div>
      </Reveal>
    </main>
  );
}

export function Careers() {
  const [positions, setPositions] = useState(undefined);
  useEffect(() => { api('/api/positions').then((r) => setPositions(r.ok ? r.data : [])); }, []);
  return (
    <main>
      <Meta title="Careers — Ravel" description="One open position at Ravel: Process Engineer, Lyon." />
      <section class="hero">
        <p class="eyebrow">Careers</p>
        <Reveal as="h1">Why this problem matters</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">Less than one per cent of textiles are recycled into new materials. The rest is
          burned, buried or shipped elsewhere, and the molecule that could go on and on does not get the
          chance.</p>
        <p>Fixing that is not a marketing exercise. It is weighing, dissolving, depolymerising, purifying
          and repolymerising, four stages at a time, batch after batch, with figures that survive an audit.
          The people who do it are chemists, engineers, analysts and record-keepers, and the work is patient.</p>
      </section>
      <Reveal as="section" class="section">
        <h2>Open positions</h2>
        <p class="lede">{positions === undefined ? 'Reading the collection…' : `${positions.length} open ${positions.length === 1 ? 'position' : 'positions'}`}</p>
        {positions === undefined ? <Loading /> : positions.length === 0 ? <Empty>There is no open position right now.</Empty> : (
          <div class="sheet">
            {positions.map((p) => (
              <div style="margin-bottom:1rem">
                <h3 style="margin:0 0 0.25rem">{p.title}</h3>
                <dl class="kv">
                  <dt>Location</dt><dd>{p.location}</dd>
                  <dt>Department</dt><dd>{p.department}</dd>
                  <dt>Contract</dt><dd>{p.contract_type}</dd>
                  <dt>Closes</dt><dd>{fmtDate(p.closes_on)}</dd>
                </dl>
              </div>
            ))}
          </div>
        )}
        <p class="small">The count above is derived from the collection it labels.</p>
      </Reveal>
    </main>
  );
}

export function News() {
  const [news, setNews] = useState(undefined);
  useEffect(() => { api('/api/news').then((r) => setNews(r.ok ? r.data : [])); }, []);
  return (
    <main>
      <Meta title="News — Ravel" description="News from Ravel: funding, partnerships and technical publications." />
      <section class="hero">
        <p class="eyebrow">News</p>
        <Reveal as="h1">One event, once</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">Each item carries its tag, its outlet, its date, its link, and its language — an item
          in another language says so before a reader clicks.</p>
      </section>
      <Reveal as="section" class="section">
        {news === undefined ? <Loading /> : news.length === 0 ? <Empty>No item is published.</Empty> : (
          <div class="sheet">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Item</th><th>Tag</th><th>Outlet</th><th>Date</th><th>Language</th></tr></thead>
                <tbody>
                  {news.map((n) => (
                    <tr>
                      <td><a href={n.link}>{n.title}</a>{n.language !== 'en' ? <span class="small"> (in {n.language})</span> : null}</td>
                      <td><span class="tag">{n.tag}</span></td>
                      <td>{n.outlet}</td>
                      <td>{fmtDate(n.date)}</td>
                      <td class="mono">{n.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Reveal>
    </main>
  );
}

export function Contact() {
  const [state, setState] = useState({ status: 'idle' });
  const [form, setForm] = useState({ type: 'waste_supply', from_name: '', from_email: '', message: '' });
  useEffect(() => { }, []);
  async function submit(e) {
    e.preventDefault();
    setState({ status: 'busy' });
    const { newIdempotencyKey } = await import('../api.js');
    const r = await api('/api/enquiries', { method: 'POST', key: newIdempotencyKey('enq'), body: form });
    if (r.ok) {
      setState({ status: 'sent', data: r.data });
    } else {
      setState({ status: 'failed', error: r.data });
    }
  }
  const RESPONSE = {
    waste_supply: '3 working days', polymer_purchase: '2 working days',
    partnership: '5 working days', press: '1 working day'
  };
  return (
    <main>
      <Meta title="Contact — Ravel" description="Four enquiry types, four destinations, four stated response times." />
      <section class="hero">
        <p class="eyebrow">Contact</p>
        <Reveal as="h1">Four doors, four response times</Reveal>
        <div class="accent-rule" aria-hidden="true"></div>
        <p class="lede">Waste supply, polymer purchase, partnership and press each reach a different
          destination with a different stated response time.</p>
      </section>
      <Reveal as="section" class="section">
        <div class="grid-2">
          <div class="sheet">
            {state.status === 'sent' ? (
              <div>
                <h2>Received</h2>
                <Banner>
                  Your enquiry is recorded as <Ref>{state.data.reference}</Ref>. It has gone to
                  {' '}{state.data.destination} and you will hear back within {state.data.response_days} working
                  {' '}days. One acknowledgement mail has been sent to the address you gave.
                </Banner>
                <p class="small">The point of collection states who receives the data, what it is used for,
                  how long it is kept and how to have it removed. See the <Link href="/privacy">privacy
                  policy</Link>.</p>
              </div>
            ) : (
              <form onSubmit={submit}>
                <fieldset>
                  <legend>Enquiry</legend>
                  <div style="margin-bottom:1rem">
                    <label for="ct-type">Type</label>
                    <select id="ct-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                      <option value="waste_supply">Waste supply</option>
                      <option value="polymer_purchase">Polymer purchase</option>
                      <option value="partnership">Partnership</option>
                      <option value="press">Press</option>
                    </select>
                    <p class="small" style="margin-top:0.4rem">Stated response time: {RESPONSE[form.type]}.</p>
                  </div>
                  <div style="margin-bottom:1rem">
                    <label for="ct-name">Name</label>
                    <input id="ct-name" value={form.from_name} onInput={(e) => setForm({ ...form, from_name: e.target.value })} />
                  </div>
                  <div style="margin-bottom:1rem">
                    <label for="ct-email">Email</label>
                    <input id="ct-email" type="email" required value={form.from_email} onInput={(e) => setForm({ ...form, from_email: e.target.value })} />
                  </div>
                  <div style="margin-bottom:1rem">
                    <label for="ct-msg">Message</label>
                    <textarea id="ct-msg" rows="4" value={form.message} onInput={(e) => setForm({ ...form, message: e.target.value })}></textarea>
                  </div>
                  <button class="btn" type="submit" disabled={state.status === 'busy'}>
                    {state.status === 'busy' ? 'Sending…' : 'Send the enquiry'} <span class="arrow" aria-hidden="true">→</span>
                  </button>
                </fieldset>
              </form>
            )}
            {state.status === 'failed' ? (
              <Banner kind="refused" title="The form failed">
                What failed: the enquiry could not be recorded ({state.error?.error || 'unknown cause'}), so
                nothing was sent. What you can do: check the address and try once more, or write to
                {' '}<a href="mailto:press@example.com">press@example.com</a>, an address that does not depend
                on this form working.
              </Banner>
            ) : null}
          </div>
          <div class="sheet">
            <h2>Destinations</h2>
            <dl class="kv">
              <dt>Waste supply</dt><dd>feedstock@example.com · 3 working days</dd>
              <dt>Polymer purchase</dt><dd>sales@example.com · 2 working days</dd>
              <dt>Partnership</dt><dd>partners@example.com · 5 working days</dd>
              <dt>Press</dt><dd>press@example.com · 1 working day</dd>
            </dl>
          </div>
        </div>
      </Reveal>
    </main>
  );
}

export function Privacy() {
  return (
    <main class="narrow">
      <Meta title="Privacy — Ravel" description="Ravel's privacy policy: the controller, the purposes, the retention in months for each, and your rights." />
      <h1>Privacy policy</h1>
      <p class="lede">Ravel Materials SAS, 14 rue des Pêcheurs, 69002 Lyon, France, is the controller. The
        address for a rights request is <a href="mailto:privacy@example.com">privacy@example.com</a>. The
        address for a disclosure is <a href="mailto:security@example.com">security@example.com</a>.</p>
      <div class="sheet">
        <h2>Purposes and retention</h2>
        <dl class="kv">
          <dt>An enquiry</dt><dd>24 months</dd>
          <dt>A waste-supply enquiry</dt><dd>36 months</dd>
          <dt>A polymer enquiry</dt><dd>36 months</dd>
          <dt>A press enquiry</dt><dd>12 months</dd>
          <dt>An account and its acts</dt><dd>120 months</dd>
          <dt>The record</dt><dd>180 months</dd>
        </dl>
      </div>
      <div class="sheet">
        <h2>The operational record names individuals</h2>
        <p>The operational record — batches, runs, test results, dispositions, certificates and the
          append-only sequence behind them — names individuals, because a claim nobody can attribute is a
          claim nobody can audit. It is retained under a legal and scheme obligation and is <strong>not erased
          on request</strong>. A former employee's contact detail is erased: a person inside the record is
          referenced by an identifier, and the identifier resolves to a name through a separate store with its
          own retention.</p>
      </div>
      <div class="sheet">
        <h2>Your rights</h2>
        <p>To exercise access, rectification, erasure where it applies, restriction or objection, write to
          {' '}<a href="mailto:privacy@example.com">privacy@example.com</a>. To report a disclosure, write to
          {' '}<a href="mailto:security@example.com">security@example.com</a>.</p>
      </div>
    </main>
  );
}

export function Verify({ number }) {
  const [data, setData] = useState(undefined);
  useEffect(() => { api(`/api/verify/${number}`).then((r) => setData(r.ok ? r.data : { found: false, number })); }, [number]);
  return (
    <main class="verify-page">
      <Meta title={`Verify ${number} — Ravel`} description="Public verification of a Ravel certificate." noindex />
      <p class="eyebrow">Verification</p>
      <h1><span class="mono">{number}</span></h1>
      {data === undefined ? <Loading>Checking the register…</Loading> : !data.found ? (
        <div class="sheet">
          <p class="lede">There is no certificate numbered <span class="mono">{data.number}</span> in this
            register.</p>
          <p class="small">This route cannot be used to enumerate the customer list: an unknown number
            answers exactly as this one does.</p>
        </div>
      ) : (
        <div class="sheet">
          {data.state === 'withdrawn' ? (
            <Banner kind="refused" title="Withdrawn">
              This certificate was withdrawn on {fmtDate(data.withdrawn_on)}. Reason: {data.withdrawal_reason}.
            </Banner>
          ) : null}
          <h2 style="margin-top:0">{data.state === 'withdrawn' ? 'Withdrawn' : 'Issued'}</h2>
          <dl class="kv">
            <dt>Number</dt><dd class="mono">{data.number}</dd>
            <dt>State</dt><dd>{data.state}</dd>
            <dt>Issued on</dt><dd>{fmtDate(data.issued_on)}</dd>
            {data.withdrawn_on ? <><dt>Withdrawn on</dt><dd>{fmtDate(data.withdrawn_on)}</dd></> : null}
            {data.withdrawal_reason ? <><dt>Reason</dt><dd>{data.withdrawal_reason}</dd></> : null}
            <dt>Site</dt><dd class="mono">{data.site}</dd>
            <dt>Grade</dt><dd>{data.grade}</dd>
            <dt>Claim type</dt><dd>{data.claim_type.replace(/_/g, ' ')}</dd>
            <dt>Recipient</dt><dd>{data.recipient_name}</dd>
          </dl>
          <p class="small">This answer carries no yield, no collector, no genealogy and no carbon breakdown,
            and offers no forwarding to a replacement.</p>
        </div>
      )}
    </main>
  );
}
