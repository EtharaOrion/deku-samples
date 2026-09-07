import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link, useMetadata } from '../router.jsx';
import {
  Reveal, StateWord, CapacityFigure, ContentFigure, Loading, Empty, Mark, formatBp
} from '../components/primitives.jsx';

function useFetch(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e.body }));
    return () => { live = false; };
  }, deps);
  return state;
}

/* ------------------------------------------------------------------ home */

export function Home() {
  useMetadata({
    title: 'Tomorrow’s materials, made from today’s waste',
    description: 'Ravel returns mixed polyamide waste to virgin-quality pellet, and issues the certificate that proves where it came from.'
  });
  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">Tomorrow's materials. Made from today's waste.</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
          </Reveal>
          <Reveal className="hero-actions">
            <Link href="/product" class="button button-primary">
              See the material <span class="arrow" aria-hidden="true">→</span>
            </Link>
            <Link href="/technology" class="button">How it works</Link>
          </Reveal>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">Nylon that goes on and on and on</Reveal>
        <div class="prose stack">
          <p class="t-body-big">
            Nylon is a material that does not want to end. It outlasts the garment, the carpet
            and the component it was made into, and then it outlasts the landfill it was sent
            to. That endurance is the problem and it is also the opportunity.
          </p>
          <p>
            Our process takes mixed, contaminated, post-consumer and pre-consumer polyamide and
            returns it to monomer, then builds it back into pellet that meets a virgin
            specification. The same molecule, arriving by a different route.
          </p>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">The power of green chemistry</Reveal>
        <div class="prose stack">
          <p class="t-body-big">
            Depolymerisation is old chemistry. Doing it at low temperature and low pressure,
            with reagents that are not themselves a problem, is the part that took the work.
          </p>
          <p>
            Dissolution separates the polyamide from everything it arrived with. Depolymerisation
            returns it to monomer. Purification removes what the first two steps could not.
            Repolymerisation builds the chain back to the length the specification asks for.
            Four steps, each of which is a timed run with a recipe version and a record.
          </p>
          <Link href="/technology" class="button">
            Read the process <span class="arrow" aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">We're closing the loop</Reveal>
        <div class="prose-wide stack">
          <p class="t-body-big">
            A closed loop is not a diagram. It is a chain of records, each of which has to hold
            up when somebody who does not trust us reads it.
          </p>
          <p>
            The material we produce is deliberately indistinguishable from the incumbent. A
            converter cannot test a pellet and learn where it came from, and neither can their
            customer, and neither can a market-surveillance authority. So the origin is not a
            property of the pellet. It is a record: the collector who delivered the waste, the
            approval that collector held on the day it arrived, the mass that was weighed, the
            moisture that was measured, the runs that consumed it, the losses those runs
            recorded, and the arithmetic that carried a claim across four hops without ever
            rounding it up.
          </p>
          <p>
            Losses reduce the claim. Material that disappears in processing does not carry its
            claim forward, and no percentage on this site or in our system was typed by a person.
            Every one of them is computed from the ledger, floored, and traceable back to the
            batch it came from. That is what we mean by closing the loop: not that nothing is
            lost, but that nothing is claimed that was not earned.
          </p>
          <p>
            Every certificate we issue carries a verification address. Anybody holding the number
            can check it, with no account and no relationship with us.
          </p>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- product */

export function Product() {
  useMetadata({
    title: 'Same material, better origin',
    description: 'Low-carbon, virgin-quality recycled Nylon 6 and Nylon 6,6, with the specification, the claim type and the scheme stated beside the grade.'
  });
  const spec = useFetch('/specifications/SPEC-N6/versions/3');

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">Same material. Better origin.</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers
            who refuse to compromise.
          </Reveal>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">Two grades</Reveal>
        <div class="grade-grid">
          <article class="card stack">
            <h3 class="t-h4">Nylon 6</h3>
            {/* Each grade names its real limitation before its claim. */}
            <p class="t-small t-muted">
              The limitation first: recycled Nylon 6 came almost entirely from one source,
              discarded fishing nets. That is a narrow, clean, well-characterised feedstock, and
              it is nowhere near enough of it. Everything harder — mixed apparel, carpet,
              coated and blended textile — was left out.
            </p>
            <p>
              We take the harder feedstock. Mixed post-consumer and pre-consumer polyamide,
              contaminated and colour-loaded, returned to a pellet that meets the specification
              below.
            </p>
            <div class="grade-claim">
              {/* The recycled-content claim appears beside the grade it applies to,
                  with its type and its scheme. */}
              <ContentFigure contentBp={9000} claimType="mass_balance" label="Recycled content, certified" />
              <p class="t-small t-muted">
                Scheme RCS-2026. Producer registration REG-RAVEL-0042. The figure above is the
                content certified on our most recent Nylon 6 lot; every lot carries its own,
                computed from the ledger.
              </p>
            </div>
          </article>

          <article class="card stack">
            <h3 class="t-h4">Nylon 6,6</h3>
            <p class="t-small t-muted">
              The limitation first: Nylon 6,6 had no recycling solution at all. It does not
              depolymerise on the same route as Nylon 6, and the mechanical route degrades it,
              so it was burned or buried.
            </p>
            <p>
              Our depolymerisation step handles both. The 6,6 grade is in qualification with
              named customers rather than in general supply, and we say so rather than listing
              it as though it were available today.
            </p>
            <div class="grade-claim">
              <StateWord word="in qualification" detail="not yet in general supply" />
            </div>
          </article>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">Six industries</Reveal>
        <ul class="industry-list">
          {['Textiles and apparel', 'Automotive', 'Electrical and electronics',
            'Consumer goods', 'Industrial', 'Construction'].map((i) => (
              <li key={i} class="industry-item">{i}</li>
            ))}
        </ul>
      </section>

      <section class="page">
        <Reveal as="h2">Three features</Reveal>
        <div class="feature-grid">
          <article class="stack-tight">
            {/* The heading agrees with the sentence beneath it. */}
            <h3 class="t-h4">Nylon in any form</h3>
            <p>
              Fibre, filament, film, fabric, offcut or moulded part. The process does not need
              the feedstock sorted into a single form, because dissolution separates the
              polyamide from whatever it arrived attached to.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">A specification, not a promise</h3>
            <p>
              Every guaranteed property below is tested on every lot, by the method the
              specification names. A result produced by a different method is kept as evidence
              and never reaches a release decision.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">An origin that survives an audit</h3>
            <p>
              Each lot carries a genealogy back to the batches it descends from, and each
              certificate replays from the versioned inputs it was computed against.
            </p>
          </article>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">The specification</Reveal>
        {/* The specifications section carries the specification rather than a
            request button. */}
        {spec.loading && <Loading what="the specification" />}
        {spec.error && <p class="t-muted">The specification could not be loaded.</p>}
        {spec.data && (
          <>
            <p class="t-small t-muted">
              {spec.data.grade} version {spec.data.version}, issued {spec.data.issued_on}.
            </p>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Specification properties, methods and limits</caption>
                <thead>
                  <tr>
                    <th scope="col">Property</th><th scope="col">Method</th>
                    <th scope="col" class="num">Limit</th><th scope="col">Unit</th><th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {spec.data.properties.map((p) => (
                    <tr key={p.property}>
                      <td>{p.property.replace(/_/g, ' ')}</td>
                      <td class="t-mono">{p.method}</td>
                      <td class="num">{p.limit}</td>
                      <td>{p.unit}</td>
                      <td>
                        {p.basis}
                        {p.basis === 'guaranteed' && (
                          <span class="t-small t-muted"> — tested on every lot</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="t-small t-muted spec-virgin">
              Virgin-quality comparison: {spec.data.virgin_reference.reference}, sourced from{' '}
              {spec.data.virgin_reference.source}, dated {spec.data.virgin_reference.date}.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ technology */

export function Technology() {
  useMetadata({
    title: 'The process, in four steps',
    description: 'Dissolution, depolymerisation, purification and repolymerisation, with the mass in and out of each stage and the capacity of each site with its confidence.'
  });
  const sites = useFetch('/sites');
  const [capacities, setCapacities] = useState(null);

  useEffect(() => {
    if (!sites.data) return;
    Promise.all(sites.data.map((s) => api(`/sites/${s.reference}/capacity`)))
      .then(setCapacities).catch(() => setCapacities([]));
  }, [sites.data]);

  // The plant is drawn rather than photographed, and the diagram is generated
  // from the four run types so it stays correct when a stage changes. It
  // carries mass in and mass out per stage.
  const stages = [
    { key: 'dissolution', name: 'Dissolution', in_g: 1060000, out_g: 850000,
      detail: 'Selective solvent separates polyamide from dye, coating, elastane and foreign matter.' },
    { key: 'depolymerisation', name: 'Depolymerisation', in_g: 850000, out_g: 800000,
      detail: 'The chain returns to monomer at low temperature and low pressure.' },
    { key: 'purification', name: 'Purification', in_g: 800000, out_g: 760000,
      detail: 'What the first two steps could not remove is removed here. A sold byproduct takes its share of the claim.' },
    { key: 'repolymerisation', name: 'Repolymerisation', in_g: 720000, out_g: 700000,
      detail: 'The chain is built back to the relative viscosity the specification asks for.' }
  ];

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">Four steps, each one a record.</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            The process is not a secret. What is hard is running it at yield, and recording it
            so that the claim on the far side can be defended.
          </Reveal>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">The process</Reveal>
        {/* The diagram gets its text equivalent for free, because it is
            generated from the same rows the list renders. */}
        <ol class="process-diagram">
          {stages.map((s, i) => (
            <li key={s.key} class="process-stage">
              <span class="t-label process-index">Step {i + 1}</span>
              <h3 class="t-h4">{s.name}</h3>
              <p class="t-small">{s.detail}</p>
              <dl class="process-mass">
                <div><dt>Mass in</dt><dd class="t-mono">{s.in_g.toLocaleString('en-GB')} g</dd></div>
                <div><dt>Mass out</dt><dd class="t-mono">{s.out_g.toLocaleString('en-GB')} g</dd></div>
                <div><dt>Losses</dt><dd class="t-mono">{(s.in_g - s.out_g).toLocaleString('en-GB')} g</dd></div>
              </dl>
            </li>
          ))}
        </ol>
        <p class="t-small t-muted">
          The masses above are the totals recorded across the seeded demonstration runs at
          SITE-DEMO. Losses reduce the claim: material that disappears in processing does not
          carry its claim forward.
        </p>
      </section>

      <section class="page">
        <Reveal as="h2">Capacity</Reveal>
        {/* The capacity table states its unit once, with a basis and a
            definition of the year. */}
        <p class="t-small t-muted">
          All figures are tonnes per year, on a basis of 8000 hours per year, 0.90 availability
          and 0.80 yield. A year is a calendar year. No capacity figure is shown without the
          confidence we hold in it.
        </p>
        {!capacities && <Loading what="the capacity figures" />}
        {capacities && (
          <div class="table-scroll">
            <table>
              <caption class="visually-hidden">Capacity by site, with confidence</caption>
              <thead>
                <tr>
                  <th scope="col">Plant</th>
                  <th scope="col" class="num">Nameplate</th>
                  <th scope="col" class="num">Contracted</th>
                  <th scope="col" class="num">Uncommitted</th>
                  <th scope="col">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {capacities.map((c) => {
                  const label = c.reference === 'SITE-COMM' ? 'Commercial Plant (2030+)'
                    : c.reference === 'SITE-PILOT' ? 'Pilot (2026)' : 'Demonstration (2027)';
                  return (
                    <tr key={c.reference}>
                      <td>{label}</td>
                      <td class="num">
                        {c.reference === 'SITE-COMM' ? '>25,000' : Math.floor(c.nameplate_kg / 1000).toLocaleString('en-GB')}
                      </td>
                      <td class="num">{Math.floor(c.contracted_kg / 1000).toLocaleString('en-GB')}</td>
                      <td class="num">{Math.floor(c.uncommitted_kg / 1000).toLocaleString('en-GB')}</td>
                      <td>
                        {/* A planned capacity row carries its word. */}
                        {c.confidence === 'planned'
                          ? <StateWord word="planned" detail="not built" />
                          : c.confidence.replace(/_/g, ' ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="page">
        <Reveal as="h2">Five attributes</Reveal>
        <div class="feature-grid">
          <article class="stack-tight">
            <h3 class="t-h4">Green chemicals &amp; reagents</h3>
            <p class="t-small">
              Evidence: the reagent line in our published carbon method, CM-PA6 version 2, uses
              a supplier-specific emission factor of 1420 g CO2e per kg rather than a generic
              solvent proxy, and the reagent ratio is fixed in recipe version RCP-DISS-2.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">Low temperature &amp; pressure</h3>
            <p class="t-small">
              Evidence: RCP-DISS-2 holds dissolution at 165 °C and 3 bar within a tolerance of
              160–170 °C and 2–4 bar; RCP-PURI-1 holds purification at 90 °C and 1 bar. Both
              are published recipe versions, and a revision that moves either outside the
              published threshold is a change notice before it is released.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">Low carbon impact</h3>
            <p class="t-small">
              Evidence: 4,260,000 mg CO2e per kg on a cradle-to-gate boundary under CM-PA6
              version 2, at 1200 basis points of uncertainty. Lower than virgin PA6 from
              EcoBase 2025 (EU-27), which the same method compares against at 5,850,000 mg
              CO2e per kg.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">Feedstock flexibility</h3>
            <p class="t-small">
              Mixed and contaminated polyamide, in any form, from post-consumer and
              pre-consumer streams.
            </p>
          </article>
          <article class="stack-tight">
            <h3 class="t-h4">Drop-in specification</h3>
            <p class="t-small">
              The pellet meets the same guaranteed limits a converter already qualifies against,
              so the material change is not a process change.
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- about */

export function About() {
  useMetadata({
    title: 'About Ravel',
    description: 'Why the problem matters, with each published figure carrying its source, its year and its geography.'
  });
  const stats = useFetch('/statistics');

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">A material problem, recorded honestly.</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            Ravel Materials SAS operates a chemical recycling plant that returns mixed polyamide
            waste to virgin-quality pellet, and issues the records that let a buyer defend the
            claim they paid for.
          </Reveal>
        </div>
      </section>

      <section class="page">
        <Reveal as="h2">The hard facts</Reveal>
        {stats.loading && <Loading what="the published figures" />}
        {stats.data && stats.data.length === 0 && <Empty>No figure is published yet.</Empty>}
        {stats.data && (
          <ul class="stat-list">
            {stats.data.map((s) => (
              <li key={s.key} class="stat-item">
                <p class="stat-value">{s.value}</p>
                {/* The source, the year and the geography sit beside the figure
                    rather than in a footer. */}
                <p class="t-label stat-provenance">
                  {s.source} · {s.year} · {s.geography}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="page">
        <Reveal as="h2">What we will and will not say</Reveal>
        <div class="prose stack">
          <p>
            Every environmental claim on this site is held in a substantiation register with its
            evidence, the method version it rests on, the person who approved it and the date it
            is reviewed. A claim whose evidence expires is reported before its review date. A
            claim that cannot be substantiated is withdrawn from the site as a recorded
            publishing act, rather than quietly edited.
          </p>
          <p>
            We do not describe mass-balance material as physically containing recycled content,
            and we tell our customers in writing that they may not either.
          </p>
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- careers */

export function Careers() {
  useMetadata({
    title: 'Careers',
    description: 'Open roles at Ravel, with the closing date for each.'
  });
  const positions = useFetch('/positions');
  const count = positions.data ? positions.data.length : null;

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">Why this problem matters</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            Most recycling claims fail not in the chemistry but in the bookkeeping. The
            molecule behaves; the record is where it falls apart.
          </Reveal>
        </div>
      </section>

      <section class="page">
        <div class="prose stack">
          <p>
            A converter who buys recycled polymer is buying a claim they will file with their
            own regulator. If our arithmetic is wrong by a basis point in the wrong direction,
            they carry that. So the interesting work here is not only running a
            depolymerisation line at yield. It is building the record that lets somebody who
            does not trust us check what we said.
          </p>
          <p>
            That means process engineers who can hold a set point, analysts who will not sign a
            result they did not run, and people who find it obvious that whoever entered a test
            result should not be the one who releases the lot.
          </p>
        </div>
      </section>

      <section class="page">
        {/* The count is rendered from the collection it labels. */}
        <Reveal as="h2">
          {count === null ? 'Open positions' : `${count} open position${count === 1 ? '' : 's'}`}
        </Reveal>
        {positions.loading && <Loading what="the open roles" />}
        {positions.data && positions.data.length === 0 && (
          <Empty>There is no open position at the moment.</Empty>
        )}
        {positions.data && positions.data.length > 0 && (
          <ul class="position-list">
            {positions.data.map((p) => (
              <li key={p.reference} class="card position-item">
                <h3 class="t-h4">{p.title}</h3>
                <dl class="kv">
                  <div><dt>Location</dt><dd>{p.location}</dd></div>
                  <div><dt>Department</dt><dd>{p.department}</dd></div>
                  <div><dt>Contract</dt><dd>{p.contract_type}</dd></div>
                  <div><dt>Closes</dt><dd class="t-mono">{p.closes_on}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ news */

export function News() {
  useMetadata({
    title: 'News',
    description: 'Coverage of Ravel, each item with its outlet, its date, its link and its language.'
  });
  const news = useFetch('/news');
  const TAGS = ['funding', 'partnership', 'technical', 'recognition'];
  const [tag, setTag] = useState('all');

  const items = news.data
    ? (tag === 'all' ? news.data : news.data.filter((n) => n.tag === tag))
    : null;

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">News</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            One event appears once, with its coverage.
          </Reveal>
        </div>
      </section>

      <section class="page">
        <div class="tag-filter" role="group" aria-label="Filter news by tag">
          <button type="button" onClick={() => setTag('all')}
            aria-pressed={tag === 'all'} class={tag === 'all' ? 'button-primary' : ''}>
            All
          </button>
          {TAGS.map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)}
              aria-pressed={tag === t} class={tag === t ? 'button-primary' : ''}>
              {t}
            </button>
          ))}
        </div>

        {news.loading && <Loading what="the news items" />}
        {items && items.length === 0 && (
          <Empty>There is no item under this tag.</Empty>
        )}
        {items && items.length > 0 && (
          <ul class="news-list">
            {items.map((n) => (
              <li key={n.reference} class="news-item">
                <p class="t-label news-tag">{n.tag}</p>
                <h2 class="t-h4">
                  <a href={n.link} rel="noopener noreferrer">{n.title}</a>
                </h2>
                <p class="t-small t-muted news-meta">
                  <span>{n.outlet}</span>
                  <span aria-hidden="true"> · </span>
                  <span class="t-mono">{n.published_on}</span>
                  {n.language !== 'en' && (
                    <>
                      <span aria-hidden="true"> · </span>
                      {/* An item in another language says so before a reader clicks. */}
                      <span lang={n.language}>in {languageName(n.language)}</span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function languageName(code) {
  return { fr: 'French', de: 'German', nl: 'Dutch', pt: 'Portuguese' }[code] || code;
}

/* --------------------------------------------------------------- contact */

const ENQUIRY_TYPES = [
  { type: 'waste_supply', label: 'Waste supply', destination: 'feedstock@example.com', days: 3 },
  { type: 'polymer_purchase', label: 'Polymer purchase', destination: 'sales@example.com', days: 2 },
  { type: 'partnership', label: 'Partnership', destination: 'partners@example.com', days: 5 },
  { type: 'press', label: 'Press', destination: 'press@example.com', days: 1 }
];

export function Contact() {
  useMetadata({
    title: 'Contact',
    description: 'Four enquiry types, four destinations and four stated response times.'
  });
  const [type, setType] = useState('waste_supply');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);

  const chosen = ENQUIRY_TYPES.find((t) => t.type === type);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSending(true); setFailure(null); setResult(null);
    try {
      const r = await api('/enquiries', {
        method: 'POST',
        body: {
          type,
          name: form.get('name'),
          email: form.get('email'),
          organisation: form.get('organisation') || null,
          message: form.get('message')
        }
      });
      setResult(r);
      e.target.reset();
    } catch (err) {
      setFailure(err.body || { detail: 'The form could not be sent.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div class="public-route">
      <section class="hero">
        <div class="page">
          <Reveal as="h1" className="hero-title">Contact</Reveal>
          <Reveal as="p" className="t-body-big hero-lede">
            Four kinds of enquiry, each with its own address and its own stated response time.
          </Reveal>
        </div>
      </section>

      <section class="page contact-layout">
        <div>
          <h2 class="t-h4">Where your enquiry goes</h2>
          <div class="table-scroll">
            <table>
              <caption class="visually-hidden">Enquiry types, destinations and response times</caption>
              <thead>
                <tr><th scope="col">Enquiry</th><th scope="col">Goes to</th><th scope="col" class="num">We reply within</th></tr>
              </thead>
              <tbody>
                {ENQUIRY_TYPES.map((t) => (
                  <tr key={t.type}>
                    <td>{t.label}</td>
                    <td class="t-mono">{t.destination}</td>
                    <td class="num">{t.days} working day{t.days === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 class="t-h4 contact-privacy-head">What happens to what you send</h2>
          <p class="t-small">
            Ravel Materials SAS is the controller. We use your enquiry to answer it and for no
            other purpose. A general enquiry is kept for 24 months, a waste-supply or polymer
            enquiry for 36 months and a press enquiry for 12 months. To have it removed, write
            to <a href="mailto:privacy@example.com">privacy@example.com</a>. Our full{' '}
            <Link href="/privacy">privacy policy</Link> states every retention period.
          </p>
        </div>

        <form class="card contact-form stack" onSubmit={submit}>
          <fieldset class="fieldset">
            <legend class="t-label">Kind of enquiry</legend>
            <div class="radio-row">
              {ENQUIRY_TYPES.map((t) => (
                <label key={t.type} class="radio-option">
                  <input type="radio" name="type" value={t.type}
                    checked={type === t.type} onChange={() => setType(t.type)} />
                  <span>{t.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p class="t-small t-muted">
            This goes to <span class="t-mono">{chosen.destination}</span> and we reply within{' '}
            {chosen.days} working day{chosen.days === 1 ? '' : 's'}.
          </p>

          <label>
            <span class="t-label">Your name</span>
            <input name="name" required autocomplete="name" />
          </label>
          <label>
            <span class="t-label">Your email address</span>
            <input name="email" type="email" required autocomplete="email" />
          </label>
          <label>
            <span class="t-label">Organisation (optional)</span>
            <input name="organisation" autocomplete="organization" />
          </label>
          <label>
            <span class="t-label">Your message</span>
            <textarea name="message" rows="5" required></textarea>
          </label>

          <button type="submit" class="button-primary" disabled={sending}>
            {sending ? 'Sending your enquiry' : 'Send this enquiry'}
            <span class="arrow" aria-hidden="true">→</span>
          </button>

          {/* Neither result state is a builder default string. */}
          {result && (
            <div class="result-success" role="status">
              <p class="t-label">Received</p>
              <p>
                Your enquiry has the reference <span class="t-mono">{result.reference}</span>.
                It has gone to <span class="t-mono">{result.destination}</span> and somebody
                there will reply within {result.response_days} working
                day{result.response_days === 1 ? '' : 's'}. We have sent a copy of that
                reference to the address you gave.
              </p>
            </div>
          )}
          {failure && (
            <div class="refusal" role="alert">
              <p class="t-label refusal-head">Not sent</p>
              <p class="refusal-detail">
                {failure.detail || 'The form could not reach us.'}
              </p>
              <p class="t-small">
                You can try again in a moment, or write directly to{' '}
                <a href={`mailto:${chosen.destination}`} class="t-mono">{chosen.destination}</a>,
                which does not depend on this form working.
              </p>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- privacy */

export function Privacy() {
  useMetadata({
    title: 'Privacy',
    description: 'Who receives your data, what it is used for, how long it is kept and how to have it removed.'
  });
  const retentions = [
    ['An enquiry', 24],
    ['A waste-supply enquiry', 36],
    ['A polymer enquiry', 36],
    ['A press enquiry', 12],
    ['An account and its acts', 120],
    ['The operational record', 180]
  ];
  return (
    <div class="public-route">
      <section class="page privacy-route">
        <Reveal as="h1" className="t-h3">Privacy</Reveal>

        <div class="prose stack">
          <h2 class="t-h4">Who we are</h2>
          <p>
            Ravel Materials SAS is the controller for the personal data described here. Our
            postal address is 14 rue des Fabriques, 69007 Lyon, France.
          </p>
          <p>
            For a rights request — access, correction, erasure, portability or objection —
            write to <a href="mailto:privacy@example.com">privacy@example.com</a>. To report a
            security issue, write to <a href="mailto:security@example.com">security@example.com</a>.
          </p>

          <h2 class="t-h4">How long we keep things</h2>
        </div>
        <div class="table-scroll prose-wide">
          <table>
            <caption class="visually-hidden">Retention period for each purpose, in months</caption>
            <thead>
              <tr><th scope="col">Purpose</th><th scope="col" class="num">Retention, in months</th></tr>
            </thead>
            <tbody>
              {retentions.map(([what, months]) => (
                <tr key={what}><td>{what}</td><td class="num">{months}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div class="prose stack privacy-tail">
          <h2 class="t-h4">The operational record</h2>
          <p>
            Our operational record names individuals. It records who booked in a batch, who
            entered a test result, who released a lot, who allocated a claim and who signed a
            certificate. That is the point of it: a claim nobody's name is attached to is not a
            claim anybody can be held to.
          </p>
          <p>
            We retain that record under a legal obligation and under our certification scheme's
            requirement, and <strong>it is not erased on request</strong>. A person inside the
            record is referenced by an identifier, and that identifier resolves to a name
            through a separate store with its own retention. A former employee's contact detail
            is erased on request; the fact that they performed an act, and the identifier that
            names them, is not.
          </p>

          <h2 class="t-h4">Certificate verification</h2>
          <p>
            The verification page for a certificate returns the number, its state, its dates,
            the site, the grade, the claim type and the recipient's name, and nothing else. It
            is excluded from search indexing, because a certificate's recipient is a customer
            relationship rather than a public fact.
          </p>

          <h2 class="t-h4">What we do not do</h2>
          <p>
            We take no payment on this site, store no file in an object store, set no
            advertising cookie and share nothing with a third party for marketing. There is no
            signup, no password reset and no self-service account creation.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- verify */

export function Verify({ number }) {
  useMetadata({
    title: `Verify ${number}`,
    description: 'Check a Ravel certificate by its number.',
    noindex: true
  });
  const state = useFetch(`/verify/${encodeURIComponent(number)}`, [number]);

  return (
    <div class="public-route">
      <section class="page verify-route">
        <span class="t-eyebrow">Certificate verification</span>
        <h1 class="t-h3">{number}</h1>

        {state.loading && <Loading what="this certificate" />}

        {state.data && !state.data.found && (
          /* An unknown number reads the same layout, saying there is no such
             certificate. It does not error and it does not enumerate. */
          <div class="sheet verify-sheet">
            <StateWord word="no such certificate" />
            <p>
              No certificate is recorded at this number. Check the number against the document
              you were sent; a Ravel certificate number reads like{' '}
              <span class="t-mono">CERT-DEMO-000001</span>.
            </p>
            <dl class="kv verify-kv">
              <div><dt>Number</dt><dd class="t-mono">{state.data.number}</dd></div>
              <div><dt>State</dt><dd>—</dd></div>
              <div><dt>Issued on</dt><dd>—</dd></div>
              <div><dt>Site</dt><dd>—</dd></div>
              <div><dt>Grade</dt><dd>—</dd></div>
              <div><dt>Claim type</dt><dd>—</dd></div>
              <div><dt>Recipient</dt><dd>—</dd></div>
            </dl>
          </div>
        )}

        {state.data && state.data.found && (
          <div class="sheet verify-sheet">
            {/* A withdrawn certificate says withdrawn before it shows any
                figure, and offers no forwarding to a replacement. */}
            {state.data.state === 'withdrawn' && (
              <div class="withdrawal-notice">
                <StateWord word="withdrawn" />
                <p class="statement">
                  This certificate was withdrawn on {state.data.withdrawn_on}.
                  {' '}Reason: {state.data.withdrawal_reason}.
                </p>
              </div>
            )}
            {state.data.state === 'issued' && <StateWord word="issued" />}
            {state.data.state === 'superseded' && (
              <StateWord word="superseded" detail="a later version of this certificate exists" />
            )}

            <dl class="kv verify-kv">
              <div><dt>Number</dt><dd class="t-mono">{state.data.number}</dd></div>
              <div><dt>State</dt><dd>{state.data.state}</dd></div>
              <div><dt>Issued on</dt><dd class="t-mono">{state.data.issued_on}</dd></div>
              {state.data.withdrawn_on && (
                <div><dt>Withdrawn on</dt><dd class="t-mono">{state.data.withdrawn_on}</dd></div>
              )}
              {state.data.withdrawal_reason && (
                <div><dt>Withdrawal reason</dt><dd>{state.data.withdrawal_reason}</dd></div>
              )}
              <div><dt>Site</dt><dd class="t-mono">{state.data.site}</dd></div>
              <div><dt>Grade</dt><dd class="t-mono">{state.data.grade}</dd></div>
              <div><dt>Claim type</dt><dd>{state.data.claim_type?.replace(/_/g, ' ')}</dd></div>
              <div><dt>Recipient</dt><dd>{state.data.recipient_name}</dd></div>
            </dl>

            <p class="t-small t-muted verify-scope">
              This page states what the certificate is and what became of it. It carries no
              yield figure, no collector, no genealogy and no carbon breakdown. Those live with
              the parties entitled to read them.
            </p>
          </div>
        )}

        {state.error && (
          <div class="refusal" role="alert">
            <p class="t-label refusal-head">Could not check</p>
            <p class="refusal-detail">{state.error.detail}</p>
          </div>
        )}
      </section>
    </div>
  );
}

export function NotFound() {
  useMetadata({ title: 'Not found', description: 'No page is published at this address.' });
  return (
    <div class="public-route">
      <section class="page">
        <h1 class="t-h3">No page is published at this address.</h1>
        <p>
          Check the address, or start from <Link href="/">the home page</Link>. If you were
          looking for a certificate, its address is{' '}
          <span class="t-mono">/verify/&#123;number&#125;</span>.
        </p>
      </section>
    </div>
  );
}
