import { useState, useEffect, useCallback } from 'preact/hooks';
import { api, login, logout, getToken, holdsRole, ApiError } from './api.js';
import { Link, navigate, useMeta } from './router.jsx';
import {
  State, Loading, Empty, Refusal, ErrorBanner, ContentFigure, CarbonFigure, CapacityFigure,
  TableScroll, Derivation, Icon, grams, kg, bp, percent, words
} from './components.jsx';

/* ---------------------------------------------------------------- data ---- */

export function useResource(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api.get(path)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
  }, [path]);
  useEffect(() => reload(), deps.length ? deps : [path]);
  return { ...state, reload };
}

/* --------------------------------------------------------------- chrome ---- */

const CONSOLE_NAV = [
  ['/console', 'Board'],
  ['/console/intake', 'Intake'],
  ['/console/record', 'Record'],
  ['/console/reconciliation', 'Reconciliation'],
  ['/console/certificates', 'Certificates']
];

export function ConsoleChrome({ path, session, onSignOut, children }) {
  return (
    <div class="shell">
      <a class="skip-link" href="#main">Skip to the content</a>
      <header class="topbar">
        <div class="wrap wrap-wide topbar-inner">
          <Link href="/console" class="brand">Ravel</Link>
          {/* Navigation across the console is a persistent top bar. */}
          <nav class="topnav" aria-label="Console">
            {CONSOLE_NAV.map(([href, label]) => (
              <Link key={href} href={href}
                aria-current={href === '/console' ? (path === href ? 'page' : undefined)
                  : (path.startsWith(href) ? 'page' : undefined)}>
                {label}
              </Link>
            ))}
          </nav>
          <div class="row t-small">
            <span class="muted">
              {session?.name} · {(session?.roles || []).map(words).join(', ')}
            </span>
            <button class="btn btn-quiet" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>
      <SuspensionBanner />
      <main id="main" class="wrap wrap-wide" style="padding-top:2rem;padding-bottom:3rem">
        {children}
      </main>
    </div>
  );
}

