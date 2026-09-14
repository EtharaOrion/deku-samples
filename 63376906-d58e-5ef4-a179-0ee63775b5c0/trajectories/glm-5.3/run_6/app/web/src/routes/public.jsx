import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { Link } from '../lib/router.jsx';
import { useDoc, Reveal, fmtBpShort, fmtKg, fmtDate, claimWord } from '../lib/ui.jsx';

function Public({ title, desc, children, noindex }) {
  useDoc(title, desc, { noindex });
  return <main id="main" class="page public">{children}</main>;
}

export function Home() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/statistics').then((r) => setStats(r.body || [])); }, []);
  return (
    <Public title="Ravel — Tomorrow's materials, made from today's waste"
      description="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.">
      <section class="hero measure">
        <p class="eyebrow">Chemical recycling, Lyon and Antwerp</p>
        <Reveal as="h1" class="">Tomorrow's materials. Made from today's waste.</Reveal>
        <p class="big">Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.</p>
        <p><Link class="btn" href="/product">See the product</Link> <Link class="btn-quiet" href="/technology">How it works</Link></p>
      </section>
      <section class="measure">
        <h3>Nylon that goes on and on and on</h3>
        <p>Nylon 6 is unusual among plastics: it can be depolymerised back to its own monomer and rebuilt, without limit to the number of journeys. A fishing net that has spent a decade at sea can become, after our process, a polymer indistinguishable from one made from crude oil. The material does not degrade. What degrades is the record of where it came from, and that is the part we take care of.</p>
        <h3>The power of green chemistry</h3>
        <p>Our process runs at low temperature and low pressure, in water, with a fraction of the energy of conventional polyamide production. It is quiet, unremarkable engineering: vessels, filters, a crystalliser. There is no flame, no roar, no sacrifice of one place's air for another place's product.</p>
        <h3>We're closing the loop</h3>
        <p>Waste arrives from named collectors. It is weighed, sampled, dissolved, depolymerised, purified and repolymerised. Every lot that leaves carries a record of what it came from, what it emitted, and what the buyer may say about it. We publish the numbers behind those records, with their sources and their years, because a claim that cannot be checked is a claim nobody should make.</p>
        <div class="stat-row">
          {(stats || []).map((s) => (
            <div class="card" key={s.key}>
              <p class="eyebrow">{s.geography}</p>
              <p class="big">{s.value}</p>
              <p class="dep">Source: {s.source}, {s.year}, {s.geography}</p>
            </div>
          ))}
          {!stats && <p class="loading-words">The published figures are loading.</p>}
        </div>
      </section>
    </Public>
  );
}

const GRADES = [
  {
    grade: 'Nylon 6', ref: 'N6',
    limitation: 'Recycled Nylon 6 came almost entirely from one source: discarded fishing nets.',
    claim: 'Mass balance, RCS-2026 scheme', claimType: 'mass_balance', contentBp: 9000
  },
  {
    grade: 'Nylon 6,6', ref: 'N66',
    limitation: 'Nylon 6,6 had no recycling solution at all.',
    claim: 'Mass balance, RCS-2026 scheme', claimType: 'mass_balance', contentBp: 0
  }
];

