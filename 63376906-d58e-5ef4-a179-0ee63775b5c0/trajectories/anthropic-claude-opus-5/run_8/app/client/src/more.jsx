import { useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { api, useApi, basisPoints, grams, kilograms, kwh, words } from './api.js';
import {
  CapacityFigure, ContentFigure, DefRow, Empty, Icon, Loading, Refusal, StateWord, Table,
} from './components.jsx';
import { Meta } from './public.jsx';
import { Head, SchemeBanner } from './console.jsx';

export function Overrides() {
  const { params } = useRoute();
  const ref = params?.reference;
  const [reload, setReload] = useState(0);
  const overrides = useApi('/overrides', [reload]);
  const [state, setState] = useState({ status: 'idle', error: null });
  const rows = overrides.data || [];
  const shown = ref ? rows.filter((o) => o.reference === ref) : rows;

  const review = async (o) => {
    setState({ status: 'sending', error: null });
    try {
      await api(`/overrides/${o.reference}/review`, { method: 'POST', body: {} });
      setState({ status: 'done', error: null });
      setReload((n) => n + 1);
    } catch (error) {
      setState({ status: 'refused', error });
    }
  };

  return (
    <>
      <Meta title="Overrides — Ravel" description="Every broken separation, permanently." noindex />
      <div class="page">
        <Head eyebrow="Console" title={ref ? `Override ${ref}` : 'Overrides'}>
          <p>An override names the separation broken, its reason and its authoriser. It is
          permanent, shows on the lot for its life, is counted on the balance screen, and
          blocks signing until a second person reviews it. A review removes nothing.</p>
        </Head>
        <Refusal error={state.status === 'refused' ? state.error : null} title="The review was refused" />
        {overrides.loading && <Loading what="the overrides" />}
        {shown.length === 0 && !overrides.loading && <Empty>No separation has been overridden.</Empty>}
        {shown.map((o) => (
          <article class="card" key={o.reference} style="margin-bottom:1.5rem">
            <p class="mono" style="margin:0 0 0.35rem">{o.reference}</p>
            <p style="margin:0 0 0.75rem">
              {o.reviewed
                ? <StateWord>Reviewed</StateWord>
                : <StateWord strong><Icon name="flag" label="Unreviewed" /></StateWord>}
            </p>
            <dl class="def">
              <DefRow term="Separation broken">{words(o.separation)}</DefRow>
              <DefRow term="Lot"><a class="mono" href={`/console/lots/${o.lot}`}>{o.lot}</a></DefRow>
              <DefRow term="Authorised by"><span class="mono">{o.authorised_by}</span></DefRow>
              <DefRow term="Reason">{o.reason}</DefRow>
              <DefRow term="Recorded on"><span class="mono">{o.created_on}</span></DefRow>
              <DefRow term="Reviewed by">{o.reviewed_by ? <span class="mono">{o.reviewed_by}</span> : 'nobody yet'}</DefRow>
            </dl>
            <p class="body-small" style="margin-top:1rem">
              Separation overridden by {o.authorised_by} on {o.created_on}. This cannot be removed.
            </p>
            {!o.reviewed && (
              <p style="margin-top:1rem">
                <button class="btn" onClick={() => review(o)} disabled={state.status === 'sending'}>
                  Review this override <span class="arrow">→</span>
                </button>
                <span class="body-small" style="display:block;margin-top:0.5rem">
                  The authoriser cannot review their own override. A second person must.
                </span>
              </p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

export function Deviations() {
  const { params } = useRoute();
  const ref = params?.reference;
  const deviations = useApi('/deviations');
  const rows = (deviations.data || []).filter((d) => !ref || d.reference === ref);
  return (
    <>
      <Meta title="Deviations — Ravel" description="Deviations against runs and lots." noindex />
      <div class="page">
        <Head eyebrow="Console" title={ref ? `Deviation ${ref}` : 'Deviations'}>
          <p>A deviation travels with every lot it touches. Both outcomes are honest and
          neither is hidden.</p>
        </Head>
        {deviations.loading && <Loading what="the deviations" />}
        {deviations.error && <Refusal error={deviations.error} title="The deviations could not be read" />}
        {!deviations.loading && rows.length === 0 && <Empty>No deviation has been raised.</Empty>}
        {rows.length > 0 && (
          <Table
            caption="Deviations"
            columns={[
              { key: 'ref', label: 'Deviation', render: (d) => <a class="mono" href={`/console/deviations/${d.reference}`}>{d.reference}</a> },
              { key: 'state', label: 'State', render: (d) => (d.state === 'open' ? <StateWord strong>Open</StateWord> : <StateWord>Closed</StateWord>) },
              { key: 'runs', label: 'Runs', render: (d) => <span class="mono">{d.runs.join(', ') || '—'}</span> },
              { key: 'lots', label: 'Lots', render: (d) => <span class="mono">{d.lots.join(', ') || '—'}</span> },
              { key: 'detail', label: 'Detail', render: (d) => d.detail },
              { key: 'outcome', label: 'Outcome', render: (d) => (d.outcome ? words(d.outcome) : 'not yet closed') },
              { key: 'raised', label: 'Raised', render: (d) => <span class="mono">{d.raised_on}</span> },
            ]}
            rows={rows.map((d) => ({ ...d, key: d.reference }))}
            empty="No deviation has been raised."
          />
        )}
      </div>
    </>
  );
}

export function Contracts() {
  const contracts = useApi('/contracts');
  return (
    <>
      <Meta title="Contracts — Ravel" description="Contract projections and the offtake floor." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Contracts">
          <p>An unreachable floor is reported and never refused. The unreachable state is a
          word and a date.</p>
        </Head>
        {contracts.loading && <Loading what="the contracts" />}
        {contracts.error && <Refusal error={contracts.error} title="The contracts could not be read" />}
        {contracts.data && contracts.data.length === 0 && <Empty>No contract is on the books.</Empty>}
        {contracts.data && contracts.data.map((k) => (
          <article class="card" key={k.id} style="margin-bottom:1.5rem">
            <p class="mono" style="margin:0 0 0.35rem">{k.id}</p>
            <p class="label" style="margin:0 0 0.75rem">{k.recipient} · {k.site} · {k.period}</p>
            <p style="margin:0 0 1rem;display:flex;gap:0.35rem;flex-wrap:wrap">
              <StateWord strong={k.state === 'unreachable'}>
                {k.state === 'unreachable' ? 'Unreachable' : 'On track'}
              </StateWord>
              {k.planned_site_flag && (
                <StateWord strong>
                  <Icon name="warning" label={`Supplying site is planned, not built`} />
                </StateWord>
              )}
            </p>
            <div class="figure-rows">
              <div class="figure-row">
                <span>Delivered</span>
                <span class="figure figure-value">{kilograms(k.delivered_kg)}</span>
              </div>
              <div class="figure-row">
                <span>Committed</span>
                <span class="figure figure-value">{kilograms(k.committed_kg)}</span>
              </div>
              <div class="figure-row">
                <span>Running recycled content</span>
                <span class="figure figure-value">
                  <ContentFigure content_bp={k.running_content_bp} claim_type="mass_balance" compact />
                </span>
              </div>
              <div class="figure-row">
                <span>The floor</span>
                <span class="figure figure-value">{basisPoints(k.floor_bp)}</span>
              </div>
              <div class="figure-row">
                <span>The average the remaining volume must reach</span>
                <span class="figure figure-value">{basisPoints(k.required_remaining_bp)}</span>
              </div>
            </div>
            {k.state === 'unreachable' && (
              <p class="body-small" style="margin-top:1rem">
                Unreachable since <span class="mono">{k.unreachable_on || 'the allocation below'}</span>,
                made so by allocation <span class="mono">{k.unreachable_allocation || 'not recorded'}</span>.
              </p>
            )}
            {k.planned_site_flag && (
              <p class="body-small" style="margin-top:1rem">
                The supplying site <span class="mono">{k.site}</span> carries a confidence of
                planned. This flag appears on every response this contract appears in and
                cannot be dismissed.
              </p>
            )}
            <p class="body-small" style="margin-top:1rem">
              Shortfall consequence, stated at signature: {k.shortfall_consequence}.
            </p>
            {k.allocations.length > 0 && (
              <>
                <h3 class="h4" style="margin-top:1.5rem">Allocations</h3>
                <Table
                  caption="Contract allocations"
                  columns={[
                    { key: 'ref', label: 'Allocation', render: (a) => <span class="mono">{a.reference}</span> },
                    { key: 'lot', label: 'Lot', render: (a) => <a class="mono" href={`/console/lots/${a.lot}`}>{a.lot}</a> },
                    { key: 'mass', label: 'Mass', numeric: true, render: (a) => kilograms(a.mass_kg) },
                    { key: 'content', label: 'Content', numeric: true, render: (a) => basisPoints(a.content_bp) },
                    { key: 'by', label: 'Decided by', render: (a) => <span class="mono">{a.decided_by}</span> },
                    {
                      key: 'over',
                      label: 'Contracts that went without',
                      render: (a) => <span class="mono">{a.favoured_over.map((f) => f.contract).join(', ') || 'none'}</span>,
                    },
                  ]}
                  rows={k.allocations.map((a) => ({ ...a, key: a.reference }))}
                  empty="Nothing has been allocated to this contract."
                />
              </>
            )}
            <p class="body-small" style="margin-top:1rem">{k.derivation?.required_remaining_bp}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function Inbound() {
  const inbound = useApi('/inbound');
  return (
    <>
      <Meta title="Inbound — Ravel" description="What arrived from each source, kept verbatim." noindex />
      <div class="page">
        <Head eyebrow="Console" title="Inbound records">
          <p>Four sources send records into this system and none of them is called out to.
          The payload is kept exactly as it arrived, because a disagreement with a supplier
          is settled by what came in.</p>
        </Head>
        {inbound.loading && <Loading what="the inbound records" />}
        {inbound.error && <Refusal error={inbound.error} title="The inbound records could not be read" />}
        {inbound.data && inbound.data.length === 0 && <Empty>No inbound record has arrived.</Empty>}
        {inbound.data && inbound.data.length > 0 && (
          <div class="stack-l">
            {inbound.data.map((r) => (
              <article class="card" key={r.reference}>
                <p class="mono" style="margin:0 0 0.35rem">{r.reference}</p>
                <p class="label" style="margin:0 0 0.75rem">
                  {words(r.source)} · received at <span class="mono">{r.received_at}</span>
                </p>
                <p class="eyebrow eyebrow-ink">The payload, verbatim</p>
                <pre class="mono" style="white-space:pre-wrap;word-break:break-word;margin:0">{r.payload_verbatim}</pre>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function Sites() {
  const sites = useApi('/sites');
  const [caps, setCaps] = useState(null);
  if (sites.data && caps === null) {
    Promise.all(sites.data.map((s) => api(`/sites/${s.reference}/capacity`)))
      .then(setCaps).catch(() => setCaps([]));
  }
  return (
    <>
      <Meta title="Sites — Ravel" description="The three sites and their capacity." noindex />
      <SchemeBanner />
      <div class="page">
        <Head eyebrow="Console" title="Sites">
          <p>A capacity figure is never returned without its confidence, and{' '}
          <span class="mono">uncommitted_kg</span> is computed and allowed to be negative.</p>
        </Head>
        {!caps && <Loading what="the sites" />}
        {caps && caps.length === 0 && <Empty>No site is registered.</Empty>}
        {caps && caps.length > 0 && (
          <div class="grid grid-3">
            {caps.map((s) => (
              <article class="card" key={s.reference}>
                <p class="mono" style="margin:0 0 0.35rem">{s.reference}</p>
                <h2 class="h4">{s.name}</h2>
                <p style="margin:0.5rem 0"><StateWord strong={s.confidence === 'planned'}>{words(s.confidence)}</StateWord></p>
                <div class="figure-rows" style="margin-top:0.75rem">
                  <div class="figure-row">
                    <span>Nameplate</span>
                    <span class="figure figure-value">{kilograms(s.nameplate_kg)}/yr</span>
                  </div>
                  <div class="figure-row">
                    <span>Contracted</span>
                    <span class="figure figure-value">{kilograms(s.contracted_kg)}/yr</span>
                  </div>
                  <div class="figure-row">
                    <span>Uncommitted</span>
                    <span class="figure figure-value">{kilograms(s.uncommitted_kg)}/yr</span>
                  </div>
                </div>
                <p class="body-small" style="margin-top:0.75rem">
                  Basis: {s.basis}. Last revised {s.last_revised}. {s.derivation?.uncommitted_kg}.
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

const QUERIES = [
  'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
  'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
  'refused_allocations', 'collector_declaration_departures', 'acts_by_person',
  'exports_by_auditor',
];

export function Queries() {
  const [name, setName] = useState(QUERIES[0]);
  const { loading, data, error } = useApi(`/record/queries/${name}`, [name]);
  return (
    <>
      <Meta title="Record queries — Ravel" description="The nine questions the record exists to answer." noindex />
      <div class="page">
        <Head eyebrow="Console" title="The nine questions">
          <p>Each answers with a complete set rather than a report somebody assembles, and
          each refuses a page.</p>
        </Head>
        <div class="wizard-steps">
          {QUERIES.map((q) => (
            <a key={q} href="#answer" aria-current={q === name ? 'step' : undefined}
              onClick={(e) => { e.preventDefault(); setName(q); }}>{words(q)}</a>
          ))}
        </div>
        <div id="answer">
          {loading && <Loading what="the answer" />}
          {error && <Refusal error={error} title="The query was refused" />}
          {data && data.length === 0 && (
            <Empty>This question has no answer at the moment: the set is complete and it is empty.</Empty>
          )}
          {data && data.length > 0 && (
            <Table
              caption={words(name)}
              columns={Object.keys(data[0]).slice(0, 7).map((k) => ({
                key: k,
                label: words(k),
                numeric: typeof data[0][k] === 'number',
                render: (r) => (typeof r[k] === 'object' && r[k] !== null
                  ? <span class="mono">{JSON.stringify(r[k]).slice(0, 90)}</span>
                  : <span class={typeof r[k] === 'number' || /_(g|bp|at|on)$/.test(k) || k === 'seq' ? 'mono' : undefined}>
                      {String(r[k] ?? '—')}
                    </span>),
              }))}
              rows={data.map((r, i) => ({ ...r, key: i }))}
              empty="Nothing."
            />
          )}
          {data && <p class="body-small" style="margin-top:1rem">{data.length} rows, a complete set.</p>}
        </div>
      </div>
    </>
  );
}

export function ConsoleNotFound() {
  return (
    <div class="page" style="padding-top:3rem">
      <Head eyebrow="Console" title="There is no such surface">
        <p>The address you followed does not resolve inside the console.</p>
      </Head>
      <p><a class="btn" href="/console">Back to the board <span class="arrow">→</span></a></p>
    </div>
  );
}
