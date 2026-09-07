import { useEffect, useState } from 'preact/hooks';
import { api, login as doLogin, storedSession, clearSession } from '../api.js';
import { Link, navigate } from '../router.jsx';
import {
  Reveal, State, Empty, Loading, Refusal, Content, Carbon, Mark, formatInt, formatBp,
} from '../components/ui.jsx';

export function useFetch(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    if (path === null) { setState({ loading: false, data: null, error: null }); return; }
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e }));
    return () => { live = false; };
  }, deps);
  return state;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await doLogin(email, password);
      navigate('/console');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="shell page">
      <section class="section" style="padding-top:3.5rem">
        <div class="sheet" style="max-width:26rem">
          <p class="eyebrow">Ravel console</p>
          <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">Sign in</h1>
          <form class="stack" onSubmit={submit} style="margin-top:1.5rem">
            <label class="field">
              <span>Email address</span>
              <input type="email" required autocomplete="username" value={email}
                     onInput={(e) => setEmail(e.target.value)} />
            </label>
            <label class="field">
              <span>Password</span>
              <input type="password" required autocomplete="current-password" value={password}
                     onInput={(e) => setPassword(e.target.value)} />
            </label>
            <p>
              <button class="button" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'} <span class="arrow" aria-hidden="true">→</span>
              </button>
            </p>
          </form>
          {error ? (
            <div style="margin-top:1rem">
              <Refusal title="You were not signed in.">
                <p>{error.message}</p>
                <p class="note">
                  Signup is closed. Only the seeded accounts can sign in, and a grant that has ended
                  does not renew silently.
                </p>
              </Refusal>
            </div>
          ) : null}
          <p class="note" style="margin-top:1.5rem">
            A session expires twelve hours after it is issued.
          </p>
        </div>
      </section>
    </div>
  );
}

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];

