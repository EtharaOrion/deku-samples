import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { Link, navigate } from '../lib/router.jsx';
import { ConsoleGate } from './guard.jsx';
import { fmtG, fmtBp, fmtBpShort, fmtDate, claimWord, fmtMg, fmtKg } from '../lib/ui.jsx';

const STAGES = ['dissolution', 'depolymerisation', 'purification', 'repolymerisation'];
const stageWord = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function Board() {
  const [runs, setRuns] = useState(null);
  const [sites, setSites] = useState(null);
  useEffect(() => {
    api('/api/runs').then((r) => setRuns(r.body || []));
    api('/api/sites').then((r) => setSites(r.body || []));
  }, []);
  const byStage = (st) => (runs || []).filter((r) => r.run_type === st);
  return (
    <ConsoleGate title="Console board | Ravel" description="One column per process stage, one card per run.">
      <h1>The board</h1>
      <p class="dep">One column per process stage, one card per run. The column a card sits in is named on the card. The product records what a run did, after the run.</p>
      {runs === null && <p class="loading-words">The runs are loading.</p>}
      {runs !== null && runs.length === 0 && <p class="empty-words">There are no runs recorded.</p>}
      <div class="board">
        {STAGES.map((st) => (
          <section key={st} aria-labelledby={`col-${st}`}>
            <h4 id={`col-${st}`}>{stageWord(st)}</h4>
            {byStage(st).length === 0 && <p class="empty-words small">No runs at this stage.</p>}
            {byStage(st).map((r) => (
              <article class="run-card" key={r.reference}>
                <p class="stage">{stageWord(st)}</p>
                <p><Link href={`/console/lots`}><span class="ref">{r.reference}</span></Link></p>
                <dl class="kv">
                  <dt>State</dt><dd><span class="state-word">{r.state}</span></dd>
                  <dt>Site</dt><dd class="ref">{r.site}</dd>
                  <dt>Recipe</dt><dd class="ref">{r.recipe_version}</dd>
                  <dt>Mass in</dt><dd class="num">{fmtG(r.mass_in_g)}</dd>
                  <dt>Mass out</dt><dd class="num">{fmtG(r.mass_out_g)}</dd>
                  <dt>Losses</dt><dd class="num">{r.losses_g == null ? '—' : fmtG(r.losses_g)}</dd>
                </dl>
                {r.within_tolerance === false && <p class="flag">outside tolerance</p>}
              </article>
            ))}
          </section>
        ))}
      </div>
      {sites && (
        <section class="measure">
          <h3>Sites</h3>
          <div class="table-wrap card">
            <table>
              <thead><tr><th>Site</th><th>Confidence</th><th>Certification</th></tr></thead>
              <tbody>{sites.map((s) => (
                <tr key={s.reference}>
                  <td class="ref">{s.reference} {s.name}</td>
                  <td>{s.confidence}</td>
                  <td>{s.certification_state === 'suspended' ? <span class="state-word">suspended</span> : s.certification_state}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </ConsoleGate>
  );
}

export function Intake() {
  const [batches, setBatches] = useState(null);
  const [collectors, setCollectors] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => { api('/api/batches').then((r) => setBatches(r.body || [])); api('/api/collectors').then((r) => setCollectors(r.body || [])); };
  useEffect(load, []);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    const f = new FormData(e.currentTarget);
    const custody = [
      { kind: 'collection_site', date: f.get('received_on'), party: f.get('collector') },
      { kind: 'collector', date: f.get('received_on'), party: f.get('collector') },
      { kind: 'transport', date: f.get('received_on'), party: f.get('transport') || 'TFR-Nord' },
      { kind: 'arrival', date: f.get('received_on'), party: 'Ravel' },
      { kind: 'weighing', date: f.get('received_on'), party: 'Ravel' },
      { kind: 'acceptance', date: f.get('received_on'), party: 'Ravel' }
    ];
    const net = Number(f.get('gross_g')) - Number(f.get('tare_g'));
    const body = {
      collector: f.get('collector'), site: f.get('site'), category: f.get('category'),
      gross_g: Number(f.get('gross_g')), tare_g: Number(f.get('tare_g')), net_g: net,
      moisture_bp: Number(f.get('moisture_bp')), moisture_method: f.get('moisture_method'),
      device: f.get('device'), received_on: f.get('received_on'),
      composition: { polymer: 'PA6', fraction_bp: Number(f.get('fraction_bp') || 9000), basis: 'declared' },
      contamination: { non_nylon_bp: 0, elastane_bp: 0, coatings: 'none', colour_load: 'low', foreign_matter: 'none' },
      custody
    };
    const r = await api('/api/batches', { method: 'POST', body, idempotencyKey: 'batch-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) });
    setBusy(false);
    if (r.ok) {
      setBanner({ kind: 'ok', text: `Batch ${r.body.reference} booked in. Dry mass ${fmtG(r.body.dry_mass_g)}. Claimable: ${r.body.claimable ? 'yes' : 'no — ' + r.body.claimable_reason}.`, ref: r.body.reference });
      load();
    } else {
      setBanner({ kind: 'bad', text: (r.body && (r.body.message || r.body.error)) || 'The batch was not booked in.' });
    }
  }
  return (
    <ConsoleGate title="Intake | Ravel" description="Feedstock arrival: book in a batch.">
      <h1>Feedstock intake</h1>
      {banner && banner.kind === 'ok' && (
        <div class="banner" role="status">
          <p class="banner-title">Batch {banner.ref} booked in.</p>
          <p>{banner.text}</p>
        </div>
      )}
      {banner && banner.kind === 'bad' && (
        <div class="banner" role="alert">
          <p class="banner-title">The batch was refused.</p>
          <p>{banner.text}</p>
        </div>
      )}
      <form class="stack" onSubmit={onSubmit}>
        <label>Collector
          <select name="collector" required>
            {(collectors || []).map((c) => <option value={c.reference}>{c.reference} — {c.name}</option>)}
          </select>
        </label>
        <label>Site
          <select name="site" required>
            <option value="SITE-DEMO">SITE-DEMO</option>
            <option value="SITE-PILOT">SITE-PILOT</option>
          </select>
        </label>
        <label>Category <span class="hint">Required. Has no default. Cannot be changed after acceptance.</span>
          <select name="category" required>
            <option value="">Choose a category</option>
            <option value="post_consumer">post_consumer</option>
            <option value="pre_consumer">pre_consumer</option>
          </select>
        </label>
        <label>Gross, g <input type="number" name="gross_g" required min="1" /></label>
        <label>Tare, g <input type="number" name="tare_g" required min="0" /></label>
        <label>Moisture, basis points <input type="number" name="moisture_bp" required min="0" max="10000" value="0" /></label>
        <label>Moisture method <input type="text" name="moisture_method" required value="ISO 15512" /></label>
        <label>Weighing device
          <select name="device" required>
            <option value="WB-DEMO-01">WB-DEMO-01</option>
            <option value="WB-DEMO-02">WB-DEMO-02</option>
          </select>
        </label>
        <label>Received on <input type="date" name="received_on" required /></label>
        <label>Declared polymer fraction, basis points <input type="number" name="fraction_bp" min="0" max="10000" value="9000" /></label>
        <button class="btn" type="submit" disabled={busy}>{busy ? 'Booking in…' : 'Book in the batch'}</button>
      </form>
      <section>
        <h3>The batch register</h3>
        {batches === null && <p class="loading-words">The batches are loading.</p>}
        {batches && batches.length === 0 && <p class="empty-words">No batches have been booked in.</p>}
        {batches && batches.length > 0 && (
          <div class="table-wrap card">
            <table>
              <thead><tr><th>Batch</th><th>Collector</th><th>Category</th><th>Received</th><th class="num">Net</th><th class="num">Dry mass</th><th>Claimable</th><th>Reason / flags</th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.reference}>
                    <td class="ref">{b.reference}</td>
                    <td>{b.collector_name || b.collector}</td>
                    <td>{b.category}</td>
                    <td class="num">{fmtDate(b.received_on)}</td>
                    <td class="num">{fmtG(b.net_g)}</td>
                    <td class="num">{fmtG(b.dry_mass_g)}</td>
                    <td>{b.claimable ? 'claimable' : <span class="state-word">non-claimable</span>}</td>
                    <td>{b.claimable_reason || '—'} {(b.flags || []).map((f) => <span class="flag">{f} </span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ConsoleGate>
  );
}

export function RecordView() {
  const [entries, setEntries] = useState(null);
  const [check, setCheck] = useState(null);
  useEffect(() => {
    api('/api/record').then((r) => setEntries(r.body || []));
    api('/api/record/check').then((r) => setCheck(r.body));
  }, []);
  return (
    <ConsoleGate title="The record | Ravel" description="Every act is an entry with a person, a moment, a site and an object.">
      <h1>The record</h1>
      {check && (
        <p class="dep">
          Chain: <strong>{check.holds ? 'holds' : 'broken'}</strong>
          {check.first_failure ? ` — first failure at seq ${check.first_failure.seq} (${check.first_failure.reason})` : ` — ${check.length} entries`}
        </p>
      )}
      {entries === null && <p class="loading-words">The record is loading.</p>}
      {entries && entries.length === 0 && <p class="empty-words">The record is empty.</p>}
      {entries && entries.length > 0 && (
        <div class="table-wrap card">
          <table>
            <thead><tr><th class="num">Seq</th><th>Act</th><th>Object</th><th>Person</th><th>Site</th><th>At</th><th>Digest</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.seq}>
                  <td class="num">{e.seq}</td>
                  <td>{e.kind}</td>
                  <td class="ref">{e.object_ref || '—'}</td>
                  <td class="ref">{e.actor || '—'}</td>
                  <td class="ref">{e.site || '—'}</td>
                  <td class="num">{fmtDate(e.recorded_at)}</td>
                  <td class="ref">{e.content_deleted ? 'content deleted under retention' : e.digest.slice(0, 12) + '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleGate>
  );
}

export function Reconciliation() {
  const [data, setData] = useState(null);
  const [runs, setRuns] = useState(null);
  useEffect(() => {
    api('/api/reconciliation').then((r) => setData(r.body));
    api('/api/runs').then((r) => setRuns(r.body || []));
  }, []);
  return (
    <ConsoleGate title="Reconciliation | Ravel" description="Six figures rather than six verdicts.">
      <h1>Reconciliation</h1>
      {data === null && <p class="loading-words">The six figures are loading.</p>}
      {data && (
        <>
          <p class="dep">Read at {data.read_at}. These are figures expected to be non-zero; none is a badge.</p>
          <div class="console-grid">
            <div class="card">
              <p class="eyebrow">Mass balance residual</p>
              <p class="big num">{fmtG(data.mass_balance_residual_g)}</p>
              <p class="dep">{data.derivation.mass_balance_residual_g}</p>
            </div>
            <div class="card">
              <p class="eyebrow">Credit margin</p>
              <p class="big num">{fmtG(data.credit_margin_g)}</p>
              <p class="dep">{data.derivation.credit_margin_g}</p>
            </div>
            <div class="card">
              <p class="eyebrow">Consumptions on open runs</p>
              <p class="big num">{data.consumptions_on_open_runs}</p>
            </div>
            <div class="card">
              <p class="eyebrow">Batches with broken custody</p>
              <p class="big num">{data.batches_with_broken_custody}</p>
              <p class="dep">{data.derivation.batches_with_broken_custody}</p>
            </div>
            <div class="card">
              <p class="eyebrow">Certificates with superseded figures</p>
              <p class="big num">{data.certificates_with_superseded_figures}</p>
            </div>
            <div class="card">
              <p class="eyebrow">Integration ages, hours</p>
              <dl class="kv">
                {Object.entries(data.integration_ages).map(([k, v]) => (
                  <><dt>{k}</dt><dd class="num">{v === null ? 'never sent (null)' : v}</dd></>
                ))}
              </dl>
            </div>
          </div>
          <section>
            <h3>The runs behind the residual</h3>
            {runs && (
              <div class="table-wrap card">
                <table>
                  <thead><tr><th>Run</th><th>Stage</th><th>State</th><th class="num">In</th><th class="num">Out</th><th class="num">Losses</th></tr></thead>
                  <tbody>{runs.map((r) => (
                    <tr key={r.reference}>
                      <td class="ref">{r.reference}</td><td>{r.run_type}</td>
                      <td><span class="state-word">{r.state}</span></td>
                      <td class="num">{fmtG(r.mass_in_g)}</td><td class="num">{fmtG(r.mass_out_g)}</td>
                      <td class="num">{r.losses_g == null ? '—' : fmtG(r.losses_g)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </ConsoleGate>
  );
}

export function Balance({ params }) {
  const id = params[0];
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api(`/api/balance-periods/${id}`).then((r) => setData(r.ok ? r.body : null));
  useEffect(() => { load(); }, [id]);

  async function allocate(e) {
    e.preventDefault();
    setBusy(true);
    setBanner(null);
    const f = new FormData(e.currentTarget);
    const body = { lot: f.get('lot'), category: f.get('category'), mass_g: Number(f.get('mass_g')) };
    const r = await api(`/api/balance-periods/${id}/allocations`, {
      method: 'POST', body,
      idempotencyKey: `alloc-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    });
    setBusy(false);
    if (r.ok) {
      setBanner({ kind: 'ok', text: `Allocation made: ${fmtG(body.mass_g)} of ${body.category} claim attached to ${body.lot}. Content is now ${fmtBpShort(r.body.content_bp)}.` });
      load();
    } else {
      const b = r.body || {};
      setBanner({
        kind: 'bad',
        text: b.available_g != null
          ? `This allocation is refused. Available: ${b.available_g} g. Requested: ${b.requested_g} g.`
          : (b.message || 'The allocation was refused.')
      });
    }
  }

  if (data === null) {
    return <ConsoleGate><h1>Balance period</h1><p class="loading-words">The ledger is loading.</p></ConsoleGate>;
  }
  return (
    <ConsoleGate title={`Balance ${id} | Ravel`} description="Credits in, credits out, credits available, per category.">
      <h1>Balance <span class="ref">{id}</span></h1>
      <p class="dep">
        {data.site} — grade {data.grade} — {data.period.from} to {data.period.to} —
        state <strong>{data.state === 'closed' ? 'closed' : 'open'}</strong>
        {data.state === 'closed' && ` on ${fmtDate(data.closed_on)}, cut-off ${fmtDate(data.cut_off)}`}
      </p>
      {banner && banner.kind === 'ok' && <div class="banner" role="status"><p class="banner-title">Allocation made.</p><p>{banner.text}</p></div>}
      {banner && banner.kind === 'bad' && (
        <div class="banner" role="alert">
          <p class="banner-title">This allocation is refused.</p>
          <p>{banner.text}</p>
        </div>
      )}
      {data.state === 'closed' && (
        <div class="banner" role="status"><p class="banner-title">This period is closed. Corrections require a restatement.</p></div>
      )}
      <section>
        <h3>Credits per category</h3>
        <div class="console-grid">
          {['post_consumer', 'pre_consumer'].map((cat) => (
            <div class="card" key={cat}>
              <p class="eyebrow">{cat.replace(/_/g, ' ')}</p>
              <dl class="kv">
                <dt>Credits in</dt><dd class="num">{fmtG(data[cat].credits_in_g)}</dd>
                <dt>Credits out</dt><dd class="num">{fmtG(data[cat].credits_out_g)}</dd>
                <dt>Credits available</dt><dd class="big num">{fmtG(data[cat].credits_available_g)}</dd>
              </dl>
            </div>
          ))}
        </div>
        <p class="dep">The two categories are never netted. The margin is a mass, not a state.</p>
      </section>
      <section>
        <h3>Counts</h3>
        <dl class="kv">
          <dt>Overrides this period</dt><dd class="num">{data.override_count}</dd>
          <dt>Open restatements</dt><dd class="num">{data.open_restatement_count}</dd>
          <dt>Open findings</dt><dd class="num">{data.open_finding_count}</dd>
          <dt>Non-claimable input</dt><dd class="num">{fmtG(data.non_claimable_input_g)}</dd>
          <dt>Carry-over limit</dt><dd class="num">{fmtBpShort(data.carry_over_limit_bp)}</dd>
          {data.state === 'closed' && (<>
            <dt>Carried forward</dt><dd class="num">{Object.entries(data.carried_forward_g || {}).map(([k, v]) => `${k} ${v} g`).join(', ')}</dd>
            <dt>Expired</dt><dd class="num">{Object.entries(data.expired_g || {}).map(([k, v]) => `${k} ${v} g`).join(', ')}</dd>
          </>)}
        </dl>
      </section>
      <section>
        <h3>Conversion factors in force</h3>
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Reference</th><th class="num">Factor</th><th>Window</th><th>Provisional</th></tr></thead>
            <tbody>
              {data.conversion_factors.map((f) => (
                <tr key={f.reference}>
                  <td class="ref">{f.reference}</td>
                  <td class="num">{fmtBpShort(f.factor_bp)}</td>
                  <td>{f.derivation_window ? `${f.derivation_window.from} to ${f.derivation_window.to} (${f.derivation_window.in_g} g in, ${f.derivation_window.out_g} g out)` : 'no window'}</td>
                  <td>{f.provisional ? <span class="state-word">provisional</span> : 'derived'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h3>The movements behind the balance</h3>
        <div class="table-wrap card">
          <table>
            <thead><tr><th class="num">Id</th><th>Kind</th><th>Direction</th><th>Category</th><th class="num">Mass</th><th>Object</th><th>Effective on</th></tr></thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td class="num">{m.id}</td>
                  <td>{m.kind}{m.kind === 'transfer_in' ? ` (origin ${m.origin_site})` : ''}</td>
                  <td>{m.direction}</td>
                  <td>{m.category}</td>
                  <td class="num">{fmtG(m.mass_g)}</td>
                  <td class="ref">{m.lot || m.movement_ref || '—'}</td>
                  <td class="num">{fmtDate(m.effective_on)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="dep">{data.derivation.description} {data.derivation.credit_rule}. {data.derivation.dry_mass_rule}.</p>
      </section>
      {data.state === 'open' && (
        <section>
          <h3>Attach claim to a lot</h3>
          <form class="stack" onSubmit={allocate}>
            <label>Lot <input type="text" name="lot" required placeholder="LOT-N6-0001" /></label>
            <label>Category
              <select name="category" required>
                <option value="post_consumer">post_consumer</option>
                <option value="pre_consumer">pre_consumer</option>
              </select>
            </label>
            <label>Mass, g <input type="number" name="mass_g" required min="1" /></label>
            <button class="btn" type="submit" disabled={busy}>{busy ? 'Attaching…' : 'Attach the claim'}</button>
          </form>
        </section>
      )}
      {data.state === 'open' && <p class="dep">There is no input control on the figures above. Every figure links to the movements it came from.</p>}
    </ConsoleGate>
  );
}

function NodeCard({ node }) {
  const split = Object.entries(node.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', ');
  return (
    <div class="gen-node">
      <p><span class="ref">{node.reference}</span> <span class="dep">{node.kind}</span></p>
      <p class="num">Mass {fmtG(node.mass_g)}{split ? ` — ${split}` : ''}</p>
      {(node.flags || []).length > 0 && <p class="flag">{node.flags.join(', ')}</p>}
    </div>
  );
}

function GenList({ items }) {
  return (
    <div>
      {items.map((n, i) => (
        <div key={i}>
          <NodeCard node={n} />
          {n.to && n.to.length > 0 && <div class="gen-children"><GenList items={n.to} /></div>}
        </div>
      ))}
    </div>
  );
}

export function Genealogy({ params }) {
  const ref = params[0];
  const isLot = ref.startsWith('LOT-');
  const [data, setData] = useState(null);
  const [certs, setCerts] = useState(null);
  useEffect(() => {
    api(isLot ? `/api/lots/${ref}/genealogy` : `/api/batches/${ref}/impact`).then((r) => setData(r.ok ? r.body : { error: r.body }));
  }, [ref]);
  const exportUrl = isLot ? `/api/lots/${ref}/genealogy` : `/api/batches/${ref}/impact`;
  return (
    <ConsoleGate title={`Genealogy of ${ref} | Ravel`} description="A graph, not a tree: the same facts as a graph and as a nested list.">
      <h1>Genealogy of <span class="ref">{ref}</span></h1>
      <p class="dep">A batch reached by several paths appears once with its total mass. Both directions carry the same facts as a nested list.</p>
      {data === null && <p class="loading-words">The traversal is running.</p>}
      {data && data.error && <div class="banner" role="alert"><p class="banner-title">The traversal was refused.</p><p>{data.error.message || 'There is no such record.'}</p></div>}
      {data && !data.error && (
        <>
          <p class="dep">Flagged anywhere in the graph: <strong>{data.flagged ? 'yes — see the words on the nodes' : 'no'}</strong>. <a href={exportUrl}>Export this traversal as JSON</a>.</p>
          <section>
            <h3>The graph</h3>
            <div class="console-grid">
              {(data.nodes || []).map((n) => <NodeCard key={n.reference} node={n} />)}
            </div>
            <h4>Edges</h4>
            <div class="table-wrap card">
              <table>
                <thead><tr><th>From</th><th>To</th><th class="num">Mass</th></tr></thead>
                <tbody>{(data.edges || []).map((e, i) => (
                  <tr key={i}><td class="ref">{e.from}</td><td class="ref">{e.to}</td><td class="num">{fmtG(e.mass_g)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section>
            <h3>The same facts as a nested list</h3>
            <GenList items={data.text_equivalent || []} />
          </section>
          {!isLot && data.lots && (
            <section>
              <h3>Every lot containing any of it</h3>
              {data.lots.length === 0 && <p class="empty-words">This batch reaches no lot.</p>}
              {data.lots.length > 0 && (
                <div class="table-wrap card">
                  <table>
                    <thead><tr><th>Lot</th><th class="num">Mass</th><th>Disposition</th><th>Site</th></tr></thead>
                    <tbody>{data.lots.map((l) => (
                      <tr key={l.reference}><td class="ref">{l.reference}</td><td class="num">{fmtG(l.mass_g)}</td>
                        <td><span class="state-word">{l.disposition}</span></td><td class="ref">{l.site}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <h3>Certificates resting on those lots</h3>
              {(!data.certificates || data.certificates.length === 0) && <p class="empty-words">No certificate rests on these lots.</p>}
              {data.certificates && data.certificates.length > 0 && (
                <div class="table-wrap card">
                  <table>
                    <thead><tr><th>Certificate</th><th>State</th><th>Recipient</th><th>Claim type</th><th class="num">Content</th></tr></thead>
                    <tbody>{data.certificates.map((c) => (
                      <tr key={c.number}>
                        <td class="ref">{c.number}</td>
                        <td>{c.state === 'withdrawn' ? <span class="state-word">withdrawn</span> : c.state}</td>
                        <td>{c.recipient_name}</td>
                        <td>{claimWord(c.claim_type)}</td>
                        <td class="num">{fmtBpShort(c.content_bp)} <span class="dep">({claimWord(c.claim_type)})</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              <h3>Recipients</h3>
              <ul>{(data.recipients || []).map((r2) => <li key={r2.reference}>{r2.name} <span class="ref">{r2.reference}</span></li>)}</ul>
            </section>
          )}
        </>
      )}
    </ConsoleGate>
  );
}

export function LotView({ params }) {
  const ref = params[0];
  const [lot, setLot] = useState(null);
  const [carbon, setCarbon] = useState(null);
  const [yieldData, setYield] = useState(null);
  const [banner, setBanner] = useState(null);
  const load = () => {
    api(`/api/lots/${ref}`).then((r) => setLot(r.ok ? r.body : { error: r.body }));
    api(`/api/lots/${ref}/carbon`).then((r) => setCarbon(r.ok ? r.body : null));
    api(`/api/lots/${ref}/yield`).then((r) => setYield(r.ok ? r.body : null));
  };
  useEffect(load, [ref]);
  return (
    <ConsoleGate title={`Lot ${ref} | Ravel`} description="A lot and everything that supports its claim.">
      <h1>Lot <span class="ref">{ref}</span></h1>
      {banner && <div class="banner" role={banner.kind === 'ok' ? 'status' : 'alert'}><p class="banner-title">{banner.kind === 'ok' ? 'Act recorded.' : 'Act refused.'}</p><p>{banner.text}</p></div>}
      {lot === null && <p class="loading-words">The lot is loading.</p>}
      {lot && lot.error && <div class="banner" role="alert"><p class="banner-title">No such lot.</p><p>{(lot.error && lot.error.message) || ''}</p></div>}
      {lot && !lot.error && (
        <>
          <dl class="kv">
            <dt>Site</dt><dd class="ref">{lot.site}</dd>
            <dt>Grade</dt><dd class="ref">{lot.grade}</dd>
            <dt>Mass</dt><dd class="num">{fmtG(lot.mass_g)}</dd>
            <dt>Disposition</dt><dd><span class="state-word">{lot.disposition}</span></dd>
            <dt>Claim type</dt><dd>{claimWord(lot.claim_type)}</dd>
            <dt>Recycled content</dt><dd><span class="num">{fmtBpShort(lot.content_bp)}</span> <span class="dep">({claimWord(lot.claim_type)})</span></dd>
            <dt>Credit attached</dt><dd class="num">{fmtG(lot.credit_attached.post_consumer + lot.credit_attached.pre_consumer)} <span class="dep">({lot.credit_attached.post_consumer} g post-consumer, {lot.credit_attached.pre_consumer} g pre-consumer)</span></dd>
            <dt>Produced by</dt><dd class="ref">{lot.produced_by || '—'}</dd>
          </dl>
          <p class="dep">{lot.derivation.content_bp}.</p>
          {lot.overrides && lot.overrides.length > 0 && (
            <div class="banner" role="status">
              <p class="banner-title">Separation overridden on this lot.</p>
              {lot.overrides.map((o) => (
                <p>Separation overridden by {o.authorised_by} on {fmtDate(o.authorised_on)}. This cannot be removed. Reviewed: {o.reviewed ? 'yes' : 'no — unreviewed'}.</p>
              ))}
            </div>
          )}
          {lot.deviations && lot.deviations.length > 0 && (
            <div class="banner" role="status">
              <p class="banner-title">Deviations touching this lot.</p>
              {lot.deviations.map((d) => <p>{d.reference} — {d.state === 'open' ? <span class="state-word">open</span> : 'closed'}</p>)}
            </div>
          )}
          <section>
            <h3>Carbon</h3>
            {carbon && (
              <>
                <p class="figure-block">
                  <span class="big num">{fmtMg(carbon.value_mg_per_kg)}</span>
                  <span class="dep">Boundary {carbon.boundary} — method version {carbon.method_version} — uncertainty {carbon.uncertainty_bp} basis points</span>
                </p>
                <p class="dep">
                  {carbon.default_led ? 'This figure is default led: primary data below the threshold.' : 'This figure is not labelled default led.'}
                  {' '}Primary share {fmtBpShort(carbon.primary_share_bp)}. Comparator: {carbon.comparator.material} from dataset {carbon.comparator.dataset} ({carbon.comparator.dataset_year}, {carbon.comparator.region}).
                  {carbon.value_mg_per_kg < 4260000 ? ` This figure is lower than ${carbon.comparator.material}, by name.` : ''}
                </p>
                <h4>Breakdown</h4>
                <div class="table-wrap card">
                  <table>
                    <thead><tr><th>Line</th><th class="num">mg/kg</th><th>Tag</th></tr></thead>
                    <tbody>{carbon.breakdown.map((b) => (
                      <tr key={b.line}><td>{b.line}</td><td class="num">{b.mg_per_kg.toLocaleString('en-GB')}</td><td>{b.tag}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {carbon.energy && (
                  <>
                    <h4>Energy</h4>
                    <dl class="kv">
                      <dt>Location-based</dt><dd class="num">{fmtMg(carbon.energy.energy_location_mg_per_kg)}</dd>
                      <dt>Market-based</dt><dd class="num">{fmtMg(carbon.energy.energy_market_mg_per_kg)}</dd>
                      <dt>Metered</dt><dd class="num">{carbon.energy.metered_kwh == null ? '—' : carbon.energy.metered_kwh.toLocaleString('en-GB') + ' kWh'}</dd>
                      <dt>Retired</dt><dd class="num">{carbon.energy.retired_kwh == null ? '—' : carbon.energy.retired_kwh.toLocaleString('en-GB') + ' kWh'}</dd>
                      <dt>Unmatched</dt><dd class="num">{carbon.energy.unmatched_kwh == null ? '—' : carbon.energy.unmatched_kwh.toLocaleString('en-GB') + ' kWh'}</dd>
                    </dl>
                  </>
                )}
              </>
            )}
            {!carbon && <p class="empty-words">There is no carbon figure for this lot.</p>}
          </section>
          <section>
            <h3>Test results</h3>
            {(!lot.test_results || lot.test_results.length === 0) && <p class="empty-words">There are no test results on this lot.</p>}
            {lot.test_results && lot.test_results.length > 0 && (
              <div class="table-wrap card">
                <table>
                  <thead><tr><th>Property</th><th>Method</th><th class="num">Value</th><th>Unit</th><th>Usable for release</th></tr></thead>
                  <tbody>{lot.test_results.map((t, i) => (
                    <tr key={i}>
                      <td>{t.property}</td><td>{t.method}</td>
                      <td class="num">{t.value}</td><td>{t.unit}</td>
                      <td>{t.usable_for_release ? 'yes' : <span class="state-word">no — method mismatch</span>}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <h3>Genealogy</h3>
            <p><Link class="btn-quiet" href={`/console/lots/${ref}/genealogy`}>Open the genealogy of this lot</Link></p>
          </section>
          {yieldData && (
            <section>
              <h3>Yield</h3>
              <p class="figure-block">
                <span class="num">{fmtBpShort(yieldData.yield_bp)}</span>
                <span class="dep">{yieldData.derivation.description}. A yield figure appears on no certificate and in no verification answer.</span>
              </p>
            </section>
          )}
        </>
      )}
    </ConsoleGate>
  );
}

export function Deviations() {
  const [items, setItems] = useState(null);
  const [banner, setBanner] = useState(null);
  const load = () => api('/api/deviations').then((r) => setItems(r.body || []));
  useEffect(load, []);
  async function close(ref, outcome) {
    const r = await api(`/api/deviations/${ref}/close`, { method: 'POST', body: { outcome }, idempotencyKey: `dev-${ref}-${Date.now()}` });
    if (r.ok) setBanner({ kind: 'ok', text: `Deviation ${ref} closed with outcome ${outcome}. Both outcomes are honest and neither is hidden.` });
    else setBanner({ kind: 'bad', text: (r.body && r.body.message) || 'The deviation was not closed.' });
    load();
  }
  return (
    <ConsoleGate title="Deviations | Ravel" description="Raised and closed deviations, with honest outcomes.">
      <h1>Deviations</h1>
      {banner && <div class="banner" role={banner.kind === 'ok' ? 'status' : 'alert'}><p class="banner-title">{banner.kind === 'ok' ? 'Closed.' : 'Refused.'}</p><p>{banner.text}</p></div>}
      {items === null && <p class="loading-words">The deviations are loading.</p>}
      {items && items.length === 0 && <p class="empty-words">There are no deviations.</p>}
      {items && items.length > 0 && (
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Reference</th><th>State</th><th>Subjects</th><th>Raised by</th><th>Outcome</th><th>Close</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.reference}>
                  <td class="ref">{d.reference}</td>
                  <td>{d.state === 'open' ? <span class="state-word">open</span> : 'closed'}</td>
                  <td>{(d.subjects || []).join(', ')}</td>
                  <td class="ref">{d.raised_by}</td>
                  <td>{d.outcome || '—'}</td>
                  <td>
                    {d.state === 'open' && (
                      <>
                        <button class="btn-quiet" onClick={() => close(d.reference, 'root_cause_found')}>Close: root cause found</button>{' '}
                        <button class="btn-quiet" onClick={() => close(d.reference, 'cause_not_established')}>Close: cause not established</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleGate>
  );
}

export function Overrides() {
  const [items, setItems] = useState(null);
  const [banner, setBanner] = useState(null);
  const load = () => api('/api/overrides').then((r) => setItems(r.body || []));
  useEffect(load, []);
  async function review(ref) {
    const r = await api(`/api/overrides/${ref}/review`, { method: 'POST', body: {}, idempotencyKey: `ovr-${ref}-${Date.now()}` });
    if (r.ok) setBanner({ kind: 'ok', text: `Override ${ref} reviewed by ${r.body.reviewed_by}. A review sets reviewed true and removes nothing.` });
    else setBanner({ kind: 'bad', text: (r.body && r.body.message) || 'The review was refused.' });
    load();
  }
  return (
    <ConsoleGate title="Overrides | Ravel" description="A broken separation, recorded permanently and reviewed by a second person.">
      <h1>Overrides</h1>
      {banner && <div class="banner" role={banner.kind === 'ok' ? 'status' : 'alert'}><p class="banner-title">{banner.kind === 'ok' ? 'Reviewed.' : 'Refused.'}</p><p>{banner.text}</p></div>}
      {items === null && <p class="loading-words">The overrides are loading.</p>}
      {items && items.length === 0 && <p class="empty-words">There are no overrides.</p>}
      {items && items.length > 0 && (
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Reference</th><th>Separation</th><th>Lot</th><th>Authorised by</th><th>On</th><th>Reviewed</th><th></th></tr></thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.reference}>
                  <td class="ref">{o.reference}</td>
                  <td>{o.separation}</td>
                  <td class="ref">{o.lot}</td>
                  <td class="ref">{o.authorised_by}</td>
                  <td class="num">{fmtDate(o.authorised_on)}</td>
                  <td>{o.reviewed ? 'reviewed' : <span class="state-word">unreviewed</span>}</td>
                  <td>{!o.reviewed && <button class="btn-quiet" onClick={() => review(o.reference)}>Review it</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p class="dep">An override names the separation broken, a reason of at least forty characters and its authoriser. It is permanent, shows on the lot for its life, is counted on the balance screen, and blocks signing until a second person reviews it.</p>
    </ConsoleGate>
  );
}

const CONDITION_ORDER = [
  ['lot_released', 'The lot is released.'],
  ['no_open_deviation', 'No deviation touching the lot is open.'],
  ['no_unreviewed_override', 'No override on the lot is unreviewed.'],
  ['period_closed', 'The bookkeeping period is closed.'],
  ['balance_invariant_holds', 'The balance invariant holds with the allocation applied.'],
  ['carbon_figure_complete', 'The carbon figure exists with all four components.'],
  ['signer_scope', 'The signer holds signing scope for that site on the date of signing.'],
  ['signer_not_data_enterer', 'The signer did not enter the data.']
];

function ConditionsList({ conditions }) {
  const byKey = Object.fromEntries((conditions || []).map((c) => [c.condition, c]));
  return (
    <div class="wizard-conditions">
      {CONDITION_ORDER.map(([key, text]) => {
        const c = byKey[key];
        const state = !c ? 'Not yet checked' : (c.satisfied ? 'Satisfied' : 'Blocking');
        return (
          <div class="condition" key={key}>
            <span class="mark">{state}</span>
            <span>
              {text}{' '}
              {c && !c.satisfied && (
                <span>
                  {c.detail && c.detail.blocking_text ? `Blocked by: ${c.detail.blocking_text}. ` : ''}
                  {c.blocking_reference
                    ? <Link href={c.blocking_reference}>Open the record that would resolve it</Link>
                    : <span class="dep">This condition cannot be resolved from this screen.</span>}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const WIZ_STEPS = [
  { key: 'lot', label: 'Step 1 of 4 — the lot', href: '/console/certificates/new/lot' },
  { key: 'claim', label: 'Step 2 of 4 — the claim', href: '/console/certificates/new/claim' },
  { key: 'recipient', label: 'Step 3 of 4 — the recipient', href: '/console/certificates/new/recipient' },
  { key: 'review', label: 'Step 4 of 4 — the review', href: '/console/certificates/new/review' }
];

export function CertNew({ params, path }) {
  const step = params[0];
  const [lots, setLots] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sel, setSel] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ravel_cert_sel') || '{}'); } catch { return {}; }
  });
  const [banner, setBanner] = useState(null);
  const [password, setPassword] = useState('');
  useEffect(() => {
    api('/api/lots').then((r) => setLots(r.body || []));
    api('/api/customers').then((r) => setCustomers(r.body || []));
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem('ravel_cert_sel', JSON.stringify(sel)); } catch {}
    if (sel.lot) {
      api('/api/certificates/preview', { method: 'POST', body: { lot: sel.lot, recipient: sel.recipient || 'CUS-HELIOS' }, idempotencyKey: `prev-${sel.lot}-${sel.recipient || 'x'}` })
        .then((r) => setPreview(r.ok ? r.body : null));
    }
  }, [sel]);
  async function sign() {
    const r = await api('/api/certificates', {
      method: 'POST',
      body: { lot: sel.lot, recipient: sel.recipient, password },
      idempotencyKey: `sign-${sel.lot}-${sel.recipient}-${Date.now()}`
    });
    if (r.ok) {
      setBanner({ kind: 'ok', text: `Certificate ${r.body.number} signed. The recipient has been notified. Verify it at ravel.example.com/verify/${r.body.number}.`, number: r.body.number });
      sessionStorage.removeItem('ravel_cert_sel');
    } else {
      setBanner({ kind: 'bad', text: (r.body && (r.body.message || r.body.error)) || 'The certificate was not signed.' });
    }
  }
  return (
    <ConsoleGate title="New certificate | Ravel" description="Four steps, four addresses, eight conditions none waivable.">
      <h1>Sign a certificate</h1>
      <nav aria-label="Wizard steps" class="consolebar no-print">
        {WIZ_STEPS.map((s, i) => <Link href={s.href} aria-current={s.key === step ? 'page' : undefined}>{s.label}</Link>)}
      </nav>
      {banner && banner.kind === 'ok' && (
        <div class="banner" role="status">
          <p class="banner-title">Certificate {banner.number} signed.</p>
          <p>{banner.text}</p>
          <p><Link class="btn-quiet" href={`/console/certificates/${banner.number}`}>Open the certificate</Link></p>
        </div>
      )}
      {banner && banner.kind === 'bad' && <div class="banner" role="alert"><p class="banner-title">Signing was refused.</p><p>{banner.text}</p></div>}

      {step === 'lot' && (
        <section>
          <h2>Choose the lot</h2>
          <p class="dep">Every step shows the eight conditions as they stand. No condition is dismissible from this screen.</p>
          {lots === null && <p class="loading-words">The lots are loading.</p>}
          <div class="table-wrap card">
            <table>
              <thead><tr><th>Lot</th><th>Site</th><th class="num">Mass</th><th>Disposition</th><th>Claim type</th><th class="num">Content</th></tr></thead>
              <tbody>
                {(lots || []).map((l) => (
                  <tr key={l.reference} class={sel.lot === l.reference ? 'sel' : ''}>
                    <td><button class="btn-quiet" onClick={() => setSel({ ...sel, lot: l.reference })}>{sel.lot === l.reference ? 'Chosen' : 'Choose'}</button>{' '}<span class="ref">{l.reference}</span></td>
                    <td class="ref">{l.site}</td>
                    <td class="num">{fmtG(l.mass_g)}</td>
                    <td><span class="state-word">{l.disposition}</span></td>
                    <td>{claimWord(l.claim_type)}</td>
                    <td class="num">{fmtBpShort(l.content_bp)} <span class="dep">({claimWord(l.claim_type)})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 'claim' && (
        <section>
          <h2>The claim</h2>
          <p class="dep">A recycled-content percentage is never accepted from a person. It is computed from the ledger.</p>
          {preview && preview.preview && (
            <dl class="kv">
              <dt>Lot</dt><dd class="ref">{sel.lot}</dd>
              <dt>Claim type</dt><dd>{claimWord(preview.preview.claim_type)}</dd>
              <dt>Recycled content</dt><dd><span class="num">{fmtBpShort(preview.preview.content_bp)}</span> <span class="dep">({claimWord(preview.preview.claim_type)})</span></dd>
              <dt>Category split</dt><dd class="num">{Object.entries(preview.preview.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', ')}</dd>
              <dt>Period</dt><dd class="ref">{preview.preview.period || '—'}</dd>
              <dt>Conversion factor</dt><dd>{preview.preview.provisional_factor ? <span class="state-word">provisional</span> : 'derived'}</dd>
            </dl>
          )}
          {preview && preview.preview && preview.preview.carbon && (
            <p class="figure-block">
              <span class="num">{fmtMg(preview.preview.carbon.value_mg_per_kg)}</span>
              <span class="dep">Boundary {preview.preview.carbon.boundary} — method version {preview.preview.carbon.method_version} — uncertainty {preview.preview.carbon.uncertainty_bp} basis points</span>
            </p>
          )}
        </section>
      )}

      {step === 'recipient' && (
        <section>
          <h2>Choose the recipient</h2>
          {customers === null && <p class="loading-words">The customers are loading.</p>}
          <div class="table-wrap card">
            <table>
              <thead><tr><th></th><th>Customer</th><th>Name</th><th>Application</th><th>Industry</th></tr></thead>
              <tbody>
                {(customers || []).map((cu) => (
                  <tr key={cu.reference}>
                    <td><button class="btn-quiet" onClick={() => setSel({ ...sel, recipient: cu.reference })}>{sel.recipient === cu.reference ? 'Chosen' : 'Choose'}</button></td>
                    <td class="ref">{cu.reference}</td>
                    <td>{cu.name}</td>
                    <td>{cu.application || '—'}</td>
                    <td>{cu.industry || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {step === 'review' && (
        <section>
          <h2>The review</h2>
          <p class="dep">This is the exact document the recipient will read and file with their own regulator. Signing is a separate, deliberate act: the signer's identity is confirmed again at the moment of signing.</p>
          <ConditionsList conditions={preview && preview.conditions} />
          <h3>The document</h3>
          <pre class="doc-pre">
{`RAVEL RECYCLED POLYMER CERTIFICATE

Certificate number: (issued at signing)
Site: ${(preview && preview.preview && preview.preview.site) || '—'}
Grade: ${(preview && preview.preview && preview.preview.grade) || '—'}
Lot: ${sel.lot || '—'}

Claim
Claim type: ${claimWord((preview && preview.preview && preview.preview.claim_type) || 'mass_balance')}
Recycled content: ${(preview && preview.preview && fmtBpShort(preview.preview.content_bp)) || '—'}
Category split: ${(preview && preview.preview && Object.entries(preview.preview.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', ')) || '—'}

Carbon footprint
Value: ${(preview && preview.preview && preview.preview.carbon && preview.preview.carbon.value_mg_per_kg.toLocaleString('en-GB') + ' mg CO2e per kg') || '—'}
Boundary: ${(preview && preview.preview && preview.preview.carbon && preview.preview.carbon.boundary) || '—'}
Method version: ${(preview && preview.preview && preview.preview.carbon && preview.preview.carbon.method_version) || '—'}
Uncertainty: ${(preview && preview.preview && preview.preview.carbon && preview.preview.carbon.uncertainty_bp + ' basis points') || '—'}

Permitted statement
This material is claimed by mass balance. It is not physically segregated. It carries ${(preview && preview.preview && (preview.preview.content_bp / 100).toFixed(2)) || '—'} per cent recycled content.

Prohibited statement
You may not state that this material physically contains recycled content.

The recipient will file this document with their regulator.
Verify this certificate at ravel.example.com/verify/{'(number)'}.`}
          </pre>
          <form class="stack" onSubmit={(e) => { e.preventDefault(); sign(); }}>
            <label>Confirm your identity <span class="hint">Signing re-authenticates: the signing act carries the password again. A session alone is not a signing credential.</span>
              <input type="password" name="password" required value={password} onInput={(e) => setPassword(e.target.value)} autocomplete="current-password" />
            </label>
            <button class="btn" type="submit" disabled={!preview || !preview.all_satisfied}>Sign the certificate</button>
            {preview && !preview.all_satisfied && <p class="dep">Signing is unavailable while a condition blocks it.</p>}
          </form>
        </section>
      )}

      <section>
        <h3>The eight conditions as they stand</h3>
        <ConditionsList conditions={preview && preview.conditions} />
      </section>
    </ConsoleGate>
  );
}

export function Certificates() {
  const [certs, setCerts] = useState(null);
  useEffect(() => { api('/api/certificates').then((r) => setCerts(r.body || [])); }, []);
  return (
    <ConsoleGate title="Certificates | Ravel" description="The certificate register.">
      <h1>Certificates</h1>
      <p><Link class="btn" href="/console/certificates/new/lot">Sign a new certificate</Link></p>
      {certs === null && <p class="loading-words">The certificates are loading.</p>}
      {certs && certs.length === 0 && <p class="empty-words">No certificate has been issued.</p>}
      {certs && certs.length > 0 && (
        <div class="table-wrap card">
          <table>
            <thead><tr><th>Number</th><th>State</th><th>Site</th><th>Lot</th><th>Recipient</th><th>Claim type</th><th class="num">Content</th><th>Signed</th></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.number}>
                  <td><Link href={`/console/certificates/${c.number}`} class="ref">{c.number}</Link></td>
                  <td>{c.state === 'withdrawn' ? <span class="state-word">withdrawn</span> : c.state}</td>
                  <td class="ref">{c.site}</td>
                  <td class="ref">{c.lot}</td>
                  <td>{c.recipient_name}</td>
                  <td>{claimWord(c.claim_type)}</td>
                  <td class="num">{fmtBpShort(c.content_bp)} <span class="dep">({claimWord(c.claim_type)})</span></td>
                  <td class="num">{fmtDate(c.signed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConsoleGate>
  );
}

export function CertDetail({ params }) {
  const number = params[0];
  const [cert, setCert] = useState(null);
  const [doc, setDoc] = useState(null);
  const [replay, setReplay] = useState(null);
  const [banner, setBanner] = useState(null);
  const [stage, setStage] = useState('view');
  const [reason, setReason] = useState('');
  const load = () => {
    api(`/api/certificates/${number}`).then((r) => setCert(r.ok ? r.body : { error: r.body }));
    api(`/api/certificates/${number}/document`).then((r) => setDoc(r.ok ? r.body : null));
    api(`/api/certificates/${number}/replay`).then((r) => setReplay(r.ok ? r.body : null));
  };
  useEffect(load, [number]);

  async function withdraw() {
    const r = await api(`/api/certificates/${number}/withdraw`, {
      method: 'POST', body: { reason },
      idempotencyKey: `wd-${number}-${Date.now()}`
    });
    if (r.ok) {
      setBanner({ kind: 'ok', text: `Withdrawn. Recipients notified: ${(r.body.notified_recipients || []).map((x) => x.name).join(', ') || 'none'}. Statements now void: ${(r.body.void_statements || []).length}.`, body: r.body });
      setStage('view');
      load();
    } else {
      setBanner({ kind: 'bad', text: (r.body && r.body.message) || 'The withdrawal was refused.' });
    }
  }

  if (cert === null) {
    return <ConsoleGate><h1>Certificate</h1><p class="loading-words">The certificate is loading.</p></ConsoleGate>;
  }
  if (cert.error) {
    return <ConsoleGate><h1>Certificate</h1><div class="banner" role="alert"><p class="banner-title">There is no such certificate.</p></div></ConsoleGate>;
  }
  const carbon = cert.carbon || (cert.internal_view && cert.internal_view.carbon_with_breakdown);
  return (
    <ConsoleGate title={`Certificate ${number} | Ravel`} description="An issued certificate and its document.">
      <h1>Certificate <span class="ref">{number}</span></h1>
      {banner && banner.kind === 'ok' && (
        <div class="banner" role="status">
          <p class="banner-title">Withdrawn in one action, five consequences.</p>
          <p>{banner.text}</p>
        </div>
      )}
      {banner && banner.kind === 'bad' && <div class="banner" role="alert"><p class="banner-title">Withdrawal was refused.</p><p>{banner.text}</p></div>}
      {cert.state === 'withdrawn' && (
        <div class="banner" role="status">
          <p class="banner-title">This certificate was withdrawn on {fmtDate(cert.withdrawn_on)}. Reason: {cert.withdrawn_reason}.</p>
          <p>The document remains readable at its address. A withdrawal is never a deletion.</p>
        </div>
      )}
      <dl class="kv">
        <dt>State</dt><dd>{cert.state === 'withdrawn' ? <span class="state-word">withdrawn</span> : 'issued'}</dd>
        <dt>Version</dt><dd class="num">{cert.version}</dd>
        <dt>Site</dt><dd class="ref">{cert.site}</dd>
        <dt>Lots</dt><dd class="ref">{(cert.lots || []).map((l) => `${l.reference} (${l.mass_g} g)`).join(', ')}</dd>
        <dt>Grade</dt><dd class="ref">{cert.grade}</dd>
        <dt>Specification</dt><dd class="ref">SPEC-{cert.grade} v{cert.specification_version}</dd>
        <dt>Claim type</dt><dd>{claimWord(cert.claim_type)}</dd>
        <dt>Recycled content</dt><dd><span class="num">{fmtBpShort(cert.content_bp)}</span> <span class="dep">({claimWord(cert.claim_type)})</span></dd>
        <dt>Category split</dt><dd class="num">{Object.entries(cert.category_split || {}).map(([k, v]) => `${k} ${v} g`).join(', ')}</dd>
        <dt>Period</dt><dd class="ref">{cert.period}</dd>
        <dt>Primary share</dt><dd class="num">{fmtBpShort(cert.primary_share_bp)}</dd>
        <dt>Scheme</dt><dd class="ref">{cert.scheme}</dd>
        <dt>Registration</dt><dd class="ref">{cert.registration}</dd>
        <dt>Signer</dt><dd class="ref">{cert.signer}</dd>
        <dt>Signed at</dt><dd class="num">{fmtDate(cert.signed_at)}</dd>
        <dt>Verification</dt><dd class="ref">{cert.verification_url}</dd>
        <dt>Conversion factor</dt><dd>{cert.provisional_factor ? <span class="state-word">provisional</span> : 'derived'}</dd>
      </dl>
      {carbon && (
        <section>
          <h3>Carbon</h3>
          <p class="figure-block">
            <span class="num">{fmtMg(carbon.value_mg_per_kg)}</span>
            <span class="dep">Boundary {carbon.boundary} — method version {carbon.method_version} — uncertainty {carbon.uncertainty_bp} basis points</span>
          </p>
          {carbon.breakdown && (
            <div class="table-wrap card">
              <table>
                <thead><tr><th>Line</th><th class="num">mg/kg</th><th>Tag</th></tr></thead>
                <tbody>{carbon.breakdown.map((b) => <tr key={b.line}><td>{b.line}</td><td class="num">{b.mg_per_kg.toLocaleString('en-GB')}</td><td>{b.tag}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
      <section>
        <h3>The eight conditions as they stood at signing</h3>
        <div class="wizard-conditions">
          {(cert.conditions || []).map((c) => (
            <div class="condition" key={c.condition}>
              <span class="mark">{c.satisfied ? 'Satisfied' : 'Blocking'}</span>
              <span>Stored as it stood at the moment of signing and never recomputed on read.</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3>Statements</h3>
        <p><strong>Permitted.</strong> {cert.permitted_statement}</p>
        <p><strong>Prohibited.</strong> {cert.prohibited_statement}</p>
      </section>
      <section>
        <h3>The document</h3>
        <p class="dep">Byte-stable: two reads of the same version return identical bytes. <a href={`/api/certificates/${number}/document`}>Read the document at its address</a>.</p>
        {doc && <pre class="doc-pre print-keep">{typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)}</pre>}
      </section>
      {replay && (
        <section>
          <h3>Replay</h3>
          <p class="dep">What the certificate said, what recomputation says now, and the input that differs. Agreement and disagreement render at identical weight.</p>
          {replay.reproducible === false ? (
            <div class="banner" role="status">
              <p class="banner-title">This figure is not reproducible.</p>
              <p>{replay.reason}</p>
            </div>
          ) : (
            <dl class="kv">
              <dt>Issued content</dt><dd class="num">{fmtBpShort(replay.issued.content_bp)}</dd>
              <dt>Recomputed content</dt><dd class="num">{fmtBpShort(replay.recomputed.content_bp)}</dd>
              <dt>Agrees</dt><dd><strong>{replay.agrees ? 'yes — the recomputation agrees with the issued figure' : 'no — a disagreement is the finding an auditor came for'}</strong></dd>
              {replay.differing_input && (
                <>
                  <dt>The input that differs</dt><dd class="num">{replay.differing_input.input}: issued {replay.differing_input.issued}, recomputed {replay.differing_input.recomputed}</dd>
                </>
              )}
            </dl>
          )}
        </section>
      )}
      {stage === 'view' && cert.state !== 'withdrawn' && (
        <section>
          <h3>Withdraw this certificate</h3>
          <p class="dep">A withdrawal is one action with five consequences. Before confirming, the screen lists the recipients who will be notified by name and the downstream statements that become void.</p>
          <button class="btn-quiet" onClick={() => setStage('confirm')}>Begin a withdrawal</button>
        </section>
      )}
      {stage === 'confirm' && (
        <section>
          <h3>Confirm the withdrawal</h3>
          <p><strong>The five consequences:</strong></p>
          <ol>
            <li>The state becomes withdrawn, with the reason, the person and the date.</li>
            <li>The recipient is notified through mailpit, and the notification is part of the record.</li>
            <li>Every downstream statement the recipient was permitted to make is enumerated in the notification.</li>
            <li>Every certificate derived from this one is identified and resolved.</li>
            <li>The reverse traversal of the underlying batches runs, so every other certificate touching them is enumerated in the same action.</li>
          </ol>
          <p><strong>Recipients who will be notified, by name:</strong></p>
          <ul><li>{cert.recipient_name} ({cert.recipient_contact})</li></ul>
          <p><strong>Downstream statements the recipient is now obliged to stop making:</strong></p>
          <ul>
            <li>{cert.permitted_statement}</li>
            <li>This material carries {fmtBpShort(cert.content_bp)} recycled content.</li>
            <li>This material is claimed by {claimWord(cert.claim_type)}.</li>
          </ul>
          <form class="stack" onSubmit={(e) => { e.preventDefault(); withdraw(); }}>
            <label>Reason <span class="hint">The only free text on a certificate.</span>
              <input type="text" name="reason" required minLength="10" value={reason} onInput={(e) => setReason(e.target.value)} />
            </label>
            <button class="btn" type="submit">Confirm the withdrawal</button>{' '}
            <button class="btn-quiet" type="button" onClick={() => setStage('view')}>Go back</button>
          </form>
        </section>
      )}
    </ConsoleGate>
  );
}
