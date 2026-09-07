import { useState } from 'preact/hooks';
import { api, storedSession } from '../api.js';
import { Link, useMetadata } from '../router.jsx';
import { useFetch } from './console.jsx';
import {
  StateWord, ContentFigure, Refusal, Loading, Empty, Mark, formatG, formatBp
} from '../components/primitives.jsx';

export function BalanceList() {
  useMetadata({ title: 'Balance periods', description: 'The ledger, per site, per grade and per period.' });
  const periods = useFetch('/balance-periods');
  return (
    <div class="console-route">
      <header class="console-head">
        <span class="t-eyebrow">The ledger</span>
        <h1 class="t-h4">Balance periods</h1>
      </header>
      {periods.loading && <Loading what="the balance periods" />}
      {periods.data?.length === 0 && <Empty>No balance period has been opened yet.</Empty>}
      {periods.data && (
        <ul class="period-list">
          {periods.data.map((p) => (
            <li key={p.id} class="card stack-tight">
              <h2 class="t-h4">
                <Link href={`/console/balance/${p.id}`} class="t-mono">{p.id}</Link>
              </h2>
              <p class="t-small t-muted">
                {p.site} · {p.grade} · {p.period.from} to {p.period.to}
              </p>
              {p.state === 'closed'
                ? <StateWord word="closed" detail={`on ${p.closed_on}, cut-off ${p.cut_off}`} />
                : <span class="t-small">open</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** There is no input control on this screen at all. Every figure is derived and
 *  every figure links to the records it came from, because a claims manager who
 *  cannot get from a total to its workings will rebuild it in a spreadsheet and
 *  the spreadsheet becomes the real ledger.
 *
 *  The allocation form lives in its own dialogue below, because allocating is an
 *  act rather than a figure. */
export function BalanceDetail({ id }) {
  useMetadata({
    title: `Balance ${id}`,
    description: 'Credits in, credits out and credits available per category, each with the records it came from.'
  });
  const period = useFetch(`/balance-periods/${id}`, [id]);
  const [refusal, setRefusal] = useState(null);
  const [allocating, setAllocating] = useState(false);
  const [success, setSuccess] = useState(null);
  const session = storedSession();
  const isClaims = (session?.roles || []).includes('claims_manager');

  async function allocate(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setAllocating(true); setRefusal(null); setSuccess(null);
    try {
      const r = await api(`/balance-periods/${id}/allocations`, {
        method: 'POST',
        body: {
          lot: form.get('lot'),
          category: form.get('category'),
          // A mass, in integer grams. No route accepts a percentage, and there
          // is no control on this screen that would offer one.
          mass_g: Number(form.get('mass_g'))
        }
      });
      setSuccess(r);
      period.reload();
    } catch (err) {
      setRefusal(err.body);
      // The figures on the screen are unchanged: nothing is reloaded on a
      // refusal, because no credit moved.
    } finally {
      setAllocating(false);
    }
  }

  return (
    <div class="console-route console-wide">
      <header class="console-head">
        <span class="t-eyebrow">The ledger</span>
        <h1 class="t-h4 t-mono">{id}</h1>
      </header>

      {period.loading && <Loading what="the balance" />}
      {period.error && <Refusal refusal={period.error} />}

      {period.data && (
        <>
          {/* An inline banner on the balance surface names the available mass
              and the requested mass. It sits above the figures it refers to. */}
          <Refusal refusal={refusal} onDismiss={() => setRefusal(null)} />

          {success && (
            <div class="result-success" role="status">
              <p class="t-label">Allocated</p>
              <p>
                {formatG(success.mass_g)} g of {success.category.replace(/_/g, '-')} claim is
                attached to <span class="t-mono">{success.lot}</span>. That lot now carries{' '}
                <ContentFigure contentBp={success.content_bp} claimType={success.claim_type} compact />
                {' '}and this period holds {formatG(success.credits_available_g)} g available in
                that category.
              </p>
            </div>
          )}

          <section class="balance-header">
            <dl class="kv kv-wide">
              <div><dt>Site</dt><dd class="t-mono">{period.data.site}</dd></div>
              <div><dt>Grade</dt><dd class="t-mono">{period.data.grade}</dd></div>
              <div><dt>Period</dt><dd class="t-mono">{period.data.period.from} → {period.data.period.to}</dd></div>
              <div><dt>State</dt><dd>
                {period.data.state === 'closed'
                  ? <Mark kind="lock" label={`closed on ${period.data.closed_on}`} />
                  : 'open'}
              </dd></div>
              <div><dt>Allocation basis</dt><dd>{period.data.allocation_basis}</dd></div>
              <div><dt>Carry-over limit</dt><dd class="t-mono">{period.data.carry_over_limit_bp} bp</dd></div>
            </dl>
            {period.data.state === 'closed' && (
              <p class="statement">This period is closed. Corrections require a restatement.</p>
            )}
          </section>

          {/* The balance becomes one figure per row at the narrowest width. */}
          <section class="balance-figures">
            {['post_consumer', 'pre_consumer'].map((cat) => {
              const c = period.data[cat];
              return (
                <article key={cat} class="sheet balance-category">
                  <h2 class="t-h4">{cat.replace(/_/g, '-')}</h2>
                  <dl class="balance-rows">
                    <div class="balance-row">
                      <dt class="t-label">Credits in</dt>
                      <dd class="t-figure">{formatG(c.credits_in_g)} g</dd>
                      <dd class="t-small t-muted balance-derivation">{c.derivation.credits_in_g}</dd>
                    </div>
                    <div class="balance-row">
                      <dt class="t-label">Credits out</dt>
                      <dd class="t-figure">{formatG(c.credits_out_g)} g</dd>
                      <dd class="t-small t-muted balance-derivation">{c.derivation.credits_out_g}</dd>
                    </div>
                    <div class="balance-row">
                      <dt class="t-label">Credits available</dt>
                      {/* The invariant's margin is shown as a mass, not as a
                          state. "Within limits" is not a rendering. */}
                      <dd class="t-figure balance-available">{formatG(c.credits_available_g)} g</dd>
                      <dd class="t-small t-muted balance-derivation">{c.derivation.credits_available_g}</dd>
                    </div>
                    {c.transferred_in_g > 0 && (
                      <div class="balance-row">
                        <dt class="t-label">Arrived by transfer</dt>
                        <dd class="t-figure">{formatG(c.transferred_in_g)} g</dd>
                        <dd class="t-small t-muted balance-derivation">
                          inbound credit naming its origin, never a fresh credit
                        </dd>
                      </div>
                    )}
                  </dl>
                  <details class="balance-workings">
                    <summary>The movements behind these figures</summary>
                    <div class="table-scroll">
                      <table>
                        <caption class="visually-hidden">Credit movements in this category</caption>
                        <thead>
                          <tr><th scope="col">Movement</th><th scope="col">Kind</th>
                            <th scope="col">Lot</th><th scope="col" class="num">Mass</th></tr>
                        </thead>
                        <tbody>
                          {period.data.movements.filter((m) => m.category === cat).map((m) => (
                            <tr key={m.reference}>
                              <td class="t-mono">{m.reference}</td>
                              <td>{m.movement.replace(/_/g, ' ')}{m.fresh_credit === false ? ', not fresh credit' : ''}</td>
                              <td class="t-mono">
                                {m.lot ? <Link href={`/console/lots/${m.lot}`}>{m.lot}</Link> : (m.source_ref || '—')}
                              </td>
                              <td class="num">{m.direction === 'in' ? '+' : '−'}{formatG(m.mass_g)} g</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </article>
              );
            })}
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Non-claimable input</h2>
            <p class="t-figure">{formatG(period.data.non_claimable_input_g)} g</p>
            <p class="t-small t-muted">
              Material processed in this period that carried no claim. It is reported here
              rather than absorbed.
            </p>
          </section>

          {/* Three counts sit together and none is a badge to be cleared. None
              is rendered in the accent. */}
          <section class="sheet stack">
            <h2 class="t-h4">Three counts</h2>
            <dl class="count-row">
              <div>
                <dt class="t-label">Overrides this period</dt>
                <dd class="t-figure">{period.data.override_count}</dd>
                {period.data.unreviewed_override_count > 0 && (
                  <dd><StateWord word="unreviewed override"
                    detail={`${period.data.unreviewed_override_count} of them`} /></dd>
                )}
              </div>
              <div>
                <dt class="t-label">Open restatements</dt>
                <dd class="t-figure">{period.data.open_restatement_count}</dd>
              </div>
              <div>
                <dt class="t-label">Audit findings past their date</dt>
                <dd class="t-figure">{period.data.findings_past_date}</dd>
                <dd class="t-small t-muted">{period.data.open_finding_count} open in total</dd>
              </div>
            </dl>
          </section>

          <section class="sheet stack">
            <h2 class="t-h4">Conversion factors in force</h2>
            <div class="table-scroll">
              <table>
                <caption class="visually-hidden">Conversion factors with their derivation windows</caption>
                <thead>
                  <tr><th scope="col">Factor</th><th scope="col" class="num">Version</th>
                    <th scope="col" class="num">Basis points</th><th scope="col">Derivation window</th>
                    <th scope="col">Note</th></tr>
                </thead>
                <tbody>
                  {period.data.conversion_factors.map((f) => (
                    <tr key={f.reference}>
                      <td class="t-mono">{f.reference}</td>
                      <td class="num">{f.version}</td>
                      <td class="num">{f.factor_bp}</td>
                      <td class="t-small">
                        {f.derivation_window.derived_from
                          ? `${f.derivation_window.derived_from} → ${f.derivation_window.derived_to}, ${formatG(f.derivation_window.derived_in_g)} g in, ${formatG(f.derivation_window.derived_out_g)} g out`
                          : 'no window'}
                      </td>
                      <td>{f.provisional && <StateWord word="provisional" detail="no loss history of its own" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {period.data.inbound_credits.length > 0 && (
            <section class="sheet stack">
              <h2 class="t-h4">Inbound credits</h2>
              <div class="table-scroll">
                <table>
                  <caption class="visually-hidden">Credit that arrived from another site</caption>
                  <thead>
                    <tr><th scope="col">Movement</th><th scope="col" class="num">Mass</th>
                      <th scope="col">Origin site</th><th scope="col">Fresh credit</th></tr>
                  </thead>
                  <tbody>
                    {period.data.inbound_credits.map((i) => (
                      <tr key={i.reference}>
                        <td class="t-mono">{i.reference}</td>
                        <td class="num">{formatG(i.mass_g)} g</td>
                        <td class="t-mono">{i.origin_site}</td>
                        <td>no</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="t-small t-muted">
                Transferred credit is never a fresh credit, and the total credit across the two
                periods is unchanged by the journey.
              </p>
            </section>
          )}

          {period.data.carried_forward_g && (
            <section class="sheet stack">
              <h2 class="t-h4">The carry-over settled at the close</h2>
              <div class="table-scroll">
                <table>
                  <caption class="visually-hidden">Credit carried forward and credit expired</caption>
                  <thead>
                    <tr><th scope="col">Category</th><th scope="col" class="num">Carried forward</th>
                      <th scope="col" class="num">Expired</th></tr>
                  </thead>
                  <tbody>
                    {['post_consumer', 'pre_consumer'].map((cat) => (
                      <tr key={cat}>
                        <td>{cat.replace(/_/g, '-')}</td>
                        <td class="num">{formatG(period.data.carried_forward_g[cat])} g</td>
                        <td class="num">{formatG(period.data.expired_g?.[cat])} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p class="t-small t-muted">
                Credit still available at the close carried forward only up to{' '}
                {period.data.carry_over_limit_bp} basis points of the credit that entered the
                period. The remainder expired; neither was absorbed silently.
              </p>
            </section>
          )}

          {/* Allocating is an act, so it lives apart from the figures and is
              only offered to the role entitled to perform it. */}
          {isClaims && period.data.state === 'open' && (
            <section class="sheet stack allocate-section">
              <h2 class="t-h4">Allocate claim to a lot</h2>
              <p class="t-small t-muted">
                A mass in integer grams. No route accepts a percentage; the percentage is
                computed from the mass you attach and the mass of the lot.
              </p>
              <form class="stack allocate-form" onSubmit={allocate}>
                <label>
                  <span class="t-label">Lot</span>
                  <select name="lot" required>
                    {period.data.lots.map((l) => (
                      <option key={l.reference} value={l.reference}>
                        {l.reference} — {formatG(l.mass_g)} g, {l.disposition}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span class="t-label">Category</span>
                  <select name="category" required>
                    <option value="post_consumer">post-consumer</option>
                    <option value="pre_consumer">pre-consumer</option>
                  </select>
                </label>
                <label>
                  <span class="t-label">Mass, in grams</span>
                  <input name="mass_g" type="number" step="1" min="0" required
                    inputmode="numeric" placeholder="360000" />
                </label>
                <button type="submit" class="button-primary" disabled={allocating}>
                  {allocating ? 'Attaching the claim' : 'Attach this claim'}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
