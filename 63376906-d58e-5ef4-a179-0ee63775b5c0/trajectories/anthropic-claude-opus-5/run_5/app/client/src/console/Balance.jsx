import { useState } from 'preact/hooks';
import { useApi, useMeta, api, Link, grams, bp, words, dateOf, idempotencyKey } from '../lib.jsx';
import { Loading, Empty, Word, IconLock, RefusalBanner } from '../components/Bits.jsx';

export function BalanceIndex() {
  useMeta('Balance — Ravel console', 'The ledger, per site, per grade and per period.');
  const periods = useApi('/balance-periods');
  return (
    <>
      <h1 class="display-2">Balance periods</h1>
      {periods.loading ? <Loading what="the balance periods" /> : null}
      {periods.error ? <Empty>The balance periods could not be loaded.</Empty> : null}
      {periods.data && !periods.data.length ? <Empty>No balance period has been opened.</Empty> : null}
      <div class="grid-2" style="margin-top:1.5rem">
        {(periods.data || []).map((p) => (
          <Link key={p.id} href={`/console/balance/${p.id}`} class="card card-link">
            <div class="node-head">
              <span class="mono">{p.id}</span>
              <Word quiet={p.state === 'open'} icon={p.state === 'closed' ? <IconLock title="Closed period" /> : null}>
                {words(p.state)}
              </Word>
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {p.site} · grade {p.grade} · {dateOf(p.period.from)} to {dateOf(p.period.to)}
            </p>
            <p class="figure" style="margin-top:0.5rem">
              post-consumer available {grams(p.post_consumer.credits_available_g)}
              <br />
              pre-consumer available {grams(p.pre_consumer.credits_available_g)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}

/* The balance screen. There is no input control on this screen at all. Every
   figure is derived and every figure links to the records it came from.

   Attaching claim to a lot is an act rather than a figure, so it lives at its
   own address under the same surface, exactly as each step of the certificate
   wizard does. The refusal banner renders there, beside the same derived
   figures, which is where a claims manager needs to read it. */

export function Balance({ id, me, allocating = false }) {
  useMeta(
    allocating ? `${id} — Attach claim` : `${id} — Balance`,
    `The ledger for ${id}: credits in, credits out and credits available per category.`,
  );
  const view = useApi(`/balance-periods/${id}`);
  const [refusal, setRefusal] = useState(null);
  const [pending, setPending] = useState(false);
  const canAllocate = (me.roles || []).includes('claims_manager');

  if (view.loading) return <Loading what="the balance surface" />;
  if (view.error) return <Empty>This balance period could not be loaded. {view.error.message}</Empty>;
  const p = view.data;

  const allocate = async ({ lot, category, mass_g }) => {
    setRefusal(null);
    setPending(true);
    try {
      await api(`/balance-periods/${id}/allocations`, { method: 'POST', body: { lot, category, mass_g }, key: idempotencyKey('alloc') });
      view.reload();
    } catch (error) {
      // A refused act renders an inline banner naming what was refused and what
      // would change it. The figures on the screen are unchanged.
      setRefusal(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <p class="t-eyebrow">{allocating ? 'Balance period · attach claim' : 'Balance period'}</p>
      <h1 class="display-2" style="margin-top:0.375rem">
        <span class="mono">{p.id}</span>
      </h1>
      <p class="t-body-small" style="margin-top:0.5rem">
        {p.site} · grade {p.grade} · {dateOf(p.period.from)} to {dateOf(p.period.to)} ·{' '}
        <Word quiet={p.state === 'open'} icon={p.state === 'closed' ? <IconLock title="Closed period" /> : null}>
          {words(p.state)}
        </Word>
      </p>
      {p.state === 'closed' ? (
        <p class="note">
          This period is closed. Corrections require a restatement. It closed on {dateOf(p.closed_on)} with a cut-off of{' '}
          {dateOf(p.cut_off)}, after which a late event-time record no longer enters it.
        </p>
      ) : null}

      {/* the refusal banner sits on the balance surface itself, beside the
          figures it names */}
      <div id="allocation-result" aria-live="polite">
        <RefusalBanner error={refusal} />
      </div>

      {allocating ? (
        <p style="margin-top:1rem">
          <Link href={`/console/balance/${p.id}`} class="btn">
            Back to the reading of this period
          </Link>
        </p>
      ) : null}

      <h2 class="display-2" style="margin-top:2rem">Credits</h2>
      <p class="note">
        Every figure here is derived and every figure links to the records it came from. The two categories are never
        netted. Read this screen one figure per row at any width.
      </p>

      {['post_consumer', 'pre_consumer'].map((cat) => (
        <section key={cat} class="card" style="margin-top:1.25rem" aria-labelledby={`cat-${cat}`}>
          <h3 id={`cat-${cat}`}>{words(cat)}</h3>
          <dl style="margin-top:0.75rem">
            <FigureRow label="Credits in" value={grams(p[cat].credits_in_g)} derivation={p[cat].derivation.credits_in_g} records={p[cat].derivation.movements} />
            <FigureRow label="Credits out" value={grams(p[cat].credits_out_g)} derivation={p[cat].derivation.credits_out_g} />
            <FigureRow label="Credits available" value={grams(p[cat].credits_available_g)} derivation={p[cat].derivation.credits_available_g} strong />
            <FigureRow label="Transferred in" value={grams(p[cat].transferred_in_g)} derivation="Credit that arrived from another site's period. It is never a fresh credit." />
            <FigureRow label="Transferred out" value={grams(p[cat].transferred_out_g)} derivation="Credit that left for another site's period." />
            {p.carried_forward_g ? <FigureRow label="Carried forward" value={grams(p.carried_forward_g[cat])} derivation={`Up to ${bp(p.carry_over_limit_bp)} of the credit that entered the period.`} /> : null}
            {p.expired_g ? <FigureRow label="Expired" value={grams(p.expired_g[cat])} derivation="The remainder above the carry-over limit expires and is never absorbed silently." /> : null}
          </dl>
        </section>
      ))}

      {/* The invariant's margin is shown as a mass, not as a state. */}
      <section class="card" style="margin-top:1.25rem">
        <h3>The margin</h3>
        <p class="note">The remaining claimable mass, as a mass. There is no verdict here.</p>
        <dl style="margin-top:0.75rem">
          <FigureRow label="Remaining claimable, post-consumer" value={grams(p.post_consumer.credits_available_g)} derivation="credits_in_g minus credits_out_g over the movements themselves" strong />
          <FigureRow label="Remaining claimable, pre-consumer" value={grams(p.pre_consumer.credits_available_g)} derivation="credits_in_g minus credits_out_g over the movements themselves" strong />
          <FigureRow label="Non-claimable input" value={grams(p.non_claimable_input_g)} derivation="Dry mass consumed from batches whose approval or custody did not support a claim on the date they were received." />
        </dl>
      </section>

      {/* Three counts sit together and none is a badge to be cleared. */}
      <section class="card" style="margin-top:1.25rem">
        <h3>Three counts</h3>
        <dl style="margin-top:0.75rem">
          <FigureRow label="Overrides this period" value={String(p.override_count)} derivation={`${p.unreviewed_override_count} of them unreviewed. An override shows on its lot for its life and blocks signing until a second person reviews it.`} />
          <FigureRow label="Open restatements" value={String(p.open_restatement_count)} derivation="A restatement holds exactly one resolution per affected certificate." />
          <FigureRow label="Audit findings past their date" value={String(p.findings_past_date_count)} derivation={`${p.open_finding_count} findings are open in total.`} />
        </dl>
        {(p.overrides || []).length ? (
          <ul style="margin-top:0.75rem">
            {p.overrides.map((o) => (
              <li key={o.reference}>
                <Link href={`/console/lots/${o.lot}`} class="mono">{o.reference}</Link> on{' '}
                <span class="mono">{o.lot}</span> — {words(o.separation)}{' '}
                {o.reviewed ? <Word quiet>Reviewed</Word> : <Word firm>Override unreviewed</Word>}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section class="card" style="margin-top:1.25rem">
        <h3>Conversion factors in force</h3>
        <div class="scroller" style="margin-top:0.75rem">
          <table>
            <caption class="visually-hidden">Conversion factors with their versions and derivation windows</caption>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col" class="num">Version</th>
                <th scope="col" class="num">Factor</th>
                <th scope="col">Derivation window</th>
                <th scope="col" class="num">In</th>
                <th scope="col" class="num">Out</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {(p.conversion_factors || []).map((f) => (
                <tr key={f.reference}>
                  <td class="mono">{f.reference}</td>
                  <td class="num">{f.version}</td>
                  <td class="num">{f.factor_bp}</td>
                  <td>{f.derivation_window ? `${f.derivation_window.from} to ${f.derivation_window.to}` : 'no window'}</td>
                  <td class="num">{f.derived_in_g.toLocaleString('en-GB')}</td>
                  <td class="num">{f.derived_out_g.toLocaleString('en-GB')}</td>
                  <td>
                    {f.in_force ? <Word>In force</Word> : <Word quiet>Superseded</Word>}{' '}
                    {f.provisional ? <Word firm>Provisional</Word> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(p.inbound_credits || []).length ? (
        <section class="card" style="margin-top:1.25rem">
          <h3>Inbound credits</h3>
          <p class="note">Credit that arrived from another site's period. It is never a fresh credit.</p>
          <div class="scroller" style="margin-top:0.75rem">
            <table>
              <caption class="visually-hidden">Inbound credits, one entry per movement</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col" class="num">Mass</th>
                  <th scope="col">Origin site</th>
                  <th scope="col">Movement</th>
                  <th scope="col">Fresh credit</th>
                </tr>
              </thead>
              <tbody>
                {p.inbound_credits.map((x) => (
                  <tr key={x.reference}>
                    <td class="mono">{x.reference}</td>
                    <td class="num">{Number(x.mass_g).toLocaleString('en-GB')}</td>
                    <td class="mono">{x.origin_site}</td>
                    <td class="mono">{x.movement}</td>
                    <td>no</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section class="card" style="margin-top:1.25rem">
        <h3>Allocations against this period</h3>
        {(p.allocations || []).length ? (
          <div class="scroller" style="margin-top:0.75rem">
            <table>
              <caption class="visually-hidden">Allocations attaching claim to a lot</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Lot</th>
                  <th scope="col">Category</th>
                  <th scope="col" class="num">Mass</th>
                  <th scope="col">Effective</th>
                </tr>
              </thead>
              <tbody>
                {p.allocations.map((a) => (
                  <tr key={a.reference}>
                    <td class="mono">{a.reference}</td>
                    <td>
                      <Link href={`/console/lots/${a.lot}`} class="mono">{a.lot}</Link>
                    </td>
                    <td>{words(a.category)}</td>
                    <td class="num">{Number(a.mass_g).toLocaleString('en-GB')}</td>
                    <td class="mono">{dateOf(a.effective_on)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="empty">No claim has been attached to a lot from this period.</p>
        )}
      </section>

      {/* Allocation is an act rather than a figure. The reading of this period
          carries no input control at all; the act is at its own address. */}
      {allocating ? (
        canAllocate && p.state === 'open' ? (
          <AllocationAct onAllocate={allocate} pending={pending} />
        ) : (
          <p class="note" style="margin-top:1.5rem">
            {p.state === 'closed'
              ? 'This period is closed. Corrections require a restatement, so no claim can be attached to a lot from it and no control for it is rendered.'
              : 'Attaching claim to a lot is an act carried by a claims manager. This session does not hold that role, so no control for it is rendered.'}
          </p>
        )
      ) : canAllocate && p.state === 'open' ? (
        <p style="margin-top:2rem">
          <Link href={`/console/balance/${p.id}/allocate`} class="btn">
            Attach claim to a lot <span class="arrow" aria-hidden="true">→</span>
          </Link>
          <br />
          <span class="note">
            Attaching claim is an act and lives at its own address. This reading carries no input control, because a
            figure a reader can edit is not a figure they can trust.
          </span>
        </p>
      ) : null}

      <p class="note" style="margin-top:2rem">Read at {p.read_at}. {p.derivation.source}</p>
    </>
  );
}

function FigureRow({ label, value, derivation, records, strong = false }) {
  return (
    <div style="display:flex;flex-direction:column;gap:0.25rem;padding:0.75rem 0;border-bottom:1px solid var(--rule)">
      <dt class="t-label-small muted">{label}</dt>
      <dd style="margin:0">
        <span class={strong ? 'figure-value' : 'figure'}>{value}</span>
        {derivation ? <div class="note" style="margin-top:0.25rem">{derivation}</div> : null}
        {records && records.length ? (
          <div class="note mono" style="margin-top:0.25rem">
            From: {records.join(', ')}
          </div>
        ) : null}
      </dd>
    </div>
  );
}

function AllocationAct({ onAllocate, pending }) {
  const lots = useApi('/lots');
  const [lot, setLot] = useState('');
  const [category, setCategory] = useState('post_consumer');
  const [mass, setMass] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const n = Number(mass);
    if (!lot || !Number.isInteger(n)) return;
    onAllocate({ lot, category, mass_g: n });
  };

  return (
    <section class="card" style="margin-top:2rem" aria-labelledby="alloc-h">
      <h3 id="alloc-h">Attach claim to a lot</h3>
      <p class="note">
        This is an act rather than a figure. It takes a mass in grams. No control here accepts a percentage, because every
        percentage in this product is computed from the ledger.
      </p>
      <form onSubmit={submit} style="margin-top:1rem;max-width:26rem" novalidate>
        <div class="field">
          <label for="al-lot">Lot</label>
          <select id="al-lot" value={lot} onChange={(e) => setLot(e.currentTarget.value)} required>
            <option value="">Choose a lot</option>
            {(lots.data || []).map((l) => (
              <option key={l.reference} value={l.reference}>
                {l.reference} — {Number(l.mass_g).toLocaleString('en-GB')} g at {l.site}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="al-cat">Category</label>
          <select id="al-cat" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
            <option value="post_consumer">post-consumer</option>
            <option value="pre_consumer">pre-consumer</option>
          </select>
        </div>
        <div class="field">
          <label for="al-mass">Mass in grams</label>
          <input id="al-mass" class="mono" inputmode="numeric" pattern="[0-9]*" value={mass} onInput={(e) => setMass(e.currentTarget.value)} required aria-describedby="al-mass-hint" />
          <span class="hint" id="al-mass-hint">An integer number of grams. The percentage that follows is computed.</span>
        </div>
        <button type="submit" class="btn btn-primary" disabled={pending} aria-describedby="allocation-result">
          {pending ? 'Attaching' : 'Attach this claim'} <span class="arrow" aria-hidden="true">→</span>
        </button>
      </form>
    </section>
  );
}
