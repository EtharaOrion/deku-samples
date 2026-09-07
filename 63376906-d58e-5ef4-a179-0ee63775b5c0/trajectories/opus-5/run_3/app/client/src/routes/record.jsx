import { useEffect, useState } from 'preact/hooks';
import { api, storedSession } from '../api.js';
import { Link, useMetadata } from '../router.jsx';
import { useFetch, flagWords } from './console.jsx';
import {
  StateWord, Refusal, Loading, Empty, Mark, formatG, formatBp, ContentFigure, EnergyPanel
} from '../components/primitives.jsx';

/* ------------------------------------------------------------ the record */

const QUERIES = [
  ['lots_from_batch', 'Which lots came from a batch'],
  ['certificates_on_period', 'Which certificates rest on a period'],
  ['certificates_under_method_version', 'Which certificates use a method version'],
  ['lots_released_under_unreviewed_override', 'Which lots were released under an unreviewed override'],
  ['allocations_in_final_fortnight', 'Which allocations landed in a period’s final fortnight'],
  ['refused_allocations', 'Which allocations were refused, and by what margin'],
  ['collector_declaration_departures', 'Where a collector’s declaration departed from the sample'],
  ['acts_by_person', 'What one person did'],
  ['exports_by_auditor', 'What an auditor exported, including the reads that returned nothing']
];

