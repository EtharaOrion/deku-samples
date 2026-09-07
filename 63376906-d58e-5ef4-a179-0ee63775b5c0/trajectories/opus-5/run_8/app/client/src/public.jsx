import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { api, useApi, basisPoints, grams, kilograms, words } from './api.js';
import {
  CapacityFigure, ContentFigure, Empty, Icon, Loading, Refusal, Reveal, StateWord, Table,
} from './components.jsx';

export function Meta({ title, description, noindex = false }) {
  if (typeof document !== 'undefined') {
    document.title = title;
    let d = document.querySelector('meta[name="description"]');
    if (!d) { d = document.createElement('meta'); d.name = 'description'; document.head.appendChild(d); }
    d.content = description;
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); }
      r.content = 'noindex, nofollow';
    } else if (r) { r.remove(); }
  }
  return null;
}

export function Home() {
  return (
    <>
      <Meta
        title="Ravel — Tomorrow's materials. Made from today's waste."
        description="Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon, with every claim carried by a record rather than by a promise."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1" style="max-width:18ch">
          Tomorrow's materials. <span class="accent-mark">Made from today's waste.</span>
        </Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          Ravel produces low-carbon, virgin-quality recycled polymers, starting with nylon.
        </p>
        <p style="margin-top:1.5rem">
          <a class="btn btn-primary" href="/product">Read the product <span class="arrow">→</span></a>
        </p>
      </div>

      <div class="page">
        <hr class="rule" />
        <section class="split">
          <Reveal as="h2" class="h2">Nylon that goes on and on and on</Reveal>
          <div>
            <p class="body-big">
              Nylon is the material that refuses to wear out, which is exactly why it
              accumulates. A fishing net outlives three boats. A carpet outlives two
              houses. A jacket outlives the shop that sold it.
            </p>
            <p>
              Our chemistry returns that durability to the start of its own life rather
              than to a landfill. The polymer is taken back to its monomer, cleaned to a
              specification, and built again. What comes out is nylon, not a compromise
              that has to be explained to a customer.
            </p>
          </div>
        </section>

        <hr class="rule" />
        <section class="split">
          <Reveal as="h2" class="h2">The power of green chemistry</Reveal>
          <div>
            <p class="body-big">
              The process runs at low temperature and low pressure, on solvents chosen
              for what they do to the operator and the effluent as much as for what they
              do to the polymer.
            </p>
            <p>
              Every step is a recorded run with a recipe version, a set point achieved and
              a mass in and a mass out. That is what makes the carbon figure something an
              auditor can walk back through rather than something a brochure asserts.
            </p>
            <p><a href="/technology">The four process steps <span class="arrow">→</span></a></p>
          </div>
        </section>

        <hr class="rule" />
        <section class="split">
          <Reveal as="h2" class="h2">We're closing the loop</Reveal>
          <div>
            <p class="body-big">
              A loop is only closed if somebody can prove the material went round it.
            </p>
            <p>
              A claim about origin is not a property of a pellet. Recycled nylon and
              conventional nylon are the same material, deliberately, because a converter
              cannot requalify a line for a material that behaves differently. So the
              value is not in the pellet. It is in the record behind it: the collector
              who was approved on the day the waste arrived, the batch whose category was
              fixed at intake and never changed, the runs that consumed it, the losses
              that reduced the claim, and the ledger that refuses to attach more claim
              than the ledger holds.
            </p>
            <p>
              That record is what a customer files with their own regulator, and it is
              why every certificate we issue names the person who signed it, the method
              version behind its carbon figure, and the statement the recipient may and
              may not make. Every certificate can be checked by anybody, without an
              account, at its own permanent address.
            </p>
            <p><a href="/verify/CERT-PILOT-000001">Check a certificate <span class="arrow">→</span></a></p>
          </div>
        </section>
      </div>
    </>
  );
}

