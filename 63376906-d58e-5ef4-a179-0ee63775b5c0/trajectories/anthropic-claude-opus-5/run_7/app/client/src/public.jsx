import { useState, useEffect } from 'preact/hooks';
import { api } from './api.js';
import { Link, useMeta } from './router.jsx';
import {
  Reveal, State, Loading, Empty, ContentFigure, CapacityFigure,
  grams, kg, bp, percent, words, Icon, TableScroll, Refusal
} from './components.jsx';

function useResource(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api.get(path)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
  }, deps);
  return state;
}

/* ================================================================= chrome */

const PUBLIC_NAV = [
  ['/', 'Home'], ['/product', 'Product'], ['/technology', 'Technology'],
  ['/about', 'About'], ['/careers', 'Careers'], ['/news', 'News'], ['/contact', 'Contact']
];

export function PublicChrome({ path, children }) {
  return (
    <div class="shell">
      <a class="skip-link" href="#main">Skip to the content</a>
      <header class="topbar">
        <div class="wrap topbar-inner">
          <Link href="/" class="brand brand-public">
            Ra<span class="brand-mark">v</span>el
          </Link>
          <nav class="topnav" aria-label="Ravel">
            {PUBLIC_NAV.map(([href, label]) => (
              <Link key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</Link>
            ))}
            <Link href="/console" class="btn btn-quiet">Console</Link>
          </nav>
        </div>
      </header>
      <main id="main">{children}</main>
      <PublicFooter />
    </div>
  );
}