export function RecordView() {
  useMetadata({
    title: 'The record',
    description: 'Every act is an entry with the person, the moment, the site and the object, in an append-only chain.'
  });
  const [tab, setTab] = useState('entries');
  const entries = useFetch('/record');
  const check = useFetch('/record/check');
  const [query, setQuery] = useState('refused_allocations');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'queries') return;
    setQueryLoading(true);
    api(`/record/queries/${query}`)
      .then(setQueryResult).catch(() => setQueryResult(null))
      .finally(() => setQueryLoading(false));
  }, [query, tab]);

  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">The record</span>
        <h1 class="t-h4">Every act, in sequence</h1>
        <p class="t-small t-muted">
          No entry is edited and no entry is removed. A correction is a new entry naming what it
          corrects, and a refusal is recorded as well as a success.
        </p>
      </header>

      {check.data && (
        <section class="sheet stack chain-check">
          <h2 class="t-h4">The chain</h2>
          <dl class="kv kv-wide">
            <div>
              <dt>Verifies</dt>
              <dd>
                {check.data.holds
                  ? <span>the chain holds across {check.data.entries} entries</span>
                  : <StateWord word="does not verify" />}
              </dd>
            </div>
            <div><dt>Entries</dt><dd class="t-mono">{check.data.entries}</dd></div>
            <div><dt>Head digest</dt><dd class="t-mono">{check.data.head_digest?.slice(0, 24)}…</dd></div>
          </dl>
          {check.data.first_failure && (
            <p class="statement">
              First failure at sequence {check.data.first_failure.seq}:{' '}
              {check.data.first_failure.reason}.
            </p>
          )}
          {check.data.sequence_gap && (
            <p class="statement">
              A gap in the sequence: expected {check.data.sequence_gap.expected_seq}, found{' '}
              {check.data.sequence_gap.found_seq}.
            </p>
          )}
        </section>
      )}

      <div class="tab-row" role="tablist" aria-label="Record views">
        <button type="button" role="tab" aria-selected={tab === 'entries'}
          class={tab === 'entries' ? 'button-primary' : ''} onClick={() => setTab('entries')}>
          Entries
        </button>
        <button type="button" role="tab" aria-selected={tab === 'queries'}
          class={tab === 'queries' ? 'button-primary' : ''} onClick={() => setTab('queries')}>
          The nine questions
        </button>
      </div>

      {tab === 'entries' && (
        <>
          {entries.loading && <Loading what="the record" />}
          {entries.data?.length === 0 && <Empty>The record holds no entry yet.</Empty>}
          {entries.data && entries.data.length > 0 && (
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Record entries with their digests</caption>
                <thead>
                  <tr>
                    <th scope="col" class="num">Seq</th><th scope="col">Act</th>
                    <th scope="col">Person</th><th scope="col">Object</th>
                    <th scope="col">Outcome</th><th scope="col">Moment</th>
                    <th scope="col">Digest</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.data.map((e) => (
                    <tr key={e.seq}>
                      <td class="num">{e.seq}</td>
                      <td>{e.act.replace(/_/g, ' ')}</td>
                      <td class="t-small">{e.person || '—'}</td>
                      <td class="t-mono t-small">{e.object_ref || '—'}</td>
                      <td>
                        {e.outcome === 'refused' ? <StateWord word="refused" /> : 'success'}
                      </td>
                      <td class="t-mono t-small">{String(e.event_at).slice(0, 19).replace('T', ' ')}</td>
                      <td class="t-mono t-small">
                        {e.digest.slice(0, 12)}…
                        {e.content_deleted && (
                          <StateWord word="content deleted under retention"
                            detail={`on ${e.content_deleted_on}, position and digest unchanged`} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'queries' && (
        <section class="sheet stack">
          <h2 class="t-h4">The nine questions the record exists to answer</h2>
          <label>
            <span class="t-label">Question</span>
            <select value={query} onChange={(e) => setQuery(e.currentTarget.value)}>
              {QUERIES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {queryLoading && <Loading what="the answer" />}
          {queryResult && (
            <>
              <p class="t-small t-muted">
                A complete set rather than a report somebody assembles. This answer refuses a
                page, a limit, an offset and a cursor, because a caller handed a page resolves a
                page and believes the work is finished.
              </p>
              <QueryAnswer name={query} data={queryResult} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function QueryAnswer({ name, data }) {
  const rows = data.refusals || data.lots || data.certificates || data.allocations
    || data.departures || data.acts || data.exports || [];
  if (!rows.length) {
    return <Empty>This answer is empty. Nothing in the record matches this question.</Empty>;
  }
  const columns = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
  return (
    <div class="table-scroll">
      <table>
        <caption class="visually-hidden">{name.replace(/_/g, ' ')}</caption>
        <thead>
          <tr>{columns.map((c) => (
            <th key={c} scope="col" class={typeof rows[0][c] === 'number' ? 'num' : ''}>
              {c.replace(/_/g, ' ')}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} class={typeof r[c] === 'number' ? 'num t-mono' : ''}>
                  {r[c] === null || r[c] === undefined ? '—' : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------- reconciliation */

/** Six figures, refreshed on a schedule, with the mass balance residual as the
 *  headline. It is a screen of numbers expected to be non-zero, and it shows
 *  this period against the last three rather than a status. None is a badge and
 *  none is styled as passing. */
export function Reconciliation() {
  useMetadata({
    title: 'Reconciliation',
    description: 'Six figures rather than six verdicts, with the mass balance residual as the headline.'
  });
  const [data, setData] = useState(null);
  const [at, setAt] = useState(null);

  useEffect(() => {
    let live = true;
    const load = () => api('/reconciliation').then((d) => {
      if (!live) return;
      setData(d); setAt(new Date().toLocaleTimeString('en-GB'));
    }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Reconciliation</span>
        <h1 class="t-h4">Six figures</h1>
        <p class="t-small t-muted">
          These are figures, not verdicts. The mass balance residual is expected to be non-zero.
          Refreshed every thirty seconds{at ? `; last read at ${at}` : ''}.
        </p>
      </header>

      {!data && <Loading what="the reconciliation figures" />}

      {data && (
        <>
          <section class="sheet headline-figure">
            <h2 class="t-label">Mass balance residual</h2>
            <p class="t-figure headline-value">{formatG(data.mass_balance_residual_g)} g</p>
            <p class="t-small t-muted">
              Mass in minus mass out minus recorded losses, across every closed run.
            </p>
          </section>

          <section class="recon-grid">
            {[
              ['Credit margin', `${formatG(data.credit_margin_g)} g`, 'What the ledger still holds across every open period.'],
              ['Consumptions on open runs', data.consumptions_on_open_runs, 'Inputs recorded against a run nobody has closed.'],
              ['Batches with broken custody', data.batches_with_broken_custody, 'A missing link makes a batch non-claimable.'],
              ['Certificates with superseded figures', data.certificates_with_superseded_figures, 'A figure was recomputed after the certificate was issued.']
            ].map(([label, value, note]) => (
              <article key={label} class="sheet stack-tight">
                <h2 class="t-label">{label}</h2>
                <p class="t-figure">{value}</p>
                <p class="t-small t-muted">{note}</p>
              </article>
            ))}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Integration ages</h2>
            <p class="t-small t-muted">
              A source that stops sending is detected by the age of its most recent record
              rather than by an error. A source that has never sent reads no record at all.
            </p>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Age of the most recent record from each inbound source</caption>
                <thead>
                  <tr><th scope="col">Source</th><th scope="col" class="num">Age, in hours</th>
                    <th scope="col">Last received</th></tr>
                </thead>
                <tbody>
                  {data.integration_ages.map((a) => (
                    <tr key={a.source}>
                      <td>{a.source.replace(/_/g, ' ')}</td>
                      <td class="num">
                        {a.age_hours === null
                          ? <StateWord word="never sent" />
                          : a.age_hours.toLocaleString('en-GB')}
                      </td>
                      <td class="t-mono t-small">
                        {a.last_received_at ? String(a.last_received_at).slice(0, 19).replace('T', ' ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">This period against the last three</h2>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Credit margin by period</caption>
                <thead>
                  <tr><th scope="col">Period</th><th scope="col">Dates</th>
                    <th scope="col">State</th><th scope="col" class="num">Credit margin</th></tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.balance_period}>
                      <td><Link href={`/console/balance/${h.balance_period}`} class="t-mono">{h.balance_period}</Link></td>
                      <td class="t-mono t-small">{h.period_from} → {h.period_to}</td>
                      <td>{h.state === 'closed' ? <Mark kind="lock" label="closed" /> : 'open'}</td>
                      <td class="num">{formatG(h.credit_margin_g)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p class="t-small t-muted">
            This read saw one consistent state at{' '}
            <span class="t-mono">{String(data.read_at).slice(0, 19).replace('T', ' ')}</span>.
          </p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------- small surfaces */

export function OverrideDetail({ reference }) {
  useMetadata({ title: `Override ${reference}`, description: 'One override, permanent, and its review.' });
  const o = useFetch(`/overrides/${reference}`, [reference]);
  const [refusal, setRefusal] = useState(null);
  const [busy, setBusy] = useState(false);
  const session = storedSession();
  const canReview = (session?.roles || []).some((r) => ['quality_manager', 'claims_manager'].includes(r));

  async function review() {
    setBusy(true); setRefusal(null);
    try {
      await api(`/overrides/${reference}/review`, { method: 'POST', body: {} });
      o.reload();
    } catch (e) { setRefusal(e.body); } finally { setBusy(false); }
  }

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Override</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>
      {o.loading && <Loading what="this override" />}
      {o.error && <Refusal refusal={o.error} />}
      {o.data && (
        <section class="sheet stack">
          {!o.data.reviewed && <StateWord word="unreviewed override" />}
          <p class="statement">
            Separation overridden by {o.data.authorised_by} on {o.data.effective_on}.
            This cannot be removed.
          </p>
          <dl class="kv kv-wide">
            <div><dt>Separation broken</dt><dd>{o.data.separation.replace(/_/g, ' ')}</dd></div>
            <div><dt>Lot</dt><dd><Link href={`/console/lots/${o.data.lot}`} class="t-mono">{o.data.lot}</Link></dd></div>
            <div><dt>Authorised by</dt><dd>{o.data.authorised_by}</dd></div>
            <div><dt>Reviewed</dt><dd>{o.data.reviewed ? `yes, by ${o.data.reviewed_by}` : 'no'}</dd></div>
          </dl>
          <p class="t-label">The reason given</p>
          <p>{o.data.reason}</p>
          <p class="t-small t-muted">
            An override is permanent, shows on the lot for its life, is counted on the balance
            screen, and blocks signing until a second person reviews it. A review sets it
            reviewed and removes nothing.
          </p>
          {canReview && !o.data.reviewed && (
            <button type="button" class="button-primary" onClick={review} disabled={busy}>
              {busy ? 'Recording the review' : 'Review this override'}
            </button>
          )}
          <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />
        </section>
      )}
    </div>
  );
}

export function RunDetail({ reference }) {
  useMetadata({ title: `Run ${reference}`, description: 'One run, its recipe version, its actual set points and its losses.' });
  const r = useFetch(`/runs/${reference}`, [reference]);
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Run</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>
      {r.loading && <Loading what="this run" />}
      {r.error && <Refusal refusal={r.error} />}
      {r.data && (
        <>
          <section class="sheet stack">
            <h2 class="t-h4">The run</h2>
            <dl class="kv kv-wide">
              <div><dt>Stage</dt><dd>{r.data.run_type}</dd></div>
              <div><dt>Site</dt><dd class="t-mono">{r.data.site}</dd></div>
              <div><dt>Equipment</dt><dd class="t-mono">{r.data.equipment}</dd></div>
              <div><dt>Recipe version</dt><dd class="t-mono">{r.data.recipe_version}</dd></div>
              <div><dt>Operator</dt><dd>{r.data.operator}</dd></div>
              <div><dt>State</dt><dd>{r.data.state === 'closed' ? <Mark kind="lock" label="closed" /> : r.data.state}</dd></div>
              <div><dt>Mass in</dt><dd class="t-mono">{formatG(r.data.mass_in_g)} g</dd></div>
              <div><dt>Mass out</dt><dd class="t-mono">{formatG(r.data.mass_out_g)} g</dd></div>
              <div><dt>Losses</dt><dd class="t-mono">{formatG(r.data.losses_g)} g</dd></div>
            </dl>
            <p class="t-small t-muted derivation">{r.data.derivation.losses_g}</p>
            {r.data.flags.map((f) => <StateWord key={f} word={flagWords(f)} />)}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">The recipe it followed, and what it achieved</h2>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Set points against tolerances</caption>
                <thead>
                  <tr><th scope="col">Parameter</th><th scope="col" class="num">Set point</th>
                    <th scope="col" class="num">Achieved</th><th scope="col">Tolerance</th></tr>
                </thead>
                <tbody>
                  {Object.entries(r.data.recipe?.set_points || {}).map(([k, v]) => {
                    const tol = r.data.recipe.tolerances[k];
                    const actual = r.data.actual_set_points[k];
                    return (
                      <tr key={k}>
                        <td>{k.replace(/_/g, ' ')}</td>
                        <td class="num">{v}</td>
                        <td class="num">{actual ?? '—'}</td>
                        <td class="t-mono">{tol ? `${tol[0]} to ${tol[1]}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {r.data.within_tolerance
              ? <p class="t-small">This run was inside its recipe tolerance.</p>
              : (
                <>
                  <StateWord word="outside recipe tolerance" />
                  <p class="t-small t-muted">
                    A run outside its recipe tolerance raises a deviation whether or not its
                    output passed its tests.
                  </p>
                </>
              )}
            {r.data.recipe && (
              <p class="t-small t-muted">
                {r.data.recipe.reference} was released by {r.data.recipe.released_by} on{' '}
                {r.data.recipe.released_on}, with a residence time of{' '}
                {r.data.recipe.residence_minutes} minutes.
              </p>
            )}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">What it consumed and what it produced</h2>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Consumptions and outputs</caption>
                <thead>
                  <tr><th scope="col">Reference</th><th scope="col">Direction</th>
                    <th scope="col">Kind</th><th scope="col" class="num">Mass</th></tr>
                </thead>
                <tbody>
                  {r.data.consumptions.map((cc) => (
                    <tr key={cc.reference}>
                      <td class="t-mono">{cc.input_ref}</td>
                      <td>consumed</td>
                      <td>{cc.input_kind}</td>
                      <td class="num">{formatG(cc.mass_g)} g</td>
                    </tr>
                  ))}
                  {r.data.outputs.map((o) => (
                    <tr key={o.reference}>
                      <td class="t-mono">{o.reference}</td>
                      <td>produced</td>
                      <td>{o.kind}{o.disposition ? `, ${o.disposition}` : ''}</td>
                      <td class="num">{formatG(o.mass_g)} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function DeviationDetail({ reference }) {
  useMetadata({ title: `Deviation ${reference}`, description: 'One deviation and the runs and lots it touches.' });
  const d = useFetch(`/deviations/${reference}`, [reference]);
  const [refusal, setRefusal] = useState(null);
  const [busy, setBusy] = useState(false);
  const session = storedSession();
  const canClose = (session?.roles || []).includes('quality_manager');

  async function close(outcome) {
    setBusy(true); setRefusal(null);
    try {
      await api(`/deviations/${reference}/close`, { method: 'POST', body: { outcome } });
      d.reload();
    } catch (e) { setRefusal(e.body); } finally { setBusy(false); }
  }

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Deviation</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>
      {d.loading && <Loading what="this deviation" />}
      {d.error && <Refusal refusal={d.error} />}
      {d.data && (
        <section class="sheet stack">
          {d.data.state === 'open' && <StateWord word="open deviation" />}
          <h2 class="t-h4">{d.data.title}</h2>
          <p>{d.data.detail}</p>
          <dl class="kv kv-wide">
            <div><dt>State</dt><dd>{d.data.state}</dd></div>
            <div><dt>Raised by</dt><dd>{d.data.raised_by}</dd></div>
            <div><dt>Runs touched</dt><dd class="t-mono">{(d.data.runs || []).join(', ') || '—'}</dd></div>
            <div><dt>Lots touched</dt><dd class="t-mono">{(d.data.lots || []).join(', ') || '—'}</dd></div>
            {d.data.outcome && (
              <div><dt>Outcome</dt><dd>{d.data.outcome.replace(/_/g, ' ')}</dd></div>
            )}
          </dl>
          <p class="t-small t-muted">
            A deviation travels with every lot it touches and appears on the internal view of
            any certificate issued against that lot.
          </p>
          {canClose && d.data.state === 'open' && (
            <>
              <p class="t-small">
                Both outcomes are honest and neither is hidden.
              </p>
              <div class="button-row">
                <button type="button" onClick={() => close('root_cause_found')} disabled={busy}>
                  Close: root cause found
                </button>
                <button type="button" onClick={() => close('cause_not_established')} disabled={busy}>
                  Close: cause not established
                </button>
              </div>
            </>
          )}
          <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />
        </section>
      )}
    </div>
  );
}

export function SiteDetail({ reference }) {
  useMetadata({ title: `Site ${reference}`, description: 'One site, its capacity and its certification periods.' });
  const cap = useFetch(`/sites/${reference}/capacity`, [reference]);
  const cert = useFetch(`/sites/${reference}/certification`, [reference]);
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Site</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>
      {cap.loading && <Loading what="this site" />}
      {cap.data && (
        <section class="sheet stack">
          <h2 class="t-h4">{cap.data.name}</h2>
          <dl class="kv kv-wide">
            <div><dt>Nameplate</dt><dd class="t-mono">{cap.data.nameplate_kg.toLocaleString('en-GB')} kg/year</dd></div>
            <div><dt>Contracted</dt><dd class="t-mono">{cap.data.contracted_kg.toLocaleString('en-GB')} kg/year</dd></div>
            <div><dt>Uncommitted</dt><dd class="t-mono">{cap.data.uncommitted_kg.toLocaleString('en-GB')} kg/year</dd></div>
            <div><dt>Confidence</dt><dd>
              {cap.data.confidence === 'planned'
                ? <StateWord word="planned" detail="not built" />
                : cap.data.confidence.replace(/_/g, ' ')}
            </dd></div>
            <div><dt>Basis</dt><dd class="t-small">{cap.data.basis}</dd></div>
            <div><dt>Last revised</dt><dd class="t-mono">{cap.data.last_revised}</dd></div>
          </dl>
          <p class="t-small t-muted derivation">{cap.data.derivation.uncommitted_kg}</p>
        </section>
      )}
      {cert.data && (
        <section class="sheet stack">
          <h2 class="t-h4">Certification, as a dated period</h2>
          <div class="table-scroll">
            <table>
              <caption class="visually-hidden">Certification periods for this site</caption>
              <thead>
                <tr><th scope="col">Reference</th><th scope="col">State</th>
                  <th scope="col">From</th><th scope="col">To</th><th scope="col">Reason</th></tr>
              </thead>
              <tbody>
                {cert.data.map((c) => (
                  <tr key={c.reference}>
                    <td class="t-mono">{c.reference}</td>
                    <td>{c.state === 'suspended' ? <StateWord word="suspended" /> : c.state}</td>
                    <td class="t-mono">{c.effective_from}</td>
                    <td class="t-mono">{c.effective_to || 'open'}</td>
                    <td class="t-small">{c.reason || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="t-small t-muted">
            An issuing condition resolves against the period in force on the date of signing
            rather than against a current flag.
          </p>
        </section>
      )}
    </div>
  );
}

export function Contracts() {
  useMetadata({ title: 'Contracts', description: 'Delivered, running content, the floor, and the average the remaining volume must reach.' });
  const contracts = useFetch('/contracts');
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Contracts</span>
        <h1 class="t-h4">The offtake floor</h1>
      </header>
      {contracts.loading && <Loading what="the contract projections" />}
      {contracts.data?.length === 0 && <Empty>No contract is recorded.</Empty>}
      {contracts.data && contracts.data.map((c) => (
        <section key={c.id} class="sheet stack">
          <h2 class="t-h4 t-mono">{c.id}</h2>
          {/* A contract whose supplying site carries confidence of planned
              answers planned_site_flag true, and the flag cannot be dismissed. */}
          {c.planned_site_flag && (
            <StateWord word="planned site"
              detail={`${c.site} is not built. This flag cannot be dismissed.`} />
          )}
          <dl class="kv kv-wide">
            <div><dt>Recipient</dt><dd class="t-mono">{c.recipient}</dd></div>
            <div><dt>Site</dt><dd class="t-mono">{c.site}</dd></div>
            <div><dt>Period</dt><dd>{c.period}</dd></div>
            <div><dt>Delivered</dt><dd class="t-mono">{c.delivered_kg.toLocaleString('en-GB')} kg</dd></div>
            <div><dt>Committed</dt><dd class="t-mono">{c.committed_kg.toLocaleString('en-GB')} kg</dd></div>
            <div><dt>Running content</dt><dd class="t-mono">{formatBp(c.running_content_bp)}%</dd></div>
            <div><dt>Floor</dt><dd class="t-mono">{formatBp(c.floor_bp)}%</dd></div>
            <div><dt>The remaining volume must average</dt>
              <dd class="t-mono">{c.required_remaining_bp === null ? '—' : `${formatBp(c.required_remaining_bp)}%`}</dd></div>
            <div><dt>State</dt><dd>
              {/* The unreachable state is a word and a date, not a colour. */}
              {c.state === 'unreachable'
                ? <StateWord word="unreachable" detail={`since ${c.unreachable_on}, by allocation ${c.unreachable_allocation}`} />
                : 'on track'}
            </dd></div>
          </dl>
          <p class="t-small t-muted">
            If we fall short: {c.shortfall_consequence}. Stated at signature rather than
            discovered at the year end.
          </p>
          {c.allocations.length > 0 && (
            <>
              <h3 class="t-h4">Allocations</h3>
              <ul class="named-list">
                {c.allocations.map((a) => (
                  <li key={a.reference}>
                    <span class="t-mono">{a.lot}</span> — {formatG(a.mass_g)} g, decided by{' '}
                    {a.decided_by}
                    {a.favoured_over?.length > 0 && (
                      <span class="t-small t-muted">
                        {' '}· favoured over {a.favoured_over.join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p class="t-small t-muted derivation">{c.derivation.required_remaining_bp}</p>
        </section>
      ))}
    </div>
  );
}

export function Collectors() {
  useMetadata({ title: 'Collectors', description: 'Collectors with their approval periods and their findings.' });
  const cs = useFetch('/collectors');
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Feedstock</span>
        <h1 class="t-h4">Collectors</h1>
      </header>
      {cs.loading && <Loading what="the collectors" />}
      {cs.data?.length === 0 && <Empty>No collector is recorded.</Empty>}
      {cs.data && cs.data.map((c) => (
        <section key={c.reference} class="sheet stack">
          <h2 class="t-h4">{c.name} <span class="t-mono t-small">{c.reference}</span></h2>
          <dl class="kv kv-wide">
            <div><dt>Country</dt><dd>{c.country}</dd></div>
            <div><dt>Registration</dt><dd class="t-mono">{c.registration}</dd></div>
            <div><dt>Registration expires</dt><dd class="t-mono">{c.registration_expiry}</dd></div>
            <div><dt>Scheme status</dt><dd>{c.scheme_status.replace(/_/g, ' ')}</dd></div>
            <div><dt>Streams declared</dt><dd class="t-small">{(c.declared_streams || []).join(', ')}</dd></div>
          </dl>

          <h3 class="t-h4">Approval periods</h3>
          <div class="table-scroll">
            <table>
              <caption class="visually-hidden">Approval periods for this collector</caption>
              <thead>
                <tr><th scope="col">Reference</th><th scope="col">State</th>
                  <th scope="col">From</th><th scope="col">To</th><th scope="col">Condition</th></tr>
              </thead>
              <tbody>
                {c.approval_periods.map((p) => (
                  <tr key={p.reference}>
                    <td class="t-mono">{p.reference}</td>
                    <td>
                      {p.state}
                      {p.expiring && <StateWord word="expiring" detail="inside fourteen days of its expiry" />}
                    </td>
                    <td class="t-mono">{p.valid_from}</td>
                    <td class="t-mono">{p.valid_to}</td>
                    <td class="t-small">
                      {p.condition
                        ? `${p.condition} — closes by ${p.condition_closes_on}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {c.findings.length > 0 && (
            <>
              <h3 class="t-h4">Findings</h3>
              {c.findings.map((f) => (
                <div key={f.reference} class="stack-tight">
                  {f.past_date && <StateWord word="past its date" />}
                  <p class="t-small">
                    <span class="t-mono">{f.reference}</span> — {f.detail}
                  </p>
                  <p class="t-small t-muted">
                    Raised {f.raised_on}, due {f.due_on || 'no date'}, {f.state}.
                  </p>
                </div>
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

export function Inbound() {
  useMetadata({ title: 'Inbound records', description: 'What has arrived from each source, kept verbatim.' });
  const inbound = useFetch('/inbound');
  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">Inbound</span>
        <h1 class="t-h4">What arrived, exactly as it arrived</h1>
        <p class="t-small t-muted">
          Four sources send records into this system and none of them is called out to. The app
          stores what arrives, reconciles it against what the operator recorded, and shows the
          disagreement rather than resolving it.
        </p>
      </header>
      {inbound.loading && <Loading what="the inbound records" />}
      {inbound.data?.length === 0 && <Empty>No inbound record has arrived yet.</Empty>}
      {inbound.data && inbound.data.map((r) => (
        <section key={r.reference} class="sheet stack">
          <h2 class="t-h4">
            {r.source.replace(/_/g, ' ')} <span class="t-mono t-small">{r.reference}</span>
          </h2>
          <p class="t-small t-muted">
            Received {String(r.received_at).slice(0, 19).replace('T', ' ')}
          </p>
          <p class="t-label">The bytes as they arrived</p>
          <pre class="verbatim">{r.payload_verbatim}</pre>
        </section>
      ))}
    </div>
  );
}