export function Product() {
  const spec = useApi('/specifications/N6/versions/3');
  const grades = [
    {
      grade: 'Nylon 6',
      limitation: 'Recycled Nylon 6 came almost entirely from one source: discarded fishing nets. That source is finite, it is concentrated in a handful of ports, and it was never going to reach the volume the apparel industry needs.',
      claim: 'We take mixed post-consumer and pre-consumer polyamide waste, including textile waste nobody else will accept, and return it to virgin-quality Nylon 6 pellet.',
    },
    {
      grade: 'Nylon 6,6',
      limitation: 'Nylon 6,6 had no recycling solution at all. Its chemistry resists the depolymerisation route that works for Nylon 6, so it went to incineration or to landfill whatever a brand said about it.',
      claim: 'Our depolymerisation step is being qualified for 6,6 at the pilot site, and the same recorded chain and the same certificate apply to it when it lands.',
    },
  ];
  const industries = [
    'Textiles and apparel', 'Automotive', 'Electrical and electronics',
    'Consumer goods', 'Industrial', 'Construction',
  ];
  const features = [
    { head: 'Nylon in any form', body: 'Nylon in any form is feedstock here: woven, knitted, carpet, net, offcut, coated and mixed. The intake records what arrived, not what would have been convenient, and material we cannot claim is still processed and still recorded as non-claimable input.' },
    { head: 'A drop-in pellet', body: 'The pellet meets the same specification as its conventional equivalent and needs no change to a converter\'s line. That is the point: a material that behaves differently is a material that has to be requalified.' },
    { head: 'A claim with a chain behind it', body: 'Each delivery carries a certificate naming its claim type, its recycled content, its carbon figure with its boundary, its method version and its uncertainty, and the statement the recipient may make.' },
  ];
  return (
    <>
      <Meta
        title="Product — Ravel"
        description="Low-carbon, virgin-quality recycled Nylon 6 and 6,6 for manufacturers who refuse to compromise, with the specification and the claim published beside the grade."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">Same material. <span class="accent-mark">Better origin.</span></Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          We produce low-carbon, virgin-quality, recycled Nylon 6 and 6,6 for
          manufacturers who refuse to compromise.
        </p>
      </div>

      <div class="page">
        <hr class="rule" />
        <h2 class="h3">Two grades</h2>
        <div class="grid grid-2" style="margin-top:1.5rem">
          {grades.map((g) => (
            <article class="card" key={g.grade}>
              <h3 class="h4">{g.grade}</h3>
              <p class="eyebrow" style="margin-top:0.75rem">The limitation</p>
              <p class="body-small">{g.limitation}</p>
              <p class="eyebrow">What we do</p>
              <p class="body-small" style="margin-bottom:0">{g.claim}</p>
            </article>
          ))}
        </div>

        <hr class="rule" />
        <h2 class="h3">A drop-in pellet</h2>
        <p class="measure" style="margin-top:1rem">
          Recycled pellet beside conventional pellet, at the same scale and under the same
          light. They are the same material, which is the whole argument: a converter does
          not requalify a line for something that behaves differently.
        </p>
        <div class="grid grid-2" style="margin-top:1.5rem">
          {[
            { label: 'Ravel recycled Nylon 6', note: 'relative viscosity 2.44, moisture 0.06 per cent' },
            { label: 'Conventional Nylon 6', note: 'relative viscosity 2.42, moisture 0.07 per cent' },
          ].map((p, gi) => (
            <figure class="pellets" key={p.label} style="margin:0">
              <svg viewBox="0 0 300 120" width="100%" height="120" role="img"
                aria-label={`${p.label}, drawn at the same scale as its counterpart.`}>
                {Array.from({ length: 44 }).map((_, i) => {
                  const col = i % 11;
                  const row = Math.floor(i / 11);
                  const jitter = ((i * 37 + gi * 13) % 9) - 4;
                  return (
                    <ellipse
                      key={i}
                      cx={22 + col * 26 + jitter}
                      cy={26 + row * 24 + ((i * 17) % 7) - 3}
                      rx="10" ry="7"
                      fill="none" stroke="currentColor" stroke-width="1.2"
                      transform={`rotate(${((i * 53 + gi * 29) % 60) - 30} ${22 + col * 26} ${26 + row * 24})`}
                    />
                  );
                })}
              </svg>
              <figcaption class="body-small" style="margin-top:0.5rem">
                <strong>{p.label}</strong><br />{p.note}
              </figcaption>
            </figure>
          ))}
        </div>

        <hr class="rule" />
        <h2 class="h3">Six industries</h2>
        <ul class="grid grid-3" style="margin-top:1.5rem;list-style:none;padding:0">
          {industries.map((i) => (
            <li key={i} class="card body-regular" style="margin:0">{i}</li>
          ))}
        </ul>

        <hr class="rule" />
        <h2 class="h3">Three features</h2>
        <div class="grid grid-3" style="margin-top:1.5rem">
          {features.map((f) => (
            <article class="card" key={f.head}>
              <h3 class="h4">{f.head}</h3>
              <p class="body-small" style="margin:0.75rem 0 0">{f.body}</p>
            </article>
          ))}
        </div>

        <hr class="rule" />
        <h2 class="h3" id="specification">The specification</h2>
        <p class="measure" style="margin-top:1rem">
          This is the specification itself, not a request form. Version 3 was issued on{' '}
          {spec.data?.issued_on || '2026-02-01'}. A guaranteed limit is tested on every lot.
        </p>
        <div class="card" style="margin-top:1rem">
          <p class="eyebrow eyebrow-ink">Nylon 6, grade N6</p>
          <p class="body-small">
            The recycled-content claim for this grade:{' '}
            <ContentFigure content_bp={9000} claim_type="mass_balance" />, under the scheme RCS-2026.
          </p>
          <p class="body-small">
            This material is claimed by mass balance. It is not physically segregated.
          </p>
        </div>
        {spec.loading && <Loading what="the specification" />}
        {spec.error && <Refusal error={spec.error} title="The specification could not be read" />}
        {spec.data && (
          <>
            <Table
              caption="Specification N6 version 3"
              columns={[
                { key: 'property', label: 'Property', render: (r) => words(r.property) },
                { key: 'method', label: 'Method', render: (r) => <span class="mono">{r.method}</span> },
                { key: 'limit', label: 'Limit', numeric: true, render: (r) => r.limit },
                { key: 'unit', label: 'Unit', render: (r) => r.unit },
                { key: 'basis', label: 'Basis', render: (r) => <StateWord>{words(r.basis)}</StateWord> },
              ]}
              rows={(spec.data.properties || []).map((p) => ({ ...p, key: p.property }))}
              empty="This specification version carries no properties."
            />
            <p class="body-small" style="margin-top:1rem">
              Virgin-quality comparison: {spec.data.virgin_reference?.reference}, sourced from{' '}
              {spec.data.virgin_reference?.source}, dated {spec.data.virgin_reference?.date}.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function Technology() {
  const diagram = useApi('/process-diagram');
  const sites = useApi('/sites');
  const [capacities, setCapacities] = useState(null);
  if (sites.data && capacities === null) {
    Promise.all(sites.data.map((s) => api(`/sites/${s.reference}/capacity`)))
      .then(setCapacities)
      .catch(() => setCapacities([]));
  }
  const steps = [
    { name: 'Dissolution', body: 'Mixed polyamide waste is taken into a green solvent at low temperature, leaving elastane, coatings, dyes and foreign matter behind as a separable fraction.' },
    { name: 'Depolymerisation', body: 'The polymer chain is returned to its monomer under a recorded set point, which is the step that makes the material genuinely new rather than merely reground.' },
    { name: 'Purification', body: 'The monomer is cleaned to the purity the specification demands. A sold byproduct leaves here and takes its own share of the claim and of the emissions.' },
    { name: 'Repolymerisation', body: 'The monomer is built back into pellet at the relative viscosity the customer qualified against, and the lot takes its reference here.' },
  ];
  const attributes = [
    { head: 'Green chemicals & reagents', evidence: 'Evidence: the reagents and ratios are named on every recipe version, and the reagent line of the carbon figure carries a supplier-specific factor rather than a database default.' },
    { head: 'Low temperature & pressure', evidence: 'Evidence: the dissolution recipe RCP-DISS-2 runs at 165 °C and 3 bar against a released band of 160 to 170 °C and 2 to 4 bar, and a run outside that band raises a deviation.' },
    { head: 'Low carbon impact', evidence: 'Evidence: 4 260 000 mg CO₂e/kg, cradle-to-gate, CM-PA6 v2, uncertainty 12.00 per cent, against virgin PA6 from EcoBase 2025 in EU-27.' },
    { head: 'Drop-in quality', evidence: null },
    { head: 'Traceable to the collector', evidence: null },
  ];
  return (
    <>
      <Meta
        title="Technology — Ravel"
        description="Four process steps, a plant diagram generated from the runs themselves, and a capacity table that states its unit, its basis and its confidence."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">Four steps, recorded</Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          The process is one chain of timed runs. Each one consumes named inputs, produces
          named outputs, and closes with its losses computed rather than declared.
        </p>
      </div>

      <div class="page">
        <hr class="rule" />
        <h2 class="h3">The process</h2>
        <ol class="grid grid-4" style="margin-top:1.5rem;list-style:none;padding:0;counter-reset:step">
          {steps.map((s, i) => (
            <li key={s.name} class="card" style="margin:0">
              <p class="eyebrow">Step {i + 1}</p>
              <h3 class="h4">{s.name}</h3>
              <p class="body-small" style="margin:0.75rem 0 0">{s.body}</p>
            </li>
          ))}
        </ol>

        <hr class="rule" />
        <h2 class="h3">The plant, drawn from its own runs</h2>
        <p class="measure" style="margin-top:1rem">
          This diagram is generated from the four run types, so it stays correct when a
          stage changes. It carries mass in and mass out per stage.
        </p>
        {diagram.loading && <Loading what="the plant diagram" />}
        {diagram.error && <Refusal error={diagram.error} title="The diagram could not be read" />}
        {diagram.data && (
          <>
            <div class="grid grid-4" style="margin-top:1.5rem" aria-hidden="true">
              {diagram.data.map((s) => (
                <div class="diagram-stage" key={s.stage}>
                  <p class="eyebrow eyebrow-ink">{words(s.stage)}</p>
                  <svg viewBox="0 0 120 60" width="100%" height="60" role="presentation" focusable="false">
                    <rect x="1" y="14" width="118" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" />
                    <path d="M8 30h96" stroke="currentColor" stroke-width="1.5" fill="none" />
                    <path d="M100 25l6 5-6 5" stroke="currentColor" stroke-width="1.5" fill="none" />
                  </svg>
                  <p class="mono" style="margin:0.5rem 0 0">in {grams(s.mass_in_g)}</p>
                  <p class="mono" style="margin:0">out {grams(s.mass_out_g)}</p>
                  <p class="mono" style="margin:0">losses {grams(s.losses_g)}</p>
                </div>
              ))}
            </div>
            <p class="body-small" style="margin-top:1rem">
              Losses reduce the claim. Material that disappears in processing does not
              carry its claim forward.
            </p>
            <Table
              caption="Mass in and mass out per process stage"
              columns={[
                { key: 'stage', label: 'Stage', render: (r) => words(r.stage) },
                { key: 'runs', label: 'Runs', numeric: true, render: (r) => r.runs },
                { key: 'in', label: 'Mass in', numeric: true, render: (r) => grams(r.mass_in_g) },
                { key: 'out', label: 'Mass out', numeric: true, render: (r) => grams(r.mass_out_g) },
                { key: 'loss', label: 'Losses', numeric: true, render: (r) => grams(r.losses_g) },
              ]}
              rows={diagram.data.map((s) => ({ ...s, key: s.stage }))}
              empty="No run has been recorded yet, so the diagram has no masses to carry."
            />
          </>
        )}

        <hr class="rule" />
        <h2 class="h3">Capacity</h2>
        <p class="measure" style="margin-top:1rem">
          Every figure below is in tonnes per year, on a basis of 8000 hours per year, 0.90
          availability and 0.80 yield, where a year is a calendar year. A capacity figure is
          never shown without its confidence.
        </p>
        {!capacities && <Loading what="the capacity table" />}
        {capacities && capacities.length === 0 && (
          <Empty>No site capacity has been published.</Empty>
        )}
        {capacities && capacities.length > 0 && (
          <Table
            caption="Capacity by site"
            columns={[
              {
                key: 'site',
                label: 'Site',
                render: (r) => (r.reference === 'SITE-COMM' ? 'Commercial Plant (2030+)'
                  : r.reference === 'SITE-PILOT' ? 'Pilot (2026)' : 'Demonstration (2028)'),
              },
              {
                key: 'nameplate',
                label: 'Nameplate, tonnes per year',
                numeric: true,
                render: (r) => (r.reference === 'SITE-COMM'
                  ? `>${(r.nameplate_kg / 1000).toLocaleString('en-GB')}`
                  : (r.nameplate_kg / 1000).toLocaleString('en-GB')),
              },
              { key: 'contracted', label: 'Contracted, tonnes per year', numeric: true, render: (r) => (r.contracted_kg / 1000).toLocaleString('en-GB') },
              { key: 'uncommitted', label: 'Uncommitted, tonnes per year', numeric: true, render: (r) => (r.uncommitted_kg / 1000).toLocaleString('en-GB') },
              {
                key: 'confidence',
                label: 'Confidence',
                render: (r) => <StateWord strong={r.confidence === 'planned'}>{words(r.confidence)}</StateWord>,
              },
            ]}
            rows={capacities.map((r) => ({ ...r, key: r.reference }))}
            empty="No site capacity has been published."
          />
        )}

        <hr class="rule" />
        <h2 class="h3">Five attributes</h2>
        <div class="grid grid-3" style="margin-top:1.5rem">
          {attributes.map((a) => (
            <article class="card" key={a.head}>
              <h3 class="h4">{a.head}</h3>
              {a.evidence && <p class="body-small" style="margin:0.75rem 0 0">{a.evidence}</p>}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

export function About() {
  const stats = useApi('/statistics');
  return (
    <>
      <Meta
        title="About — Ravel"
        description="Why Ravel exists, and the three statistics behind it, each carrying its source, its year and its geography."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">A material problem, <span class="highlight-mark">stated plainly</span></Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          Ravel Materials SAS returns mixed polyamide waste to virgin-quality pellet, and
          publishes the record that makes the claim on that pellet worth anything.
        </p>
      </div>
      <div class="page">
        <hr class="rule" />
        <h2 class="h3">The hard facts</h2>
        {stats.loading && <Loading what="the published figures" />}
        {stats.error && <Refusal error={stats.error} title="The figures could not be read" />}
        {stats.data && stats.data.length === 0 && (
          <Empty>No figure is published, because a figure without a source, a year and a geography is not published at all.</Empty>
        )}
        {stats.data && stats.data.length > 0 && (
          <div class="grid grid-3" style="margin-top:1.5rem">
            {stats.data.map((s) => (
              <article class="card" key={s.key}>
                <p class="stat-figure">{s.value}</p>
                <p class="body-small" style="margin:0.75rem 0 0">
                  Source: {s.source}. Year: {s.year}. Geography: {s.geography}.
                </p>
              </article>
            ))}
          </div>
        )}
        <hr class="rule" />
        <section class="split">
          <h2 class="h3">Why the record is the product</h2>
          <div>
            <p class="body-big">
              The material is deliberately indistinguishable from the incumbent, so the
              buyer is not paying for the pellet.
            </p>
            <p>
              The buyer is paying for origin, and origin cannot be measured in a pellet.
              It exists only as a record: the collector approved on the date the waste
              was received, the batch whose category was fixed at intake, the runs that
              consumed it, the losses that reduced the claim, the ledger that would
              rather refuse an allocation than let a claim exceed what it holds, and the
              named person who signed the certificate and was entitled to.
            </p>
            <p>
              We build the plant and we build the record, and we treat the second as the
              thing a customer's regulator will actually read.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

export function Careers() {
  const positions = useApi('/positions');
  const count = positions.data?.length;
  return (
    <>
      <Meta
        title="Careers — Ravel"
        description="Why this problem matters, and the roles open at Ravel right now."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">Why this problem matters</Reveal>
        <div class="measure" style="margin-top:1.5rem">
          <p class="body-big">
            Nylon does not degrade on any timescale that helps us, and almost none of it
            comes back.
          </p>
          <p>
            The chemistry to bring it back exists. What has been missing is a plant that
            runs it at volume and a record that a regulator, an auditor and a customer's
            compliance officer can all read without being asked to take anything on
            trust. Both of those are hard, and neither is glamorous, and the second one is
            the reason a recycled-content claim is worth money at all.
          </p>
          <p>
            If you would rather build the thing that has to be right than the thing that
            demonstrates well, this is the place.
          </p>
        </div>
      </div>
      <div class="page">
        <hr class="rule" />
        <h2 class="h3">
          Open positions{typeof count === 'number' ? ` (${count})` : ''}
        </h2>
        {positions.loading && <Loading what="the open positions" />}
        {positions.error && <Refusal error={positions.error} title="The positions could not be read" />}
        {positions.data && positions.data.length === 0 && (
          <Empty>There are no open positions at the moment. Nothing is listed because the collection holds no rows.</Empty>
        )}
        {positions.data && positions.data.length > 0 && (
          <div class="grid grid-2" style="margin-top:1.5rem">
            {positions.data.map((p) => (
              <article class="card" key={p.reference}>
                <h3 class="h4">{p.title}</h3>
                <dl class="def" style="margin-top:0.75rem">
                  <div class="def-row"><dt>Location</dt><dd>{p.location}</dd></div>
                  <div class="def-row"><dt>Department</dt><dd>{p.department}</dd></div>
                  <div class="def-row"><dt>Contract type</dt><dd>{p.contract_type}</dd></div>
                  <div class="def-row"><dt>Closes on</dt><dd><span class="mono">{p.closes_on}</span></dd></div>
                </dl>
                <p class="body-small" style="margin-top:1rem">
                  Write to <a href="mailto:careers@example.com">careers@example.com</a> naming the role.
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function News() {
  const news = useApi('/news');
  const tags = ['funding', 'partnership', 'technical', 'recognition'];
  const [tag, setTag] = useState('all');
  const items = (news.data || []).filter((n) => tag === 'all' || n.tag === tag);
  return (
    <>
      <Meta
        title="News — Ravel"
        description="Coverage of Ravel, tagged by a real taxonomy, each item carrying its outlet, its date, its link and its language."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">News</Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          One event is listed once, with its coverage beside it.
        </p>
      </div>
      <div class="page">
        <hr class="rule" />
        <div class="wizard-steps" role="group" aria-label="Filter by tag">
          <a
            href="#news"
            aria-current={tag === 'all' ? 'step' : undefined}
            onClick={(e) => { e.preventDefault(); setTag('all'); }}
          >All</a>
          {tags.map((t) => (
            <a
              key={t}
              href="#news"
              aria-current={tag === t ? 'step' : undefined}
              onClick={(e) => { e.preventDefault(); setTag(t); }}
            >{t}</a>
          ))}
        </div>
        <div id="news">
          {news.loading && <Loading what="the news items" />}
          {news.error && <Refusal error={news.error} title="The news could not be read" />}
          {news.data && items.length === 0 && (
            <Empty>There is nothing tagged {tag}. The taxonomy carries four terms and a term with no items says so.</Empty>
          )}
          {items.length > 0 && (
            <div class="stack-l" style="margin-top:1.5rem">
              {items.map((n) => (
                <article class="card" key={n.reference}>
                  <p class="eyebrow">{n.tag} · <span class="mono">{n.date}</span> · {n.outlet}</p>
                  <h2 class="h4">{n.title}</h2>
                  <p class="body-small" style="margin-top:0.5rem">{n.summary}</p>
                  {n.language !== 'en' && (
                    <p class="body-small" style="margin:0.5rem 0">
                      <StateWord>Published in {n.language === 'fr' ? 'French' : n.language}</StateWord>
                    </p>
                  )}
                  <p style="margin:0.75rem 0 0">
                    <a href={n.link} rel="noopener noreferrer">
                      Read the coverage at {n.outlet} <span class="arrow">→</span>
                    </a>
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const ENQUIRY_TYPES = [
  { type: 'waste_supply', label: 'Waste supply', destination: 'feedstock@example.com', days: 3 },
  { type: 'polymer_purchase', label: 'Polymer purchase', destination: 'sales@example.com', days: 2 },
  { type: 'partnership', label: 'Partnership', destination: 'partners@example.com', days: 5 },
  { type: 'press', label: 'Press', destination: 'press@example.com', days: 1 },
];

export function Contact() {
  const [form, setForm] = useState({ type: 'waste_supply', name: '', email: '', organisation: '', message: '' });
  const [state, setState] = useState({ status: 'idle', result: null, error: null });
  const chosen = ENQUIRY_TYPES.find((t) => t.type === form.type);

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', result: null, error: null });
    try {
      const result = await api('/enquiries', { method: 'POST', body: form });
      setState({ status: 'sent', result, error: null });
    } catch (error) {
      setState({ status: 'failed', result: null, error });
    }
  };

  return (
    <>
      <Meta
        title="Contact — Ravel"
        description="Four enquiry types, four destinations and four stated response times, with the retention of what you send stated at the point of collection."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">Contact</Reveal>
        <p class="body-big measure" style="margin-top:1.5rem">
          Four kinds of enquiry, each with its own destination and its own stated response
          time.
        </p>
      </div>
      <div class="page">
        <hr class="rule" />
        <Table
          caption="Enquiry types, destinations and response times"
          columns={[
            { key: 'label', label: 'Enquiry', render: (r) => r.label },
            { key: 'destination', label: 'Destination', render: (r) => <span class="mono">{r.destination}</span> },
            { key: 'days', label: 'Response time', numeric: true, render: (r) => `${r.days} working days` },
          ]}
          rows={ENQUIRY_TYPES.map((t) => ({ ...t, key: t.type }))}
          empty="No enquiry destination is published."
        />

        <hr class="rule" />
        <div class="split">
          <div>
            <h2 class="h3">Send an enquiry</h2>
            <p class="body-small measure" style="margin-top:1rem">
              Ravel Materials SAS receives what you send here. It is used to answer your
              enquiry and for nothing else. A general enquiry is kept for 24 months, a
              waste-supply or polymer enquiry for 36 months and a press enquiry for 12
              months. To have it removed, write to{' '}
              <a href="mailto:privacy@example.com">privacy@example.com</a>. The full notice
              is on the <a href="/privacy">privacy route</a>.
            </p>
          </div>
          <form onSubmit={submit} class="sheet stack" novalidate>
            <div>
              <label for="type" class="label">Enquiry type</label>
              <select
                id="type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.currentTarget.value })}
              >
                {ENQUIRY_TYPES.map((t) => <option value={t.type} key={t.type}>{t.label}</option>)}
              </select>
              <p class="body-small" style="margin:0.5rem 0 0">
                Goes to <span class="mono">{chosen.destination}</span>, answered within{' '}
                {chosen.days} working days.
              </p>
            </div>
            <div>
              <label for="name" class="label">Your name</label>
              <input id="name" value={form.name} onInput={(e) => setForm({ ...form, name: e.currentTarget.value })} />
            </div>
            <div>
              <label for="email" class="label">Your email address</label>
              <input id="email" type="email" required value={form.email} onInput={(e) => setForm({ ...form, email: e.currentTarget.value })} />
            </div>
            <div>
              <label for="organisation" class="label">Organisation</label>
              <input id="organisation" value={form.organisation} onInput={(e) => setForm({ ...form, organisation: e.currentTarget.value })} />
            </div>
            <div>
              <label for="message" class="label">Your enquiry</label>
              <textarea id="message" rows="4" value={form.message} onInput={(e) => setForm({ ...form, message: e.currentTarget.value })} />
            </div>
            <div>
              <button class="btn btn-primary" type="submit" disabled={state.status === 'sending'}>
                {state.status === 'sending' ? 'Sending…' : 'Send enquiry'} <span class="arrow">→</span>
              </button>
            </div>
            {state.status === 'sent' && (
              <div class="banner" role="status">
                <p class="eyebrow eyebrow-ink">Enquiry received</p>
                <p class="body-small" style="margin-bottom:0.4rem">
                  Your enquiry took the reference <span class="mono">{state.result.reference}</span>. It has gone to{' '}
                  <span class="mono">{state.result.destination}</span> and a person there will reply within{' '}
                  {state.result.response_days} working days. A confirmation is on its way to the address you gave.
                </p>
              </div>
            )}
            {state.status === 'failed' && (
              <div class="banner" role="alert">
                <p class="eyebrow eyebrow-ink">The enquiry was not sent</p>
                <p class="body-small" style="margin-bottom:0.4rem">
                  {state.error.body?.message || state.error.message} You can try again, or
                  write directly to <span class="mono">{chosen.destination}</span>, which does
                  not depend on this form working.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}

export function Privacy() {
  const purposes = [
    ['An enquiry', '24 months'],
    ['A waste-supply enquiry', '36 months'],
    ['A polymer enquiry', '36 months'],
    ['A press enquiry', '12 months'],
    ['An account and its acts', '120 months'],
    ['The operational record', '180 months'],
  ];
  return (
    <>
      <Meta
        title="Privacy — Ravel"
        description="Who receives your data at Ravel, what it is used for, how long it is kept and how to have it removed."
      />
      <div class="page hero">
        <Reveal as="h1" class="h1">Privacy</Reveal>
      </div>
      <div class="page measure" style="max-width:44rem">
        <h2 class="h4">Who the controller is</h2>
        <p>
          Ravel Materials SAS is the controller of the personal data described here. Its
          registered address is 14 rue des Fabriques, 69007 Lyon, France.
        </p>

        <h2 class="h4">How to make a rights request</h2>
        <p>
          Write to <a href="mailto:privacy@example.com">privacy@example.com</a>. You may ask
          for access to your data, for its correction, and — subject to the exception below —
          for its erasure.
        </p>

        <h2 class="h4">How long each purpose is kept</h2>
        <Table
          caption="Retention by purpose"
          columns={[
            { key: 'purpose', label: 'Purpose', render: (r) => r.purpose },
            { key: 'retention', label: 'Retention', numeric: true, render: (r) => r.retention },
          ]}
          rows={purposes.map(([purpose, retention]) => ({ key: purpose, purpose, retention }))}
          empty="No retention is published."
        />

        <h2 class="h4" style="margin-top:2rem">The operational record</h2>
        <p>
          The operational record names individuals: who booked a batch in, who entered a
          test result, who set a disposition, who allocated a claim and who signed a
          certificate. It is retained under a legal obligation and under the requirement of
          the certification scheme, and it is <strong>not erased on request</strong>, because
          a certificate issued years ago has to remain reproducible from the rows written
          at the time.
        </p>
        <p>
          A former employee's contact detail <em>is</em> erased on request. A person inside
          the record is referenced by an identifier, and that identifier resolves to a name
          through a separate store with its own retention.
        </p>

        <h2 class="h4">Reporting a vulnerability</h2>
        <p>
          Write to <a href="mailto:security@example.com">security@example.com</a>.
        </p>

        <h2 class="h4">Certificate verification</h2>
        <p>
          A certificate's verification address is public and unauthenticated, and it returns
          only the certificate's number, state, dates, site, grade, claim type and recipient
          name. It is excluded from search indexing, because a certificate's recipient is a
          customer relationship.
        </p>
      </div>
    </>
  );
}

export function Verify() {
  const { path } = useLocation();
  const number = decodeURIComponent(path.split('/').filter(Boolean)[1] || '');
  const { loading, data, error } = useApi(`/verify/${encodeURIComponent(number)}`, [number]);
  return (
    <>
      <Meta
        title={`Verify ${number} — Ravel`}
        description="Check a Ravel certificate by its number."
        noindex
      />
      <div class="page hero">
        <p class="eyebrow">Certificate verification</p>
        <Reveal as="h1" class="h2">{number}</Reveal>
      </div>
      <div class="page" style="max-width:48rem">
        {loading && <Loading what="the certificate" />}
        {error && <Refusal error={error} title="The certificate could not be checked" />}
        {data && (
          <div class="sheet">
            {data.found === false ? (
              <>
                <p class="eyebrow eyebrow-ink">Not found</p>
                <h2 class="h4">There is no such certificate.</h2>
                <p class="body-small" style="margin-top:1rem">
                  No certificate with the number <span class="mono">{data.number}</span> has
                  been issued by Ravel Materials SAS. Check the number against the document
                  you were given; a certificate number is printed on the document itself.
                </p>
                <dl class="def" style="margin-top:1.5rem">
                  <div class="def-row"><dt>Number</dt><dd><span class="mono">{data.number}</span></dd></div>
                  <div class="def-row"><dt>State</dt><dd>none</dd></div>
                  <div class="def-row"><dt>Issued on</dt><dd>—</dd></div>
                  <div class="def-row"><dt>Site</dt><dd>—</dd></div>
                  <div class="def-row"><dt>Grade</dt><dd>—</dd></div>
                  <div class="def-row"><dt>Claim type</dt><dd>—</dd></div>
                  <div class="def-row"><dt>Recipient</dt><dd>—</dd></div>
                </dl>
              </>
            ) : (
              <>
                {data.state === 'withdrawn' && (
                  <p style="margin-bottom:1rem">
                    <StateWord strong>Withdrawn</StateWord>
                  </p>
                )}
                <h2 class="h4">
                  {data.state === 'withdrawn'
                    ? `This certificate was withdrawn on ${data.withdrawn_on}. Reason: ${data.withdrawal_reason}.`
                    : 'This certificate was issued by Ravel Materials SAS and stands.'}
                </h2>
                <dl class="def" style="margin-top:1.5rem">
                  <div class="def-row"><dt>Number</dt><dd><span class="mono">{data.number}</span></dd></div>
                  <div class="def-row"><dt>State</dt><dd>{words(data.state)}</dd></div>
                  <div class="def-row"><dt>Issued on</dt><dd><span class="mono">{data.issued_on}</span></dd></div>
                  {data.withdrawn_on && (
                    <div class="def-row"><dt>Withdrawn on</dt><dd><span class="mono">{data.withdrawn_on}</span></dd></div>
                  )}
                  {data.withdrawal_reason && (
                    <div class="def-row"><dt>Withdrawal reason</dt><dd>{data.withdrawal_reason}</dd></div>
                  )}
                  <div class="def-row"><dt>Site</dt><dd><span class="mono">{data.site}</span></dd></div>
                  <div class="def-row"><dt>Grade</dt><dd><span class="mono">{data.grade}</span></dd></div>
                  <div class="def-row"><dt>Claim type</dt><dd>{words(data.claim_type)}</dd></div>
                  <div class="def-row"><dt>Recipient</dt><dd>{data.recipient_name}</dd></div>
                </dl>
                {data.state === 'withdrawn' && (
                  <p class="body-small" style="margin-top:1.5rem">
                    A withdrawal is a fact about a document. This address will continue to
                    resolve and continue to state the withdrawal. There is no replacement to
                    forward you to: if the material was re-certified, that is a different
                    certificate with a different number, and the holder of the material has it.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function PublicNotFound() {
  return (
    <>
      <Meta title="Not found — Ravel" description="No such page." noindex />
      <div class="page hero">
        <h1 class="h2">There is no such page.</h1>
        <p class="body-big measure" style="margin-top:1.5rem">
          The address you followed does not resolve here. The public routes are the home
          page, the product, the technology, about, careers, news, contact and privacy.
        </p>
        <p><a class="btn" href="/">Back to the home page <span class="arrow">→</span></a></p>
      </div>
    </>
  );
}

export { ENQUIRY_TYPES, Icon, basisPoints, kilograms };
