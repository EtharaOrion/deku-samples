import { useEffect, useState } from 'preact/hooks';
import { api, login, storedSession, clearSession } from '../api.js';
import { Link, navigate, useMetadata } from '../router.jsx';
import {
  Reveal, StateWord, ContentFigure, CarbonFigure, CapacityFigure, EnergyPanel,
  Refusal, Loading, Empty, Mark, formatBp, formatG, claimTypeWords
} from '../components/primitives.jsx';

export function useFetch(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e.body }));
    return () => { live = false; };
  }, [...deps, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/* ----------------------------------------------------------------- login */

export function Login() {
  useMetadata({ title: 'Sign in', description: 'Sign in to the Ravel console.' });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true); setRefusal(null);
    try {
      await login(form.get('email'), form.get('password'));
      const next = new URLSearchParams(location.search).get('next') || '/console';
      navigate(next, { replace: true });
    } catch (err) {
      setRefusal(err.body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="page login-route">
      <div class="sheet login-sheet stack">
        <span class="t-eyebrow">Ravel console</span>
        <h1 class="t-h4">Sign in</h1>
        <p class="t-small t-muted">
          Signup is closed and there is no password reset. Accounts are granted by
          arrangement, and every grant carries an end date.
        </p>
        <form class="stack" onSubmit={submit}>
          <label>
            <span class="t-label">Email address</span>
            <input name="email" type="email" required autocomplete="username" autofocus />
          </label>
          <label>
            <span class="t-label">Password</span>
            <input name="password" type="password" required autocomplete="current-password" />
          </label>
          <button type="submit" class="button-primary" disabled={busy}>
            {busy ? 'Checking your credentials' : 'Sign in'}
          </button>
        </form>
        <Refusal refusal={refusal} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the board */

const STAGES = [
  { key: 'dissolution', name: 'Dissolution' },
  { key: 'depolymerisation', name: 'Depolymerisation' },
  { key: 'purification', name: 'Purification' },
  { key: 'repolymerisation', name: 'Repolymerisation' }
];

export function Board() {
  useMetadata({ title: 'Run board', description: 'One column per process stage, one card per run.' });
  const runs = useFetch('/runs');

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Operational record</span>
        <h1 class="t-h4">Run board</h1>
        <p class="t-small t-muted">
          One column per process stage and one card per run. This product records what a run
          did, after the run. It reads no sensor, holds no set point and raises no alarm.
        </p>
      </header>

      {runs.loading && <Loading what="the run board" />}
      {runs.error && <Refusal refusal={runs.error} />}
      {runs.data && runs.data.length === 0 && <Empty>No run has been opened yet.</Empty>}

      {runs.data && runs.data.length > 0 && (
        <div class="board">
          {STAGES.map((stage) => {
            const inStage = runs.data.filter((r) => r.run_type === stage.key);
            return (
              <section key={stage.key} class="board-column" aria-labelledby={`col-${stage.key}`}>
                <h2 id={`col-${stage.key}`} class="t-label board-column-head">
                  {stage.name} <span class="t-mono">({inStage.length})</span>
                </h2>
                {inStage.length === 0 ? (
                  <p class="t-small t-muted">No run at this stage.</p>
                ) : inStage.map((r) => (
                  <article key={r.reference} class="card run-card">
                    {/* The column a card sits in is named in text on the card
                        rather than implied by position alone. */}
                    <p class="t-label run-stage">{stage.name}</p>
                    <h3 class="t-h4 run-ref">
                      <Link href={`/console/runs/${r.reference}`} class="t-mono">{r.reference}</Link>
                    </h3>
                    <dl class="kv">
                      <div><dt>State</dt><dd>{r.state}</dd></div>
                      <div><dt>Recipe</dt><dd class="t-mono">{r.recipe_version}</dd></div>
                      <div><dt>Mass in</dt><dd class="t-mono">{formatG(r.mass_in_g)} g</dd></div>
                      <div><dt>Mass out</dt><dd class="t-mono">{formatG(r.mass_out_g)} g</dd></div>
                      <div><dt>Losses</dt><dd class="t-mono">{formatG(r.losses_g)} g</dd></div>
                    </dl>
                    {!r.within_tolerance && (
                      <StateWord word="outside recipe tolerance"
                        detail={r.excursions.map((e) => `${e.parameter} at ${e.actual}`).join(', ')} />
                    )}
                    {r.flags.map((f) => (
                      <StateWord key={f} word={flagWords(f)} />
                    ))}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function flagWords(flag) {
  if (flag.startsWith('custody_link_missing:')) {
    return `custody link missing: ${flag.split(':')[1]}`;
  }
  return {
    lapsed_calibration: 'lapsed calibration',
    non_claimable: 'non-claimable',
    unreviewed_override: 'unreviewed override',
    open_deviation: 'open deviation',
    custody_completed_late: 'custody completed late'
  }[flag] || flag.replace(/_/g, ' ');
}

/* ---------------------------------------------------------------- intake */

export function Intake() {
  useMetadata({ title: 'Feedstock intake', description: 'The batch register, with each batch resolving its claimability against the approval in force on its receipt date.' });
  const batches = useFetch('/batches');

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Operational record</span>
        <h1 class="t-h4">Feedstock intake</h1>
        <p class="t-small t-muted">
          A batch resolves its claimability against the collector approval in force on its
          receipt date, never a current flag. Every figure is computed on dry mass.
        </p>
      </header>

      {batches.loading && <Loading what="the batch register" />}
      {batches.error && <Refusal refusal={batches.error} />}
      {batches.data && batches.data.length === 0 && (
        <Empty>No batch has been booked in yet.</Empty>
      )}

      {batches.data && batches.data.length > 0 && (
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">Batch register</caption>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Collector</th>
                <th scope="col">Category</th>
                <th scope="col" class="num">Net</th>
                <th scope="col" class="num">Moisture</th>
                <th scope="col" class="num">Dry mass</th>
                <th scope="col">Received</th>
                <th scope="col">Claimable</th>
              </tr>
            </thead>
            <tbody>
              {batches.data.map((b) => (
                <tr key={b.reference}>
                  <td>
                    <Link href={`/console/batches/${b.reference}`} class="t-mono">{b.reference}</Link>
                  </td>
                  <td>
                    {/* The name the collector held on this batch's own receipt date. */}
                    {b.collector_name}
                    <span class="t-small t-muted block">as at {b.received_on}</span>
                  </td>
                  <td>{b.category.replace(/_/g, '-')}</td>
                  <td class="num">{formatG(b.net_g)} g</td>
                  <td class="num">{b.moisture_bp} bp</td>
                  <td class="num">{formatG(b.dry_mass_g)} g</td>
                  <td class="t-mono">{b.received_on}</td>
                  <td>
                    {b.claimable
                      ? <span>yes</span>
                      : (
                        <StateWord word="non-claimable"
                          detail={b.claimable_reason === 'custody_link_missing'
                            ? `custody link missing: ${b.claimable_missing_link}`
                            : `collector approval lapsed on ${b.approval_valid_to || 'an earlier date'}`} />
                      )}
                    {b.flags.includes('lapsed_calibration') && (
                      <StateWord word="lapsed calibration"
                        detail={`device calibrated ${b.device_calibrated_on}`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function BatchDetail({ reference }) {
  useMetadata({ title: `Batch ${reference}`, description: 'One batch, with its custody chain and everything derived from it.' });
  const batch = useFetch(`/batches/${reference}`, [reference]);
  const impact = useFetch(`/batches/${reference}/impact`, [reference]);

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Batch</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>

      {batch.loading && <Loading what="this batch" />}
      {batch.error && <Refusal refusal={batch.error} />}

      {batch.data && (
        <>
          <section class="sheet stack">
            <h2 class="t-h4">What arrived</h2>
            <dl class="kv kv-wide">
              <div><dt>Collector</dt><dd>{batch.data.collector_name} <span class="t-mono t-small">({batch.data.collector})</span></dd></div>
              <div><dt>Site</dt><dd class="t-mono">{batch.data.site}</dd></div>
              <div><dt>Category</dt><dd>{batch.data.category.replace(/_/g, '-')}</dd></div>
              <div><dt>Received on</dt><dd class="t-mono">{batch.data.received_on}</dd></div>
              <div><dt>Gross</dt><dd class="t-mono">{formatG(batch.data.gross_g)} g</dd></div>
              <div><dt>Tare</dt><dd class="t-mono">{formatG(batch.data.tare_g)} g</dd></div>
              <div><dt>Net</dt><dd class="t-mono">{formatG(batch.data.net_g)} g</dd></div>
              <div><dt>Moisture</dt><dd class="t-mono">{batch.data.moisture_bp} bp, by {batch.data.moisture_method}</dd></div>
              <div><dt>Dry mass</dt><dd class="t-mono">{formatG(batch.data.dry_mass_g)} g</dd></div>
              <div><dt>Weighed on</dt><dd class="t-mono">{batch.data.device}</dd></div>
              <div><dt>Accepted</dt><dd class="t-mono">{formatG(batch.data.accepted_g)} g</dd></div>
              <div><dt>Rejected</dt><dd class="t-mono">{formatG(batch.data.rejected_g)} g</dd></div>
              {batch.data.rejected_destination && (
                <div><dt>Rejected mass went to</dt><dd>{batch.data.rejected_destination}</dd></div>
              )}
            </dl>
            <p class="t-small t-muted derivation">
              Dry mass: {batch.data.derivation.dry_mass_g}.
            </p>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Claimability</h2>
            {batch.data.claimable ? (
              <p>This batch is claimable input.</p>
            ) : (
              <div class="stack-tight">
                <StateWord word="non-claimable" />
                <p class="statement">
                  {batch.data.claimable_reason === 'custody_link_missing'
                    ? `This batch cannot be claimed: ${batch.data.claimable_missing_link} custody link missing.`
                    : `This collector's approval lapsed on ${batch.data.approval_valid_to}. Material received after that date is processed but not claimed.`}
                </p>
              </div>
            )}
            {batch.data.claimable_from && (
              <p class="t-small">
                Late evidence arrived, so this batch is claimable from{' '}
                <span class="t-mono">{batch.data.claimable_from}</span> rather than from its
                receipt date.
              </p>
            )}
            <p class="t-small t-muted derivation">{batch.data.derivation.claimable}</p>
            {batch.data.flags.includes('lapsed_calibration') && (
              <StateWord word="lapsed calibration"
                detail={`${batch.data.device} was calibrated on ${batch.data.device_calibrated_on}, more than twelve months before this receipt. This flag is repeated on every lot this batch reaches.`} />
            )}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Custody</h2>
            <ol class="custody-chain">
              {['collection_site', 'collector', 'transport', 'arrival', 'weighing', 'acceptance'].map((kind) => {
                const link = batch.data.custody.find((l) => l.kind === kind);
                return (
                  <li key={kind} class="custody-link">
                    <span class="t-label">{kind.replace(/_/g, ' ')}</span>
                    {link ? (
                      <span>
                        {link.party} <span class="t-mono t-small">{link.date}</span>
                        {link.arrived_on && (
                          <span class="t-small t-muted"> — evidence arrived {link.arrived_on}</span>
                        )}
                      </span>
                    ) : (
                      <StateWord word="missing" />
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Composition and contamination</h2>
            <dl class="kv kv-wide">
              <div><dt>Polymer</dt><dd>{batch.data.composition.polymer}</dd></div>
              <div><dt>Declared fraction</dt><dd class="t-mono">{batch.data.composition.fraction_bp} bp</dd></div>
              <div><dt>Basis</dt><dd>{batch.data.composition.basis}</dd></div>
              {batch.data.composition.measured_fraction_bp != null && (
                <div>
                  <dt>Measured fraction</dt>
                  <dd class="t-mono">{batch.data.composition.measured_fraction_bp} bp</dd>
                </div>
              )}
              {Object.entries(batch.data.contamination).map(([k, v]) => (
                <div key={k}>
                  <dt>{k.replace(/_/g, ' ')}</dt>
                  <dd class={typeof v === 'number' ? 't-mono' : ''}>{typeof v === 'number' ? `${v} bp` : v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">
              <Mark kind="traversal" label="What this batch reached" />
            </h2>
            {impact.loading && <Loading what="the traversal" />}
            {impact.data && (
              <>
                <p class="t-small t-muted">
                  The complete set: every lot containing any of this batch, every certificate
                  resting on those lots, and every recipient. It is never paginated.
                </p>
                {impact.data.lots.length === 0
                  ? <Empty>This batch has not yet been consumed by any run.</Empty>
                  : (
                    <ul class="traversal-list">
                      {impact.data.lots.map((l) => (
                        <li key={l.reference}>
                          <Link href={`/console/lots/${l.reference}`} class="t-mono">{l.reference}</Link>
                          {' '}<span class="t-small t-muted">{formatG(l.mass_g)} g, {l.disposition}</span>
                          <ul>
                            {impact.data.certificates
                              .filter((c) => true)
                              .map((c) => (
                                <li key={c.number}>
                                  <Link href={`/console/certificates/${c.number}`} class="t-mono">{c.number}</Link>
                                  {' '}<span class="t-small">{c.recipient_name}</span>
                                  {c.state === 'withdrawn' && <StateWord word="withdrawn" />}
                                </li>
                              ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                <p class="t-small t-muted">
                  Recipients: {impact.data.recipients.length
                    ? impact.data.recipients.map((r) => r.name).join(', ')
                    : 'none yet'}.
                </p>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------- lots and yields */

export function Lots() {
  useMetadata({ title: 'Lots', description: 'The lot register, each lot with its claim type beside its percentage.' });
  const lots = useFetch('/lots');
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Operational record</span>
        <h1 class="t-h4">Lots</h1>
      </header>
      {lots.loading && <Loading what="the lot register" />}
      {lots.data && lots.data.length === 0 && <Empty>No lot has been produced yet.</Empty>}
      {lots.data && lots.data.length > 0 && (
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">Lot register</caption>
            <thead>
              <tr>
                <th scope="col">Lot</th><th scope="col">Site</th>
                <th scope="col" class="num">Mass</th><th scope="col">Disposition</th>
                <th scope="col">Recycled content</th><th scope="col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {lots.data.map((l) => (
                <tr key={l.reference}>
                  <td><Link href={`/console/lots/${l.reference}`} class="t-mono">{l.reference}</Link></td>
                  <td class="t-mono">{l.site}</td>
                  <td class="num">{formatG(l.mass_g)} g</td>
                  <td>{l.disposition}</td>
                  <td>
                    {/* The percentage never renders without its claim type. */}
                    <ContentFigure contentBp={l.content_bp} claimType={l.claim_type} compact />
                  </td>
                  <td>
                    {l.flags.map((f) => <StateWord key={f} word={flagWords(f)} />)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LotDetail({ reference }) {
  useMetadata({ title: `Lot ${reference}`, description: 'One lot, with its claim, its carbon figure, its overrides and its deviations.' });
  const lot = useFetch(`/lots/${reference}`, [reference]);
  const [carbon, setCarbon] = useState({ loading: true, data: null, error: null });
  const session = storedSession();
  const canSeeYield = (session?.roles || []).some((r) =>
    ['plant_operator', 'quality_manager', 'claims_manager', 'auditor'].includes(r));
  const [yieldData, setYieldData] = useState(null);

  useEffect(() => {
    let live = true;
    api(`/lots/${reference}/carbon`)
      .then((d) => live && setCarbon({ loading: false, data: d, error: null }))
      .catch((e) => live && setCarbon({ loading: false, data: null, error: e.body }));
    if (canSeeYield) api(`/lots/${reference}/yield`).then((d) => live && setYieldData(d)).catch(() => {});
    return () => { live = false; };
  }, [reference]);

  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">Lot</span>
        <h1 class="t-h4 t-mono">{reference}</h1>
      </header>

      {lot.loading && <Loading what="this lot" />}
      {lot.error && <Refusal refusal={lot.error} />}

      {lot.data && (
        <>
          <section class="sheet stack">
            <h2 class="t-h4">Claim</h2>
            <ContentFigure contentBp={lot.data.content_bp} claimType={lot.data.claim_type} />
            <dl class="kv kv-wide">
              <div><dt>Mass</dt><dd class="t-mono">{formatG(lot.data.mass_g)} g</dd></div>
              <div><dt>Credit attached</dt><dd class="t-mono">{formatG(lot.data.credit_attached_g)} g</dd></div>
              <div><dt>Post-consumer</dt><dd class="t-mono">{formatG(lot.data.category_split.post_consumer)} g</dd></div>
              <div><dt>Pre-consumer</dt><dd class="t-mono">{formatG(lot.data.category_split.pre_consumer)} g</dd></div>
              <div><dt>Disposition</dt><dd>{lot.data.disposition}</dd></div>
              <div><dt>Balance period</dt><dd>
                <Link href={`/console/balance/${lot.data.balance_period}`} class="t-mono">
                  {lot.data.balance_period}
                </Link>
              </dd></div>
            </dl>
            <p class="t-small t-muted derivation">{lot.data.derivation.content_bp}</p>
            <p class="statement t-small">
              This material is claimed by mass balance. It is not physically segregated.
            </p>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Carbon</h2>
            {carbon.loading && <Loading what="the carbon figure" />}
            {carbon.error && <Refusal refusal={carbon.error} />}
            {carbon.data && (
              <>
                <CarbonFigure carbon={carbon.data} />
                <h3 class="t-h4 breakdown-head">Breakdown</h3>
                {/* The internal view returns the breakdown always: a response
                    carrying the aggregate with no breakdown behind it does not
                    exist inside the console. */}
                <div class="table-scroll">
                  <table>
                    <caption class="visually-hidden">Carbon breakdown by line</caption>
                    <thead>
                      <tr><th scope="col">Line</th><th scope="col" class="num">mg CO2e/kg</th><th scope="col">Tag</th></tr>
                    </thead>
                    <tbody>
                      {carbon.data.breakdown.map((b) => (
                        <tr key={b.line}>
                          <td>{b.line.replace(/_/g, ' ')}</td>
                          <td class="num">{b.mg_per_kg.toLocaleString('en-GB')}</td>
                          <td>{b.tag.replace(/_/g, ' ')}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Total</strong></td>
                        <td class="num"><strong>{carbon.data.value_mg_per_kg.toLocaleString('en-GB')}</strong></td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <h3 class="t-h4 breakdown-head">Energy</h3>
                <EnergyPanel energy={carbon.data.energy} />
              </>
            )}
          </section>

          {lot.data.overrides.length > 0 && (
            <section class="sheet stack">
              <h2 class="t-h4">Overrides</h2>
              {lot.data.overrides.map((o) => (
                <div key={o.reference} class="override-entry stack-tight">
                  {!o.reviewed && <StateWord word="unreviewed override" />}
                  <p class="t-mono t-small">{o.reference} — {o.separation.replace(/_/g, ' ')}</p>
                  <p class="statement">
                    Separation overridden by {o.authorised_by} on {o.effective_on}.
                    This cannot be removed.
                  </p>
                  <p class="t-small t-muted">Reason given: {o.reason}</p>
                  <Link href={`/console/overrides/${o.reference}`} class="button">
                    Open this override
                  </Link>
                </div>
              ))}
            </section>
          )}

          {lot.data.deviations.length > 0 && (
            <section class="sheet stack">
              <h2 class="t-h4">Deviations</h2>
              {lot.data.deviations.map((d) => (
                <div key={d.reference} class="stack-tight">
                  {d.state === 'open' && <StateWord word="open deviation" />}
                  <p><span class="t-mono">{d.reference}</span> — {d.title}</p>
                  {d.outcome && <p class="t-small t-muted">Outcome: {d.outcome.replace(/_/g, ' ')}</p>}
                </div>
              ))}
            </section>
          )}

          <section class="sheet stack">
            <h2 class="t-h4">Test results</h2>
            {lot.data.test_results.length === 0
              ? <Empty>No test result is recorded against this lot.</Empty>
              : (
                <div class="table-scroll">
                  <table>
                    <caption class="visually-hidden">Test results on this lot</caption>
                    <thead>
                      <tr><th scope="col">Property</th><th scope="col">Method</th>
                        <th scope="col" class="num">Value</th><th scope="col">Entered by</th>
                        <th scope="col">Usable for release</th></tr>
                    </thead>
                    <tbody>
                      {lot.data.test_results.map((t) => (
                        <tr key={t.reference}>
                          <td>{t.property.replace(/_/g, ' ')}</td>
                          <td class="t-mono">{t.method}</td>
                          <td class="num">{t.value} {t.unit}</td>
                          <td class="t-small">{t.entered_by}</td>
                          <td>
                            {t.usable_for_release ? 'yes'
                              : <StateWord word="method mismatch" detail="kept as evidence, never reaches a disposition" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </section>

          <p>
            <Link href={`/console/lots/${reference}/genealogy`} class="button">
              <Mark kind="traversal" label="Open the genealogy" />
            </Link>
          </p>

          {yieldData && (
            <section class="sheet stack">
              <h2 class="t-h4">Yield</h2>
              <p class="t-small t-muted">
                Losses reduce the claim. This figure appears on no certificate, in no
                certificate document and in no verification answer.
              </p>
              <div class="table-scroll">
                <table>
                  <caption class="visually-hidden">Yield by stage</caption>
                  <thead>
                    <tr><th scope="col">Run</th><th scope="col">Stage</th>
                      <th scope="col" class="num">In</th><th scope="col" class="num">Out</th>
                      <th scope="col" class="num">Losses</th><th scope="col" class="num">Yield</th></tr>
                  </thead>
                  <tbody>
                    {yieldData.stages.map((s) => (
                      <tr key={s.run}>
                        <td class="t-mono">{s.run}</td>
                        <td>{s.run_type}</td>
                        <td class="num">{formatG(s.mass_in_g)} g</td>
                        <td class="num">{formatG(s.mass_out_g)} g</td>
                        <td class="num">{formatG(s.losses_g)} g</td>
                        <td class="num">{formatBp(s.yield_bp)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
