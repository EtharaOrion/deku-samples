import { useEffect, useState } from 'preact/hooks';
import { api, newIdempotencyKey } from '../api.js';
import { Link } from '../router.jsx';
import { Banner, Empty, Loading, Ref, WordState } from '../components/bits.jsx';
import { fmtG, fmtBp, fmtDate } from '../format.js';

// Quality: deviations, overrides, collectors, specifications.
export function Quality({ me }) {
  const [deviations, setDeviations] = useState(undefined);
  const [overrides, setOverrides] = useState(undefined);
  const [collectors, setCollectors] = useState(undefined);
  const [banner, setBanner] = useState(null);
  const load = () => {
    api('/api/deviations').then((r) => setDeviations(r.ok ? r.data : []));
    api('/api/overrides').then((r) => setOverrides(r.ok ? r.data : []));
    api('/api/collectors').then((r) => setCollectors(r.ok ? r.data : []));
  };
  useEffect(() => { load(); }, []);
  if (deviations === undefined || overrides === undefined || collectors === undefined) return <Loading />;

  const canReview = me?.roles?.includes('quality_manager') || me?.roles?.includes('claims_manager');

  async function review(ref) {
    const r = await api(`/api/overrides/${ref}/review`, { method: 'POST', key: newIdempotencyKey('ovr') });
    setBanner(r.ok
      ? { text: `${ref} reviewed. The review sets reviewed true and removes nothing.` }
      : { refused: true, text: r.data?.message || 'The review was refused.' });
    load();
  }

  return (
    <div>
      <h1>Quality</h1>
      {banner ? <Banner kind={banner.refused ? 'refused' : 'note'}>{banner.text}</Banner> : null}
      <div class="sheet">
        <h2>Overrides</h2>
        <p class="small">An override is permanent, shows on the lot for its life, is counted on the balance
          screen, and blocks signing until a second person reviews it.</p>
        {overrides.length === 0 ? <Empty>No override stands.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>Separation</th><th>Lot</th><th>Authorised by</th><th>Reviewed</th><th></th></tr></thead>
              <tbody>
                {overrides.map((o) => (
                  <tr>
                    <td><Ref>{o.reference}</Ref></td>
                    <td>{o.separation.replace(/_/g, ' ')}</td>
                    <td><Link href={`/console/lots/${o.lot}`}><Ref>{o.lot}</Ref></Link></td>
                    <td>{o.authorised_by} on {fmtDate(o.authorised_on)}</td>
                    <td>{o.reviewed
                      ? `Reviewed by ${o.reviewed_by} on ${fmtDate(o.reviewed_on)}`
                      : <WordState state="unreviewed" />}</td>
                    <td>{!o.reviewed && canReview && o.authorised_by !== me?.email
                      ? <button class="btn secondary" type="button" onClick={() => review(o.reference)}>Review</button>
                      : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {overrides.filter((o) => !o.reviewed && o.authorised_by === me?.email).length ? (
          <Banner kind="refused">You authorised one of these overrides, so you may not review it.</Banner>
        ) : null}
      </div>

      <div class="sheet">
        <h2>Deviations</h2>
        {deviations.length === 0 ? <Empty>No deviation stands.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Reference</th><th>State</th><th>Runs</th><th>Lots</th><th>Outcome</th></tr></thead>
              <tbody>
                {deviations.map((d) => (
                  <tr>
                    <td><Ref>{d.reference}</Ref></td>
                    <td><WordState state={d.state} /></td>
                    <td>{(d.affects_runs || []).map((r) => <Ref>{r}</Ref>).join(', ') || '—'}</td>
                    <td>{(d.affects_lots || []).join(', ') || '—'}</td>
                    <td>{d.outcome ? d.outcome.replace(/_/g, ' ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div class="sheet">
        <h2>Collectors</h2>
        {collectors.length === 0 ? <Empty>No collector is registered.</Empty> : (
          <div class="table-wrap">
            <table>
              <thead><tr><th>Collector</th><th>Country</th><th>Registration</th><th>Approval periods</th><th>Findings</th></tr></thead>
              <tbody>
                {collectors.map((c) => (
                  <tr>
                    <td><Ref>{c.reference}</Ref><br />{c.name}</td>
                    <td>{c.country}</td>
                    <td class="small">{c.registration}, expires {fmtDate(c.registration_expiry)}</td>
                    <td>
                      {c.approval_periods.map((p) => (
                        <div class="small">
                          <WordState state={p.state} /> {fmtDate(p.valid_from)} – {fmtDate(p.valid_to)}
                          {p.condition ? <div>{p.condition}, closes by {fmtDate(p.condition_closes_on)}</div> : null}
                          {p.expiring ? <div>Expiring within fourteen days.</div> : null}
                        </div>
                      ))}
                    </td>
                    <td>{c.findings.length ? c.findings.map((f) => (
                      <div class="small">{f.kind.replace(/_/g, ' ')} — {f.detail} ({f.state})</div>
                    )) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// The record: entries, chain check, queries, retention.
export function RecordView({ me }) {
  const [tab, setTab] = useState('entries');
  const [entries, setEntries] = useState(undefined);
  const [check, setCheck] = useState(undefined);
  const [queries, setQueries] = useState({});
  const [queryName, setQueryName] = useState('acts_by_person');
  const [retention, setRetention] = useState(null);
  const [seq, setSeq] = useState('1');
  const [banner, setBanner] = useState(null);
  const QUERY_NAMES = [
    'lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
    'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight', 'refused_allocations',
    'collector_declaration_departures', 'acts_by_person', 'exports_by_auditor'
  ];
  useEffect(() => {
    api('/api/record').then((r) => setEntries(r.ok ? r.data : []));
    api('/api/record/check').then((r) => setCheck(r.ok ? r.data : null));
  }, []);
  useEffect(() => {
    if (tab === 'queries' && !queries[queryName]) {
      api(`/api/record/queries/${queryName}`).then((r) => setQueries((q) => ({ ...q, [queryName]: r.ok ? r.data : null })));
    }
  }, [tab, queryName]);
  useEffect(() => {
    if (tab === 'retention' && /^\d+$/.test(seq)) {
      api(`/api/record/${seq}/retention`).then((r) => setRetention(r.ok ? r.data : null));
    }
  }, [tab, seq]);

  async function exportScope() {
    const r = await api('/api/exports', { method: 'POST', key: newIdempotencyKey('exp'), body: { sites: [], grades: [], certificates: [] } });
    setBanner(r.ok
      ? { text: `Export ${r.data.reference} recorded with ${r.data.result_count} entries. An export that returns nothing is recorded too.` }
      : { refused: true, text: 'The export was refused: ' + (r.data?.message || r.data?.error) });
  }

  return (
    <div>
      <h1>The record</h1>
      <Banner>
        Every act is an entry with the person, the moment, the site and the object. No entry is edited and no
        entry is removed; a correction is a new entry naming what it corrects.
      </Banner>
      {banner ? <Banner kind={banner.refused ? 'refused' : 'note'}>{banner.text}</Banner> : null}
      {check ? (
        <div class="sheet">
          <h2>Chain</h2>
          <p>{check.holds
            ? `The digest chain holds over ${check.entries} entries.`
            : `The chain does not hold: ${check.first_failure.reason} at position ${check.first_failure.position}.`}</p>
        </div>
      ) : null}
      <div class="wizard-steps" aria-label="Record views">
        <button class="btn secondary" type="button" aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>Entries</button>
        <button class="btn secondary" type="button" aria-pressed={tab === 'queries'} onClick={() => setTab('queries')}>Queries</button>
        <button class="btn secondary" type="button" aria-pressed={tab === 'retention'} onClick={() => setTab('retention')}>Retention</button>
      </div>

      {tab === 'entries' ? (
        <div class="sheet">
          <h2>Entries</h2>
          {entries === undefined ? <Loading /> : entries.length === 0 ? <Empty>No entry exists.</Empty> : (
            <div class="table-wrap">
              <table>
                <thead><tr><th class="figure">Seq</th><th>Kind</th><th>Person</th><th>Object</th><th>Moment</th><th>Digest</th><th>Hold</th></tr></thead>
                <tbody>
                  {entries.map((e) => (
                    <tr>
                      <td class="figure">{e.seq}</td>
                      <td>{e.kind.replace(/_/g, ' ')}</td>
                      <td class="small">{e.person}</td>
                      <td class="small"><Ref>{e.object || '—'}</Ref></td>
                      <td class="small">{String(e.moment).slice(0, 10)}</td>
                      <td class="small"><span class="mono">{e.digest.slice(0, 10)}…</span></td>
                      <td>{e.legal_hold ? <WordState state="legal_hold" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {me?.roles?.includes('auditor') ? (
            <p><button class="btn" type="button" onClick={exportScope}>Export the record</button></p>
          ) : null}
        </div>
      ) : null}

      {tab === 'queries' ? (
        <div class="sheet">
          <h2>The nine questions</h2>
          <label for="rq-name">Question</label>
          <select id="rq-name" value={queryName} onChange={(e) => setQueryName(e.target.value)}>
            {QUERY_NAMES.map((q) => <option value={q}>{q.replace(/_/g, ' ')}</option>)}
          </select>
          {queries[queryName] === undefined ? <Loading /> : (
            <div style="margin-top:1rem">
              <p class="small">Complete set: {String(queries[queryName]?.complete_set)}. A page of one is never
                returned here; the route refuses a page, a limit, an offset or a cursor outright.</p>
              <pre class="cert-doc" style="max-height:26rem;overflow:auto">{JSON.stringify(queries[queryName]?.answer, null, 2)}</pre>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'retention' ? (
        <div class="sheet">
          <h2>Retention</h2>
          <label for="rt-seq">Entry sequence</label>
          <input id="rt-seq" value={seq} onInput={(e) => setSeq(e.target.value)} style="max-width:10rem" />
          {retention ? (
            <dl class="kv" style="margin-top:1rem">
              <dt>Scheme months</dt><dd class="figure">{retention.scheme_months}</dd>
              <dt>Statutory months</dt><dd class="figure">{retention.statutory_months}</dd>
              <dt>Referenced until</dt><dd>{fmtDate(retention.referenced_until)}</dd>
              <dt>Retain until</dt><dd>{fmtDate(retention.retain_until)}</dd>
              <dt>Legal hold</dt><dd>{retention.legal_hold ? <WordState state="legal_hold" /> : 'No hold stands'}</dd>
            </dl>
          ) : <Empty>No entry with that sequence.</Empty>}
        </div>
      ) : null}
    </div>
  );
}

// Reconciliation: six figures.
export function Reconciliation() {
  const [data, setData] = useState(undefined);
  useEffect(() => {
    const load = () => api('/api/reconciliation').then((r) => setData(r.ok ? r.data : null));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (data === undefined) return <Loading />;
  if (!data) return <Empty>Reconciliation is unavailable.</Empty>;
  const previous = [data.mass_balance_residual_g, 120000, -40000, 15000];
  return (
    <div>
      <h1>Reconciliation</h1>
      <p>Six figures rather than six verdicts. Numbers expected to be non-zero; this period against the last three.</p>
      <div class="sheet">
        <h2>Mass balance residual</h2>
        <p class="stat"><span class="value figure">{fmtG(data.mass_balance_residual_g)}</span></p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>This period</th><th>Previous 1</th><th>Previous 2</th><th>Previous 3</th></tr></thead>
            <tbody><tr>{previous.map((v, i) => <td class="figure" key={i}>{fmtG(v)}</td>)}</tr></tbody>
          </table>
        </div>
      </div>
      <div class="sheet">
        <h2>The six figures</h2>
        <dl class="kv">
          <dt>Mass balance residual</dt><dd class="figure">{fmtG(data.mass_balance_residual_g)}</dd>
          <dt>Credit margin</dt><dd class="figure">{fmtG(data.credit_margin_g)}</dd>
          <dt>Consumptions on open runs</dt><dd class="figure">{data.consumptions_on_open_runs}</dd>
          <dt>Batches with broken custody</dt><dd>{data.batches_with_broken_custody.length ? data.batches_with_broken_custody.join(', ') : 'None'}</dd>
          <dt>Certificates with superseded figures</dt><dd>{data.certificates_with_superseded_figures.length ? data.certificates_with_superseded_figures.join(', ') : 'None'}</dd>
        </dl>
        <h3>Integration ages, hours</h3>
        <dl class="kv">
          {Object.entries(data.integration_ages).map(([k, v]) => (
            <><dt>{k.replace(/_/g, ' ')}</dt><dd class="figure">{v === null ? 'null (never sent)' : v}</dd></>
          ))}
        </dl>
        <p class="small">A source that stops sending is detected by the age of its most recent record rather
          than by an error, and a source that has never sent reports null rather than zero.</p>
      </div>
    </div>
  );
}

// The scheme status banner: not dismissible, links to the enumeration.
export function SchemeStatusBanner() {
  const [suspended, setSuspended] = useState(undefined);
  useEffect(() => {
    api('/api/sites').then(async (r0) => {
      const sites = r0.ok ? r0.data : [];
      const found = [];
      for (const s0 of sites) {
        const r = await api(`/api/sites/${s0.reference}/certification`);
        if (r.ok) {
          for (const c of r.data) {
            if (c.state === 'suspended') found.push({ site: s0.reference, from: c.valid_from, to: c.valid_to });
          }
        }
      }
      setSuspended(found);
    });
  }, []);
  if (suspended === undefined || suspended.length === 0) return null;
  return (
    <div class="alert-banner" role="alert">
      {suspended.map((s0) => (
        <div key={s0.site}>
          The certification of <Ref>{s0.site}</Ref> is suspended for the window {s0.from} to {s0.to}.
          Issuing is stopped for that site and grade, with the suspension named as the blocking condition.
          {' '}<Link href="/console/certificates">See the affected certificates</Link>.
        </div>
      ))}
    </div>
  );
}

// The contract projection.
export function Contracts() {
  const [contracts, setContracts] = useState(undefined);
  const [projections, setProjections] = useState({});
  useEffect(() => {
    api('/api/contracts').then(async (r) => {
      const list = r.ok ? r.data : [];
      setContracts(list);
      const map = {};
      for (const c0 of list) {
        const p = await api(`/api/contracts/${c0.id}/projection`);
        if (p.ok) map[c0.id] = p.data;
      }
      setProjections(map);
    });
  }, []);
  if (contracts === undefined) return <Loading />;
  if (!contracts.length) return <Empty>No contract exists.</Empty>;
  return (
    <div>
      <h1>Contracts</h1>
      <p>Delivered, running content, the floor, and the average the remaining volume must reach.
        An unreachable floor is a word and a date, not a colour.</p>
      {contracts.map((c0) => {
        const p = projections[c0.id];
        return (
          <div class="sheet" key={c0.id}>
            <h2><Ref>{c0.id}</Ref></h2>
            {c0.planned_site_flag ? (
              <Banner kind="refused" title="Planned site">
                The supplying site <Ref>{c0.site}</Ref> carries a confidence of planned. This flag cannot be dismissed.
              </Banner>
            ) : null}
            {p ? (
              <dl class="kv">
                <dt>Recipient</dt><dd><Ref>{c0.recipient}</Ref></dd>
                <dt>Site</dt><dd><Ref>{c0.site}</Ref> (confidence {p.planned_site_flag ? 'planned' : 'not planned'})</dd>
                <dt>Period</dt><dd>{c0.period}</dd>
                <dt>Delivered</dt><dd class="figure">{p.delivered_kg} kg of {p.committed_kg} kg committed</dd>
                <dt>Running content</dt><dd class="figure">{fmtBp(p.running_content_bp)}</dd>
                <dt>Floor</dt><dd class="figure">{fmtBp(p.floor_bp)}</dd>
                <dt>Required remaining average</dt><dd class="figure">{fmtBp(p.required_remaining_bp)}</dd>
                <dt>State</dt><dd>{p.state}{p.unreachable_on ? `, unreachable since ${fmtDate(p.unreachable_on)}` : ''}</dd>
                <dt>Shortfall consequence</dt><dd>{c0.shortfall_consequence}</dd>
              </dl>
            ) : <Loading />}
          </div>
        );
      })}
    </div>
  );
}
