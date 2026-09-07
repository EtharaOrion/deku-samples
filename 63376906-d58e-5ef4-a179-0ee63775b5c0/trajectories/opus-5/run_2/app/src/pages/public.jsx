import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { Link, useMeta } from '../lib/router.jsx';
import { Reveal, Empty, Loading, Word, CapacityFigure, Mark } from '../components/common.jsx';
import { grams, kilograms, date, words, basisPoints, percentFromBp } from '../lib/format.js';

function useFetch(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e }));
    return () => { live = false; };
  }, [path]);
  return state;
}

/* ------------------------------------------------------------------ home */
export function Home() {
  useMeta('Ravel — Tomorrow\'s materials. Made from today\'s waste.',
    'Ravel returns mixed polyamide waste to virgin-quality pellet, and issues the certificate that proves where it came from.');
  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Tomorrow's materials. Made from today's waste.</Reveal>
        <Reveal as="p" class="t-body-big" style="max-width:44rem">
          Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
        </Reveal>
      </header>

      <hr class="rule" />

      <section class="three-up">
        <Reveal as="div">
          <h3>Nylon that goes on and on and on</h3>
          <p>
            Nylon is worth recovering because it can be taken back to its monomer and rebuilt
            without the loss that ends most recycling after one turn. Our chemistry returns the
            same polymer, not a lesser one, and it can be done again to the material it makes.
          </p>
        </Reveal>
        <Reveal as="div">
          <h3 class="accent">The power of green chemistry</h3>
          <p>
            Dissolution and depolymerisation run at low temperature and low pressure with
            reagents chosen for what they do to the people handling them as much as for yield.
            Every set point is released against a recipe version and recorded after the run.
          </p>
        </Reveal>
        <Reveal as="div">
          <h3>We're closing the loop</h3>
          <p>
            A loop is only closed if somebody can show it. Every pellet we ship carries a
            record that runs back through its runs, its feedstock batches and the collector
            who delivered them, on the date they were delivered.
          </p>
        </Reveal>
      </section>

      <section class="sheet">
        <h4>What closing the loop actually requires</h4>
        <p>
          The material is deliberately indistinguishable from the incumbent, so a buyer is not
          paying for the pellet. They are paying for origin, and origin cannot be measured in a
          pellet: it exists only as a record. That record is the product.
        </p>
        <p>
          Two rules do most of the work. Losses reduce the claim — material that disappears in
          processing does not carry its claim forward. And no claim percentage is ever accepted
          from a person, on any route, in any form: every percentage this company publishes is
          computed from the ledger and carries the versions it was computed against.
        </p>
        <p style="margin-bottom:0">
          <Link href="/verify/CERT-PILOT-000001">Verify a certificate</Link> without an account,
          or read <Link href="/technology">how the process works</Link>.
        </p>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- product */
export function Product() {
  useMeta('Ravel — Same material. Better origin.',
    'Low-carbon, virgin-quality recycled Nylon 6 and 6,6, with the specification, the claim type and the scheme stated beside the grade.');
  const spec = useFetch('/specifications/SPEC-N6/versions/3');
  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Same material. Better origin.</Reveal>
        <Reveal as="p" class="t-body-big" style="max-width:46rem">
          We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for manufacturers who
          refuse to compromise.
        </Reveal>
      </header>

      <hr class="rule" />

      <section>
        <h2>Two grades</h2>
        <div class="two-up">
          <div class="sheet">
            <p class="eyebrow">Grade</p>
            <h3>Nylon 6</h3>
            <p>
              <strong>The limitation first:</strong> recycled Nylon 6 came almost entirely from
              one source, discarded fishing nets. That is a narrow and contested feedstock, and
              it cannot supply an industry.
            </p>
            <p style="margin-bottom:0">
              We take mixed post-consumer and pre-consumer polyamide textile waste instead,
              contaminated and unsorted, and return it to pellet.
            </p>
          </div>
          <div class="sheet">
            <p class="eyebrow">Grade</p>
            <h3>Nylon 6,6</h3>
            <p>
              <strong>The limitation first:</strong> Nylon 6,6 had no recycling solution at all.
              Its chemistry resists the routes that work on Nylon 6, so it has been landfilled
              and incinerated by default.
            </p>
            <p style="margin-bottom:0">
              Our depolymerisation route reaches both, which is what makes a mixed waste stream
              usable rather than a sorting problem.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>Industries</h2>
        <ul class="three-up" style="list-style:none;padding:0">
          {['Textiles and apparel', 'Automotive', 'Electrical and electronics',
            'Consumer goods', 'Industrial', 'Construction'].map((i) => (
            <li key={i} style="padding:.5rem 0;border-bottom:1px solid var(--ink-hairline)">{i}</li>
          ))}
        </ul>
      </section>

      <section class="three-up">
        <div>
          <h4>Nylon in any form</h4>
          <p>
            Fibre, film, filament, offcut or moulded part: the process takes nylon in any form,
            because it dissolves the polymer rather than sorting the object it came in.
          </p>
        </div>
        <div>
          <h4>Contamination is expected</h4>
          <p>
            Elastane, coatings, dyes and foreign matter are recorded at intake and carried on the
            batch record. Nothing is assumed clean, and what is rejected records where it went.
          </p>
        </div>
        <div>
          <h4>Drop-in by specification</h4>
          <p>
            The pellet is qualified against the same guaranteed limits as the virgin comparator,
            tested by the method the specification names, on every lot.
          </p>
        </div>
      </section>

      <section>
        <h2>Specification</h2>
        {spec.loading && <Loading what="the specification" />}
        {spec.error && <p class="note">The specification could not be read.</p>}
        {spec.data && (
          <>
            <p>
              <span class="mono">{spec.data.grade}</span> version{' '}
              <span class="mono">{spec.data.version}</span>, issued {date(spec.data.issued_on)}.
              The claim on this grade is <Word>mass balance</Word> under scheme{' '}
              <span class="mono">RCS-2026</span>, at up to{' '}
              <span class="figure">{basisPoints(9000)} ({percentFromBp(9000)})</span> recycled
              content attributed by mass balance.
            </p>
            <div class="scroll-x">
              <table>
                <caption class="visually-hidden">Specification properties</caption>
                <thead>
                  <tr><th>Property</th><th>Method</th><th class="num">Limit</th><th>Unit</th><th>Basis</th></tr>
                </thead>
                <tbody>
                  {spec.data.properties.map((p) => (
                    <tr key={p.property}>
                      <td>{words(p.property)}</td>
                      <td class="mono">{p.method}</td>
                      <td class="num mono">{p.limit}</td>
                      <td>{p.unit}</td>
                      <td><Word quiet={p.basis !== 'guaranteed'}>{p.basis}</Word></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="note">
              Virgin-quality comparison: {spec.data.virgin_reference.reference}, sourced from{' '}
              {spec.data.virgin_reference.source}, dated {date(spec.data.virgin_reference.date)}.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------ technology */
export function Technology() {
  useMeta('Ravel — Technology',
    'Dissolution, depolymerisation, purification and repolymerisation, with mass in and mass out per stage and the capacity table stating its unit once.');
  const diagram = useFetch('/process-diagram');
  const sites = useFetch('/sites');
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    if (!sites.data) return;
    Promise.all(sites.data.map((s) => api(`/sites/${s.reference}/capacity`)))
      .then(setCaps).catch(() => setCaps([]));
  }, [sites.data]);

  const steps = [
    ['Dissolution', 'The waste is dissolved so the polyamide leaves the object it arrived in. Contamination, dye and non-nylon fractions separate here rather than being sorted by hand beforehand.'],
    ['Depolymerisation', 'The dissolved polymer is taken back to monomer. This is the step that makes the loop repeatable: the material is rebuilt rather than reprocessed into something less.'],
    ['Purification', 'The monomer is purified to the quality a polymerisation needs. Byproducts leave here, and a sold byproduct takes a stated share of the claim and of the emissions.'],
    ['Repolymerisation', 'The purified monomer is polymerised back to pellet at the specification the customer holds, and the lot takes its claim from the ledger rather than from the process.'],
  ];

  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Four stages, recorded after the fact</Reveal>
        <Reveal as="p" class="t-body-big" style="max-width:46rem">
          This system controls no equipment and reads no live sensor. It records what a run did,
          after the run, and shows a disagreement with the control system rather than resolving it.
        </Reveal>
      </header>

      <hr class="rule" />

      <section>
        <h2>The process</h2>
        <ol style="padding-left:1.25rem">
          {steps.map(([name, body], i) => (
            <li key={name} style="margin-bottom:1.5rem">
              <h4 style="margin-bottom:.35rem">{name}</h4>
              <p>{body}</p>
              {diagram.data?.[i] && (
                <p class="note figure" style="margin:0">
                  Mass in {grams(diagram.data[i].mass_in_g)} · mass out {grams(diagram.data[i].mass_out_g)} ·
                  losses {grams(diagram.data[i].losses_g)} · {diagram.data[i].runs} runs recorded.
                  Losses reduce the claim.
                </p>
              )}
            </li>
          ))}
        </ol>
        {diagram.loading && <Loading what="the process figures" />}
      </section>

      <section>
        <h2>Capacity</h2>
        <p class="note">
          All figures are kilograms of pellet per year, on a basis of{' '}
          <span class="mono">8000 hours per year, 0.90 availability, 0.80 yield</span>. A year is
          the calendar year. A capacity figure is never given without its confidence.
        </p>
        {!caps && <Loading what="the capacity table" />}
        {caps && caps.length === 0 && <Empty>No capacity figures are published.</Empty>}
        {caps && caps.length > 0 && (
          <div class="scroll-x">
            <table>
              <caption class="visually-hidden">Capacity per site, in kilograms per year</caption>
              <thead>
                <tr>
                  <th>Site</th><th class="num">Nameplate</th><th class="num">Contracted</th>
                  <th class="num">Uncommitted</th><th>Confidence</th><th>Revised</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.reference}>
                    <td>{c.name} <span class="mono note">{c.reference}</span></td>
                    <td class="num mono">{kilograms(c.nameplate_kg)}</td>
                    <td class="num mono">{kilograms(c.contracted_kg)}</td>
                    <td class="num mono">{kilograms(c.uncommitted_kg)}</td>
                    <td><Word quiet={c.confidence !== 'planned'}>{words(c.confidence)}</Word></td>
                    <td class="mono">{date(c.last_revised)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="note">
          Commercial Plant (2030+) reads &gt;25,000 tonnes per year. Pilot (2026) is 40,000 kg per
          year. A row whose confidence is <Word>planned</Word> says so wherever it appears.
        </p>
      </section>

      <section>
        <h2>Five attributes</h2>
        <div class="two-up">
          <div>
            <h4>Green chemicals &amp; reagents</h4>
            <p class="note">
              Evidence: supplier declarations for every reagent are held on file and used as
              supplier-specific emission factors under <span class="mono">CM-PA6 v2</span>,
              approved by the quality manager and reviewed annually.
            </p>
          </div>
          <div>
            <h4>Low temperature &amp; pressure</h4>
            <p class="note">
              Evidence: released recipe versions <span class="mono">RCP-DISS-2</span> and{' '}
              <span class="mono">RCP-PURI-1</span> carry their set points and tolerances, and the
              actuals achieved are recorded against every run.
            </p>
          </div>
          <div>
            <h4>Low carbon impact</h4>
            <p class="note">
              Evidence: lot carbon figures computed under <span class="mono">CM-PA6 v2</span>,
              cradle-to-gate, against the EcoBase 2025 virgin PA6 comparator, each carrying its
              uncertainty and its primary-data share.
            </p>
          </div>
          <div>
            <h4>Nylon in any form</h4>
            <p class="note">A description of what the process accepts, not an environmental claim.</p>
          </div>
          <div>
            <h4>Recorded after the fact</h4>
            <p class="note">A description of what this system does, not an environmental claim.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- about */
export function About() {
  useMeta('Ravel — About', 'The hard facts behind the company, each with its source, its year and its geography.');
  const stats = useFetch('/statistics');
  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Why we exist</Reveal>
        <Reveal as="p" class="t-body-big" style="max-width:46rem">
          Ravel Materials SAS operates a chemical recycling plant that returns mixed polyamide
          waste to virgin-quality pellet, and issues the record that proves where it came from.
        </Reveal>
      </header>

      <hr class="rule" />

      <section>
        <h2>The hard facts</h2>
        {stats.loading && <Loading what="the published figures" />}
        {stats.data?.length === 0 && <Empty>No figures are published.</Empty>}
        {stats.data && (
          <div class="three-up">
            {stats.data.map((s) => (
              <div key={s.key} class="sheet">
                <p class="t-body-big" style="margin-bottom:.75rem">{s.value}</p>
                <p class="note" style="margin:0">
                  Source: {s.source}. Year: <span class="mono">{s.year}</span>.
                  Geography: {s.geography}.
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2>How we talk about it</h2>
        <p>
          Every environmental claim on this site carries a substantiation record naming the
          evidence behind it, the method version it rests on, the person who approved it and
          the date it is next reviewed. A claim that cannot be substantiated is withdrawn from
          the site as a recorded publishing act rather than quietly edited.
        </p>
        <p>
          A carbon figure lower than its comparator is described as lower than that comparator,
          by name, with the dataset and the year it came from. We do not publish a figure that
          cannot carry its source, its year and its geography.
        </p>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- careers */
export function Careers() {
  useMeta('Ravel — Careers', 'Open roles at Ravel, and why this problem matters.');
  const positions = useFetch('/positions');
  const count = positions.data ? positions.data.length : null;
  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Work here</Reveal>
      </header>
      <hr class="rule" />
      <section>
        <h2>Why this problem matters</h2>
        <p style="max-width:44rem">
          Most of what the world wears and drives is made from material that was never designed
          to come back. The chemistry to bring it back exists; what has been missing is a way to
          prove that a particular pellet came from a particular pile of waste, delivered by a
          particular collector, on a particular day. Without that proof the material is just
          nylon, and nylon is a commodity.
        </p>
        <p style="max-width:44rem">
          Building the proof is a harder problem than building the plant, and it is not a
          reporting exercise. It is arithmetic that has to be right every time, on a ledger that
          cannot be overdrawn, signed by somebody who was entitled to sign it. If that is the
          kind of problem you want, we would like to hear from you.
        </p>
      </section>
      <section>
        <h2>{count === null ? 'Open positions' : `${count} open position${count === 1 ? '' : 's'}`}</h2>
        {positions.loading && <Loading what="the open roles" />}
        {positions.data?.length === 0 && <Empty>There are no open positions at the moment.</Empty>}
        {positions.data?.map((p) => (
          <div key={p.reference} class="sheet" style="margin-bottom:1rem">
            <h4 style="margin-bottom:.35rem">{p.title}</h4>
            <p class="note" style="margin:0">
              {p.location} · {p.department} · {p.contract_type} · closes{' '}
              <span class="mono">{date(p.closes_on)}</span>
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ news */
export function News() {
  useMeta('Ravel — News', 'Coverage of Ravel, each item carrying its outlet, its date, its link and its language.');
  const news = useFetch('/news');
  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header><Reveal as="h1">News</Reveal></header>
      <hr class="rule" />
      {news.loading && <Loading what="the news items" />}
      {news.data?.length === 0 && <Empty>There are no news items yet.</Empty>}
      {news.data?.map((n) => (
        <article key={n.reference} class="sheet" style="margin-bottom:1rem">
          <p class="eyebrow" style="margin:0 0 .35rem">{words(n.tag)}</p>
          <h4 style="margin-bottom:.35rem">{n.title}</h4>
          <p class="note" style="margin:0 0 .5rem">
            {n.outlet} · <span class="mono">{date(n.date)}</span>
            {n.language !== 'en' && <> · <Word quiet>in {n.language === 'fr' ? 'French' : n.language}</Word></>}
          </p>
          <p style="margin:0">
            <a href={n.link} rel="noopener noreferrer">
              Read at {n.outlet} <span class="button-arrow" aria-hidden="true">→</span>
            </a>
          </p>
        </article>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- contact */
export function Contact() {
  useMeta('Ravel — Contact', 'Four enquiry types, four destinations and four stated response times.');
  const types = [
    ['waste_supply', 'Waste supply', 'feedstock@example.com', 3],
    ['polymer_purchase', 'Polymer purchase', 'sales@example.com', 2],
    ['partnership', 'Partnership', 'partners@example.com', 5],
    ['press', 'Press', 'press@example.com', 1],
  ];
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', organisation: '', message: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await api('/enquiries', { method: 'POST', body: form }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const chosen = types.find((t) => t[0] === form.type);

  return (
    <div class="wrap stack-loose" style="padding-top:3rem">
      <header>
        <Reveal as="h1">Contact</Reveal>
        <Reveal as="p" class="t-body-big" style="max-width:44rem">
          Four kinds of enquiry, each with its own address and its own stated response time.
        </Reveal>
      </header>
      <hr class="rule" />

      <div class="two-up">
        <section>
          <h2>Where it goes</h2>
          <div class="scroll-x">
            <table>
              <caption class="visually-hidden">Enquiry types, destinations and response times</caption>
              <thead><tr><th>Enquiry</th><th>Destination</th><th class="num">Response</th></tr></thead>
              <tbody>
                {types.map(([k, label, dest, days]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td class="mono">{dest}</td>
                    <td class="num mono">{days} working day{days === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="note">
            Ravel Materials SAS receives what you send to answer your enquiry. It is kept for the
            retention stated in the <Link href="/privacy">privacy policy</Link>, and you may have
            it removed by writing to <span class="mono">privacy@example.com</span>.
          </p>
        </section>

        <section>
          <h2>Write to us</h2>
          {result && (
            <div class="banner" role="status">
              <p class="label" style="margin:0 0 .35rem">Enquiry received</p>
              <p style="margin:0">
                Your reference is <span class="mono">{result.reference}</span>. It has gone to{' '}
                <span class="mono">{result.destination}</span> and somebody will reply within{' '}
                {result.response_days} working day{result.response_days === 1 ? '' : 's'}.
                A confirmation has been sent to the address you gave.
              </p>
            </div>
          )}
          {error && (
            <div class="banner" role="alert">
              <p class="label" style="margin:0 0 .35rem">This enquiry was not sent</p>
              <p style="margin:0 0 .5rem">{error.message}</p>
              <p style="margin:0">
                You can correct the form and try again, or write directly to{' '}
                <span class="mono">{chosen[2]}</span>, which does not depend on this form working.
              </p>
            </div>
          )}
          <form onSubmit={submit} style="margin-top:1rem">
            <label class="field">
              <span class="label">Enquiry type</span>
              <select value={form.type} onInput={(e) => setForm({ ...form, type: e.target.value })}>
                {types.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label class="field">
              <span class="label">Your name</span>
              <input required value={form.name} onInput={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label class="field">
              <span class="label">Email</span>
              <input type="email" required value={form.email}
                onInput={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label class="field">
              <span class="label">Organisation</span>
              <input value={form.organisation} onInput={(e) => setForm({ ...form, organisation: e.target.value })} />
            </label>
            <label class="field">
              <span class="label">Message</span>
              <textarea required rows="5" value={form.message}
                onInput={(e) => setForm({ ...form, message: e.target.value })} />
            </label>
            <button type="submit" class="button-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send enquiry'} <span class="button-arrow" aria-hidden="true">→</span>
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- privacy */
export function Privacy() {
  useMeta('Ravel — Privacy', 'Who receives your data, what it is used for, how long it is kept and how to have it removed.');
  const retentions = [
    ['An enquiry', 24], ['A waste-supply enquiry', 36], ['A polymer enquiry', 36],
    ['A press enquiry', 12], ['An account and its acts', 120], ['The record', 180],
  ];
  return (
    <div class="wrap-narrow stack-loose" style="padding-top:3rem">
      <header><Reveal as="h1">Privacy</Reveal></header>
      <hr class="rule" />
      <section>
        <h2>Who we are</h2>
        <p>
          This site is operated by Ravel. The controller of the personal data described here is{' '}
          <strong>Ravel Materials SAS</strong>, 14 rue des Fabriques, 69007 Lyon, France.
        </p>
        <p>
          For a rights request — access, correction, erasure, objection or portability — write to{' '}
          <span class="mono">privacy@example.com</span>. To report a security issue, write to{' '}
          <span class="mono">security@example.com</span>.
        </p>
      </section>
      <section>
        <h2>What we keep, and for how long</h2>
        <div class="scroll-x">
          <table>
            <caption class="visually-hidden">Retention in months by purpose</caption>
            <thead><tr><th>Purpose</th><th class="num">Retention</th></tr></thead>
            <tbody>
              {retentions.map(([what, months]) => (
                <tr key={what}><td>{what}</td><td class="num mono">{months} months</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>The operational record</h2>
        <p>
          The operational record names individuals: the person who booked in a batch, entered a
          test result, set a disposition, closed a period or signed a certificate. It is retained
          under a legal and certification-scheme obligation and{' '}
          <strong>it is not erased on request</strong>, because a certificate issued today has to
          be reproducible for years and a record that can be edited proves nothing.
        </p>
        <p>
          A former employee's contact detail <em>is</em> erased on request. The identifier inside
          the record stays; the name it resolves to is held in a separate store with its own
          retention, and that store is what a rights request reaches.
        </p>
        <p>
          When an entry reaches the end of its retention its content is deleted while its position
          and its digest survive, so the chain still verifies and the entry states that its content
          was deleted under retention on a date. The one fact never deleted is that a certificate
          existed.
        </p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>
          The public routes set no cookie and carry no analytics or advertising script. The console
          holds a session token in your browser's local storage so that you stay signed in; it is
          removed when you sign out.
        </p>
      </section>
    </div>
  );
}