export function Product() {
  return (
    <Public title="Product — Same material. Better origin. | Ravel"
      description="We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.">
      <section class="hero measure">
        <p class="eyebrow">Two grades, one standard</p>
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <p class="big">We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise.</p>
      </section>
      <section class="measure">
        <h3>The grades</h3>
        <div class="steps">
          {GRADES.map((g) => (
            <div class="card" key={g.ref}>
              <p class="eyebrow">Grade {g.ref}</p>
              <h4>{g.grade}</h4>
              <p><strong>Its limitation, stated first.</strong> {g.limitation}</p>
              <p>What it is now: a virgin-quality polyamide pellet, produced by chemical recycling, meeting the same specification as its incumbent.</p>
              <p class="figure-block">
                <span class="big num">{fmtBpShort(g.contentBp)}</span>
                <span class="dep">Recycled content, claim type: <strong>{claimWord(g.claimType)}</strong>, {g.claim}</span>
              </p>
              <p class="dep">This material is claimed by mass balance. It is not physically segregated.</p>
            </div>
          ))}
        </div>
        <h3>Six industries</h3>
        <ul>
          <li>Textiles and apparel</li>
          <li>Automotive</li>
          <li>Electrical and electronics</li>
          <li>Consumer goods</li>
          <li>Industrial</li>
          <li>Construction</li>
        </ul>
        <h3>What the material does</h3>
        <div class="steps">
          <div class="card">
            <h4>Nylon in any form</h4>
            <p>Fishing net, carpet, airbag offcut, spinning waste: the chemistry accepts them all, because the process works on the polymer rather than on the shape it arrived in.</p>
          </div>
          <div class="card">
            <h4>Virgin-quality output</h4>
            <p>The pellet meets the same guaranteed specification as virgin polyamide: relative viscosity, moisture, ash. The specification is published, not implied.</p>
          </div>
          <div class="card">
            <h4>A record with every lot</h4>
            <p>Each lot carries what it came from and what it emitted, allocated by arithmetic, on a certificate a customer can file with their own regulator.</p>
          </div>
        </div>
      </section>
      <section class="measure">
        <h3>The specification</h3>
        <div class="table-wrap card">
          <table>
            <caption class="eyebrow">Specification SPEC-N6 version 3, issued 2026-02-01. Virgin reference: virgin PA6 at relative viscosity 2.42, source EcoBase 2025, dated 2025-11-30.</caption>
            <thead><tr><th>Property</th><th>Method</th><th>Limit</th><th>Unit</th><th>Basis</th></tr></thead>
            <tbody>
              <tr><td>relative_viscosity</td><td>ISO 307</td><td class="num">2.40</td><td>ratio</td><td>guaranteed</td></tr>
              <tr><td>moisture</td><td>ISO 15512</td><td class="num">0.10</td><td>percent</td><td>guaranteed</td></tr>
              <tr><td>yellowness_index</td><td>ASTM E313</td><td class="num">8.0</td><td>index</td><td>typical</td></tr>
              <tr><td>ash_content</td><td>ISO 3451-1</td><td class="num">0.30</td><td>percent</td><td>informational</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </Public>
  );
}

const STAGES = [
  { name: 'Dissolution', run_type: 'dissolution', massIn: 300000, massOut: 480000, note: 'Nylon is dissolved away from contamination: elastane, dyes, cotton, sand.' },
  { name: 'Depolymerisation', run_type: 'depolymerisation', massIn: 850000, massOut: 800000, note: 'The dissolved polymer is broken back to caprolactam, its own monomer.' },
  { name: 'Purification', run_type: 'purification', massIn: 800000, massOut: 720000, note: 'The monomer is distilled and treated until it meets polymerisation grade.' },
  { name: 'Repolymerisation', run_type: 'repolymerisation', massIn: 720000, massOut: 700000, note: 'The clean monomer is rebuilt into virgin-quality pellet.' }
];


