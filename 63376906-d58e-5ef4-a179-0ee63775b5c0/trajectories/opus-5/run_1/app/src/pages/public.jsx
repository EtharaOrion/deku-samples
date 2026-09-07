import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { Reveal, State, Empty, Loading, Refusal, Capacity, Mark, formatInt, formatBp } from '../components/ui.jsx';

function useFetch(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e }));
    return () => { live = false; };
  }, deps);
  return state;
}

function Hero({ eyebrow, title, standfirst }) {
  return (
    <header class="section" style="padding-top:3.5rem">
      <Reveal class="stack">
        {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
        <h1 style="max-width:18ch">{title}</h1>
        {standfirst ? <p class="body-big measure">{standfirst}</p> : null}
        <div class="accent-rule" role="presentation" />
      </Reveal>
    </header>
  );
}

export function Home() {
  const stats = useFetch('/statistics');
  return (
    <div class="shell page">
      <Hero
        eyebrow="Ravel"
        title="Tomorrow's materials. Made from today's waste."
        standfirst="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon."
      />

      <section class="section">
        <Reveal as="h2">Nylon that goes on and on and on</Reveal>
        <div class="stack measure" style="margin-top:1.5rem">
          <p>
            Nylon is a material worth keeping. It is strong, it is light, and it survives
            being made into a thing and then unmade again. What it has lacked is a way back:
            a route from a mixed, contaminated, awkward waste stream to a pellet a
            manufacturer can put straight into an existing process without changing anything.
          </p>
          <p>
            We built that route, and we built the record that proves each pellet came through it.
          </p>
        </div>
      </section>

      <section class="section">
        <Reveal as="h2">The power of green chemistry</Reveal>
        <div class="stack measure" style="margin-top:1.5rem">
          <p>
            Our process is chemical rather than mechanical, so the polymer is taken back to its
            building blocks and rebuilt. Mechanical recycling shortens the chain a little each
            time. Chemical recycling does not, which is why the output meets a virgin
            specification rather than a recycled one.
          </p>
          <p>
            It runs at <span class="highlight-mark">low temperature and low pressure</span>,
            with reagents chosen for what they are as much as for what they do.
          </p>
        </div>
      </section>

      <section class="section">
        <Reveal as="h2">We're closing the loop</Reveal>
        <div class="stack measure" style="margin-top:1.5rem">
          <p>
            A loop is only closed if somebody can check it. Every lot we ship carries a
            genealogy back to the batches it came from, the collectors who delivered them and
            the approval those collectors held on the day of delivery. Every claim is
            arithmetic over that record, computed rather than asserted, and every certificate
            states what the recipient may say and what they may not.
          </p>
          <p>
            Losses reduce the claim. Material that disappears in processing does not carry its
            claim forward, and the ledger will not let it.
          </p>
          <p>
            <Link href="/technology" class="button">
              How the process works <span class="arrow" aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      <section class="section">
        <h2>The hard facts</h2>
        {stats.loading ? <Loading what="the published figures" /> : null}
        {stats.error ? <Empty>The published figures could not be loaded.</Empty> : null}
        {stats.data ? (
          <div class="grid grid--3" style="margin-top:1.5rem">
            {stats.data.map((s) => (
              <Reveal class="card stack-s" key={s.key}>
                <p class="body-big">{s.value}</p>
                <p class="note">
                  Source: {s.source} · {s.year} · {s.geography}
                </p>
              </Reveal>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function Product() {
  const specs = useFetch('/specifications/SPEC-N6/versions/3');
  const grades = [
    {
      grade: 'Nylon 6',
      limitation:
        'Recycled Nylon 6 came almost entirely from one source, discarded fishing nets. That is a narrow supply, and it is already spoken for.',
      claim:
        'We take post-consumer textiles and pre-consumer offcuts as well, which is a far larger and far messier stream, and we make the same pellet from it.',
    },
    {
      grade: 'Nylon 6,6',
      limitation:
        'Nylon 6,6 had no recycling solution at all. It is the harder polymer to depolymerise and nobody was doing it at scale.',
      claim:
        'Our chemistry handles both, so a manufacturer running 6,6 has a recycled option for the first time.',
    },
  ];
  const industries = ['textiles and apparel', 'automotive', 'electrical and electronics',
                      'consumer goods', 'industrial', 'construction'];
  const features = [
    { head: 'Nylon in any form', body: 'Fibre, film, fabric, carpet, offcut or moulded part. The process takes nylon in any form, because the material that arrives at a plant is never one clean shape.' },
    { head: 'Drop-in by specification', body: 'The pellet meets the virgin specification rather than a recycled one, so it goes into an existing process without a requalification.' },
    { head: 'A claim with a record behind it', body: 'Every certificate rests on a genealogy, a versioned method and a ledger that refuses an allocation it cannot support.' },
  ];
  return (
    <div class="shell page">
      <Hero
        eyebrow="Product"
        title="Same material. Better origin."
        standfirst="We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise."
      />

      <section class="section">
        <h2>Two grades</h2>
        <div class="grid grid--2" style="margin-top:1.5rem">
          {grades.map((g) => (
            <Reveal class="card stack-s" key={g.grade}>
              <h3 class="h4" style="font-size:var(--h4-size);line-height:var(--h4-line)">{g.grade}</h3>
              <p class="label">The limitation</p>
              <p>{g.limitation}</p>
              <p class="label">What we do</p>
              <p>{g.claim}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section class="section">
        <h2>Industries</h2>
        <ul class="grid grid--3" style="margin-top:1.5rem">
          {industries.map((i) => (
            <li class="card" key={i}>{i}</li>
          ))}
        </ul>
      </section>

      <section class="section">
        <h2>Features</h2>
        <div class="grid grid--3" style="margin-top:1.5rem">
          {features.map((f) => (
            <Reveal class="stack-s" key={f.head}>
              <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">{f.head}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section class="section">
        <h2>Specification</h2>
        <p class="note" style="margin-top:0.75rem">
          SPEC-N6 version 3, issued {specs.data ? specs.data.issued_on : '…'}. A guaranteed
          limit is tested on every lot.
        </p>
        {specs.loading ? <Loading what="the specification" /> : null}
        {specs.data ? (
          <>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <caption class="visually-hidden">SPEC-N6 version 3, one row per property</caption>
                <thead>
                  <tr><th scope="col">Property</th><th scope="col">Method</th>
                      <th scope="col" class="num">Limit</th><th scope="col">Unit</th>
                      <th scope="col">Basis</th></tr>
                </thead>
                <tbody>
                  {specs.data.rows.map((r) => (
                    <tr key={r.property}>
                      <td>{r.property.replace(/_/g, ' ')}</td>
                      <td class="mono">{r.method}</td>
                      <td class="num">{r.limit}</td>
                      <td>{r.unit}</td>
                      <td>{r.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="note" style="margin-top:1rem">
              Virgin-quality comparison: {specs.data.virgin_reference.reference}, from{' '}
              {specs.data.virgin_reference.source}, dated {specs.data.virgin_reference.dated}.
            </p>
          </>
        ) : null}
        <div class="card stack-s" style="margin-top:1.5rem">
          <p class="label">Recycled content claim, grade N6</p>
          <p>
            <span class="mono">9000 bp</span> — {formatBp(9000)} recycled content, claimed by{' '}
            <strong>mass balance</strong> under scheme RCS-2026.
          </p>
          <p class="note">
            This material is claimed by mass balance. It is not physically segregated.
          </p>
        </div>
      </section>
    </div>
  );
}

export function Technology() {
  const diagram = useFetch('/process-diagram');
  const sites = useFetch('/sites');
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    if (!sites.data) return;
    Promise.all(sites.data.map((s) => api(`/sites/${s.reference}/capacity`)))
      .then(setCaps).catch(() => setCaps([]));
  }, [sites.data]);

  const attributes = [
    { name: 'Green chemicals & reagents', claim: true,
      evidence: 'Reagent register with supplier declarations dated 2026, held against carbon method CM-PA6 v2.' },
    { name: 'Low temperature & pressure', claim: true,
      evidence: 'Recipe versions RCP-DISS-2 and RCP-REPO-3, with recorded set points, tolerances and the person who released them.' },
    { name: 'Low carbon impact', claim: true,
      evidence: 'Carbon figure 4260000 mg CO2e per kg, boundary cradle-to-gate, method CM-PA6 v2, uncertainty 1200 bp. This figure is lower than virgin PA6 (EcoBase 2025, EU-27).' },
    { name: 'Takes nylon in any form', claim: false },
    { name: 'Drop-in specification', claim: false },
  ];
  const rowFor = (ref) => (caps || []).find((c) => c.reference === ref);
  const capacityRows = [
    { label: 'Pilot (2026)', ref: 'SITE-PILOT' },
    { label: 'Demonstration (2027)', ref: 'SITE-DEMO' },
    { label: 'Commercial Plant (2030+)', ref: 'SITE-COMM' },
  ];

  return (
    <div class="shell page">
      <Hero
        eyebrow="Technology"
        title="Four steps, and a record of each"
        standfirst="Waste arrives in batches, is consumed by timed process runs through four stages, and leaves as lots of polymer with a genealogy behind them."
      />

      <section class="section">
        <h2>The process</h2>
        {diagram.loading ? <Loading what="the process diagram" /> : null}
        {diagram.data ? (
          <>
            <ol class="grid grid--4" style="margin-top:1.5rem">
              {diagram.data.stages.map((s, i) => (
                <Reveal as="li" class="card stack-s" key={s.stage}>
                  <p class="label">Step {i + 1}</p>
                  <h3 style="font-size:var(--h4-size);line-height:var(--h4-line);text-transform:capitalize">
                    {s.stage}
                  </h3>
                  <p class="mono">{formatInt(s.mass_in_g)} g in</p>
                  <p class="mono">{formatInt(s.mass_out_g)} g out</p>
                  <p class="mono">{formatInt(s.losses_g)} g lost</p>
                </Reveal>
              ))}
            </ol>
            <p class="note" style="margin-top:1rem">Losses reduce the claim.</p>
            <details style="margin-top:1rem">
              <summary class="label" style="cursor:pointer">The same diagram in words</summary>
              <ul class="stack-s" style="margin-top:0.75rem">
                {diagram.data.text_equivalent.map((t) => <li key={t}>{t}</li>)}
              </ul>
            </details>
          </>
        ) : null}
      </section>

      <section class="section">
        <h2>Capacity</h2>
        <p class="note" style="margin-top:0.75rem">
          Every figure is in tonnes per year, on a basis of{' '}
          {caps && caps[0] ? caps[0].basis : '8000 hours per year, 0.90 availability, 0.80 yield'}.
          A year is a calendar year. A capacity figure is never shown without its confidence.
        </p>
        {!caps ? <Loading what="the capacity table" /> : (
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">Capacity per site, in tonnes per year, with confidence</caption>
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
                {capacityRows.map((r) => {
                  const c = rowFor(r.ref);
                  if (!c) return null;
                  const t = (kg) => `${(kg / 1000).toLocaleString('en-GB')} tonnes per year`;
                  return (
                    <tr key={r.ref}>
                      <th scope="row" style="font-family:var(--serif);text-transform:none;letter-spacing:0;font-size:var(--body-small-size);color:var(--ink)">
                        {r.label}
                      </th>
                      <td class="num">
                        {c.confidence === 'planned' ? '>' : ''}{t(c.nameplate_kg)}
                      </td>
                      <td class="num">{t(c.contracted_kg)}</td>
                      <td class="num">{t(c.uncommitted_kg)}</td>
                      <td>
                        {c.confidence === 'planned'
                          ? <State word="planned" strong><Mark kind="flag" label="" /></State>
                          : <State word={c.confidence} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section class="section">
        <h2>Five attributes</h2>
        <ul class="stack" style="margin-top:1.5rem">
          {attributes.map((a) => (
            <li class="card stack-s" key={a.name}>
              <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">{a.name}</h3>
              {a.claim ? (
                <>
                  <p class="label">Evidence</p>
                  <p>{a.evidence}</p>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function About() {
  const stats = useFetch('/statistics');
  return (
    <div class="shell page">
      <Hero
        eyebrow="About"
        title="A record, not a story"
        standfirst="Ravel Materials SAS returns mixed polyamide waste to virgin-quality pellet, and keeps the record that lets a customer's auditor check the claim."
      />
      <section class="section">
        <h2>The hard facts</h2>
        {stats.loading ? <Loading what="the published figures" /> : null}
        {stats.data ? (
          <div class="grid grid--3" style="margin-top:1.5rem">
            {stats.data.map((s) => (
              <Reveal class="card stack-s" key={s.key}>
                <p class="body-big">{s.value}</p>
                <dl class="stack-s note" style="margin-top:0.5rem">
                  <div><span class="label">Source</span> {s.source}</div>
                  <div><span class="label">Year</span> {s.year}</div>
                  <div><span class="label">Geography</span> {s.geography}</div>
                </dl>
              </Reveal>
            ))}
          </div>
        ) : null}
      </section>
      <section class="section">
        <h2>What we do not do</h2>
        <div class="stack measure" style="margin-top:1.5rem">
          <p>
            This system controls no equipment, holds no set point, drives no valve and raises no
            alarm. It reads the control system's record after the fact and shows the disagreement
            rather than resolving it.
          </p>
          <p>
            It builds no life-cycle model, issues no invoice and hedges nothing. It records what a
            run did, after the run.
          </p>
        </div>
      </section>
    </div>
  );
}

export function Careers() {
  const positions = useFetch('/positions');
  const count = positions.data ? positions.data.length : null;
  return (
    <div class="shell page">
      <Hero eyebrow="Careers" title="Why this problem matters" />
      <section class="section">
        <div class="stack measure">
          <p>
            Less than one per cent of textiles are recycled into new materials. The rest is
            landfilled, incinerated or exported. That is not a failure of intention; it is a
            failure of chemistry and of bookkeeping, and both are solvable.
          </p>
          <p>
            The chemistry gets a material back to a specification. The bookkeeping is what makes
            the claim worth paying for, and it is the harder of the two to get right, because a
            claim that cannot be traced to a batch is a claim a regulator will eventually take
            apart.
          </p>
          <p>
            If you want to work on a problem where the arithmetic has to be exactly right, this
            is one.
          </p>
        </div>
      </section>
      <section class="section">
        <h2>{count === null ? 'Open positions' : `${count} open position${count === 1 ? '' : 's'}`}</h2>
        {positions.loading ? <Loading what="the open roles" /> : null}
        {positions.data && positions.data.length === 0 ? (
          <Empty>There are no open positions at the moment.</Empty>
        ) : null}
        {positions.data && positions.data.length > 0 ? (
          <ul class="stack" style="margin-top:1.5rem">
            {positions.data.map((p) => (
              <li class="card stack-s" key={p.reference}>
                <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">{p.title}</h3>
                <dl class="note stack-s">
                  <div><span class="label">Location</span> {p.location}</div>
                  <div><span class="label">Department</span> {p.department}</div>
                  <div><span class="label">Contract</span> {p.contract_type}</div>
                  <div><span class="label">Closes</span> <span class="mono">{p.closes_on}</span></div>
                </dl>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function News() {
  const news = useFetch('/news');
  return (
    <div class="shell page">
      <Hero eyebrow="News" title="Coverage" standfirst="One event, listed once, with its coverage." />
      <section class="section">
        {news.loading ? <Loading what="the news items" /> : null}
        {news.data && news.data.length === 0 ? <Empty>There are no news items yet.</Empty> : null}
        {news.data ? (
          <ul class="stack">
            {news.data.map((n) => (
              <li class="card stack-s" key={n.reference}>
                <p class="label">{n.tag}</p>
                <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">{n.title}</h3>
                <p class="note">
                  {n.outlet} · <span class="mono">{n.date}</span>
                </p>
                {n.language !== 'en' ? (
                  <p><State word={`in ${n.language === 'fr' ? 'French' : n.language}`} /></p>
                ) : null}
                <p>
                  <a href={n.link} rel="noopener noreferrer">
                    Read at {n.outlet}
                    {n.language !== 'en' ? ` (in ${n.language === 'fr' ? 'French' : n.language})` : ''}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

const ENQUIRY_TYPES = [
  { type: 'waste_supply', label: 'Waste supply', destination: 'feedstock@example.com', days: 3 },
  { type: 'polymer_purchase', label: 'Polymer purchase', destination: 'sales@example.com', days: 2 },
  { type: 'partnership', label: 'Partnership', destination: 'partners@example.com', days: 5 },
  { type: 'press', label: 'Press', destination: 'press@example.com', days: 1 },
];

export function Contact() {
  const [type, setType] = useState('waste_supply');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api('/enquiries', {
        method: 'POST',
        body: { type, email, name, organisation, message },
      });
      setResult(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="shell page">
      <Hero eyebrow="Contact" title="Four enquiry types, four destinations" />
      <section class="section">
        <div class="split">
          <div class="stack">
            <form class="stack" onSubmit={submit}>
              <label class="field">
                <span>Enquiry type</span>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {ENQUIRY_TYPES.map((t) => (
                    <option value={t.type} key={t.type}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Your name</span>
                <input value={name} onInput={(e) => setName(e.target.value)} autocomplete="name" />
              </label>
              <label class="field">
                <span>Your organisation</span>
                <input value={organisation} onInput={(e) => setOrganisation(e.target.value)}
                       autocomplete="organization" />
              </label>
              <label class="field">
                <span>Your email address</span>
                <input type="email" required value={email} onInput={(e) => setEmail(e.target.value)}
                       autocomplete="email" />
              </label>
              <label class="field">
                <span>Message</span>
                <textarea rows="4" value={message} onInput={(e) => setMessage(e.target.value)} />
              </label>
              <p>
                <button class="button" type="submit" disabled={busy}>
                  {busy ? 'Sending…' : 'Send enquiry'} <span class="arrow" aria-hidden="true">→</span>
                </button>
              </p>
            </form>

            {result ? (
              <div class="banner" role="status">
                <p class="banner__title">Your enquiry was received.</p>
                <p style="margin-top:0.4rem">
                  It is reference <span class="mono">{result.reference}</span>. It has gone to{' '}
                  <span class="mono">{result.destination}</span>, and somebody will answer within{' '}
                  {result.response_days} working day{result.response_days === 1 ? '' : 's'}.
                  A confirmation has been sent to the address you gave.
                </p>
              </div>
            ) : null}
            {error ? (
              <Refusal title="Your enquiry was not sent.">
                <p>{error.body && error.body.detail ? error.body.detail : 'The form could not reach us.'}</p>
                <p>
                  You can try again, or write directly to{' '}
                  <a href="mailto:privacy@example.com">privacy@example.com</a>, which does not
                  depend on this form working.
                </p>
              </Refusal>
            ) : null}
          </div>

          <aside class="stack">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Where it goes</h2>
            <ul class="stack-s">
              {ENQUIRY_TYPES.map((t) => (
                <li key={t.type}>
                  <p><strong>{t.label}</strong></p>
                  <p class="note">
                    <span class="mono">{t.destination}</span> · answered within {t.days} working
                    day{t.days === 1 ? '' : 's'}
                  </p>
                </li>
              ))}
            </ul>
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">What we do with it</h2>
            <p class="note">
              Your enquiry is received by Ravel Materials SAS and used only to answer it. A general
              enquiry is kept for 24 months, a waste-supply or polymer enquiry for 36 months and a
              press enquiry for 12 months. To have it removed, write to{' '}
              <a href="mailto:privacy@example.com">privacy@example.com</a>. Our{' '}
              <Link href="/privacy">privacy policy</Link> states this in full.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function Privacy() {
  const retentions = [
    ['An enquiry', 24], ['A waste-supply enquiry', 36], ['A polymer enquiry', 36],
    ['A press enquiry', 12], ['An account and its acts', 120], ['The record', 180],
  ];
  return (
    <div class="shell page">
      <Hero eyebrow="Privacy" title="Privacy policy" />
      <section class="section">
        <div class="stack measure">
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Who we are</h2>
          <p>
            This site belongs to Ravel. The controller of the data described here is{' '}
            <strong>Ravel Materials SAS</strong>, 14 rue de la Manufacture, 69007 Lyon, France.
          </p>
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Your rights</h2>
          <p>
            To ask for a copy of your data, to correct it or to have it removed, write to{' '}
            <a href="mailto:privacy@example.com">privacy@example.com</a>. We answer within one
            month.
          </p>
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">How long we keep it</h2>
          <div class="scroller">
            <table>
              <caption class="visually-hidden">Retention in months, per purpose</caption>
              <thead>
                <tr><th scope="col">Purpose</th><th scope="col" class="num">Months</th></tr>
              </thead>
              <tbody>
                {retentions.map(([what, months]) => (
                  <tr key={what}>
                    <td>{what}</td>
                    <td class="num">{months}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The operational record</h2>
          <p>
            The operational record names individuals: who booked in a batch, who entered a test
            result, who signed a certificate. It is retained under a legal and scheme obligation
            and <strong>is not erased on request</strong>. A former employee's contact detail is
            erased on request; their acts in the record are not, because a certificate issued
            years ago has to remain reproducible.
          </p>
          <p>
            A person inside the record is referenced by an identifier, and that identifier resolves
            to a name through a separate store with its own retention.
          </p>
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Reporting a vulnerability</h2>
          <p>
            Write to <a href="mailto:security@example.com">security@example.com</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

export function Verify({ number }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    setState({ loading: true, data: null, error: null });
    fetch('/api/verify/' + encodeURIComponent(number))
      .then((r) => r.json())
      .then((d) => setState({ loading: false, data: d, error: null }))
      .catch((e) => setState({ loading: false, data: null, error: e }));
  }, [number]);

  const d = state.data;
  return (
    <div class="shell page">
      <Hero eyebrow="Verification" title="Certificate verification" />
      <section class="section">
        <div class="sheet measure">
          {state.loading ? <Loading what="this certificate" /> : null}
          {state.error ? <Empty>This certificate could not be checked just now.</Empty> : null}
          {d && !d.found ? (
            <div class="stack">
              <p class="label">Certificate number</p>
              <p class="mono body-big">{d.number}</p>
              <p><State word="no such certificate" strong /></p>
              <p>
                There is no certificate with this number. Check the number against the document you
                were given; a certificate number is never reused, so a number that has never been
                issued stays unissued.
              </p>
            </div>
          ) : null}
          {d && d.found ? (
            <div class="stack">
              {d.state === 'withdrawn' ? (
                <div class="banner">
                  <p class="banner__title">
                    <Mark kind="warning" label="Withdrawn" />
                  </p>
                  <p style="margin-top:0.4rem">
                    This certificate was withdrawn on {d.withdrawn_on}. Reason: {d.withdrawal_reason}.
                  </p>
                </div>
              ) : null}
              <dl class="stack-s">
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Number</dt>
                  <dd class="mono" style="margin:0">{d.number}</dd>
                </div>
                <div class="balance-figure">
                  <dt class="label" style="margin:0">State</dt>
                  <dd style="margin:0"><State word={d.state} strong={d.state === 'withdrawn'} /></dd>
                </div>
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Issued on</dt>
                  <dd class="mono" style="margin:0">{d.issued_on}</dd>
                </div>
                {d.withdrawn_on ? (
                  <div class="balance-figure">
                    <dt class="label" style="margin:0">Withdrawn on</dt>
                    <dd class="mono" style="margin:0">{d.withdrawn_on}</dd>
                  </div>
                ) : null}
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Site</dt>
                  <dd class="mono" style="margin:0">{d.site}</dd>
                </div>
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Grade</dt>
                  <dd class="mono" style="margin:0">{d.grade}</dd>
                </div>
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Claim type</dt>
                  <dd style="margin:0">{d.claim_type.replace(/_/g, ' ')}</dd>
                </div>
                <div class="balance-figure">
                  <dt class="label" style="margin:0">Recipient</dt>
                  <dd style="margin:0">{d.recipient_name}</dd>
                </div>
              </dl>
              <p class="note">
                This answer carries no yield, no collector, no genealogy and no carbon breakdown.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function NotFound() {
  return (
    <div class="shell page">
      <Hero eyebrow="Not found" title="There is no page at this address." />
      <section class="section">
        <p class="measure">
          Check the address, or start again from the <Link href="/">home page</Link>.
        </p>
      </section>
    </div>
  );
}