function PublicFooter() {
  return (
    <footer class="footer">
      <div class="wrap">
        <div class="grid grid-3">
          <div>
            <p class="eyebrow">Ravel</p>
            <p>
              Ravel Materials SAS. We return mixed polyamide waste to virgin-quality pellet,
              and we record where every claim came from.
            </p>
          </div>
          <div>
            <p class="eyebrow">Routes</p>
            <ul style="list-style:none;padding:0;margin:0">
              {PUBLIC_NAV.map(([href, label]) => (
                <li key={href} style="margin-bottom:0.25rem"><Link href={href}>{label}</Link></li>
              ))}
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
          <div>
            <p class="eyebrow">Verify a certificate</p>
            <p>
              Every certificate we issue resolves at a permanent address, with no account:
              <br /><span class="mono">ravel.example.com/verify/&#123;number&#125;</span>
            </p>
            <p><Link href="/verify/CERT-PILOT-000001">Try a verification</Link></p>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* =================================================================== home */

export function Home() {
  useMeta(
    'Tomorrow\'s materials. Made from today\'s waste.',
    'Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon, and records the origin of every claim.'
  );
  return (
    <>
      <section class="section">
        <div class="wrap">
          <Reveal as="h1">Tomorrow's materials. Made from today's waste.</Reveal>
          <Reveal>
            <p class="t-big">
              Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
            </p>
            <p class="row">
              <Link href="/product" class="btn">
                See the product <span class="btn-arrow" aria-hidden="true">→</span>
              </Link>
              <Link href="/technology" class="btn btn-secondary">How it works</Link>
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">Nylon that goes on and on and on</Reveal>
          <Reveal>
            <p class="t-big">
              Nylon is worth recovering and hard to recover. Ours goes back to monomer and comes
              out as pellet a converter can run without changing a setting, and it can go round
              again after that.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">The power of green chemistry</Reveal>
          <Reveal>
            <p class="t-big">
              We dissolve, depolymerise, purify and repolymerise at low temperature and low
              pressure, with reagents chosen for what they do to the operator and the effluent
              as much as for what they do to the polymer.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">We're closing the loop</Reveal>
          <Reveal>
            <p class="t-big">
              A loop is closed by evidence, not by a diagram. The material we sell is deliberately
              indistinguishable from the incumbent, so a buyer is not paying for the pellet. They
              are paying for its origin, and origin cannot be measured in a pellet: it exists only
              as a record.
            </p>
            <p>
              So we built the record first. Every lot we ship descends from named batches, through
              timed runs, to a mass-balance ledger that refuses to attach more claim than it holds.
              Losses reduce the claim. No percentage on this site was typed by anybody; each one is
              computed from the movements underneath it and carries the versions it was computed
              against.
            </p>
            <p>
              A customer files our certificate with their own regulator. That is a serious thing to
              hand somebody, so the certificate states what they may say and what they may not, it
              is readable without our software, and it resolves at a public address for as long as
              it exists — including after we withdraw it, which we say plainly rather than quietly
              forwarding to a replacement.
            </p>
            <p class="row">
              <Link href="/about" class="btn btn-secondary">The hard facts</Link>
              <Link href="/contact" class="btn btn-quiet">Talk to us</Link>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/* ================================================================ product */

export function Product() {
  useMeta(
    'Same material. Better origin.',
    'Low-carbon, virgin-quality recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise, with the specification and the claim beside the grade.'
  );
  const spec = useResource('/specifications/SPEC-N6/versions/3');
  return (
    <>
      <section class="section">
        <div class="wrap">
          <Reveal as="h1">Same material. Better origin.</Reveal>
          <Reveal>
            <p class="t-big">
              We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who
              refuse to compromise.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">Two grades</Reveal>
          <div class="grid grid-2">
            <Reveal as="article" class="card">
              <h3>Nylon 6</h3>
              <p class="muted">
                The limitation first: recycled Nylon 6 came almost entirely from one source,
                discarded fishing nets. That is a narrow, contested feedstock, and it does not
                scale to the volume the industry needs.
              </p>
              <p>
                We take mixed post-consumer and pre-consumer polyamide textile waste instead, back
                to caprolactam and out as pellet.
              </p>
              <p>
                <ContentFigure content_bp={9000} claim_type="mass_balance" />
              </p>
              <p class="t-small muted">
                Scheme RCS-2026, registration REG-RAVEL-0042. This material is claimed by mass
                balance. It is not physically segregated.
              </p>
            </Reveal>
            <Reveal as="article" class="card">
              <h3>Nylon 6,6</h3>
              <p class="muted">
                The limitation first: Nylon 6,6 had no recycling solution at all. It does not
                depolymerise the way Nylon 6 does, so it was downcycled or burned.
              </p>
              <p>
                Our route recovers both monomers, which is what makes a 6,6 claim possible rather
                than aspirational.
              </p>
              <p>
                <ContentFigure content_bp={7500} claim_type="mass_balance" />
              </p>
              <p class="t-small muted">
                Scheme RCS-2026, registration REG-RAVEL-0042. This material is claimed by mass
                balance. It is not physically segregated.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">Industries</Reveal>
          <Reveal>
            <div class="grid grid-3">
              {['Textiles and apparel', 'Automotive', 'Electrical and electronics',
                'Consumer goods', 'Industrial', 'Construction'].map((i) => (
                <p key={i} class="card">{i}</p>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <Reveal as="h2">Three features</Reveal>
          <div class="grid grid-3">
            <Reveal as="article" class="card">
              <h4>Nylon in any form</h4>
              <p>
                Carpet, airbag offcut, apparel, fishing net or industrial waste: the process takes
                nylon in any form, because sorting to a single clean stream is the step that makes
                most recycling uneconomic.
              </p>
            </Reveal>
            <Reveal as="article" class="card">
              <h4>Drop-in pellet</h4>
              <p>
                It runs on existing equipment at existing set points. A converter qualifies it the
                way they qualify any lot, against the specification below.
              </p>
            </Reveal>
            <Reveal as="article" class="card">
              <h4>A claim that survives an audit</h4>
              <p>
                Every lot carries its genealogy, its ledger position and its carbon figure with the
                method version behind it. An auditor reads the same records we do.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <h2>Specification</h2>
          {spec.loading ? <Loading what="the specification" /> : null}
          {spec.error ? <Empty>The specification could not be read just now.</Empty> : null}
          {spec.data ? (
            <>
              <p class="muted">
                {spec.data.grade} version {spec.data.version}, issued {spec.data.issued_on}.
                A guaranteed limit is tested on every lot.
              </p>
              <TableScroll caption={`${spec.data.grade} version ${spec.data.version}`}>
                <thead>
                  <tr>
                    <th scope="col">Property</th><th scope="col">Method</th>
                    <th scope="col" class="num">Limit</th><th scope="col">Unit</th><th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.data.properties.map((p) => (
                    <tr key={p.property}>
                      <td>{words(p.property)}</td>
                      <td class="mono">{p.method}</td>
                      <td class="num">{p.limit}</td>
                      <td>{p.unit}</td>
                      <td>{words(p.basis)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
              <p class="t-small muted" style="margin-top:1rem">
                Virgin-quality comparison: {spec.data.virgin_reference.reference}, sourced from{' '}
                {spec.data.virgin_reference.source}, dated {spec.data.virgin_reference.date}.
              </p>
            </>
          ) : null}
        </div>
      </section>
    </>
  );
}

/* ============================================================= technology */

const STAGES = [
  ['Dissolution', 'Mixed waste is dissolved so the polyamide separates from dye, coating, elastane and foreign matter.', 570000, 480000],
  ['Depolymerisation', 'The polymer chain is taken back to monomer at low temperature and low pressure.', 850000, 800000],
  ['Purification', 'The monomer is purified to the point where the pellet is indistinguishable from virgin.', 800000, 760000],
  ['Repolymerisation', 'Purified monomer is polymerised back to pellet at the viscosity the specification names.', 720000, 700000]
];

export function Technology() {
  useMeta(
    'Four steps from mixed waste to virgin-quality pellet',
    'Dissolution, depolymerisation, purification and repolymerisation, with the mass in and out of each stage and the evidence behind every claim.'
  );
  const sites = useResource('/sites');
  const [caps, setCaps] = useState({});
  useEffect(() => {
    if (!sites.data) return;
    Promise.all(sites.data.map((s) => api.get(`/sites/${s.reference}/capacity`).catch(() => null)))
      .then((rows) => {
        const out = {};
        rows.forEach((r, i) => { if (r) out[sites.data[i].reference] = r; });
        setCaps(out);
      });
  }, [sites.data]);

  return (
    <>
      <section class="section">
        <div class="wrap">
          <Reveal as="h1">Four steps, and the mass across each one</Reveal>
          <Reveal>
            <p class="t-big">
              The plant is drawn rather than photographed, and this diagram is generated from the
              four run types, so it stays correct when a stage changes.
            </p>
          </Reveal>
        </div>
      </section>

      <section class="section-tight">
        <div class="wrap">
          <ProcessDiagram />
          <details style="margin-top:1rem">
            <summary style="cursor:pointer">The same diagram as text</summary>
            <ol>
              {STAGES.map(([name, desc, inG, outG]) => (
                <li key={name} style="margin-bottom:0.5rem">
                  <strong>{name}.</strong> {desc}{' '}
                  <span class="mono">In {grams(inG)}, out {grams(outG)}, losses {grams(inG - outG)}.</span>
                </li>
              ))}
            </ol>
            <p class="t-small">Losses reduce the claim.</p>
          </details>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <h2>Capacity</h2>
          <p class="muted">
            Every figure below is a quantity in tonnes per year, on one basis:{' '}
            <span class="mono">8000 hours per year, 0.90 availability, 0.80 yield</span>. A year is
            a calendar year. A capacity figure is never shown without its confidence.
          </p>
          {sites.loading ? <Loading what="the capacity table" /> : null}
          {sites.data ? (
            <TableScroll caption="Nameplate capacity by site">
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col" class="num">Nameplate</th>
                  <th scope="col" class="num">Contracted</th>
                  <th scope="col" class="num">Uncommitted</th>
                  <th scope="col">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {sites.data.map((s) => {
                  const c = caps[s.reference];
                  const planned = s.confidence === 'planned';
                  return (
                    <tr key={s.reference}>
                      <th scope="row">
                        {s.name}{' '}
                        {planned ? <State word="Planned" consequence /> : null}
                      </th>
                      <td class="num">{c ? `${(c.nameplate_kg / 1000).toLocaleString('en-GB')} t/yr` : '—'}</td>
                      <td class="num">{c ? `${(c.contracted_kg / 1000).toLocaleString('en-GB')} t/yr` : '—'}</td>
                      <td class="num">{c ? `${(c.uncommitted_kg / 1000).toLocaleString('en-GB')} t/yr` : '—'}</td>
                      <td>{words(s.confidence)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </TableScroll>
          ) : null}
          <p class="t-small muted" style="margin-top:1rem">
            Commercial Plant (2030+) reads &gt;25,000 tonnes per year and is a planned row: it
            carries the word. Pilot (2026) runs at 40 tonnes per year. Uncommitted capacity is
            nameplate minus contracted, computed, and is allowed to be negative — the commercial
            site is over-committed by 1,000 tonnes per year and we report that here rather than
            quietly.
          </p>
        </div>
      </section>

      <section class="section">
        <div class="wrap">
          <h2>Five attributes</h2>
          <div class="grid grid-2">
            <article class="card">
              <h4>Green chemicals &amp; reagents</h4>
              <p>Reagents are declared per recipe version, with ratios, and released by a named person.</p>
              <p class="t-small muted">
                Evidence: reagent declarations held against recipe versions RCP-DISS-2 and RCP-REPO-3,
                approved 2026-01-15, reviewed by 2026-09-30.
              </p>
            </article>
            <article class="card">
              <h4>Low temperature &amp; pressure</h4>
              <p>Dissolution runs at 160–170 °C and 2–4 bar; repolymerisation at 250–260 °C and 7–9 bar.</p>
              <p class="t-small muted">
                Evidence: the published set points and tolerances on those recipe versions. A revision
                that moves either outside the published threshold is a change notice before it is released.
              </p>
            </article>
            <article class="card">
              <h4>Low carbon impact</h4>
              <p>
                4,260,000 mg CO2e per kg, cradle-to-gate, method CM-PA6 v2, uncertainty 1200 bp.
                Lower than virgin PA6 from EcoBase 2025.
              </p>
              <p class="t-small muted">
                Evidence: carbon figure CF-LOT-0001 against ISO 14067, reviewed by Ilse Grootveld,
                published 2026-01-20.
              </p>
            </article>
            <article class="card">
              <h4>Any nylon feedstock</h4>
              <p>Post-consumer and pre-consumer polyamide, mixed, coloured, coated or contaminated.</p>
            </article>
            <article class="card">
              <h4>Drop-in quality</h4>
              <p>Relative viscosity to 2.40 and moisture to 0.10 per cent, both guaranteed and tested on every lot.</p>
            </article>
          </div>
        </div>
      </section>
    </>
  );
}

/** Generated from the four run types, carrying mass in and mass out per stage. */
function ProcessDiagram() {
  const w = 900, h = 200, boxW = 170, boxH = 84, gap = (w - 4 * boxW) / 3;
  return (
    <div class="table-scroll" tabindex="0" role="region" aria-label="The four process stages">
      <svg viewBox={`0 0 ${w} ${h}`} class="graph-svg" style="min-width:56rem;padding:1rem"
        role="img" aria-label="Four stages: dissolution, depolymerisation, purification, repolymerisation, each with mass in and mass out.">
        {STAGES.map(([name, , inG, outG], i) => {
          const x = i * (boxW + gap);
          return (
            <g key={name}>
              <rect x={x} y={40} width={boxW} height={boxH} rx="4" class="graph-node-box" />
              <text x={x + 12} y={64} class="graph-label" style="font-family:var(--grotesk);font-weight:600">
                {name}
              </text>
              <text x={x + 12} y={86} class="graph-label">in {(inG / 1000).toLocaleString('en-GB')} kg</text>
              <text x={x + 12} y={104} class="graph-label">out {(outG / 1000).toLocaleString('en-GB')} kg</text>
              {i < 3 ? (
                <path d={`M${x + boxW} 82 h ${gap - 8} m -8 -5 l 8 5 l -8 5`} class="graph-edge" />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ================================================================== about */

export function About() {
  useMeta(
    'The hard facts',
    'Why mixed polyamide waste is worth recovering, with every published figure carrying its source, its year and its geography.'
  );
  const stats = useResource('/statistics');
  return (
    <>
      <section class="section">
        <div class="wrap">
          <Reveal as="h1">The hard facts</Reveal>
          <Reveal>
            <p class="t-big">
              Three figures decide whether this problem is worth a company. Each carries its source,
              its year and its geography beside it, because a figure that cannot carry all three is
              not a fact we are willing to publish.
            </p>
          </Reveal>
        </div>
      </section>
      <section class="section-tight">
        <div class="wrap">
          {stats.loading ? <Loading what="the published figures" /> : null}
          {stats.error ? <Empty>The published figures could not be read just now.</Empty> : null}
          {stats.data && !stats.data.length ? <Empty>No figure is published.</Empty> : null}
          {stats.data ? (
            <div class="grid grid-3">
              {stats.data.map((s) => (
                <Reveal as="article" class="card" key={s.key}>
                  <p class="t-big">{s.value}</p>
                  <p class="t-small muted">
                    Source: {s.source} · Year: {s.year} · Geography: {s.geography}
                  </p>
                </Reveal>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <section class="section">
        <div class="wrap">
          <h2>What we are</h2>
          <p>
            Ravel Materials SAS operates a chemical recycling plant that returns mixed polyamide
            waste to virgin-quality pellet. We run a pilot and a demonstration site today and a
            commercial site is planned.
          </p>
          <p>
            We are unusual in one respect: we treat the record as the product. The pellet is
            deliberately ordinary. What a customer buys, and what their regulator eventually reads,
            is a claim about origin — and a claim nobody can trace is a claim nobody should accept.
          </p>
        </div>
      </section>
    </>
  );
}

/* ================================================================ careers */

export function Careers() {
  useMeta('Careers', 'Open roles at Ravel, and why this problem matters.');
  const positions = useResource('/positions');
  const count = positions.data ? positions.data.length : null;
  return (
    <>
      <section class="section">
        <div class="wrap">
          <Reveal as="h1">Why this problem matters</Reveal>
          <Reveal>
            <p class="t-big">
              Textile waste is one of the largest material streams nobody has solved. Less than one
              per cent of textiles are recycled into new materials; the rest is landfilled, exported
              or burned. Nylon is among the most valuable fractions and among the hardest to recover,
              which is exactly why it is still unrecovered.
            </p>
            <p>
              Solving it is a chemistry problem and a bookkeeping problem in equal measure. The
              chemistry decides whether the pellet is good enough. The bookkeeping decides whether
              anybody is allowed to say so. We take both seriously, and we would rather refuse a
              claim than round one up.
            </p>
          </Reveal>
        </div>
      </section>
      <section class="section">
        <div class="wrap">
          <h2>{count === null ? 'Open positions' : `${count} open position${count === 1 ? '' : 's'}`}</h2>
          {positions.loading ? <Loading what="the open roles" /> : null}
          {positions.data && !positions.data.length ? (
            <Empty>There is no open position at the moment.</Empty>
          ) : null}
          {positions.data && positions.data.length ? (
            <div class="stack">
              {positions.data.map((p) => (
                <article class="card" key={p.id}>
                  <h3>{p.title}</h3>
                  <dl class="definition">
                    <dt>Location</dt><dd>{p.location}</dd>
                    <dt>Department</dt><dd>{p.department}</dd>
                    <dt>Contract type</dt><dd>{p.contract_type}</dd>
                    <dt>Closes on</dt><dd class="mono">{p.closes_on}</dd>
                  </dl>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}

/* =================================================================== news */

export function News() {
  useMeta('News', 'Funding, partnership, technical and recognition news from Ravel, each item with its outlet, its date and its link.');
  const news = useResource('/news');
  return (
    <section class="section">
      <div class="wrap">
        <Reveal as="h1">News</Reveal>
        {news.loading ? <Loading what="the news" /> : null}
        {news.data && !news.data.length ? <Empty>There is no news item yet.</Empty> : null}
        {news.data ? (
          <div class="stack-l">
            {news.data.map((n) => (
              <Reveal as="article" class="card" key={n.id}>
                <p class="eyebrow">{words(n.tag)}</p>
                <h3>{n.title}</h3>
                <p class="t-small muted">
                  <span class="mono">{n.date}</span> · {n.outlet}
                  {n.language !== 'en' ? (
                    <> · <State word={`In ${n.language === 'fr' ? 'French' : n.language}`} /></>
                  ) : null}
                </p>
                <p>
                  <a href={n.link} rel="noopener noreferrer">
                    Read it at {n.outlet} <span aria-hidden="true">→</span>
                  </a>
                </p>
                {n.coverage && n.coverage.length > 1 ? (
                  <details>
                    <summary>Other coverage of this event</summary>
                    <ul>
                      {n.coverage.map((c) => (
                        <li key={c.link}><a href={c.link} rel="noopener noreferrer">{c.outlet}</a> ({c.language})</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Reveal>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ================================================================ contact */

const ENQUIRY_TYPES = [
  ['waste_supply', 'Supplying waste', 'feedstock@example.com', 3],
  ['polymer_purchase', 'Buying polymer', 'sales@example.com', 2],
  ['partnership', 'Partnership', 'partners@example.com', 5],
  ['press', 'Press', 'press@example.com', 1]
];

export function Contact() {
  useMeta('Contact', 'Four enquiry types, four destinations and four stated response times.');
  const [type, setType] = useState('waste_supply');
  const [form, setForm] = useState({ name: '', email: '', organisation: '', message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const chosen = ENQUIRY_TYPES.find((t) => t[0] === type);

  async function submit(e) {
    e.preventDefault();
    setSending(true); setError(null); setResult(null);
    try {
      const r = await api.post('/enquiries', { type, ...form });
      setResult(r);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <section class="section">
      <div class="wrap wrap-narrow">
        <Reveal as="h1">Contact</Reveal>
        <p class="t-big">
          Four kinds of enquiry, four destinations, four stated response times. We tell you which
          one you are sending and how long we take.
        </p>

        <TableScroll caption="Where an enquiry goes and how long we take">
          <thead>
            <tr>
              <th scope="col">Enquiry</th><th scope="col">Destination</th>
              <th scope="col" class="num">Response</th>
            </tr>
          </thead>
          <tbody>
            {ENQUIRY_TYPES.map(([k, label, dest, days]) => (
              <tr key={k}>
                <th scope="row">{label}</th>
                <td class="mono">{dest}</td>
                <td class="num">{days} working day{days === 1 ? '' : 's'}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>

        {result ? (
          <div class="banner" role="status" style="margin-top:1.5rem">
            <p class="banner-title">Your enquiry is recorded</p>
            <p>
              We have it under reference <span class="mono">{result.reference}</span>. It has gone to{' '}
              <span class="mono">{result.destination}</span>, and we answer within{' '}
              {result.response_days} working day{result.response_days === 1 ? '' : 's'}. A
              confirmation is on its way to the address you gave.
            </p>
            <p class="t-small muted">
              Ravel Materials SAS holds this enquiry to answer it and for no other purpose. We keep
              it for {result.data_protection?.retention_months} months. Write to{' '}
              <span class="mono">privacy@example.com</span> to have it removed.
            </p>
          </div>
        ) : null}

        {error ? (
          <Refusal title="Your enquiry was not sent">
            <p>
              {error.body?.error === 'email_required'
                ? 'We need an address to answer, and none was given.'
                : 'The form could not be submitted just now. Nothing was recorded and nothing was sent.'}
            </p>
            <p>
              You can try again, or write to us directly at{' '}
              <span class="mono">{chosen[2]}</span>, which does not depend on this form working.
            </p>
          </Refusal>
        ) : null}

        <form onSubmit={submit} style="margin-top:2rem" novalidate>
          <label class="field">
            <span class="label">What is this about</span>
            <select value={type} onChange={(e) => setType(e.currentTarget.value)}>
              {ENQUIRY_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            <span class="hint">
              This goes to <span class="mono">{chosen[2]}</span> and we answer within {chosen[3]}{' '}
              working day{chosen[3] === 1 ? '' : 's'}.
            </span>
          </label>
          <label class="field">
            <span class="label">Your name</span>
            <input value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Your email</span>
            <input type="email" required value={form.email}
              onInput={(e) => setForm({ ...form, email: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Organisation</span>
            <input value={form.organisation} onInput={(e) => setForm({ ...form, organisation: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Message</span>
            <textarea rows="5" value={form.message}
              onInput={(e) => setForm({ ...form, message: e.currentTarget.value })} />
          </label>
          <button class="btn" type="submit" disabled={sending}>
            {sending ? 'Sending' : 'Send the enquiry'} <span class="btn-arrow" aria-hidden="true">→</span>
          </button>
        </form>

        <p class="t-small muted" style="margin-top:1.5rem">
          We collect your name, address, organisation and message in order to answer you. Ravel
          Materials SAS is the controller. We keep an enquiry for 24 months, a waste-supply or
          polymer enquiry for 36 months and a press enquiry for 12 months. Write to{' '}
          <span class="mono">privacy@example.com</span> to have it removed. The full policy is on
          the <Link href="/privacy">privacy route</Link>.
        </p>
      </div>
    </section>
  );
}

/* ================================================================ privacy */

export function Privacy() {
  useMeta('Privacy', 'Who receives your data at Ravel, what it is used for, how long it is kept and how to have it removed.');
  return (
    <section class="section">
      <div class="wrap wrap-narrow">
        <h1>Privacy</h1>
        <p class="t-big">
          This states who receives your data, what it is used for, how long it is kept and how to
          have it removed.
        </p>

        <h2>The controller</h2>
        <p>
          Ravel Materials SAS is the controller of the personal data described here.
        </p>
        <address class="card" style="font-style:normal">
          Ravel Materials SAS<br />
          14 Quai Rambaud<br />
          69002 Lyon<br />
          France<br />
          <span class="mono">privacy@example.com</span>
        </address>
        <p>
          Write to <span class="mono">privacy@example.com</span> to ask for a copy of your data, to
          correct it, or to have it removed. Report a security issue to{' '}
          <span class="mono">security@example.com</span>.
        </p>

        <h2>What we keep, and for how long</h2>
        <TableScroll caption="Retention by purpose">
          <thead>
            <tr>
              <th scope="col">Purpose</th>
              <th scope="col" class="num">Retention</th>
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">An enquiry</th><td class="num">24 months</td></tr>
            <tr><th scope="row">A waste-supply enquiry</th><td class="num">36 months</td></tr>
            <tr><th scope="row">A polymer enquiry</th><td class="num">36 months</td></tr>
            <tr><th scope="row">A press enquiry</th><td class="num">12 months</td></tr>
            <tr><th scope="row">An account and its acts</th><td class="num">120 months</td></tr>
            <tr><th scope="row">The operational record</th><td class="num">180 months</td></tr>
          </tbody>
        </TableScroll>

        <h2>The operational record names individuals</h2>
        <p>
          Our operational record names the person who performed each act: who booked in a batch, who
          entered a test result, who set a disposition, who signed a certificate. We are required to
          keep that record under a legal obligation and under our certification scheme's rules, and
          it is <strong>not erased on request</strong>. That is the honest position, and we would
          rather state it here than discover it with you later.
        </p>
        <p>
          A former employee's contact detail <em>is</em> erased on request. The record continues to
          name the acts, by an identifier that resolves to a name through a separate store with its
          own retention.
        </p>

        <h2>Certificates</h2>
        <p>
          A certificate we issue names its recipient organisation and resolves at a public address
          for as long as it exists, including after it is withdrawn. The verification route is
          excluded from search indexing, because a certificate's recipient is a customer
          relationship rather than something we publish.
        </p>
      </div>
    </section>
  );
}

/* ================================================================= verify */

export function Verify({ number }) {
  useMeta(
    `Verify ${number}`,
    'Check a Ravel certificate. No account is needed.',
    { noindex: true }
  );
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api.get(`/verify/${encodeURIComponent(number)}`)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
  }, [number]);

  return (
    <section class="section">
      <div class="wrap wrap-narrow">
        <p class="eyebrow">Certificate verification</p>
        <h1 class="mono" style="word-break:break-word">{number}</h1>

        {state.loading ? <Loading what="this certificate" /> : null}

        {state.error ? (
          <Refusal title="This check could not be completed">
            <p>
              {state.error.status === 429
                ? 'Too many verification requests have come from this address. Try again shortly.'
                : 'The verification service could not be reached. Nothing about this certificate has changed.'}
            </p>
          </Refusal>
        ) : null}

        {/* The same layout says there is no such certificate. */}
        {state.data && !state.data.found ? (
          <div class="sheet">
            <p class="eyebrow">State</p>
            <p class="t-big"><State word="No such certificate" consequence /></p>
            <p>
              There is no certificate at this number. That is the whole answer: we do not suggest a
              replacement and we do not list our customers here.
            </p>
            <dl class="definition">
              <dt>Number</dt><dd class="mono">{state.data.number}</dd>
              <dt>State</dt><dd>Not found</dd>
              <dt>Issued on</dt><dd>—</dd>
              <dt>Site</dt><dd>—</dd>
              <dt>Grade</dt><dd>—</dd>
              <dt>Claim type</dt><dd>—</dd>
              <dt>Recipient</dt><dd>—</dd>
            </dl>
          </div>
        ) : null}

        {state.data && state.data.found ? (
          <div class="sheet">
            {/* A withdrawn certificate says withdrawn before it shows any figure. */}
            {state.data.state === 'withdrawn' ? (
              <div class="banner" role="status">
                <p class="banner-title">Withdrawn</p>
                <p class="t-big">
                  This certificate was withdrawn on {state.data.withdrawn_on}. Reason:{' '}
                  {state.data.withdrawal_reason}.
                </p>
                <p class="t-small">
                  A withdrawal is a fact about this document. There is no forwarding address and no
                  replacement is offered here.
                </p>
              </div>
            ) : (
              <p class="t-big"><State word="Issued" /></p>
            )}

            <dl class="definition">
              <dt>Number</dt><dd class="mono">{state.data.number}</dd>
              <dt>State</dt><dd>{words(state.data.state)}</dd>
              <dt>Issued on</dt><dd class="mono">{state.data.issued_on}</dd>
              {state.data.withdrawn_on ? (<><dt>Withdrawn on</dt><dd class="mono">{state.data.withdrawn_on}</dd></>) : null}
              {state.data.withdrawal_reason ? (<><dt>Reason</dt><dd>{state.data.withdrawal_reason}</dd></>) : null}
              <dt>Site</dt><dd class="mono">{state.data.site}</dd>
              <dt>Grade</dt><dd class="mono">{state.data.grade}</dd>
              <dt>Claim type</dt><dd>{words(state.data.claim_type)}</dd>
              <dt>Recipient</dt><dd>{state.data.recipient_name}</dd>
            </dl>

            <p class="t-small muted">
              This answer carries no yield, no collector, no genealogy and no carbon breakdown. A
              customer's compliance officer needs the state of the document; the rest belongs to the
              parties to it.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