export function Technology() {
  return (
    <Public title="Technology — Dissolution, Depolymerisation, Purification, Repolymerisation | Ravel"
      description="Four process stages turn mixed polyamide waste back into virgin-quality pellet at low temperature and low pressure.">
      <section class="hero measure">
        <p class="eyebrow">The process</p>
        <Reveal as="h1">Four stages, one plant</Reveal>
        <p class="big">Dissolution, Depolymerisation, Purification, Repolymerisation. Each stage is a run, each run is recorded after the fact, and the diagram below is generated from those run types.</p>
      </section>
      <section class="measure">
        <h3>The plant, drawn from the record</h3>
        <div class="plant-diagram">
          <div class="steps">
            {STAGES.map((st, i) => (
              <div class="card" key={st.run_type}>
                <p class="eyebrow">Stage {i + 1} of 4</p>
                <h4>{st.name}</h4>
                <p>{st.note}</p>
                <p class="figure-block">
                  <span class="num">mass in {st.massIn.toLocaleString('en-GB')} g</span>
                  <span class="dep"> — </span>
                  <span class="num">mass out {st.massOut.toLocaleString('en-GB')} g</span>
                </p>
              </div>
            ))}
          </div>
          <p class="dep">Text equivalent: dissolution 300000 g in and 480000 g out; depolymerisation 850000 g in and 800000 g out; purification 800000 g in and 720000 g out; repolymerisation 720000 g in and 700000 g out. Losses reduce the claim.</p>
        </div>
        <h3>Capacity</h3>
        <div class="table-wrap card">
          <table>
            <caption class="eyebrow">Capacity stated in tonnes per year. Basis: 8000 hours per year, 0.90 availability, 0.80 yield. The year is a calendar year of operation at that basis.</caption>
            <thead><tr><th>Plant</th><th>Capacity</th><th>Confidence</th></tr></thead>
            <tbody>
              <tr><td>Pilot (2026)</td><td class="num">40 tonnes per year</td><td>commissioned</td></tr>
              <tr><td>Demonstration (2026)</td><td class="num">400 tonnes per year</td><td>commissioned</td></tr>
              <tr><td>Commercial Plant (2030+)</td><td class="num">&gt;25,000 tonnes per year</td><td>planned</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Five attributes</h3>
        <div class="steps">
          <div class="card"><h4>Green chemicals &amp; reagents</h4><p>Evidence: supplier environmental product declarations for every reagent, recorded against the carbon method version CM-PA6 v2.</p></div>
          <div class="card"><h4>Low temperature &amp; pressure</h4><p>Evidence: recipe set points and the achieved values recorded by the control system, held on every run record.</p></div>
          <div class="card"><h4>Low carbon impact</h4><p>Evidence: the carbon figure for each lot, computed against CM-PA6 v2 and compared with virgin PA6 from the EcoBase 2025 dataset, EU-27.</p></div>
          <div class="card"><h4>Closed water circuit</h4><p>Process water is treated and returned to the circuit.</p></div>
          <div class="card"><h4>No incineration of input</h4><p>What cannot be dissolved leaves as a recorded byproduct with a destination, not as an emission.</p></div>
        </div>
      </section>
    </Public>
  );
}

export function About() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api('/api/statistics').then((r) => setStats(r.body || [])); }, []);
  return (
    <Public title="About — The hard facts | Ravel" description="Ravel Materials SAS. Chemical recycling of polyamide, from Lyon and Antwerp.">
      <section class="hero measure">
        <p class="eyebrow">Ravel Materials SAS</p>
        <Reveal as="h1">A plant, a ledger and a certificate</Reveal>
        <p class="big">We return mixed polyamide waste to virgin-quality pellet, and we keep the record that makes the claim possible.</p>
      </section>
      <section class="measure">
        <h3>The hard facts</h3>
        <div class="stat-row">
          {(stats || []).map((s) => (
            <div class="card" key={s.key}>
              <p class="big">{s.value}</p>
              <p class="dep">Source: {s.source}, {s.year}, {s.geography}</p>
            </div>
          ))}
          {!stats && <p class="loading-words">The published figures are loading.</p>}
        </div>
        <p>Of the three figures above, the emissions figure is stated as a mass: 1.8 gigatonnes of carbon dioxide equivalent a year, globally, from plastics production.</p>
        <h3>How we are organised</h3>
        <p>Ravel operates a pilot line and a demonstration plant, both certified against RCS-2026, and is building a commercial plant in Antwerp. The company is Ravel Materials SAS, registered in Lyon.</p>
      </section>
    </Public>
  );
}