export function Board() {
  const runs = useFetch('/runs');
  const recon = useFetch('/reconciliation');
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          The run board
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          One column per process stage, one card per run. Each card names the column it sits in.
        </p>
      </section>

      <section class="section">
        {runs.loading ? <Loading what="the run board" /> : null}
        {runs.error ? <Empty>The run board could not be loaded.</Empty> : null}
        {runs.data ? (
          <div class="board">
            {STAGES.map((stage) => {
              const rows = runs.data.filter((r) => r.run_type === stage);
              return (
                <div class="board__column" key={stage}>
                  <h2 class="board__heading">{stage}</h2>
                  {rows.length === 0 ? (
                    <p class="empty">No run is at this stage.</p>
                  ) : (
                    <ul class="stack-s">
                      {rows.map((r) => (
                        <li key={r.reference}>
                          <article class={`node ${r.flags.length ? 'node--flagged' : ''}`}>
                            <p class="label" style="margin-bottom:0.25rem">Stage: {stage}</p>
                            <p class="mono">
                              <Link href={`/console/runs/${r.reference}`}>{r.reference}</Link>
                            </p>
                            <p class="note" style="margin-top:0.35rem">
                              {r.site} · {r.equipment}
                            </p>
                            <p class="mono note">
                              in {formatInt(r.mass_in_g)} g · out {formatInt(r.mass_out_g)} g
                              {r.losses_g !== null ? ` · lost ${formatInt(r.losses_g)} g` : ''}
                            </p>
                            <p style="margin-top:0.5rem;display:flex;gap:0.35rem;flex-wrap:wrap">
                              <State word={r.state} />
                              {!r.within_tolerance ? <State word="outside tolerance" strong /> : null}
                              {r.flags.includes('lapsed_calibration') ? (
                                <State word="lapsed calibration" strong>
                                  <Mark kind="warning" label="" />
                                </State>
                              ) : null}
                            </p>
                          </article>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {recon.data ? (
        <section class="section">
          <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">This moment</h2>
          <p class="note" style="margin-top:0.5rem">
            Read at <span class="mono">{recon.data.read_at}</span>.{' '}
            <Link href="/console/reconciliation">The full reconciliation</Link>.
          </p>
        </section>
      ) : null}
    </div>
  );
}

export function Intake() {
  const batches = useFetch('/batches');
  const collectors = useFetch('/collectors');
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          Feedstock intake
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          A batch resolves its claimability against the collector approval in force on its receipt
          date, never a current flag. Every figure is computed on dry mass.
        </p>
      </section>

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">The batch register</h2>
        {batches.loading ? <Loading what="the batch register" /> : null}
        {batches.error ? <Empty>The batch register could not be loaded.</Empty> : null}
        {batches.data && batches.data.length === 0 ? (
          <Empty>No batch has been booked in yet.</Empty>
        ) : null}
        {batches.data && batches.data.length > 0 ? (
          <div class="scroller" style="margin-top:1rem">
            <table>
              <caption class="visually-hidden">Every batch, with its dry mass and its claimability</caption>
              <thead>
                <tr>
                  <th scope="col">Batch</th>
                  <th scope="col">Collector, as at receipt</th>
                  <th scope="col">Category</th>
                  <th scope="col" class="num">Received</th>
                  <th scope="col" class="num">Net</th>
                  <th scope="col" class="num">Dry mass</th>
                  <th scope="col">Claimable</th>
                  <th scope="col">Flags</th>
                </tr>
              </thead>
              <tbody>
                {batches.data.map((b) => (
                  <tr key={b.reference}>
                    <td class="mono">
                      <Link href={`/console/batches/${b.reference}`}>{b.reference}</Link>
                    </td>
                    <td>{b.collector_name}<br /><span class="note mono">{b.collector}</span></td>
                    <td>{b.category.replace(/_/g, '-')}</td>
                    <td class="num">{b.received_on}</td>
                    <td class="num">{formatInt(b.net_g)} g</td>
                    <td class="num">{formatInt(b.dry_mass_g)} g</td>
                    <td>
                      {b.claimable ? (
                        <State word="claimable" />
                      ) : (
                        <State word="non-claimable" strong>
                          <Mark kind="warning" label="" />
                        </State>
                      )}
                      {!b.claimable ? (
                        <p class="note" style="margin-top:0.35rem">
                          {b.claimable_reason === 'custody_link_missing'
                            ? `This batch cannot be claimed: ${b.missing_custody_kind}.`
                            : `This collector's approval lapsed on ${b.approval_lapsed_on || 'its stated date'}. Material received after that date is processed but not claimed.`}
                        </p>
                      ) : null}
                    </td>
                    <td>
                      {b.flags.length === 0 ? <span class="note">none</span> : (
                        <span style="display:flex;flex-direction:column;gap:0.25rem">
                          {b.flags.map((f) => (
                            <State word={f.replace(/_/g, ' ')} strong key={f}>
                              <Mark kind="warning" label="" />
                            </State>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section class="section">
        <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Collectors and their approvals</h2>
        {collectors.loading ? <Loading what="the collectors" /> : null}
        {collectors.data ? (
          <ul class="grid grid--3" style="margin-top:1rem">
            {collectors.data.map((c) => (
              <li class="card stack-s" key={c.reference}>
                <p class="mono">{c.reference}</p>
                <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">{c.name}</h3>
                <p class="note">
                  {c.country} · registration <span class="mono">{c.registration}</span>, expiring{' '}
                  <span class="mono">{c.registration_expiry}</span>
                </p>
                <ul class="stack-s">
                  {c.approval_periods.map((p) => (
                    <li key={p.reference}>
                      <State word={p.state} strong={p.state !== 'approved'} />{' '}
                      <span class="mono note">{p.valid_from} to {p.valid_to}</span>
                      {p.expiring ? <> <State word="expiring" strong /></> : null}
                      {p.condition ? (
                        <p class="note">
                          Condition: {p.condition}, to be closed by{' '}
                          <span class="mono">{p.condition_closes_on}</span>.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {c.findings.length > 0 ? (
                  <div>
                    <p class="label">Findings</p>
                    {c.findings.map((f) => (
                      <p class="note" key={f.reference}>
                        <State word={f.state} strong={f.state === 'open'} /> {f.detail}
                      </p>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function BatchDetail({ reference }) {
  const batch = useFetch(`/batches/${reference}`, [reference]);
  const impact = useFetch(`/batches/${reference}/impact`, [reference]);
  const b = batch.data;
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Batch</p>
        <h1 class="mono" style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {reference}
        </h1>
      </section>
      {batch.loading ? <Loading what="this batch" /> : null}
      {batch.error ? <Empty>No batch at this address.</Empty> : null}
      {b ? (
        <>
          <section class="section">
            <dl class="stack-s">
              {[
                ['Collector, as at receipt', `${b.collector_name} (${b.collector})`],
                ['Site', b.site],
                ['Category', b.category.replace(/_/g, '-')],
                ['Received on', b.received_on],
                ['Net mass', `${formatInt(b.net_g)} g`],
                ['Moisture', `${b.moisture_bp} bp`],
                ['Dry mass', `${formatInt(b.dry_mass_g)} g`],
                ['Accepted', `${formatInt(b.accepted_g)} g`],
                ['Rejected', `${formatInt(b.rejected_g)} g`],
                ['Weighing device', b.device || '—'],
              ].map(([k, v]) => (
                <div class="balance-figure" key={k}>
                  <dt class="label" style="margin:0">{k}</dt>
                  <dd class="balance-figure__value" style="margin:0">{v}</dd>
                </div>
              ))}
            </dl>
            <p class="note" style="margin-top:0.75rem">
              Dry mass is {b.dry_mass_derivation.rule}, from {formatInt(b.dry_mass_derivation.net_g)} g
              at {b.dry_mass_derivation.moisture_bp} bp.
            </p>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Claimability</h2>
            <p style="margin-top:0.75rem">
              {b.claimable
                ? <State word="claimable" />
                : <State word="non-claimable" strong><Mark kind="warning" label="" /></State>}
            </p>
            {!b.claimable ? (
              <p style="margin-top:0.75rem">
                {b.claimable_reason === 'custody_link_missing'
                  ? `This batch cannot be claimed: ${b.missing_custody_kind}.`
                  : `This collector's approval lapsed on ${b.approval_lapsed_on || 'its stated date'}. Material received after that date is processed but not claimed.`}
              </p>
            ) : null}
            {b.claimable_from && b.claimable_from !== b.received_on ? (
              <p class="note" style="margin-top:0.5rem">
                Claimable forward from <span class="mono">{b.claimable_from}</span>, the date the
                late evidence arrived, rather than from its receipt date.
              </p>
            ) : null}
            <p class="note" style="margin-top:0.5rem">
              The approval in force on {b.received_on} was: {b.approval_state_on_receipt}.
            </p>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Custody</h2>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr><th scope="col">Link</th><th scope="col" class="num">Date</th>
                      <th scope="col">Party</th><th scope="col">Arrived</th></tr>
                </thead>
                <tbody>
                  {b.custody.map((l, i) => (
                    <tr key={i}>
                      <td>{l.kind.replace(/_/g, ' ')}</td>
                      <td class="num">{l.date || '—'}</td>
                      <td>{l.party || '—'}</td>
                      <td>{l.late ? <State word={`late, ${l.arrived_on}`} strong /> : 'at receipt'}</td>
                    </tr>
                  ))}
                  {b.missing_custody_kinds.map((k) => (
                    <tr key={'missing-' + k}>
                      <td>{k.replace(/_/g, ' ')}</td>
                      <td class="num">—</td>
                      <td>—</td>
                      <td><State word="missing" strong><Mark kind="warning" label="" /></State></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Where this batch reached
            </h2>
            <p class="note" style="margin-top:0.5rem">
              The same traversal, backwards. A complete set, never paginated.
            </p>
            {impact.loading ? <Loading what="the reverse traversal" /> : null}
            {impact.data ? (
              impact.data.lots.length === 0 ? (
                <Empty>No lot contains any of this batch yet.</Empty>
              ) : (
                <div class="stack" style="margin-top:1rem">
                  <div>
                    <p class="label">Lots</p>
                    <ul class="stack-s">
                      {impact.data.lots.map((l) => (
                        <li key={l.lot} class="mono">
                          <Link href={`/console/lots/${l.lot}/genealogy`}>{l.lot}</Link>{' '}
                          — {formatInt(l.mass_g)} g of this batch, in a lot of {formatInt(l.lot_mass_g)} g
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p class="label">Certificates resting on those lots</p>
                    {impact.data.certificates.length === 0 ? (
                      <p class="note">No certificate rests on these lots.</p>
                    ) : (
                      <ul class="stack-s">
                        {impact.data.certificates.map((c) => (
                          <li key={c.number + c.version} class="mono">
                            <Link href={`/console/certificates/${c.number}`}>{c.number}</Link>{' '}
                            <State word={c.state} strong={c.state === 'withdrawn'} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p class="label">Recipients</p>
                    {impact.data.recipients.length === 0 ? (
                      <p class="note">No recipient holds a certificate on these lots.</p>
                    ) : (
                      <ul class="stack-s">
                        {impact.data.recipients.map((r) => <li key={r.reference}>{r.name}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function RunDetail({ reference }) {
  const run = useFetch(`/runs/${reference}`, [reference]);
  const r = run.data;
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Run</p>
        <h1 class="mono" style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {reference}
        </h1>
      </section>
      {run.loading ? <Loading what="this run" /> : null}
      {run.error ? <Empty>No run at this address.</Empty> : null}
      {r ? (
        <>
          <section class="section">
            <p style="display:flex;gap:0.5rem;flex-wrap:wrap">
              <State word={r.state} />
              <State word={r.run_type} />
              {!r.within_tolerance ? <State word="outside tolerance" strong /> : null}
              {r.queued ? <State word="queued" strong /> : null}
            </p>
            <dl class="stack-s" style="margin-top:1.5rem">
              {[
                ['Site', r.site], ['Equipment', r.equipment],
                ['Recipe version', r.recipe_version], ['Operator', r.operator],
                ['Mass in', `${formatInt(r.mass_in_g)} g`],
                ['Mass out', `${formatInt(r.mass_out_g)} g`],
                ['Losses', r.losses_g === null ? 'not yet computed' : `${formatInt(r.losses_g)} g`],
              ].map(([k, v]) => (
                <div class="balance-figure" key={k}>
                  <dt class="label" style="margin:0">{k}</dt>
                  <dd class="balance-figure__value" style="margin:0">{v}</dd>
                </div>
              ))}
            </dl>
            <p class="note" style="margin-top:0.75rem">
              Losses are {r.losses_derivation.rule}. Losses reduce the claim.
            </p>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Set points achieved against the recipe
            </h2>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr><th scope="col">Parameter</th><th scope="col" class="num">Achieved</th>
                      <th scope="col" class="num">Band</th><th scope="col">Within</th></tr>
                </thead>
                <tbody>
                  {r.tolerance_detail.map((t) => (
                    <tr key={t.parameter}>
                      <td>{t.parameter.replace(/_/g, ' ')}</td>
                      <td class="num">{t.actual}</td>
                      <td class="num">{t.min} to {t.max}</td>
                      <td>
                        <State word={t.within ? 'within tolerance' : 'outside tolerance'}
                               strong={!t.within} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Consumptions</h2>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr><th scope="col">Reference</th><th scope="col">Input</th>
                      <th scope="col" class="num">Mass</th><th scope="col" class="num">Effective</th></tr>
                </thead>
                <tbody>
                  {r.consumptions.map((c) => (
                    <tr key={c.reference}>
                      <td class="mono">{c.reference}</td>
                      <td class="mono">{c.input_ref}</td>
                      <td class="num">{formatInt(c.mass_g)} g</td>
                      <td class="num">{c.effective_on}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">Outputs</h2>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr><th scope="col">Reference</th><th scope="col">Kind</th>
                      <th scope="col" class="num">Mass</th><th scope="col">Disposition</th></tr>
                </thead>
                <tbody>
                  {r.outputs.map((o) => (
                    <tr key={o.reference}>
                      <td class="mono">{o.reference}</td>
                      <td>{o.kind}</td>
                      <td class="num">{formatInt(o.mass_g)} g</td>
                      <td>{o.disposition || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
