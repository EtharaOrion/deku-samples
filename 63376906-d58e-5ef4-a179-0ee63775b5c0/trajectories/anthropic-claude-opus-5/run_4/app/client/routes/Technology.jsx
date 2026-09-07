import { api } from '../api.js';
import { Reveal, useAsync, useTitle, Loading, CapacityFigure, StateWord, Icon } from '../ui.jsx';

const STEPS = [
  ['Dissolution',
   'Mixed polyamide waste is dissolved in a bio-derived solvent at low temperature. Dyes, coatings, elastane and foreign matter stay behind rather than travelling forward as contamination.'],
  ['Depolymerisation',
   'The dissolved polymer is broken back to its monomer with water at moderate temperature and pressure. This is the step that reaches Nylon 6,6 as well as Nylon 6.'],
  ['Purification',
   'The monomer is purified to virgin specification. The residue leaves as a byproduct, and a sold byproduct takes a stated share of both the claim and the emissions.'],
  ['Repolymerisation',
   'The purified monomer is polymerised back to pellet at the specification the customer holds, and the lot is tested against every guaranteed limit before it is dispositioned.'],
];

const ATTRIBUTES = [
  {
    title: 'Green chemicals & reagents',
    claim: true,
    body: 'The solvent is bio-derived and the depolymerisation reagent is water.',
    evidence: 'Evidence: recipe versions RCP-DISS-2 and RCP-DEPO-4 name their reagents and ratios, and the reagent line of the carbon breakdown carries a supplier-specific factor rather than a secondary one.',
  },
  {
    title: 'Low temperature & pressure',
    claim: true,
    body: 'Dissolution runs at 160 to 170 °C and 2 to 4 bar; purification at 110 to 130 °C and 1 to 2 bar.',
    evidence: 'Evidence: the published recipe tolerances. A revision moving temperature or pressure outside the published threshold is a change notice before it is released.',
  },
  {
    title: 'Low carbon impact',
    claim: true,
    body: '4,260,000 mg CO₂e per kg of pellet, cradle-to-gate, under CM-PA6 v2, with an uncertainty of 12.00%.',
    evidence: 'Evidence: carbon figure CFG-0001, seven breakdown lines summing to the value, against the comparator virgin PA6 from EcoBase 2025 for EU-27. Lower than that comparator.',
  },
  {
    title: 'Drop-in on existing equipment',
    claim: false,
    body: 'The pellet runs on the customer\'s line without a change to the tooling, because it is the same polymer at the same relative viscosity.',
  },
  {
    title: 'Any input form',
    claim: false,
    body: 'Carpet, apparel, netting and offcuts enter the same first step, contaminated and coloured.',
  },
];

export default function Technology() {
  useTitle(
    'Technology — Four steps, and the capacity behind them',
    'Dissolution, depolymerisation, purification and repolymerisation, with mass in and mass out per stage and every capacity figure carrying its confidence.'
  );
  const sites = useAsync(async () => {
    const list = await api('/sites');
    return Promise.all(list.map((s) => api(`/sites/${s.reference}/capacity`).then((c) => ({ ...s, ...c }))));
  });
  const diagram = useAsync(() => api('/process-diagram'));

  return (
    <div class="page stack-lg" style="padding-top:3.5rem">
      <Reveal as="section" className="narrow">
        <p class="t-eyebrow">Technology</p>
        <h1 class="t-h2">Four steps, and nothing hidden between them</h1>
        <p class="t-big">
          The process is four timed stages. A batch reaches a lot across all four, by several
          paths, and the record of which batch reached which lot is a traversal over the
          consumption rows rather than a summary somebody wrote down.
        </p>
      </Reveal>

      <Reveal as="section">
        <ol class="stack" style="list-style:none;padding:0;counter-reset:step">
          {STEPS.map(([name, body], i) => (
            <li key={name} class="sheet" style="margin-bottom:1rem">
              <p class="t-eyebrow">Step {i + 1}</p>
              <h2 class="t-h4">{name}</h2>
              <p style="margin-bottom:0">{body}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Mass in, mass out</h2>
        <p class="t-big">
          Losses reduce the claim. Material that disappears in processing does not carry its claim
          forward, so the loss figure is the one number a competitor does not show.
        </p>
        {diagram.loading ? <Loading what="the process figures" /> : null}
        {diagram.data ? (
          <div class="table-scroll">
            <table>
              <caption>Across every closed run at every site, in grams.</caption>
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col" class="num">Runs</th>
                  <th scope="col" class="num">Mass in</th>
                  <th scope="col" class="num">Mass out</th>
                  <th scope="col" class="num">Lost</th>
                </tr>
              </thead>
              <tbody>
                {diagram.data.stages.map((s) => (
                  <tr key={s.stage}>
                    <th scope="row" style="text-transform:capitalize">{s.stage}</th>
                    <td class="num">{s.runs}</td>
                    <td class="num">{s.mass_in_g.toLocaleString('en-GB')}</td>
                    <td class="num">{s.mass_out_g.toLocaleString('en-GB')}</td>
                    <td class="num">{s.losses_g.toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Capacity</h2>
        <p class="t-big">
          Stated once in tonnes per year, on a basis of 8,000 hours per year at 0.90 availability
          and 0.80 yield. Every figure carries its confidence, and a planned row says so.
        </p>
        {sites.loading ? <Loading what="the capacity figures" /> : null}
        {sites.data ? (
          <div class="table-scroll">
            <table>
              <caption>
                Unit: tonnes per year. Basis: 8,000 hours per year, 0.90 availability, 0.80 yield.
                Last revised 2026-06-30. Uncommitted is nameplate minus contracted and is allowed
                to be negative.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Plant</th>
                  <th scope="col">Confidence</th>
                  <th scope="col" class="num">Nameplate</th>
                  <th scope="col" class="num">Contracted</th>
                  <th scope="col" class="num">Uncommitted</th>
                </tr>
              </thead>
              <tbody>
                {sites.data.map((s) => (
                  <tr key={s.reference}>
                    <th scope="row">
                      {s.name}{' '}
                      <span class="t-small" style="color:var(--muted)">
                        ({s.confidence === 'planned' ? '2030+' : s.reference === 'SITE-PILOT' ? '2026' : '2027'})
                      </span>
                      {s.confidence === 'planned' ? (
                        <> <StateWord word="Planned" icon={<Icon name="flag" label="Flag" />} /></>
                      ) : null}
                    </th>
                    <td>{s.confidence.replace(/_/g, ' ')}</td>
                    <td class="num">{(s.nameplate_kg / 1000).toLocaleString('en-GB')}</td>
                    <td class="num">{(s.contracted_kg / 1000).toLocaleString('en-GB')}</td>
                    <td class="num">{(s.uncommitted_kg / 1000).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p class="t-small" style="margin-top:1rem">
          Commercial Plant (2030+) reads &gt;25,000 tonnes per year. Pilot (2026) is 40 tonnes per
          year. A year is a calendar year at the stated basis; it is not a rated hour count
          extrapolated to a round number.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Five attributes</h2>
        <div class="grid grid-2">
          {ATTRIBUTES.map((a) => (
            <div class="sheet" key={a.title}>
              <h3 class="t-h4">{a.title}</h3>
              <p>{a.body}</p>
              {a.evidence ? <p class="t-small" style="color:var(--muted);margin-bottom:0">{a.evidence}</p> : null}
            </div>
          ))}
        </div>
      </Reveal>
    </div>
  );
}