export function Careers() {
  const [positions, setPositions] = useState(null);
  useEffect(() => { api('/api/positions').then((r) => setPositions(r.body || [])); }, []);
  const count = positions ? positions.length : null;
  return (
    <Public title="Careers — Why this problem matters | Ravel" description="Open roles at Ravel.">
      <section class="hero measure">
        <p class="eyebrow">Careers</p>
        <Reveal as="h1">Why this problem matters</Reveal>
        <p class="big">Less than 1 per cent of textiles are recycled into new materials. The rest is landfilled, incinerated, or shipped somewhere else and counted as someone else's problem.</p>
        <p>Polyamide is the polymer in fishing nets, carpets, airbags and technical yarn. It is also one of the few that can be taken back to its own monomer and rebuilt without limit. The work is not glamorous: vessels, filters, a crystalliser, and a ledger that has to be right. It is done by process engineers, analysts, quality managers and claims managers who would rather be audited than believed.</p>
      </section>
      <section class="measure">
        <h3>Open positions</h3>
        {positions === null && <p class="loading-words">The open positions are loading.</p>}
        {positions && positions.length === 0 && <p class="empty-words">There are no open positions right now.</p>}
        {positions && positions.length > 0 && (
          <>
            <p>{count === 1 ? 'There is 1 open position.' : `There are ${count} open positions.`}</p>
            <div class="table-wrap card">
              <table>
                <thead><tr><th>Title</th><th>Location</th><th>Department</th><th>Contract</th><th>Closes</th></tr></thead>
                <tbody>
                  {positions.map((p2) => (
                    <tr key={p2.id}>
                      <td>{p2.title}</td><td>{p2.location}</td><td>{p2.department}</td>
                      <td>{p2.contract_type}</td><td class="num">{fmtDate(p2.closes_on)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </Public>
  );
}

export function News() {
  const [items, setItems] = useState(null);
  useEffect(() => { api('/api/news').then((r) => setItems(r.body || [])); }, []);
  return (
    <Public title="News | Ravel" description="News from Ravel, one event listed once with its coverage.">
      <section class="hero measure">
        <p class="eyebrow">News</p>
        <Reveal as="h1">News</Reveal>
        <p class="big">One event appears once, with its coverage. An item in another language says so before you click.</p>
      </section>
      <section class="measure">
        {items === null && <p class="loading-words">The news items are loading.</p>}
        {items && items.length === 0 && <p class="empty-words">There are no news items right now.</p>}
        <ul>
          {(items || []).map((n) => (
            <li key={n.id} class="card" style="">
              <p class="eyebrow">{n.tag}</p>
              <h4>{n.title}</h4>
              <p>
                {n.language !== 'en' && <span class="flag">In {n.language === 'fr' ? 'French' : n.language}. </span>}
                <a href={n.link} rel="noopener noreferrer">Coverage by {n.outlet}</a>
                <span class="dep"> — {fmtDate(n.published_on)}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </Public>
  );
}

export function Contact() {
  const [state, setState] = useState({ status: 'idle', ref: null, dest: null, days: null, error: null });
  const TYPES = [
    ['waste_supply', 'Waste supply', 'feedstock@example.com', '3 working days'],
    ['polymer_purchase', 'Polymer purchase', 'sales@example.com', '2 working days'],
    ['partnership', 'Partnership', 'partners@example.com', '5 working days'],
    ['press', 'Press', 'press@example.com', '1 working day']
  ];
  async function onSubmit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState({ status: 'sending', error: null });
    const body = {
      type: f.get('type'), name: f.get('name'), email: f.get('email'),
      organisation: f.get('organisation'), message: f.get('message')
    };
    const r = await api('/api/enquiries', { method: 'POST', body, idempotencyKey: 'enq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) });
    if (r.ok) {
      setState({ status: 'sent', ref: r.body.reference, dest: r.body.destination, days: r.body.response_days, error: null });
    } else {
      setState({ status: 'failed', error: (r.body && r.body.message) || 'The form could not be sent.', ref: null, dest: null, days: null });
    }
  }
  return (
    <Public title="Contact | Ravel" description="Four enquiry types, four destinations, four stated response times.">
      <section class="hero measure">
        <p class="eyebrow">Contact</p>
        <Reveal as="h1">Contact</Reveal>
        <p class="big">Four enquiry types, four destinations, four stated response times.</p>
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Enquiry type</th><th>Destination</th><th>Response time</th></tr></thead>
            <tbody>
              {TYPES.map(([v, label, dest, days]) => (
                <tr key={v}><td>{label}</td><td>{dest}</td><td>{days}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section class="measure">
        <h3>Send an enquiry</h3>
        <form class="stack" onSubmit={onSubmit}>
          <label>Type
            <select name="type" required>
              {TYPES.map(([v, label]) => <option value={v}>{label}</option>)}
            </select>
          </label>
          <label>Name <input type="text" name="name" required /></label>
          <label>Email <input type="email" name="email" required /></label>
          <label>Organisation <input type="text" name="organisation" /></label>
          <label>Message <textarea name="message" rows="5"></textarea></label>
          <p class="dep">The point of collection states who receives the data, what it is used for, how long it is kept and how to have it removed. See the <Link href="/privacy">privacy policy</Link>.</p>
          <button class="btn" type="submit">Send the enquiry</button>
        </form>
        {state.status === 'sending' && <p class="loading-words">The enquiry is being sent.</p>}
        {state.status === 'sent' && (
          <div class="banner" role="status">
            <p class="banner-title">Enquiry {state.ref} received.</p>
            <p>What happens next: your enquiry has gone to {state.dest}, and you will receive an answer within {state.days} working days. A confirmation has been sent to the address you gave.</p>
          </div>
        )}
        {state.status === 'failed' && (
          <div class="banner" role="alert">
            <p class="banner-title">The enquiry could not be sent.</p>
            <p>What failed: {state.error}</p>
            <p>What you can do: check the address you entered and try again, or write to us at <a href="mailto:press@example.com">press@example.com</a>, which does not depend on this form working.</p>
          </div>
        )}
      </section>
    </Public>
  );
}

export function Privacy() {
  return (
    <Public title="Privacy | Ravel" description="Ravel's privacy policy: what is collected, why, for how long, and how to have it removed.">
      <section class="hero measure">
        <p class="eyebrow">Privacy</p>
        <Reveal as="h1">Privacy policy</Reveal>
        <p class="big">Ravel Materials SAS is the controller. Postal address: 12 rue de la Récupération, 69003 Lyon, France.</p>
      </section>
      <section class="measure">
        <h3>Who receives your data, and for what</h3>
        <p>Enquiries are received by the destination for their type: waste supply at feedstock@example.com, polymer purchase at sales@example.com, partnership at partners@example.com, press at press@example.com. The address for a rights request is <a href="mailto:privacy@example.com">privacy@example.com</a>. The disclosure address is <a href="mailto:security@example.com">security@example.com</a>.</p>
        <h3>Retention, stated in months, for every purpose</h3>
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Purpose</th><th>Retention</th></tr></thead>
            <tbody>
              <tr><td>An enquiry</td><td class="num">24 months</td></tr>
              <tr><td>A waste-supply enquiry</td><td class="num">36 months</td></tr>
              <tr><td>A polymer enquiry</td><td class="num">36 months</td></tr>
              <tr><td>A press enquiry</td><td class="num">12 months</td></tr>
              <tr><td>An account and its acts</td><td class="num">120 months</td></tr>
              <tr><td>The record</td><td class="num">180 months</td></tr>
            </tbody>
          </table>
        </div>
        <h3>The operational record</h3>
        <p>Stated plainly: the operational record names individuals. It is retained under a legal and scheme obligation, and it is not erased on request. A former employee's contact detail is.</p>
        <h3>Your rights</h3>
        <p>To have personal data removed or corrected, write to <a href="mailto:privacy@example.com">privacy@example.com</a>. To report a security concern, write to <a href="mailto:security@example.com">security@example.com</a>.</p>
      </section>
    </Public>
  );
}

export function Verify({ params }) {
  const number = params[0];
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api(`/api/verify/${encodeURIComponent(number)}`).then((r) => { setData(r.body); setLoading(false); });
  }, [number]);
  return (
    <Public title={`Verify ${number} | Ravel`} description="Public verification of a Ravel certificate." noindex>
      <section class="hero measure">
        <p class="eyebrow">Certificate verification</p>
        <Reveal as="h1">Verify a certificate</Reveal>
        {loading && <p class="loading-words">The certificate is being checked.</p>}
        {!loading && data && !data.found && (
          <>
            <p class="big">There is no such certificate.</p>
            <p>No certificate with the number <span class="ref">{data.number}</span> exists at this address. Check the number and try again.</p>
          </>
        )}
        {!loading && data && data.found && (
          <>
            <p class="eyebrow">Certificate <span class="ref">{data.number}</span></p>
            {data.state === 'withdrawn' && (
              <div class="banner" role="status">
                <p class="banner-title">This certificate was withdrawn on {fmtDate(data.withdrawn_on)}. Reason: {data.withdrawal_reason}.</p>
                <p>The document remains readable at its address. This page does not forward to any replacement.</p>
              </div>
            )}
            {data.state !== 'withdrawn' && <p class="state-word">issued</p>}
            <dl class="kv">
              <dt>Issued on</dt><dd class="num">{fmtDate(data.issued_on)}</dd>
              <dt>Site</dt><dd class="ref">{data.site}</dd>
              <dt>Grade</dt><dd class="ref">{data.grade}</dd>
              <dt>Claim type</dt><dd>{claimWord(data.claim_type)}</dd>
              <dt>Recipient</dt><dd>{data.recipient_name}</dd>
            </dl>
          </>
        )}
      </section>
    </Public>
  );
}