/** Where a site's certification is suspended, every surface that can issue says so. */
function SuspensionBanner() {
  const [suspensions, setSuspensions] = useState([]);
  useEffect(() => {
    api.get('/sites').then(async (sites) => {
      const out = [];
      for (const s of sites) {
        try {
          const periods = await api.get(`/sites/${s.reference}/certification`);
          const open = periods.filter((p) => p.state === 'suspended' && !p.effective_to);
          for (const o of open) out.push({ site: s.reference, ...o });
        } catch { /* a site whose certification cannot be read raises nothing here */ }
      }
      setSuspensions(out);
    }).catch(() => {});
  }, []);
  if (!suspensions.length) return null;
  return (
    <div class="wrap wrap-wide" style="padding-top:1rem">
      {suspensions.map((s) => (
        <div class="banner" role="alert" key={`${s.site}-${s.id}`}>
          <p class="banner-title">Certification suspended — issuing is blocked</p>
          <p>
            <span class="mono">{s.site}</span>{s.grade ? ` grade ${s.grade}` : ''} is suspended from{' '}
            <span class="mono">{s.effective_from}</span>
            {s.effective_to ? <> to <span class="mono">{s.effective_to}</span></> : ' with no end date recorded'}.
            {s.reason ? ` Reason: ${s.reason}.` : ''}
          </p>
          <p class="t-small">
            This banner is not dismissible. Every certificate signed inside the window is enumerated
            on the certification record for that site.
          </p>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- login ---- */

export function Login({ onSignedIn, next }) {
  useMeta('Sign in', 'Sign in to the Ravel console.');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await login(email, password);
      const me = await api.get('/auth/me');
      onSignedIn(me);
      navigate(next || '/console');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="shell">
      <main id="main" class="wrap wrap-narrow section">
        <p class="eyebrow">Ravel console</p>
        <h1>Sign in</h1>
        <p class="t-big">
          The console is reached only with a session. There is no signup, no password reset and no
          self-service account creation.
        </p>
        {error ? (
          <Refusal title="You were not signed in">
            <p>
              {error.status === 503
                ? 'The identity service could not be reached. Nothing was signed in and nothing changed.'
                : 'That email and password were not accepted. Check them and try again.'}
            </p>
          </Refusal>
        ) : null}
        <form onSubmit={submit} class="sheet" style="margin-top:1.5rem">
          <label class="field">
            <span class="label">Email</span>
            <input type="email" autocomplete="username" required value={email}
              onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label class="field">
            <span class="label">Password</span>
            <input type="password" autocomplete="current-password" required value={password}
              onInput={(e) => setPassword(e.currentTarget.value)} />
          </label>
          <button class="btn" type="submit" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'} <span class="btn-arrow" aria-hidden="true">→</span>
          </button>
        </form>
        <p class="t-small muted" style="margin-top:1.5rem">
          A session expires twelve hours after it is issued. A grant is scoped to a site and carries
          an end date; nothing renews silently.
        </p>
      </main>
    </div>
  );
}

/* ---------------------------------------------------------- the board ---- */

const STAGES = [
  ['dissolution', 'Dissolution'],
  ['depolymerisation', 'Depolymerisation'],
  ['purification', 'Purification'],
  ['repolymerisation', 'Repolymerisation']
];

export function Board() {
  useMeta('Board', 'One column per process stage and one card per run.');
  const runs = useResource('/runs');
  return (
    <>
      <p class="eyebrow">Operational record</p>
      <h1>The board</h1>
      <p class="t-big">
        One column per process stage, one card per run. This product records what a run did, after
        the run. It reads no sensor and drives no equipment.
      </p>

      {runs.loading ? <Loading what="the run board" /> : null}
      {runs.error ? <ErrorBanner error={runs.error} /> : null}
      {runs.data && !runs.data.length ? <Empty>No run has been opened yet.</Empty> : null}

      {runs.data && runs.data.length ? (
        <div class="board">
          {STAGES.map(([key, label]) => {
            const inStage = runs.data.filter((r) => r.run_type === key);
            return (
              <section class="board-column" key={key} aria-label={label}>
                <h3>{label}</h3>
                <p class="t-small muted">
                  {inStage.length} run{inStage.length === 1 ? '' : 's'}
                </p>
                {!inStage.length ? (
                  <p class="t-small muted">No run is in this stage.</p>
                ) : inStage.map((r) => (
                  <article class="run-card" key={r.reference}>
                    {/* The column a card sits in is named in text on the card. */}
                    <p class="eyebrow" style="margin-bottom:0.35rem">{label}</p>
                    <p class="mono" style="margin:0 0 0.35rem">
                      <Link href={`/console/runs/${r.reference}`}>{r.reference}</Link>
                    </p>
                    <p class="t-small muted" style="margin:0 0 0.5rem">
                      Recipe {r.recipe_version} · {r.site}
                    </p>
                    <p class="row" style="gap:0.35rem;margin:0">
                      <State word={r.state === 'closed' ? 'Closed' : 'Open'} quiet={r.state !== 'closed'} />
                      {r.within_tolerance === false ? <State word="Outside tolerance" consequence /> : null}
                      {r.deviations?.some((d) => d.state === 'open')
                        ? <State word="Deviation open" consequence /> : null}
                    </p>
                    {r.losses_g !== null && r.losses_g !== undefined ? (
                      <p class="t-small mono" style="margin:0.5rem 0 0">
                        Losses {grams(r.losses_g)}
                      </p>
                    ) : null}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : null}
      <p class="t-small muted" style="margin-top:1.5rem">Losses reduce the claim.</p>
    </>
  );
}

/* ------------------------------------------------------------- a run ---- */

export function RunDetail({ reference }) {
  useMeta(`Run ${reference}`, 'What this run consumed, what it produced and whether it held its recipe.');
  const run = useResource(`/runs/${reference}`);
  const r = run.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console">Board</Link> · Run</p>
      <h1 class="mono">{reference}</h1>
      {run.loading ? <Loading what="this run" /> : null}
      {run.error ? <ErrorBanner error={run.error} /> : null}
      {r ? (
        <>
          <p class="row">
            <State word={r.state === 'closed' ? 'Closed' : 'Open'} quiet={r.state !== 'closed'} />
            {r.within_tolerance === false ? <State word="Outside tolerance" consequence /> : null}
          </p>
          <dl class="definition">
            <dt>Stage</dt><dd>{words(r.run_type)}</dd>
            <dt>Site</dt><dd class="mono">{r.site}</dd>
            <dt>Equipment</dt><dd class="mono">{r.equipment}</dd>
            <dt>Recipe version followed</dt><dd class="mono">{r.recipe_version}</dd>
            <dt>Operator</dt><dd>{r.operator}</dd>
            <dt>Started</dt><dd class="mono">{r.started_at}</dd>
            <dt>Closed</dt><dd class="mono">{r.closed_at || 'not closed'}</dd>
            <dt>Losses</dt><dd class="mono">{grams(r.losses_g)}</dd>
          </dl>

          {r.recipe ? (
            <>
              <h2>Set points</h2>
              <TableScroll caption="Recipe against actual">
                <thead>
                  <tr>
                    <th scope="col">Parameter</th>
                    <th scope="col" class="num">Set point</th>
                    <th scope="col" class="num">Tolerance</th>
                    <th scope="col" class="num">Achieved</th>
                    <th scope="col">Within tolerance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.recipe.set_points || {}).map(([k, v]) => {
                    const tol = (r.recipe.tolerances || {})[k];
                    const actual = (r.actual_set_points || {})[k];
                    const inTol = tol && actual !== undefined ? actual >= tol[0] && actual <= tol[1] : null;
                    return (
                      <tr key={k}>
                        <th scope="row">{words(k)}</th>
                        <td class="num">{v}</td>
                        <td class="num">{tol ? `${tol[0]}–${tol[1]}` : '—'}</td>
                        <td class="num">{actual ?? '—'}</td>
                        <td>{inTol === null ? '—' : inTol ? 'Within tolerance' : 'Outside tolerance'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableScroll>
              <p class="t-small muted" style="margin-top:0.75rem">
                Released by {r.recipe.released_by} on <span class="mono">{r.recipe.released_on}</span>.
                Residence time {r.recipe.residence_time_minutes} minutes.
              </p>
            </>
          ) : null}

          <h2>Consumed</h2>
          {!r.consumptions.length ? <Empty>This run has consumed nothing.</Empty> : (
            <TableScroll caption="Consumptions">
              <thead>
                <tr>
                  <th scope="col">Consumption</th><th scope="col">Input</th>
                  <th scope="col" class="num">Mass</th><th scope="col">Effective on</th>
                </tr>
              </thead>
              <tbody>
                {r.consumptions.map((cn) => (
                  <tr key={cn.reference}>
                    <td class="mono">{cn.reference}</td>
                    <td class="mono">{cn.input_ref}</td>
                    <td class="num">{grams(cn.mass_g)}</td>
                    <td class="mono">{cn.effective_on}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          <h2>Produced</h2>
          {!r.outputs.length ? <Empty>This run has produced nothing.</Empty> : (
            <TableScroll caption="Outputs">
              <thead>
                <tr>
                  <th scope="col">Output</th><th scope="col">Kind</th>
                  <th scope="col" class="num">Mass</th><th scope="col">Disposition</th>
                </tr>
              </thead>
              <tbody>
                {r.outputs.map((o) => (
                  <tr key={o.reference}>
                    <td class="mono">{o.reference}</td>
                    <td>{words(o.kind)}</td>
                    <td class="num">{grams(o.mass_g)}</td>
                    <td>{o.disposition ? words(o.disposition) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          {r.custody_notes?.length ? (
            <div class="banner" role="note">
              <p class="banner-title">A batch this run consumed is missing a custody link</p>
              {r.custody_notes.map((n) => (
                <p key={n.batch} class="mono">
                  {n.batch}: missing {n.missing.join(', ')}
                </p>
              ))}
              <p class="t-small">A batch missing a custody link is non-claimable.</p>
            </div>
          ) : null}

          <Derivation of={r.derivation} />
        </>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------- intake ---- */

export function Intake() {
  useMeta('Intake', 'Feedstock arrival: what was delivered, what was accepted and what can be claimed.');
  const batches = useResource('/batches');
  const collectors = useResource('/collectors');
  return (
    <>
      <p class="eyebrow">Operational record</p>
      <h1>Intake</h1>
      <p class="t-big">
        A batch resolves its claimability against the collector approval in force on its receipt
        date, never a current flag. Material from a lapsed collector is processed as non-claimable
        input.
      </p>

      {batches.loading ? <Loading what="the batch register" /> : null}
      {batches.error ? <ErrorBanner error={batches.error} /> : null}
      {batches.data && !batches.data.length ? <Empty>No batch has been booked in yet.</Empty> : null}

      {batches.data && batches.data.length ? (
        <TableScroll caption="Batch register">
          <thead>
            <tr>
              <th scope="col">Batch</th>
              <th scope="col">Collector, as named then</th>
              <th scope="col">Category</th>
              <th scope="col">Received</th>
              <th scope="col" class="num">Net</th>
              <th scope="col" class="num">Moisture</th>
              <th scope="col" class="num">Dry mass</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {batches.data.map((b) => (
              <tr key={b.reference}>
                <th scope="row" class="mono">
                  <Link href={`/console/batches/${b.reference}`}>{b.reference}</Link>
                </th>
                <td>{b.collector_name}<br /><span class="t-small muted mono">{b.collector}</span></td>
                <td>{words(b.category)}</td>
                <td class="mono">{b.received_on}</td>
                <td class="num">{grams(b.net_g)}</td>
                <td class="num">{bp(b.moisture_bp)}</td>
                <td class="num">{grams(b.dry_mass_g)}</td>
                <td>
                  <span class="row" style="gap:0.35rem">
                    {b.claimable
                      ? <State word="Claimable" />
                      : <State word="Not claimable" consequence />}
                    {b.flags?.includes('lapsed_calibration')
                      ? <State word="Calibration lapsed" consequence /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : null}

      <h2>Collectors</h2>
      {collectors.loading ? <Loading what="the collectors" /> : null}
      {collectors.data ? (
        <div class="grid grid-3">
          {collectors.data.map((c) => (
            <article class="card" key={c.reference}>
              <h4>{c.name}</h4>
              <p class="t-small mono muted">{c.reference} · {c.country} · {c.registration}</p>
              <p class="t-small">Registration expires <span class="mono">{c.registration_expiry}</span></p>
              {c.approval_periods.map((p, i) => (
                <p key={i} class="t-small">
                  <State word={words(p.state).replace(/^\w/, (m) => m.toUpperCase())}
                    consequence={['lapsed', 'suspended'].includes(p.state)} />{' '}
                  <span class="mono">{p.valid_from} to {p.valid_to}</span>
                  {p.expiring ? <> · <State word="Expiring" consequence /></> : null}
                  {p.condition ? (
                    <><br /><span class="muted">Condition: {p.condition}, closing by {p.condition_closes_on}</span></>
                  ) : null}
                </p>
              ))}
              {c.findings?.length ? (
                <p class="t-small">
                  <State word={`${c.findings.length} finding${c.findings.length === 1 ? '' : 's'}`} consequence />
                  {c.findings.map((f) => (
                    <span key={f.reference}><br /><span class="muted">{f.description}</span></span>
                  ))}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function BatchDetail({ reference }) {
  useMeta(`Batch ${reference}`, 'What was delivered, what was accepted, and whether it can be claimed.');
  const batch = useResource(`/batches/${reference}`);
  const b = batch.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console/intake">Intake</Link> · Batch</p>
      <h1 class="mono">{reference}</h1>
      {batch.loading ? <Loading what="this batch" /> : null}
      {batch.error ? <ErrorBanner error={batch.error} /> : null}
      {b ? (
        <>
          {!b.claimable ? (
            <div class="banner" role="note">
              <p class="banner-title">Not claimable</p>
              <p class="t-big">
                {b.claimable_reason === 'custody_link_missing'
                  ? `This batch cannot be claimed: ${b.claimable_missing_kind} custody link is missing.`
                  : `This collector's approval lapsed on ${b.approval_valid_to}. Material received after that date is processed but not claimed.`}
              </p>
              {b.claimable_from ? (
                <p>Claimable forward from <span class="mono">{b.claimable_from}</span>, the date the late evidence arrived.</p>
              ) : null}
            </div>
          ) : null}

          {b.flags?.includes('lapsed_calibration') ? (
            <div class="banner" role="note">
              <p class="banner-title">Calibration lapsed</p>
              <p>
                The weighing device <span class="mono">{b.device}</span> was last calibrated more
                than twelve months before this receipt. This flag is repeated on every lot this
                batch reaches.
              </p>
            </div>
          ) : null}

          <dl class="definition">
            <dt>Collector, as named then</dt><dd>{b.collector_name} <span class="mono t-small">({b.collector})</span></dd>
            <dt>Site</dt><dd class="mono">{b.site}</dd>
            <dt>Category</dt><dd>{words(b.category)} <span class="t-small muted">— cannot be changed after acceptance</span></dd>
            <dt>Received on</dt><dd class="mono">{b.received_on}</dd>
            <dt>Gross</dt><dd class="mono">{grams(b.gross_g)}</dd>
            <dt>Tare</dt><dd class="mono">{grams(b.tare_g)}</dd>
            <dt>Net</dt><dd class="mono">{grams(b.net_g)}</dd>
            <dt>Moisture</dt><dd class="mono">{bp(b.moisture_bp)} ({b.moisture_method})</dd>
            <dt>Dry mass</dt><dd class="mono">{grams(b.dry_mass_g)}</dd>
            <dt>Accepted</dt><dd class="mono">{grams(b.accepted_g)}</dd>
            <dt>Rejected</dt>
            <dd class="mono">
              {grams(b.rejected_g)}
              {b.rejected_destination ? <> → {b.rejected_destination}</> : null}
            </dd>
            <dt>Approval in force on receipt</dt><dd>{words(b.approval_state_on_receipt)}</dd>
          </dl>

          <h2>Composition</h2>
          <dl class="definition">
            <dt>Polymer</dt><dd class="mono">{b.composition.polymer}</dd>
            <dt>Declared fraction</dt><dd class="mono">{bp(b.composition.fraction_bp)}</dd>
            <dt>Measured fraction</dt>
            <dd class="mono">
              {b.composition.measured_fraction_bp !== undefined
                ? bp(b.composition.measured_fraction_bp)
                : 'no sample taken'}
            </dd>
            <dt>Basis</dt><dd>{words(b.composition.basis)}</dd>
          </dl>

          <h2>Contamination</h2>
          <dl class="definition">
            <dt>Non-nylon</dt><dd class="mono">{bp(b.contamination.non_nylon_bp)}</dd>
            <dt>Elastane</dt><dd class="mono">{bp(b.contamination.elastane_bp)}</dd>
            <dt>Coatings</dt><dd>{b.contamination.coatings}</dd>
            <dt>Colour load</dt><dd>{b.contamination.colour_load}</dd>
            <dt>Foreign matter</dt><dd>{b.contamination.foreign_matter}</dd>
          </dl>

          <h2>Custody</h2>
          <TableScroll caption="Chain of custody">
            <thead>
              <tr><th scope="col">Link</th><th scope="col">Date</th><th scope="col">Party</th><th scope="col">State</th></tr>
            </thead>
            <tbody>
              {b.custody.map((l, i) => (
                <tr key={i}>
                  <th scope="row">{words(l.kind)}</th>
                  <td class="mono">{l.date}</td>
                  <td>{l.party}</td>
                  <td>{l.late ? `Arrived late on ${l.arrived_on}` : 'Present'}</td>
                </tr>
              ))}
              {b.custody_missing.map((k) => (
                <tr key={k}>
                  <th scope="row">{words(k)}</th>
                  <td>—</td><td>—</td>
                  <td><State word="Missing" consequence /></td>
                </tr>
              ))}
            </tbody>
          </TableScroll>

          <p style="margin-top:1.5rem">
            <Link href={`/console/batches/${reference}/impact`} class="btn btn-secondary">
              Where this batch went <span class="btn-arrow" aria-hidden="true">→</span>
            </Link>
          </p>
          <Derivation of={b.derivation} />
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- lots ---- */

export function Lots() {
  useMeta('Lots', 'The lot register with the claim attached to each lot.');
  const lots = useResource('/lots');
  return (
    <>
      <p class="eyebrow">Operational record</p>
      <h1>Lots</h1>
      {lots.loading ? <Loading what="the lot register" /> : null}
      {lots.error ? <ErrorBanner error={lots.error} /> : null}
      {lots.data && !lots.data.length ? <Empty>No lot has been produced yet.</Empty> : null}
      {lots.data && lots.data.length ? (
        <TableScroll caption="Lot register">
          <thead>
            <tr>
              <th scope="col">Lot</th><th scope="col">Site</th>
              <th scope="col" class="num">Mass</th>
              <th scope="col">Recycled content</th>
              <th scope="col">Disposition</th><th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {lots.data.map((l) => (
              <tr key={l.reference}>
                <th scope="row" class="mono">
                  <Link href={`/console/lots/${l.reference}`}>{l.reference}</Link>
                </th>
                <td class="mono">{l.site}</td>
                <td class="num">{grams(l.mass_g)}</td>
                <td><ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} compact /></td>
                <td>{words(l.disposition)}</td>
                <td>
                  <span class="row" style="gap:0.35rem">
                    {l.deviations?.some((d) => d.state === 'open') ? <State word="Deviation open" consequence /> : null}
                    {l.overrides?.some((o) => !o.reviewed) ? <State word="Override unreviewed" consequence /> : null}
                    {l.flags?.includes('lapsed_calibration') ? <State word="Calibration lapsed" consequence /> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : null}
    </>
  );
}

export function LotDetail({ reference }) {
  useMeta(`Lot ${reference}`, 'The claim, the carbon figure and the record behind one lot.');
  const lot = useResource(`/lots/${reference}`);
  const [carbon, setCarbon] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    api.get(`/lots/${reference}/carbon`)
      .then((data) => setCarbon({ loading: false, data, error: null }))
      .catch((error) => setCarbon({ loading: false, data: null, error }));
  }, [reference]);
  const l = lot.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console/lots">Lots</Link> · Lot</p>
      <h1 class="mono">{reference}</h1>
      {lot.loading ? <Loading what="this lot" /> : null}
      {lot.error ? <ErrorBanner error={lot.error} /> : null}
      {l ? (
        <>
          <p class="row">
            <State word={words(l.disposition).replace(/^\w/, (m) => m.toUpperCase())}
              consequence={l.disposition !== 'released'} />
            {l.deviations?.some((d) => d.state === 'open') ? <State word="Deviation open" consequence /> : null}
            {l.overrides?.some((o) => !o.reviewed) ? <State word="Override unreviewed" consequence /> : null}
            {l.flags?.includes('lapsed_calibration') ? <State word="Calibration lapsed" consequence /> : null}
          </p>

          {l.overrides?.filter((o) => !o.reviewed).map((o) => (
            <div class="banner" role="note" key={o.reference}>
              <p class="banner-title">Separation overridden — unreviewed</p>
              <p>{o.statement}</p>
              <p class="t-small">
                Separation broken: {words(o.separation)}. This blocks signing until a second person
                reviews it, and it shows on this lot for its life.
              </p>
            </div>
          ))}

          <div class="grid grid-2">
            <div class="card">
              <p class="eyebrow">Recycled content</p>
              <ContentFigure content_bp={l.content_bp} claim_type={l.claim_type} />
              <p class="t-small muted" style="margin-top:0.5rem">
                {grams(l.credit_attached_g)} of claim attached to a lot of {grams(l.mass_g)}.
              </p>
              <p class="t-small mono">
                post-consumer {grams(l.category_split?.post_consumer)} ·
                pre-consumer {grams(l.category_split?.pre_consumer)}
              </p>
            </div>
            <div class="card">
              <p class="eyebrow">Carbon</p>
              {carbon.loading ? <Loading what="the carbon figure" /> : null}
              {carbon.error ? (
                <p class="t-small">
                  {carbon.error.body?.error === 'allocation_basis_mismatch'
                    ? 'This figure is not returned: the period and the carbon method disagree on the allocation basis.'
                    : 'No carbon figure exists for this lot.'}
                </p>
              ) : null}
              {carbon.data ? (
                <>
                  <CarbonFigure carbon={carbon.data} />
                  <p class="t-small muted" style="margin-top:0.5rem">
                    Primary share {bp(carbon.data.primary_share_bp)}
                    {carbon.data.default_led ? ' — default-led' : ' — above the primary-data threshold'}
                  </p>
                </>
              ) : null}
              <p style="margin-top:0.75rem">
                <Link href={`/console/lots/${reference}/carbon`} class="btn btn-quiet">
                  The breakdown and the energy panel
                </Link>
              </p>
            </div>
          </div>

          <dl class="definition">
            <dt>Grade</dt><dd class="mono">{l.grade}</dd>
            <dt>Site</dt><dd class="mono">{l.site}</dd>
            <dt>Mass</dt><dd class="mono">{grams(l.mass_g)}</dd>
            <dt>Claim type</dt><dd>{words(l.claim_type)}</dd>
            <dt>Produced by run</dt><dd class="mono">{l.run || 'blended'}</dd>
            <dt>Produced on</dt><dd class="mono">{l.produced_on}</dd>
            <dt>Specification</dt><dd class="mono">SPEC-N6 v{l.specification_version}</dd>
            {l.sites ? (<><dt>Blended across sites</dt><dd class="mono">{l.sites.join(', ')}</dd></>) : null}
          </dl>

          <h2>Test results</h2>
          {!l.test_results.length ? <Empty>No test result is recorded against this lot.</Empty> : (
            <TableScroll caption="Test results">
              <thead>
                <tr>
                  <th scope="col">Property</th><th scope="col">Method</th>
                  <th scope="col" class="num">Value</th><th scope="col">Unit</th>
                  <th scope="col" class="num">Uncertainty</th><th scope="col">Usable for release</th>
                </tr>
              </thead>
              <tbody>
                {l.test_results.map((t) => (
                  <tr key={t.reference}>
                    <td>{words(t.property)}</td>
                    <td class="mono">{t.method}</td>
                    <td class="num">{t.value}</td>
                    <td>{t.unit}</td>
                    <td class="num">{bp(t.uncertainty_bp)}</td>
                    <td>{t.usable_for_release ? 'Yes' : 'No — method mismatch'}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          {l.deviations?.length ? (
            <>
              <h2>Deviations</h2>
              <TableScroll caption="Deviations touching this lot">
                <thead>
                  <tr><th scope="col">Deviation</th><th scope="col">State</th><th scope="col">Outcome</th><th scope="col">Description</th></tr>
                </thead>
                <tbody>
                  {l.deviations.map((d) => (
                    <tr key={d.reference}>
                      <th scope="row" class="mono">{d.reference}</th>
                      <td>{d.state === 'open' ? <State word="Open" consequence /> : 'Closed'}</td>
                      <td>{d.outcome ? words(d.outcome) : '—'}</td>
                      <td>{d.description}</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </>
          ) : null}

          <p class="row" style="margin-top:1.5rem">
            <Link href={`/console/lots/${reference}/genealogy`} class="btn btn-secondary">
              Genealogy <span class="btn-arrow" aria-hidden="true">→</span>
            </Link>
          </p>
        </>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------- genealogy ---- */

export function Genealogy({ reference }) {
  useMeta(`Genealogy of ${reference}`, 'The same facts twice: as a graph and as a nested list.');
  const g = useResource(`/lots/${reference}/genealogy`);
  const [exported, setExported] = useState(null);
  const [exportError, setExportError] = useState(null);

  async function doExport() {
    setExportError(null);
    try {
      const r = await api.post('/exports', { lots: [reference], sites: [] });
      setExported(r);
    } catch (err) { setExportError(err); }
  }

  const d = g.data;
  return (
    <>
      <p class="eyebrow"><Link href={`/console/lots/${reference}`}>Lot</Link> · Genealogy</p>
      <h1>Genealogy of <span class="mono">{reference}</span></h1>
      <p class="t-big">
        A graph, not a tree. A batch that reaches this lot by several paths is drawn once, and its
        edges carry mass rather than a percentage.
      </p>

      {g.loading ? <Loading what="the genealogy" /> : null}
      {g.error ? <ErrorBanner error={g.error} /> : null}

      {d ? (
        <>
          {d.flagged ? (
            <div class="banner" role="note">
              <p class="banner-title">Something in this graph is flagged</p>
              <p>
                A flag anywhere in the genealogy is visible from the lot without expanding anything.
                The flagged nodes are:{' '}
                <span class="mono">
                  {d.nodes.filter((n) => n.flags.length).map((n) => n.reference).join(', ')}
                </span>.
              </p>
            </div>
          ) : null}

          <h2>As a graph</h2>
          <GraphView nodes={d.nodes} edges={d.edges} />

          <h2>As a nested list</h2>
          <p class="t-small muted">
            The same nodes, the same masses, the same category splits and the same flags. This list
            is not a summary; it is the same information in another form.
          </p>
          <NestedList node={d.text_equivalent} />

          <p class="row" style="margin-top:1.5rem">
            <button class="btn" onClick={doExport}>
              Export this genealogy <span class="btn-arrow" aria-hidden="true">→</span>
            </button>
          </p>
          {exportError ? <ErrorBanner error={exportError} /> : null}
          {exported ? (
            <div class="banner" role="status">
              <p class="banner-title">Exported</p>
              <p>
                Export <span class="mono">{exported.reference}</span> carries{' '}
                {exported.entries?.length ?? 0} record entries with their digests, anchored at
                sequence <span class="mono">{exported.anchors?.first_seq ?? '—'}</span> to{' '}
                <span class="mono">{exported.anchors?.last_seq ?? '—'}</span>.
              </p>
              <p class="t-small">Every export is itself an entry in the record.</p>
            </div>
          ) : null}

          <p class="t-small muted" style="margin-top:1rem">
            Read at <span class="mono">{d.read_at}</span>.
          </p>
        </>
      ) : null}
    </>
  );
}

/** The graph at a wide viewport; it becomes the nested list at the narrowest width. */
function GraphView({ nodes, edges }) {
  const cols = { batch: 0, run: 1, intermediate: 2, lot: 3 };
  const byCol = [[], [], [], []];
  for (const n of nodes) byCol[cols[n.kind] ?? 2].push(n);
  const colW = 240, rowH = 96, padX = 16, padY = 16;
  const height = Math.max(...byCol.map((c) => c.length), 1) * rowH + padY * 2;
  const pos = new Map();
  byCol.forEach((col, ci) => col.forEach((n, ri) => {
    pos.set(n.reference, { x: padX + ci * colW, y: padY + ri * rowH });
  }));

  return (
    <div class="table-scroll" tabindex="0" role="region" aria-label="Genealogy graph">
      <svg class="graph-svg" viewBox={`0 0 ${padX * 2 + colW * 4} ${height}`}
        style={`min-width:56rem;height:${height}px`} role="img"
        aria-label="A graph of the batches, runs and outputs this lot descends from. The same facts are listed below as a nested list.">
        {edges.map((e, i) => {
          const a = pos.get(e.from), b = pos.get(e.to);
          if (!a || !b) return null;
          return (
            <g key={i}>
              <path d={`M${a.x + 200} ${a.y + 32} C ${a.x + 230} ${a.y + 32}, ${b.x - 30} ${b.y + 32}, ${b.x} ${b.y + 32}`}
                class="graph-edge" />
              <text x={(a.x + 200 + b.x) / 2 - 20} y={(a.y + b.y) / 2 + 28} class="graph-label" style="font-size:11px">
                {Number(e.mass_g).toLocaleString('en-GB')} g
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const p = pos.get(n.reference);
          if (!p) return null;
          return (
            <g key={n.reference}>
              <rect x={p.x} y={p.y} width="200" height="64" rx="4"
                class={`graph-node-box${n.flags.length ? ' graph-node-flagged' : ''}`} />
              <text x={p.x + 10} y={p.y + 20} class="graph-label" style="font-weight:600">{n.reference}</text>
              <text x={p.x + 10} y={p.y + 36} class="graph-label">
                {words(n.kind)} · {Number(n.mass_g).toLocaleString('en-GB')} g
              </text>
              <text x={p.x + 10} y={p.y + 52} class="graph-label" style="font-size:11px">
                {n.flags.length ? `flagged: ${n.flags.join(', ')}` : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function NestedList({ node }) {
  if (!node) return <Empty>This lot has no recorded genealogy.</Empty>;
  return (
    <ul class="nested-list">
      <NestedNode node={node} />
    </ul>
  );
}

function NestedNode({ node }) {
  const split = node.category_split || {};
  const parts = Object.entries(split).filter(([, v]) => v > 0);
  return (
    <li>
      <span class="mono">{node.reference}</span> — {words(node.kind)},{' '}
      <span class="mono">{grams(node.mass_g)}</span>
      {parts.length ? (
        <span class="t-small muted">
          {' '}({parts.map(([k, v]) => `${words(k)} ${v} g`).join(', ')})
        </span>
      ) : null}
      {node.flags?.length ? (
        <> <State word={node.flags.map(words).join(', ')} consequence /></>
      ) : null}
      {node.repeated ? <span class="t-small muted"> — already listed above</span> : null}
      {node.children?.length ? (
        <ul>
          {node.children.map((c, i) => <NestedNode key={`${c.reference}-${i}`} node={c} />)}
        </ul>
      ) : null}
    </li>
  );
}

export function BatchImpact({ reference }) {
  useMeta(`Impact of ${reference}`, 'Every lot containing any of this batch, every certificate resting on those lots, and every recipient.');
  const impact = useResource(`/batches/${reference}/impact`);
  const d = impact.data;
  return (
    <>
      <p class="eyebrow"><Link href={`/console/batches/${reference}`}>Batch</Link> · Impact</p>
      <h1>Where <span class="mono">{reference}</span> went</h1>
      <p class="t-big">
        The same traversal, backwards. This is the enumeration a withdrawal runs on the worst day
        the company will have, so it is a complete set and never a page.
      </p>
      {impact.loading ? <Loading what="the traversal" /> : null}
      {impact.error ? <ErrorBanner error={impact.error} /> : null}
      {d ? (
        <>
          <h2>Lots</h2>
          {!d.lots.length ? <Empty>No lot contains any of this batch.</Empty> : (
            <TableScroll caption="Lots containing any of this batch">
              <thead>
                <tr><th scope="col">Lot</th><th scope="col">Site</th><th scope="col" class="num">Mass</th><th scope="col">Disposition</th></tr>
              </thead>
              <tbody>
                {d.lots.map((l) => (
                  <tr key={l.reference}>
                    <th scope="row" class="mono"><Link href={`/console/lots/${l.reference}`}>{l.reference}</Link></th>
                    <td class="mono">{l.site}</td>
                    <td class="num">{grams(l.mass_g)}</td>
                    <td>{words(l.disposition)}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          <h2>Certificates</h2>
          {!d.certificates.length ? <Empty>No certificate rests on those lots.</Empty> : (
            <TableScroll caption="Certificates resting on those lots">
              <thead>
                <tr><th scope="col">Certificate</th><th scope="col">State</th><th scope="col">Recipient</th></tr>
              </thead>
              <tbody>
                {d.certificates.map((c) => (
                  <tr key={`${c.number}-${c.version}`}>
                    <th scope="row" class="mono">
                      <Link href={`/console/certificates/${c.number}`}>{c.number}</Link>
                    </th>
                    <td>{c.state === 'withdrawn' ? <State word="Withdrawn" consequence /> : words(c.state)}</td>
                    <td>{c.recipient_name}</td>
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}

          <h2>Recipients</h2>
          {!d.recipients.length ? <Empty>No recipient holds a certificate resting on this batch.</Empty> : (
            <ul>{d.recipients.map((r) => <li key={r.reference}>{r.name} <span class="mono t-small">({r.reference})</span></li>)}</ul>
          )}
          <p class="t-small muted">Read at <span class="mono">{d.read_at}</span>. This is a complete set.</p>
        </>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------- balance screen ---- */

export function BalancePeriods() {
  useMeta('Balance', 'The ledger, per site, per grade and per period.');
  const periods = useResource('/balance-periods');
  return (
    <>
      <p class="eyebrow">The ledger</p>
      <h1>Balance periods</h1>
      {periods.loading ? <Loading what="the balance periods" /> : null}
      {periods.error ? <ErrorBanner error={periods.error} /> : null}
      {periods.data && !periods.data.length ? <Empty>No balance period exists.</Empty> : null}
      {periods.data ? (
        <div class="stack">
          {periods.data.map((p) => (
            <article class="card" key={p.id}>
              <div class="row-between">
                <h3 class="mono" style="margin:0">
                  <Link href={`/console/balance/${p.id}`}>{p.id}</Link>
                </h3>
                <span class="row" style="gap:0.35rem">
                  <State word={p.state === 'closed' ? 'Closed' : 'Open'} consequence={p.state === 'closed'} />
                  {p.state === 'closed' ? <Icon name="lock" title="" /> : null}
                </span>
              </div>
              <p class="t-small muted">
                {p.site} · {p.grade} · <span class="mono">{p.period.from} to {p.period.to}</span>
              </p>
              <p class="mono t-small">
                post-consumer available {grams(p.credits_available_g.post_consumer)} ·
                pre-consumer available {grams(p.credits_available_g.pre_consumer)}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * The balance screen. There is no input control on this screen at all: every figure is
 * derived and every figure links to the records it came from.
 */
export function Balance({ id }) {
  useMeta(`Balance ${id}`, 'Credits in, credits out and credits available per category, every figure derived.');
  const period = useResource(`/balance-periods/${id}`);
  const [allocation, setAllocation] = useState({ lot: '', category: 'post_consumer', mass_g: '' });
  const [refusal, setRefusal] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = period.data;

  async function allocate(e) {
    e.preventDefault();
    setBusy(true); setRefusal(null); setSuccess(null);
    try {
      const r = await api.post(`/balance-periods/${id}/allocations`, {
        lot: allocation.lot,
        category: allocation.category,
        mass_g: Number(allocation.mass_g)
      });
      setSuccess(r);
      period.reload();
    } catch (err) {
      // The figures on the screen are unchanged; the banner names the two masses.
      setRefusal(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p class="eyebrow"><Link href="/console/balance">Balance</Link> · Period</p>
      <h1 class="mono">{id}</h1>
      {period.loading && !p ? <Loading what="the ledger" /> : null}
      {period.error ? <ErrorBanner error={period.error} /> : null}

      {p ? (
        <>
          <p class="row">
            <State word={p.state === 'closed' ? 'Closed' : 'Open'} consequence={p.state === 'closed'} />
            <span class="t-small muted">
              {p.site} · {p.grade} · <span class="mono">{p.period.from} to {p.period.to}</span>
            </span>
          </p>
          {p.state === 'closed' ? (
            <div class="banner" role="note">
              <p class="banner-title">Closed</p>
              <p>This period is closed. Corrections require a restatement.</p>
              <p class="t-small mono">
                Closed on {p.closed_on} · cut-off {p.cut_off}
              </p>
            </div>
          ) : null}

          {/* The invariant's margin is shown as a mass, not as a state. */}
          <h2>Credits</h2>
          <TableScroll caption="Credits per category. Every figure is derived and the two categories are never netted.">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" class="num">Credits in</th>
                <th scope="col" class="num">Credits out</th>
                <th scope="col" class="num">Available</th>
              </tr>
            </thead>
            <tbody>
              {['post_consumer', 'pre_consumer'].map((cat) => (
                <tr key={cat}>
                  <th scope="row">{words(cat)}</th>
                  <td class="num">{grams(p.credits_in_g[cat])}</td>
                  <td class="num">{grams(p.credits_out_g[cat])}</td>
                  <td class="num">{grams(p.credits_available_g[cat])}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
          <p class="t-small muted">
            The remaining claimable mass is the margin. There is no verdict here and no badge.
          </p>

          {/* Three counts sit together and none is a badge to be cleared. */}
          <h2>Three counts</h2>
          <TableScroll caption="Counts against this period">
            <thead>
              <tr><th scope="col">Count</th><th scope="col" class="num">Number</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Overrides this period</th><td class="num">{p.override_count}</td></tr>
              <tr><th scope="row">Open restatements</th><td class="num">{p.open_restatement_count}</td></tr>
              <tr><th scope="row">Audit findings past their date</th><td class="num">{p.open_finding_count}</td></tr>
            </tbody>
          </TableScroll>

          <h2>Non-claimable input</h2>
          <p class="mono">{grams(p.non_claimable_input_g)}</p>
          <p class="t-small muted">
            Material processed but not claimed, because the collector's approval was not in force on
            the receipt date or a custody link was missing.
          </p>

          <h2>Conversion factors in force</h2>
          <TableScroll caption="Conversion factors with their versions and derivation windows">
            <thead>
              <tr>
                <th scope="col">Factor</th><th scope="col" class="num">Version</th>
                <th scope="col" class="num">Factor</th><th scope="col">Window</th>
                <th scope="col" class="num">In</th><th scope="col" class="num">Out</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {p.conversion_factors.map((f) => (
                <tr key={f.reference}>
                  <th scope="row" class="mono">{f.reference}</th>
                  <td class="num">{f.version}</td>
                  <td class="num">{bp(f.factor_bp)}</td>
                  <td class="mono">{f.derived_from ? `${f.derived_from} to ${f.derived_to}` : 'no window'}</td>
                  <td class="num">{grams(f.derived_in_g)}</td>
                  <td class="num">{grams(f.derived_out_g)}</td>
                  <td>{f.provisional ? <State word="Provisional" consequence /> : 'Derived'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>

          {p.inbound_credits?.length ? (
            <>
              <h2>Inbound credit</h2>
              <TableScroll caption="Credit that arrived by transfer, never a fresh credit">
                <thead>
                  <tr>
                    <th scope="col">Movement</th><th scope="col" class="num">Mass</th>
                    <th scope="col">Origin site</th><th scope="col">Fresh credit</th>
                  </tr>
                </thead>
                <tbody>
                  {p.inbound_credits.map((i) => (
                    <tr key={i.reference}>
                      <th scope="row" class="mono">{i.reference}</th>
                      <td class="num">{grams(i.mass_g)}</td>
                      <td class="mono">{i.origin_site}</td>
                      <td>No — it travelled from another period</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </>
          ) : null}

          {p.carried_forward_g ? (
            <>
              <h2>Carry-over at the close</h2>
              <TableScroll caption={`Carry-over limited to ${p.carry_over_limit_bp} basis points of the credit that entered`}>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" class="num">Carried forward</th>
                    <th scope="col" class="num">Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {['post_consumer', 'pre_consumer'].map((cat) => (
                    <tr key={cat}>
                      <th scope="row">{words(cat)}</th>
                      <td class="num">{grams(p.carried_forward_g[cat])}</td>
                      <td class="num">{grams(p.expired_g[cat])}</td>
                    </tr>
                  ))}
                </tbody>
              </TableScroll>
            </>
          ) : null}

          <h2>Movements</h2>
          <p class="t-small muted">
            A balance is the sum of its movements and is never held as a total. Each movement links
            to the record it came from.
          </p>
          <TableScroll caption="Every credit movement in this period">
            <thead>
              <tr>
                <th scope="col">Direction</th><th scope="col">Category</th>
                <th scope="col" class="num">Mass</th><th scope="col">Source</th>
                <th scope="col">Lot</th><th scope="col">Effective on</th>
              </tr>
            </thead>
            <tbody>
              {p.movements.map((m) => (
                <tr key={m.id}>
                  <td>{words(m.direction)}</td>
                  <td>{words(m.category)}</td>
                  <td class="num">{grams(m.mass_g)}</td>
                  <td class="mono">{m.source_ref || m.source_kind}</td>
                  <td class="mono">
                    {m.lot ? <Link href={`/console/lots/${m.lot}`}>{m.lot}</Link> : '—'}
                  </td>
                  <td class="mono">{m.effective_on}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>

          <Derivation of={p.derivation} />
          <p class="t-small muted">Read at <span class="mono">{p.read_at}</span>.</p>

          {/* Allocation is a separate act on its own surface, not a control on the ledger. */}
          <AllocationPanel
            id={id} p={p} allocation={allocation} setAllocation={setAllocation}
            allocate={allocate} busy={busy} refusal={refusal} success={success}
          />
        </>
      ) : null}
    </>
  );
}

function AllocationPanel({ id, p, allocation, setAllocation, allocate, busy, refusal, success }) {
  const lots = useResource('/lots');
  if (p.state === 'closed') return null;
  // Allocating claim is a claims manager's act. A reader who could not perform it is not
  // offered a control that the server would refuse.
  if (!holdsRole('claims_manager')) return null;
  return (
    <section style="margin-top:3rem">
      <h2>Allocate claim</h2>
      <p class="t-small muted">
        This is a deliberate act and it is refused rather than warned about when the ledger cannot
        support it. No percentage is entered here: the content is computed from the mass attached.
      </p>

      {/* The banner names the available mass and the requested mass. */}
      {refusal ? (
        <Refusal title="This allocation is refused">
          {refusal.body?.available_g !== undefined ? (
            <>
              <p class="t-big mono">
                This allocation is refused. Available: {refusal.body.available_g} g. Requested:{' '}
                {refusal.body.requested_g} g.
              </p>
              <p>
                Credits attached never exceed credits available. The figures above are unchanged and
                no credit moved.
              </p>
            </>
          ) : (
            <p>{refusal.body?.rule || refusal.message}</p>
          )}
        </Refusal>
      ) : null}

      {success ? (
        <div class="banner" role="status">
          <p class="banner-title">Claim attached</p>
          <p>
            {grams(success.mass_g)} of {words(success.category)} claim attached to{' '}
            <span class="mono">{success.lot}</span>.
          </p>
          <p>
            <ContentFigure content_bp={success.content_bp} claim_type={success.claim_type} />
          </p>
          <p class="t-small mono">{success.derivation?.content_bp}</p>
        </div>
      ) : null}

      <form onSubmit={allocate} class="card" style="margin-top:1rem">
        <div class="grid grid-3">
          <label class="field">
            <span class="label">Lot</span>
            <select value={allocation.lot} onChange={(e) => setAllocation({ ...allocation, lot: e.currentTarget.value })} required>
              <option value="">Choose a lot</option>
              {(lots.data || []).filter((l) => l.site === p.site).map((l) => (
                <option key={l.reference} value={l.reference}>{l.reference} ({l.mass_g} g)</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Category</span>
            <select value={allocation.category} onChange={(e) => setAllocation({ ...allocation, category: e.currentTarget.value })}>
              <option value="post_consumer">post consumer</option>
              <option value="pre_consumer">pre consumer</option>
            </select>
          </label>
          <label class="field">
            <span class="label">Mass in grams</span>
            <input type="number" step="1" min="1" required value={allocation.mass_g}
              onInput={(e) => setAllocation({ ...allocation, mass_g: e.currentTarget.value })} />
            <span class="hint">An integer number of grams. No percentage is accepted.</span>
          </label>
        </div>
        <button class="btn" type="submit" disabled={busy}>
          {busy ? 'Attaching' : 'Attach this claim'} <span class="btn-arrow" aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- carbon ---- */

export function LotCarbon({ reference }) {
  useMeta(`Carbon for ${reference}`, 'The carbon figure with its boundary, method version and uncertainty, its breakdown and its energy panel.');
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    api.get(`/lots/${reference}/carbon`)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, [reference]);
  const c = state.data;
  return (
    <>
      <p class="eyebrow"><Link href={`/console/lots/${reference}`}>Lot</Link> · Carbon</p>
      <h1>Carbon for <span class="mono">{reference}</span></h1>
      {state.loading ? <Loading what="the carbon figure" /> : null}
      {state.error ? (
        <Refusal title="This figure is not returned">
          <p>
            {state.error.body?.error === 'allocation_basis_mismatch'
              ? `The period allocates on ${state.error.body.period_allocation_basis} and the carbon method on ${state.error.body.method_allocation_basis}. The allocation basis is held once per period and applies to both.`
              : 'No carbon figure exists for this lot.'}
          </p>
        </Refusal>
      ) : null}
      {c ? (
        <>
          <div class="card">
            <CarbonFigure carbon={c} />
          </div>
          <dl class="definition">
            <dt>Standard</dt><dd>{c.standard}</dd>
            <dt>Functional unit</dt><dd>{c.functional_unit}</dd>
            <dt>Boundary</dt><dd>{c.boundary}</dd>
            <dt>Method version</dt><dd class="mono">{c.method_version}</dd>
            <dt>Uncertainty</dt><dd class="mono">{bp(c.uncertainty_bp)}</dd>
            <dt>Allocation basis</dt><dd>{words(c.allocation_basis)}</dd>
            <dt>Primary share</dt>
            <dd class="mono">
              {bp(c.primary_share_bp)} against a threshold of {bp(c.primary_threshold_bp)}
              {c.default_led
                ? ' — this figure is default-led'
                : ' — above the threshold, and it is not presented as metered where it is not'}
            </dd>
            <dt>Cache</dt><dd>{c.cache_valid ? 'Valid' : 'Not valid — an input was superseded and this figure is not silently recomputed'}</dd>
          </dl>

          <h2>Comparator</h2>
          <p>
            This figure is <strong>lower than {c.comparator.material}</strong>, from dataset{' '}
            {c.comparator.dataset} of {c.comparator.dataset_year} in {c.comparator.region}.
          </p>

          <h2>Breakdown</h2>
          <TableScroll caption="One line per contribution. The lines sum to the value.">
            <thead>
              <tr>
                <th scope="col">Line</th>
                <th scope="col" class="num">mg CO2e per kg</th>
                <th scope="col">Tag</th>
              </tr>
            </thead>
            <tbody>
              {(c.breakdown || []).map((l) => (
                <tr key={l.line}>
                  <th scope="row">{words(l.line)}</th>
                  <td class="num">{Number(l.mg_per_kg).toLocaleString('en-GB')}</td>
                  <td>{words(l.tag)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Total</th>
                <td class="num">
                  {(c.breakdown || []).reduce((s, l) => s + l.mg_per_kg, 0).toLocaleString('en-GB')}
                </td>
                <td>—</td>
              </tr>
            </tbody>
          </TableScroll>

          {/* Location-based and market-based side by side, never one alone. */}
          <h2>Energy</h2>
          <TableScroll caption="Location-based and market-based, returned together">
            <thead>
              <tr>
                <th scope="col" class="num">Location-based</th>
                <th scope="col" class="num">Market-based</th>
                <th scope="col" class="num">Metered</th>
                <th scope="col" class="num">Retired</th>
                <th scope="col" class="num">Unmatched</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="num">{Number(c.energy_location_mg_per_kg).toLocaleString('en-GB')} mg/kg</td>
                <td class="num">{Number(c.energy_market_mg_per_kg).toLocaleString('en-GB')} mg/kg</td>
                <td class="num">{Number(c.metered_kwh).toLocaleString('en-GB')} kWh</td>
                <td class="num">{Number(c.retired_kwh).toLocaleString('en-GB')} kWh</td>
                <td class="num">{Number(c.unmatched_kwh).toLocaleString('en-GB')} kWh</td>
              </tr>
            </tbody>
          </TableScroll>
          <EnergyInstruments />

          <Derivation of={c.derivation} />
        </>
      ) : null}
    </>
  );
}

function EnergyInstruments() {
  const inst = useResource('/energy-instruments');
  if (!inst.data) return null;
  return (
    <>
      <h3>Retired instruments</h3>
      {!inst.data.length ? <Empty>No energy instrument is recorded.</Empty> : (
        <TableScroll caption="Energy instruments">
          <thead>
            <tr>
              <th scope="col">Instrument</th><th scope="col" class="num">Quantity</th>
              <th scope="col" class="num">Vintage</th><th scope="col">Region</th>
              <th scope="col">State</th><th scope="col">Applied to</th>
            </tr>
          </thead>
          <tbody>
            {inst.data.map((i) => (
              <tr key={i.reference}>
                <th scope="row" class="mono">{i.reference}</th>
                <td class="num">{Number(i.quantity_kwh).toLocaleString('en-GB')} kWh</td>
                <td class="num">{i.vintage}</td>
                <td>{i.region}</td>
                <td>{i.state === 'retired' ? 'Retired' : <State word="Held, not retired" consequence />}</td>
                <td class="mono">{i.applied_period || '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}
    </>
  );
}

/* -------------------------------------------------------- reconciliation ---- */

export function Reconciliation() {
  useMeta('Reconciliation', 'Six figures rather than six verdicts.');
  const recon = useResource('/reconciliation');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // refreshed on a schedule
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (tick) recon.reload(); }, [tick]);
  const d = recon.data;
  return (
    <>
      <p class="eyebrow">The record</p>
      <h1>Reconciliation</h1>
      <p class="t-big">
        Six figures rather than six verdicts. These are numbers expected to be non-zero. None is a
        badge and none is styled as passing.
      </p>
      {recon.loading && !d ? <Loading what="the reconciliation" /> : null}
      {recon.error ? <ErrorBanner error={recon.error} /> : null}
      {d ? (
        <>
          <div class="card" style="margin-bottom:1.5rem">
            <p class="eyebrow">Mass balance residual</p>
            <p class="figure-value" style="font-size:var(--h3-size);line-height:var(--h3-line)">
              {grams(d.mass_balance_residual_g)}
            </p>
            <p class="t-small muted">
              Summed over closed runs as mass in minus mass out minus recorded losses.
            </p>
          </div>

          <TableScroll caption="The six figures">
            <thead>
              <tr><th scope="col">Figure</th><th scope="col" class="num">Value</th></tr>
            </thead>
            <tbody>
              <tr><th scope="row">Mass balance residual</th><td class="num">{grams(d.mass_balance_residual_g)}</td></tr>
              <tr><th scope="row">Credit margin</th><td class="num">{grams(d.credit_margin_g)}</td></tr>
              <tr><th scope="row">Consumptions on open runs</th><td class="num">{d.consumptions_on_open_runs}</td></tr>
              <tr><th scope="row">Batches with broken custody</th><td class="num">{d.batches_with_broken_custody}</td></tr>
              <tr><th scope="row">Certificates with superseded figures</th><td class="num">{d.certificates_with_superseded_figures}</td></tr>
            </tbody>
          </TableScroll>

          <h2>Integration ages</h2>
          <p class="t-small muted">
            A source that stops sending is detected by the age of its most recent record rather than
            by an error. A source that has never sent reads no record rather than zero.
          </p>
          <TableScroll caption="The age of the most recent record from each inbound source">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col" class="num">Age in hours</th>
                <th scope="col">Most recent record</th>
              </tr>
            </thead>
            <tbody>
              {d.integration_ages.map((i) => (
                <tr key={i.source}>
                  <th scope="row">{words(i.source)}</th>
                  <td class="num">
                    {i.age_hours === null
                      ? <State word="Never sent" consequence />
                      : Number(i.age_hours).toLocaleString('en-GB')}
                  </td>
                  <td class="mono">{i.last_received_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableScroll>

          <Derivation of={d.derivation} />
          <p class="t-small muted">Read at <span class="mono">{d.read_at}</span>.</p>
        </>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- record ---- */

export function RecordView() {
  useMeta('Record', 'The append-only record, its digest chain and the nine questions it answers.');
  const record = useResource('/record');
  const check = useResource('/record/check');
  const d = record.data;
  return (
    <>
      <p class="eyebrow">The record</p>
      <h1>The record</h1>
      <p class="t-big">
        Every act is an entry with the person, the moment, the site and the object. No entry is
        edited and no entry is removed; a correction is a new entry naming what it corrects. A
        refusal is recorded as well as a success.
      </p>

      {check.data ? (
        <div class="card" style="margin-bottom:1.5rem">
          <p class="eyebrow">Digest chain</p>
          <p class="t-big">
            {check.data.holds
              ? `The chain holds across ${check.data.entries} entries.`
              : 'The chain does not hold.'}
          </p>
          {check.data.first_failure ? (
            <p class="mono">
              First failure at sequence {check.data.first_failure.seq}: {words(check.data.first_failure.reason)}
            </p>
          ) : null}
          <p class="t-small muted">
            Each digest is computed over the entry's own content and the previous entry's digest. A
            gap in the sequence and a digest that does not verify are both reportable conditions.
          </p>
        </div>
      ) : null}

      <h2>The nine questions</h2>
      <div class="grid grid-3">
        {['lots_from_batch', 'certificates_on_period', 'certificates_under_method_version',
          'lots_released_under_unreviewed_override', 'allocations_in_final_fortnight',
          'refused_allocations', 'collector_declaration_departures', 'acts_by_person',
          'exports_by_auditor'].map((q) => (
          <Link key={q} href={`/console/record/queries/${q}`} class="card" style="text-decoration:none;display:block">
            <span class="t-regular">{words(q)}</span>
          </Link>
        ))}
      </div>

      <h2>Entries</h2>
      {record.loading ? <Loading what="the record" /> : null}
      {record.error ? <ErrorBanner error={record.error} /> : null}
      {d && !d.length ? <Empty>The record holds no entry.</Empty> : null}
      {d ? (
        <TableScroll caption={`${d.length} entries, in the order the acts happened`}>
          <thead>
            <tr>
              <th scope="col" class="num">Seq</th><th scope="col">Act</th>
              <th scope="col">Person</th><th scope="col">Moment</th>
              <th scope="col">Object</th><th scope="col">Outcome</th>
              <th scope="col">Digest</th>
            </tr>
          </thead>
          <tbody>
            {d.slice().reverse().map((e) => (
              <tr key={e.seq}>
                <td class="num">
                  <Link href={`/console/record/${e.seq}`}>{e.seq}</Link>
                </td>
                <td>{words(e.act)}</td>
                <td class="t-small">{e.person || '—'}</td>
                <td class="mono t-small">{String(e.at).replace('T', ' ').slice(0, 19)}</td>
                <td class="mono t-small">{e.object_ref || '—'}</td>
                <td>{e.outcome === 'refused' ? <State word="Refused" consequence /> : 'Success'}</td>
                <td class="mono t-small">{String(e.digest).slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      ) : null}
    </>
  );
}

export function RecordEntry({ seq }) {
  useMeta(`Record entry ${seq}`, 'One entry, its digest and its retention.');
  const entry = useResource(`/record/${seq}`);
  const retention = useResource(`/record/${seq}/retention`);
  const e = entry.data;
  const r = retention.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console/record">Record</Link> · Entry</p>
      <h1>Entry <span class="mono">{seq}</span></h1>
      {entry.loading ? <Loading what="this entry" /> : null}
      {entry.error ? <ErrorBanner error={entry.error} /> : null}
      {e ? (
        <>
          {e.content_deleted ? (
            <div class="banner" role="note">
              <p class="banner-title">Content deleted under retention</p>
              <p>{e.statement}</p>
              <p class="t-small">
                The entry keeps its position and its digest, so the chain still verifies.
              </p>
            </div>
          ) : null}
          <dl class="definition">
            <dt>Act</dt><dd>{words(e.act)}</dd>
            <dt>Person</dt><dd>{e.person || '—'}</dd>
            <dt>Moment</dt><dd class="mono">{e.at}</dd>
            <dt>Site</dt><dd class="mono">{e.site || '—'}</dd>
            <dt>Object</dt><dd class="mono">{e.object_kind} {e.object_ref}</dd>
            <dt>Outcome</dt><dd>{e.outcome === 'refused' ? <State word="Refused" consequence /> : 'Success'}</dd>
            <dt>Digest</dt><dd class="mono" style="word-break:break-all">{e.digest}</dd>
            <dt>Previous digest</dt><dd class="mono" style="word-break:break-all">{e.prev_digest}</dd>
          </dl>
          {e.content ? (
            <>
              <h2>Content</h2>
              <pre class="doc-plain">{JSON.stringify(e.content, null, 2)}</pre>
            </>
          ) : null}
          {r ? (
            <>
              <h2>Retention</h2>
              <dl class="definition">
                <dt>Scheme requirement</dt><dd class="mono">{r.scheme_months} months, to {r.scheme_until}</dd>
                <dt>Statutory requirement</dt><dd class="mono">{r.statutory_months} months, to {r.statutory_until}</dd>
                <dt>Referenced until</dt><dd class="mono">{r.referenced_until || 'not referenced by an issued figure'}</dd>
                <dt>Retain until</dt><dd class="mono">{r.retain_until} — the longest of the three, computed</dd>
                <dt>Legal hold</dt>
                <dd>
                  {r.legal_hold
                    ? <><State word="Under legal hold" consequence /> <span class="mono t-small">{r.legal_hold_reference}</span> — deletion is refused</>
                    : 'None stands'}
                </dd>
              </dl>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function RecordQuery({ name }) {
  useMeta(`Query: ${words(name)}`, 'One of the nine questions the record exists to answer, as a complete set.');
  const q = useResource(`/record/queries/${name}`);
  const d = q.data;
  return (
    <>
      <p class="eyebrow"><Link href="/console/record">Record</Link> · Query</p>
      <h1>{words(name)}</h1>
      {q.loading ? <Loading what="this query" /> : null}
      {q.error ? <ErrorBanner error={q.error} /> : null}
      {d ? (
        <>
          <p class="t-big">
            {d.count} result{d.count === 1 ? '' : 's'}. This is a complete set, not a page.
          </p>
          {!d.results.length ? <Empty>This question has no answer in the record yet.</Empty> : (
            <TableScroll caption={words(name)}>
              <thead>
                <tr>
                  {Object.keys(d.results[0]).map((k) => (
                    <th scope="col" key={k} class={typeof d.results[0][k] === 'number' ? 'num' : undefined}>
                      {words(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.results.map((row, i) => (
                  <tr key={i}>
                    {Object.keys(d.results[0]).map((k) => (
                      <td key={k} class={typeof row[k] === 'number' ? 'num mono' : undefined}>
                        {row[k] === null || row[k] === undefined
                          ? '—'
                          : typeof row[k] === 'object' ? JSON.stringify(row[k])
                            : typeof row[k] === 'boolean' ? (row[k] ? 'yes' : 'no')
                              : String(row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableScroll>
          )}
          <p class="t-small muted">{d.note}</p>
        </>
      ) : null}
    </>
  );
}
