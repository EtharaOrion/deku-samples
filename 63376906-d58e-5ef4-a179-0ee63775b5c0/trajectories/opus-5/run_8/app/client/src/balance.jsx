import { useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { api, useApi, basisPoints, grams, kwh, words } from './api.js';
import {
  CarbonFigure, ContentFigure, DefRow, Empty, Icon, Loading, Refusal, StateWord, Table,
} from './components.jsx';
import { Meta } from './public.jsx';
import { Head, SchemeBanner } from './console.jsx';

// The balance screen. There is no input control on this screen at all: every
// figure is derived and every figure links to the records it came from.
export function Balance() {
  const periods = useApi('/balance-periods');
  return (
    <>
      <Meta title="The ledger — Ravel" description="Credits in, credits out and credits available, per site, grade and period." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="The ledger">
          <p>A balance is the sum of its movements and is never held as a total.</p>
        </Head>
        {periods.loading && <Loading what="the balance periods" />}
        {periods.error && <Refusal error={periods.error} title="The ledger could not be read" />}
        {periods.data && periods.data.length === 0 && (
          <Empty>No balance period has been opened.</Empty>
        )}
        {periods.data && periods.data.length > 0 && (
          <div class="grid grid-2">
            {periods.data.map((p) => (
              <a class="card card-link" href={`/console/balance/${p.id}`} key={p.id}>
                <p class="mono" style="margin:0 0 0.35rem">{p.id}</p>
                <p class="label" style="margin:0 0 0.75rem">
                  {p.site} · {p.grade} · {p.period.from} to {p.period.to}
                </p>
                <p style="margin:0 0 0.75rem;display:flex;gap:0.35rem;flex-wrap:wrap">
                  <StateWord strong={p.state === 'closed'}>
                    {p.state === 'closed' ? 'Closed' : 'Open'}
                  </StateWord>
                  {p.unreviewed_override_count > 0 && <StateWord strong>Unreviewed override</StateWord>}
                </p>
                <p class="body-small" style="margin:0">
                  Post-consumer available {grams(p.post_consumer.credits_available_g)}
                </p>
                <p class="body-small" style="margin:0">
                  Pre-consumer available {grams(p.pre_consumer.credits_available_g)}
                </p>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function BalancePeriod() {
  const { params } = useRoute();
  const id = params.id;
  const [reload, setReload] = useState(0);
  const period = useApi(`/balance-periods/${id}`, [id, reload]);
  const lots = useApi('/lots', [reload]);
  const overrides = useApi('/overrides', [reload]);
  const [alloc, setAlloc] = useState({ lot: 'LOT-N6-0001', category: 'post_consumer', mass_g: '' });
  const [state, setState] = useState({ status: 'idle', error: null, result: null });
  const p = period.data;

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending', error: null, result: null });
    try {
      const result = await api(`/balance-periods/${id}/allocations`, {
        method: 'POST',
        body: { lot: alloc.lot, category: alloc.category, mass_g: Number(alloc.mass_g) },
      });
      setState({ status: 'done', error: null, result });
      setReload((x) => x + 1);
    } catch (error) {
      // The figures on the screen are unchanged: nothing is reloaded on a refusal.
      setState({ status: 'refused', error, result: null });
    }
  };

  const categoryRows = (cat) => {
    const c = p[cat];
    return (
      <section key={cat} style="margin-top:2rem" aria-labelledby={`cat-${cat}`}>
        <h3 class="h4" id={`cat-${cat}`}>{words(cat)}</h3>
        <div class="figure-rows">
          <div class="figure-row">
            <span>
              Credits in
              <span class="body-small" style="display:block">
                {c.derivation.credits_in_g.length} movements:{' '}
                {c.derivation.credits_in_g.map((m) => (
                  <a class="mono" href={`/console/batches/${m.source}`} key={m.movement}>{m.source} </a>
                ))}
              </span>
            </span>
            <span class="figure figure-value">{grams(c.credits_in_g)}</span>
          </div>
          <div class="figure-row">
            <span>
              Credits out
              <span class="body-small" style="display:block">
                {c.derivation.credits_out_g.length === 0
                  ? 'no claim has been attached from this category'
                  : c.derivation.credits_out_g.map((m) => (
                    <a class="mono" href={`/console/lots/${m.lot}`} key={m.movement}>{m.lot} </a>
                  ))}
              </span>
            </span>
            <span class="figure figure-value">{grams(c.credits_out_g)}</span>
          </div>
          <div class="figure-row">
            <span>
              Credits available
              <span class="body-small" style="display:block">{c.derivation.credits_available_g}</span>
            </span>
            <span class="figure figure-value">{grams(c.credits_available_g)}</span>
          </div>
          {c.inbound_credit_g > 0 && (
            <div class="figure-row">
              <span>
                Inbound credit from another site
                <span class="body-small" style="display:block">
                  {c.derivation.inbound_credit_g.map((m) => (
                    <span key={m.movement}>
                      Movement {m.transfer} from <span class="mono">{m.origin_site}</span>. Not a fresh credit.
                    </span>
                  ))}
                </span>
              </span>
              <span class="figure figure-value">{grams(c.inbound_credit_g)}</span>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <>
      <Meta title={`${id} — Ravel`} description="The ledger for one site, grade and period." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Balance period" title={id} />
        {period.loading && <Loading what="the balance period" />}
        {period.error && <Refusal error={period.error} title="The period could not be read" />}
        {p && (
          <>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
              <StateWord strong={p.state === 'closed'}>
                {p.state === 'closed' ? <Icon name="lock" label="Closed" /> : 'Open'}
              </StateWord>
              <span class="label">
                {p.site} · grade {p.grade} · {p.period.from} to {p.period.to}
              </span>
            </div>
            {p.state === 'closed' && (
              <div class="banner" style="margin-bottom:1.5rem">
                <p class="eyebrow eyebrow-ink">Closed</p>
                <p class="body-small" style="margin:0">
                  This period is closed. Corrections require a restatement. It closed on{' '}
                  <span class="mono">{p.closed_on}</span> with a cut-off of{' '}
                  <span class="mono">{p.cut_off}</span>, after which a late event-time record
                  no longer enters it.
                </p>
              </div>
            )}

            {categoryRows('post_consumer')}
            {categoryRows('pre_consumer')}

            <section style="margin-top:2rem">
              <h3 class="h4">The margin, as a mass</h3>
              <div class="figure-rows">
                <div class="figure-row">
                  <span>Remaining claimable mass, post-consumer</span>
                  <span class="figure figure-value">{grams(p.post_consumer.credits_available_g)}</span>
                </div>
                <div class="figure-row">
                  <span>Remaining claimable mass, pre-consumer</span>
                  <span class="figure figure-value">{grams(p.pre_consumer.credits_available_g)}</span>
                </div>
                <div class="figure-row">
                  <span>Non-claimable input this period</span>
                  <span class="figure figure-value">{grams(p.non_claimable_input_g)}</span>
                </div>
              </div>
            </section>

            <section style="margin-top:2rem">
              <h3 class="h4">Three counts</h3>
              <div class="figure-rows">
                <div class="figure-row">
                  <span>Overrides this period</span>
                  <span class="figure figure-value">{p.override_count}</span>
                </div>
                <div class="figure-row">
                  <span>Open restatements</span>
                  <span class="figure figure-value">{p.open_restatement_count}</span>
                </div>
                <div class="figure-row">
                  <span>Audit findings past their date</span>
                  <span class="figure figure-value">{p.open_finding_count}</span>
                </div>
              </div>
              {overrides.data?.filter((o) => !o.reviewed).map((o) => (
                <p class="body-small" style="margin-top:0.75rem" key={o.reference}>
                  <StateWord strong>Unreviewed override</StateWord>{' '}
                  Separation overridden by {o.authorised_by} on {o.created_on}. This cannot
                  be removed. <a href={`/console/overrides/${o.reference}`}>{o.reference}</a>
                </p>
              ))}
            </section>

            <section style="margin-top:2rem">
              <h3 class="h4">Conversion factors in force</h3>
              <Table
                caption="Conversion factors"
                columns={[
                  { key: 'ref', label: 'Factor', render: (f) => <span class="mono">{f.reference} v{f.version}</span> },
                  { key: 'bp', label: 'Factor', numeric: true, render: (f) => basisPoints(f.factor_bp) },
                  { key: 'window', label: 'Derivation window', render: (f) => (f.derived_from ? <span class="mono">{f.derived_from} to {f.derived_to}</span> : 'no window at all') },
                  { key: 'in', label: 'Derived in', numeric: true, render: (f) => grams(f.derived_in_g) },
                  { key: 'out', label: 'Derived out', numeric: true, render: (f) => grams(f.derived_out_g) },
                  { key: 'prov', label: 'State', render: (f) => (f.provisional ? <StateWord strong>Provisional</StateWord> : <StateWord>Derived</StateWord>) },
                ]}
                rows={p.conversion_factors.map((f) => ({ ...f, key: f.reference }))}
                empty="No conversion factor has been published for this site."
              />
            </section>

            {p.carried_forward_g && (
              <section style="margin-top:2rem">
                <h3 class="h4">Carry-over settled at the close</h3>
                <div class="figure-rows">
                  <div class="figure-row">
                    <span>Carried forward, post-consumer</span>
                    <span class="figure figure-value">{grams(p.carried_forward_g.post_consumer)}</span>
                  </div>
                  <div class="figure-row">
                    <span>Expired, post-consumer</span>
                    <span class="figure figure-value">{grams(p.expired_g.post_consumer)}</span>
                  </div>
                  <div class="figure-row">
                    <span>Carried forward, pre-consumer</span>
                    <span class="figure figure-value">{grams(p.carried_forward_g.pre_consumer)}</span>
                  </div>
                  <div class="figure-row">
                    <span>Expired, pre-consumer</span>
                    <span class="figure figure-value">{grams(p.expired_g.pre_consumer)}</span>
                  </div>
                </div>
                <p class="body-small" style="margin-top:0.75rem">
                  The limit is {basisPoints(p.carry_over_limit_bp)} of the credit that entered
                  the period. The remainder expires and is never absorbed silently.
                </p>
              </section>
            )}

            <section style="margin-top:2rem">
              <h3 class="h4">Lots in this period</h3>
              <Table
                caption="Lots"
                columns={[
                  { key: 'ref', label: 'Lot', render: (l) => <a class="mono" href={`/console/lots/${l.reference}`}>{l.reference}</a> },
                  { key: 'mass', label: 'Mass', numeric: true, render: (l) => grams(l.mass_g) },
                  { key: 'disp', label: 'Disposition', render: (l) => <StateWord>{words(l.disposition)}</StateWord> },
                  {
                    key: 'content',
                    label: 'Recycled content',
                    render: (l) => {
                      const full = lots.data?.find((x) => x.reference === l.reference);
                      return full
                        ? <ContentFigure content_bp={full.content_bp} claim_type={full.claim_type} compact />
                        : '—';
                    },
                  },
                ]}
                rows={p.lots.map((l) => ({ ...l, key: l.reference }))}
                empty="No lot belongs to this period."
              />
            </section>

            {/* The allocation is a claims act, not a figure on this screen. It is
                kept below the derived figures and every figure above stays put
                when it is refused. */}
            <hr class="rule" />
            <section aria-labelledby="allocate">
              <h3 class="h4" id="allocate">Allocate claim to a lot</h3>
              <p class="body-small measure">
                A mass in grams, never a percentage. The percentage is computed from the
                ledger once the credit is attached.
              </p>
              <Refusal error={state.status === 'refused' ? state.error : null} title="This allocation is refused" />
              {state.status === 'done' && (
                <div class="banner" role="status" style="margin-bottom:1rem">
                  <p class="eyebrow eyebrow-ink">Claim attached</p>
                  <p class="body-small" style="margin:0">
                    {grams(state.result.mass_g)} of {words(state.result.category)} claim attached to{' '}
                    <span class="mono">{state.result.lot}</span>.{' '}
                    <ContentFigure content_bp={state.result.content_bp} claim_type={state.result.claim_type} />.
                    Credits available now {grams(state.result.credits_available_g)}.
                  </p>
                </div>
              )}
              {p.state === 'closed' ? (
                <p class="body-small">
                  This period is closed. Corrections require a restatement.
                </p>
              ) : (
                <form onSubmit={submit} class="card stack" style="margin-top:1rem">
                  <div>
                    <label class="label" for="alloc-lot">Lot</label>
                    <select id="alloc-lot" value={alloc.lot} onChange={(e) => setAlloc({ ...alloc, lot: e.currentTarget.value })}>
                      {p.lots.map((l) => <option value={l.reference} key={l.reference}>{l.reference}</option>)}
                    </select>
                  </div>
                  <div>
                    <label class="label" for="alloc-cat">Category</label>
                    <select id="alloc-cat" value={alloc.category} onChange={(e) => setAlloc({ ...alloc, category: e.currentTarget.value })}>
                      <option value="post_consumer">post consumer</option>
                      <option value="pre_consumer">pre consumer</option>
                    </select>
                  </div>
                  <div>
                    <label class="label" for="alloc-mass">Mass in grams</label>
                    <input id="alloc-mass" inputmode="numeric" pattern="[0-9]*" value={alloc.mass_g}
                      onInput={(e) => setAlloc({ ...alloc, mass_g: e.currentTarget.value })} />
                  </div>
                  <div>
                    <button class="btn btn-primary" type="submit" disabled={state.status === 'sending'}>
                      {state.status === 'sending' ? 'Allocating…' : 'Allocate'} <span class="arrow">→</span>
                    </button>
                  </div>
                </form>
              )}
            </section>
            <p class="body-small" style="margin-top:2rem">
              Read at <span class="mono">{p.read_at}</span>. {p.derivation?.source}.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export function Lots() {
  const lots = useApi('/lots');
  return (
    <>
      <Meta title="Lots — Ravel" description="The lot register." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Lots" />
        {lots.loading && <Loading what="the lot register" />}
        {lots.error && <Refusal error={lots.error} title="The lot register could not be read" />}
        {lots.data && (
          <Table
            caption="Lot register"
            columns={[
              { key: 'ref', label: 'Lot', render: (l) => <a class="mono" href={`/console/lots/${l.reference}`}>{l.reference}</a> },
              { key: 'grade', label: 'Grade', render: (l) => <span class="mono">{l.grade}</span> },
              { key: 'site', label: 'Site', render: (l) => <span class="mono">{l.site}</span> },
              { key: 'mass', label: 'Mass', numeric: true, render: (l) => grams(l.mass_g) },
              { key: 'content', label: 'Recycled content', render: (l) => <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact /> },
              {
                key: 'state',
                label: 'State',
                render: (l) => (
                  <span style="display:flex;gap:0.35rem;flex-wrap:wrap">
                    <StateWord>{words(l.disposition)}</StateWord>
                    {l.overrides?.some((o) => !o.reviewed) && <StateWord strong>Unreviewed override</StateWord>}
                    {l.deviations?.some((d) => d.state === 'open') && <StateWord strong>Open deviation</StateWord>}
                    {l.flags?.includes('lapsed_calibration') && <StateWord strong>Lapsed calibration</StateWord>}
                    {l.provisional_factor && <StateWord strong>Provisional factor</StateWord>}
                  </span>
                ),
              },
            ]}
            rows={lots.data}
            empty="No lot has been produced."
          />
        )}
      </div>
    </>
  );
}

export function LotDetail() {
  const { params } = useRoute();
  const ref = params.reference;
  const lot = useApi(`/lots/${ref}`, [ref]);
  const carbon = useApi(`/lots/${ref}/carbon`, [ref]);
  const l = lot.data;
  const c = carbon.data;
  return (
    <>
      <Meta title={`${ref} — Ravel`} description="A lot, its claim, its carbon figure and its flags." noindex />
      <div class="page">
        <Head eyebrow="Lot" title={ref} />
        {lot.loading && <Loading what="the lot" />}
        {lot.error && <Refusal error={lot.error} title="The lot could not be read" />}
        {l && (
          <>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
              <StateWord>{words(l.disposition)}</StateWord>
              {l.overrides?.filter((o) => !o.reviewed).map((o) => (
                <StateWord strong key={o.reference}>Unreviewed override</StateWord>
              ))}
              {l.deviations?.filter((d) => d.state === 'open').map((d) => (
                <StateWord strong key={d.reference}>Open deviation</StateWord>
              ))}
              {l.flags?.includes('lapsed_calibration') && <StateWord strong>Lapsed calibration</StateWord>}
              {l.provisional_factor && <StateWord strong>Provisional factor</StateWord>}
            </div>
            {l.overrides?.filter((o) => !o.reviewed).map((o) => (
              <div class="banner" style="margin-bottom:1rem" key={o.reference}>
                <p class="eyebrow eyebrow-ink">
                  <Icon name="flag" label="Override, unreviewed" />
                </p>
                <p class="body-small" style="margin:0">
                  Separation overridden by {o.authorised_by} on {o.created_on}. This cannot be
                  removed. Separation: {words(o.separation)}. Reason: {o.reason}.{' '}
                  <a href={`/console/overrides/${o.reference}`}>{o.reference}</a>
                </p>
              </div>
            ))}
            <dl class="def">
              <DefRow term="Grade"><span class="mono">{l.grade}</span></DefRow>
              <DefRow term="Site">
                <span class="mono">{(l.sites || [l.site]).join(', ')}</span>
              </DefRow>
              <DefRow term="Mass">{grams(l.mass_g)}</DefRow>
              <DefRow term="Recycled content">
                <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} />
                <span class="body-small" style="display:block">{l.derivation?.formula}</span>
              </DefRow>
              <DefRow term="Credit attached">{grams(l.credit_attached_g)}</DefRow>
              <DefRow term="Category split">
                post-consumer {grams(l.category_split?.post_consumer)}, pre-consumer{' '}
                {grams(l.category_split?.pre_consumer)}
              </DefRow>
              <DefRow term="Disposition">
                {words(l.disposition)}{l.disposition_by ? ` by ${l.disposition_by}` : ''}
              </DefRow>
              <DefRow term="Specification version"><span class="mono">SPEC-{l.grade} v{l.specification_version}</span></DefRow>
              <DefRow term="Genealogy">
                <a href={`/console/lots/${ref}/genealogy`}>
                  <Icon name="arrow" label="Read the genealogy" />
                </a>
              </DefRow>
            </dl>

            <h2 class="h4" style="margin-top:2rem">Carbon</h2>
            {carbon.loading && <Loading what="the carbon figure" />}
            {carbon.error && <Refusal error={carbon.error} title="The carbon figure could not be read" />}
            {c && (
              <>
                <p style="margin-bottom:1rem"><CarbonFigure carbon={c} /></p>
                <dl class="def">
                  <DefRow term="Boundary">{c.boundary}</DefRow>
                  <DefRow term="Method version"><span class="mono">{c.method_version_label}</span></DefRow>
                  <DefRow term="Uncertainty">{basisPoints(c.uncertainty_bp)}</DefRow>
                  <DefRow term="Primary data share">
                    {basisPoints(c.primary_share_bp)}, against a threshold of{' '}
                    {basisPoints(c.primary_threshold_bp)}.{' '}
                    {c.default_led
                      ? <StateWord strong>Default-led</StateWord>
                      : 'This figure is not default-led.'}
                  </DefRow>
                  <DefRow term="Comparator">
                    {c.comparator.material}, {c.comparator.dataset}, {c.comparator.dataset_year},{' '}
                    {c.comparator.region}. This figure is {c.comparator_relation}.
                  </DefRow>
                  <DefRow term="Cache">
                    {c.cache_valid ? 'valid' : <StateWord strong>Cache not valid — a recomputation is a recorded act</StateWord>}
                  </DefRow>
                </dl>
                <h3 class="h4" style="margin-top:1.5rem">Breakdown</h3>
                <Table
                  caption="Carbon breakdown"
                  columns={[
                    { key: 'line', label: 'Line', render: (x) => words(x.line) },
                    { key: 'value', label: 'mg CO₂e/kg', numeric: true, render: (x) => x.mg_per_kg.toLocaleString('en-GB') },
                    { key: 'tag', label: 'Data', render: (x) => <StateWord>{words(x.tag)}</StateWord> },
                  ]}
                  rows={(c.breakdown || []).map((x) => ({ ...x, key: x.line }))}
                  empty="This figure carries no breakdown, which is not permitted inside the console."
                />
                <h3 class="h4" style="margin-top:1.5rem">Energy</h3>
                <div class="figure-rows">
                  <div class="figure-row">
                    <span>Location-based</span>
                    <span class="figure figure-value">{c.energy.energy_location_mg_per_kg.toLocaleString('en-GB')} mg CO₂e/kg</span>
                  </div>
                  <div class="figure-row">
                    <span>Market-based</span>
                    <span class="figure figure-value">{c.energy.energy_market_mg_per_kg.toLocaleString('en-GB')} mg CO₂e/kg</span>
                  </div>
                  <div class="figure-row">
                    <span>Metered consumption</span>
                    <span class="figure figure-value">{kwh(c.energy.metered_kwh)}</span>
                  </div>
                  <div class="figure-row">
                    <span>Retired against this period</span>
                    <span class="figure figure-value">{kwh(c.energy.retired_kwh)}</span>
                  </div>
                  <div class="figure-row">
                    <span>Unmatched consumption</span>
                    <span class="figure figure-value">{kwh(c.energy.unmatched_kwh)}</span>
                  </div>
                </div>
                <Table
                  caption="Retired instruments"
                  columns={[
                    { key: 'ref', label: 'Instrument', render: (x) => <span class="mono">{x.reference}</span> },
                    { key: 'q', label: 'Quantity', numeric: true, render: (x) => kwh(x.quantity_kwh) },
                    { key: 'v', label: 'Vintage', numeric: true, render: (x) => x.vintage },
                    { key: 'r', label: 'Region', render: (x) => x.region },
                    { key: 's', label: 'State', render: (x) => <StateWord>{words(x.state)}</StateWord> },
                  ]}
                  rows={(c.energy.instruments || []).map((x) => ({ ...x, key: x.reference }))}
                  empty="No instrument has been retired against this period."
                />
              </>
            )}

            <h2 class="h4" style="margin-top:2rem">Test results</h2>
            <Table
              caption="Test results on this lot"
              columns={[
                { key: 'prop', label: 'Property', render: (t) => words(t.property) },
                { key: 'method', label: 'Method', render: (t) => <span class="mono">{t.method}</span> },
                { key: 'value', label: 'Value', numeric: true, render: (t) => t.value },
                { key: 'unit', label: 'Unit', render: (t) => t.unit },
                { key: 'by', label: 'Entered by', render: (t) => <span class="mono">{t.entered_by}</span> },
                {
                  key: 'usable',
                  label: 'Usable for release',
                  render: (t) => (t.usable_for_release
                    ? <StateWord>Usable</StateWord>
                    : <StateWord strong>Method mismatch, kept as evidence</StateWord>),
                },
              ]}
              rows={(l.test_results || []).map((t) => ({ ...t, key: t.reference }))}
              empty="No test result has been entered against this lot."
            />
          </>
        )}
      </div>
    </>
  );
}

// A graph, not a tree, and the same facts as a nested list.
export function Genealogy() {
  const { params } = useRoute();
  const ref = params.reference;
  const gen = useApi(`/lots/${ref}/genealogy`, [ref]);
  const [exportState, setExportState] = useState({ status: 'idle', error: null, result: null });
  const g = gen.data;

  const exportList = async () => {
    setExportState({ status: 'running', error: null, result: null });
    try {
      const result = await api('/exports', { method: 'POST', body: { scope: { object: ref, lots: [ref] } } });
      const blob = new Blob([JSON.stringify({ genealogy: g, export: result }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ref}-genealogy-${result.reference}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportState({ status: 'done', error: null, result });
    } catch (error) {
      setExportState({ status: 'failed', error, result: null });
    }
  };

  const NodeLine = ({ n }) => (
    <>
      <span class="label">{words(n.kind)}{n.run_type ? ` · ${words(n.run_type)}` : ''}{n.output_kind ? ` · ${words(n.output_kind)}` : ''}</span>{' '}
      <span class="mono">{n.reference}</span>{' '}
      <span class="figure">{grams(n.contributed_mass_g ?? n.mass_g)}</span>
      {n.category_split && (
        <span class="body-small" style="display:block">
          post-consumer {grams(n.category_split.post_consumer)} · pre-consumer{' '}
          {grams(n.category_split.pre_consumer)} · non-claimable{' '}
          {grams(n.category_split.non_claimable)}
          {typeof n.losses_g === 'number' && n.losses_g > 0 && ` · losses ${grams(n.losses_g)}`}
        </span>
      )}
      {(n.flags || []).length > 0 && (
        <span style="display:inline-flex;gap:0.35rem;flex-wrap:wrap;margin-top:0.35rem">
          {n.flags.map((f) => <StateWord strong key={f}>{words(f)}</StateWord>)}
        </span>
      )}
      {n.repeated && (
        <span class="body-small" style="display:block">
          Reached by another path as well; it appears once with its total mass.
        </span>
      )}
    </>
  );

  const Nested = ({ node }) => (
    <li>
      <NodeLine n={node} />
      {node.inputs?.length > 0 && (
        <ul>
          {node.inputs.map((i, k) => <Nested node={i} key={`${i.reference}-${k}`} />)}
        </ul>
      )}
    </li>
  );

  return (
    <>
      <Meta title={`Genealogy of ${ref} — Ravel`} description="The graph and the nested list behind one lot." noindex />
      <div class="page">
        <Head eyebrow="Genealogy" title={ref}>
          <p>A graph, not a tree. A batch reached by several paths is drawn once with the
          total mass it contributed, and the edges carry mass rather than a percentage.</p>
        </Head>
        {gen.loading && <Loading what="the genealogy" />}
        {gen.error && <Refusal error={gen.error} title="The genealogy could not be read" />}
        {g && (
          <>
            <div class="banner" style="margin-bottom:1.5rem">
              <p class="eyebrow eyebrow-ink">
                {g.flagged
                  ? <Icon name="flag" label="Something in this graph is flagged" />
                  : 'Nothing in this graph is flagged'}
              </p>
              <p class="body-small" style="margin:0">
                {g.flagged
                  ? `Flagged: ${[...new Set(g.nodes.flatMap((n) => n.flags))].map(words).join(', ')}. A flag anywhere in the graph is visible from the lot without expanding anything.`
                  : 'No node in this graph carries a flag.'}
              </p>
            </div>

            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem">
              <button class="btn" onClick={exportList}>
                Export this genealogy <span class="arrow">→</span>
              </button>
            </div>
            {exportState.status === 'done' && (
              <p class="body-small" role="status">
                Export <span class="mono">{exportState.result.reference}</span> taken. Every
                export is itself an entry in the record.
              </p>
            )}
            {exportState.status === 'failed' && <Refusal error={exportState.error} title="The export was refused" />}

            <h2 class="h4">The graph</h2>
            <div class="graph-only">
              <GraphSvg nodes={g.nodes} edges={g.edges} />
            </div>
            <p class="body-small graph-only" style="margin-top:0.5rem">
              Edges carry mass. A percentage of a percentage across four hops compounds
              into a figure nobody can reconcile.
            </p>
            <div class="list-only" style="display:block">
              <p class="body-small">
                At this width the graph is the nested list below, which carries the same
                nodes, the same masses, the same category splits and the same flags.
              </p>
            </div>

            <h2 class="h4" style="margin-top:2rem">The same facts, as a nested list</h2>
            <ul class="tree">
              <Nested node={g.text_equivalent} />
            </ul>

            <h2 class="h4" style="margin-top:2rem">Every node</h2>
            <Table
              caption="Nodes"
              columns={[
                { key: 'kind', label: 'Kind', render: (n) => words(n.kind) },
                { key: 'ref', label: 'Reference', render: (n) => <span class="mono">{n.reference}</span> },
                { key: 'mass', label: 'Mass', numeric: true, render: (n) => grams(n.mass_g) },
                { key: 'post', label: 'Post-consumer', numeric: true, render: (n) => grams(n.category_split.post_consumer) },
                { key: 'pre', label: 'Pre-consumer', numeric: true, render: (n) => grams(n.category_split.pre_consumer) },
                { key: 'non', label: 'Non-claimable', numeric: true, render: (n) => grams(n.category_split.non_claimable) },
                {
                  key: 'flags',
                  label: 'Flags',
                  render: (n) => (n.flags.length === 0 ? 'none'
                    : n.flags.map((f) => <StateWord strong key={f}>{words(f)}</StateWord>)),
                },
              ]}
              rows={g.nodes.map((n) => ({ ...n, key: n.reference }))}
              empty="This lot has no genealogy."
            />
            <p class="body-small" style="margin-top:1rem">
              Read at <span class="mono">{g.read_at}</span>. {g.derivation?.source}.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function GraphSvg({ nodes, edges }) {
  const order = { batch: 0, run: 1, output: 2, lot: 3 };
  // Lay the graph out by depth from the lot, so a batch reached twice still
  // sits once.
  const depth = new Map();
  const lot = nodes.find((n) => n.kind === 'lot');
  const compute = (ref, d = 0, seen = new Set()) => {
    if (seen.has(ref)) return;
    seen.add(ref);
    depth.set(ref, Math.max(depth.get(ref) ?? 0, d));
    for (const e of edges.filter((x) => x.to === ref)) compute(e.from, d + 1, seen);
  };
  if (lot) compute(lot.reference);
  const maxDepth = Math.max(0, ...depth.values());
  const columns = [];
  for (let d = maxDepth; d >= 0; d -= 1) {
    columns.push(nodes.filter((n) => depth.get(n.reference) === d)
      .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)));
  }
  const colW = 190;
  const rowH = 74;
  const width = Math.max(600, columns.length * colW);
  const height = Math.max(200, Math.max(...columns.map((c) => c.length)) * rowH + 40);
  const pos = new Map();
  columns.forEach((col, ci) => {
    col.forEach((n, ri) => {
      pos.set(n.reference, {
        x: ci * colW + 14,
        y: ri * rowH + 24 + ((Math.max(...columns.map((c) => c.length)) - col.length) * rowH) / 2,
      });
    });
  });
  return (
    <div class="table-scroll">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Genealogy graph. The same facts are in the nested list below."
        style="max-width:100%"
      >
        {edges.map((e) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + 150;
          const y1 = a.y + 20;
          const x2 = b.x;
          const y2 = b.y + 20;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={`M${x1} ${y1} C ${x1 + 20} ${y1}, ${x2 - 20} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="currentColor"
                stroke-width="1"
                opacity="0.5"
              />
              <text x={(x1 + x2) / 2 - 24} y={(y1 + y2) / 2 - 4} font-size="12" fill="currentColor" font-family="monospace">
                {e.mass_g.toLocaleString('en-GB')} g
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.reference);
          if (!p) return null;
          return (
            <g key={n.reference}>
              <rect x={p.x} y={p.y} width="150" height="40" rx="4" fill="none" stroke="currentColor"
                stroke-width={n.flags.length ? 2 : 1} />
              <text x={p.x + 8} y={p.y + 16} font-size="12" fill="currentColor" font-family="monospace">
                {n.reference}
              </text>
              <text x={p.x + 8} y={p.y + 32} font-size="12" fill="currentColor" font-family="monospace">
                {n.mass_g.toLocaleString('en-GB')} g{n.flags.length ? ' · flagged' : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
