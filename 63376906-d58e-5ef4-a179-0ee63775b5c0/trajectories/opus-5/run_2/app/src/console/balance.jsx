import { useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useResource, ReadAt, Derivation } from './shared.jsx';
import { Link, useMeta } from '../lib/router.jsx';
import { Loading, Empty, Word, Refusal, Reveal, Mark, RecycledContent } from '../components/common.jsx';
import { grams, basisPoints, words, date, percentFromBp } from '../lib/format.js';

export function BalanceList() {
  useMeta('Ravel — Balance periods', 'The ledger, per site, grade and period.', { noindex: true });
  const periods = useResource('/balance-periods');
  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Reconciliation</p>
      <Reveal as="h1" class="t-h3">Balance periods</Reveal>
      {periods.loading && <Loading what="the balance periods" />}
      {periods.data?.length === 0 && <Empty>No balance period has been opened.</Empty>}
      {periods.data?.map((p) => (
        <article key={p.id} class="sheet" style="margin-bottom:1rem">
          <div class="spread">
            <div>
              <h2 class="t-h4 mono" style="margin-bottom:.35rem">{p.id}</h2>
              <p class="note" style="margin:0">
                {p.site} · {p.grade} · {date(p.period.from)} to {date(p.period.to)}
              </p>
            </div>
            <p style="margin:0">
              <Word quiet={p.state !== 'closed'}>
                {p.state === 'closed'
                  ? <Mark kind="lock" label="closed" />
                  : 'open'}
              </Word>
            </p>
          </div>
          <p style="margin:1rem 0 0">
            <Link href={`/console/balance/${p.id}`}>Open the balance</Link>
          </p>
        </article>
      ))}
    </div>
  );
}

/* There is no input control on this screen at all. Every figure is derived and
   every figure links to the records it came from. */
export function Balance({ id }) {
  useMeta(`Ravel — ${id}`, 'Credits in, credits out and credits available per category.', { noindex: true });
  const period = useResource(`/balance-periods/${id}`);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState({ lot: '', category: 'post_consumer', mass_g: '' });
  const [busy, setBusy] = useState(false);
  const lots = useResource('/lots');
  const p = period.data;

  const allocate = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api(`/balance-periods/${id}/allocations`, {
        method: 'POST',
        body: { lot: form.lot, category: form.category, mass_g: Number(form.mass_g) },
      });
      setNotice(r);
      period.reload();
    } catch (err) {
      // The allocation does not happen, and the figures on the screen are unchanged.
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="wrap stack" style="padding-top:2rem">
      <p class="eyebrow">Balance period</p>
      <Reveal as="h1" class="t-h3 mono">{id}</Reveal>

      {period.loading && <Loading what="this balance period" />}
      {period.error && <p class="note">This balance period could not be read.</p>}

      {p && (
        <>
          <p class="note" style="max-width:44rem">
            {p.site} · {p.grade} · {date(p.period.from)} to {date(p.period.to)} ·{' '}
            <Word quiet={p.state !== 'closed'}>
              {p.state === 'closed' ? <Mark kind="lock" label="closed" /> : 'open'}
            </Word>
            {p.state === 'closed' && ' — This period is closed. Corrections require a restatement.'}
          </p>

          {/* Two categories, never netted. The balance becomes one figure per row
              at the narrowest width. */}
          {['post_consumer', 'pre_consumer'].map((cat) => (
            <section key={cat} class="sheet" style="margin-bottom:1rem">
              <h2 class="t-h4">{words(cat)}</h2>
              <dl style="margin:0">
                <FigureRow label="Credits in" value={grams(p[cat].credits_in_g)}
                  source="Sum of credit movements with direction in, from consumptions of claimable batches" />
                <FigureRow label="Credits out" value={grams(p[cat].credits_out_g)}
                  source="Sum of allocation movements attaching claim to a lot" />
                <FigureRow label="Credits available" value={grams(p[cat].credits_available_g)}
                  source="Credits in minus credits out" emphasis />
                <FigureRow label="Inbound credits, not fresh" value={grams(p[cat].inbound_credits_g)}
                  source="Credit arriving on a transfer from another site" />
              </dl>
            </section>
          ))}

          {/* The invariant's margin is shown as a mass, not as a state. */}
          <section class="sheet">
            <h2 class="t-h4">The margin</h2>
            <p style="margin:0 0 .5rem">
              Remaining claimable mass, post-consumer:{' '}
              <strong class="figure">{grams(p.post_consumer.credits_available_g)}</strong>
            </p>
            <p style="margin:0">
              Remaining claimable mass, pre-consumer:{' '}
              <strong class="figure">{grams(p.pre_consumer.credits_available_g)}</strong>
            </p>
            <p class="note" style="margin:1rem 0 0">
              Non-claimable input this period:{' '}
              <span class="figure">{grams(p.non_claimable_input_g)}</span>. Material from a lapsed
              collector is processed as non-claimable input and grants no credit.
            </p>
          </section>

          {/* Three counts sit together and none is a badge to be cleared. */}
          <section class="sheet">
            <h2 class="t-h4">Three counts</h2>
            <dl style="margin:0">
              <FigureRow label="Overrides this period" value={String(p.override_count)}
                source={`${p.unreviewed_override_count} of them unreviewed`} />
              <FigureRow label="Open restatements" value={String(p.open_restatement_count)}
                source="A restatement is opened where a closed period must be corrected" />
              <FigureRow label="Audit findings past their date" value={String(p.open_finding_count)}
                source="Findings raised against a collector's approval record" />
            </dl>
          </section>

          <section class="sheet">
            <h2 class="t-h4">Conversion factors in force</h2>
            <div class="scroll-x">
              <table>
                <thead>
                  <tr><th>Reference</th><th class="num">Factor</th><th>Window</th>
                    <th class="num">In</th><th class="num">Out</th><th>State</th></tr>
                </thead>
                <tbody>
                  {p.conversion_factors.map((f) => (
                    <tr key={f.reference}>
                      <td class="mono">{f.reference} v{f.version}</td>
                      <td class="num mono">{basisPoints(f.factor_bp)}</td>
                      <td class="mono">
                        {f.derived_from ? `${date(f.derived_from)} to ${date(f.derived_to)}` : 'no window'}
                      </td>
                      <td class="num mono">{grams(f.derived_in_g)}</td>
                      <td class="num mono">{grams(f.derived_out_g)}</td>
                      <td>
                        {f.provisional ? <Word>provisional</Word> : <Word quiet>derived</Word>}
                        {f.superseded_by && <> <Word quiet>superseded</Word></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="sheet">
            <h2 class="t-h4">Carry-over at the close</h2>
            <p class="note">
              Credit still available at the close carries forward only up to{' '}
              <span class="mono">{basisPoints(p.carry_over_limit_bp)}</span> of the credit that
              entered the period. The remainder expires and is never absorbed silently.
            </p>
            <div class="scroll-x">
              <table>
                <thead><tr><th>Category</th><th class="num">Carries forward</th><th class="num">Expires</th></tr></thead>
                <tbody>
                  {['post_consumer', 'pre_consumer'].map((cat) => {
                    const c = p.carry_over[cat];
                    return (
                      <tr key={cat}>
                        <td>{words(cat)}</td>
                        <td class="num mono">{grams(c.carried_forward_g ?? c.would_carry_forward_g)}</td>
                        <td class="num mono">{grams(c.expired_g ?? c.would_expire_g)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section class="sheet">
            <h2 class="t-h4">Movements</h2>
            <p class="note">A balance is the sum of its movements and is never held as a total.</p>
            {p.movements.length === 0 && <Empty>No movement has been recorded in this period.</Empty>}
            {p.movements.length > 0 && (
              <div class="scroll-x">
                <table>
                  <thead>
                    <tr><th>Reference</th><th>Direction</th><th>Category</th><th class="num">Mass</th>
                      <th>Source</th><th>Lot</th><th>Effective</th></tr>
                  </thead>
                  <tbody>
                    {p.movements.map((m) => (
                      <tr key={m.reference}>
                        <td class="mono">{m.reference}</td>
                        <td>{m.direction === 'in' ? 'in' : 'out'}</td>
                        <td>{words(m.category)}</td>
                        <td class="num mono">{grams(m.mass_g)}</td>
                        <td class="mono">{m.source_ref || words(m.source_kind)}</td>
                        <td class="mono">{m.lot || '—'}</td>
                        <td class="mono">{date(m.effective_on)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* The allocation is a deliberate act and lives beneath the derived
              figures, which carry no input of their own. */}
          <section class="sheet no-print">
            <h2 class="t-h4">Allocate claim to a lot</h2>
            <p class="note">
              No percentage is accepted here. A mass in grams is attached and the resulting
              percentage is computed from the ledger.
            </p>
            <Refusal error={error} title="This allocation is refused" />
            {notice && (
              <div class="banner" role="status" style="margin-bottom:1rem">
                <p class="label" style="margin:0 0 .35rem">Allocation attached</p>
                <p style="margin:0">
                  <span class="mono">{grams(notice.mass_g)}</span> of {words(notice.category)} claim
                  attached to <span class="mono">{notice.lot}</span>. The lot now reads{' '}
                  <RecycledContent content_bp={notice.lot_content_bp} claim_type={notice.claim_type} />.
                </p>
              </div>
            )}
            <form onSubmit={allocate}>
              <div class="two-up">
                <label class="field">
                  <span class="label">Lot</span>
                  <select required value={form.lot} onInput={(e) => setForm({ ...form, lot: e.target.value })}>
                    <option value="">Choose a lot</option>
                    {(lots.data || []).map((l) => (
                      <option key={l.reference} value={l.reference}>
                        {l.reference} — {grams(l.mass_g)} at {l.site}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="label">Category</span>
                  <select value={form.category} onInput={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="post_consumer">Post-consumer</option>
                    <option value="pre_consumer">Pre-consumer</option>
                  </select>
                </label>
              </div>
              <label class="field">
                <span class="label">Mass to attach, in grams</span>
                <input type="number" min="1" step="1" required value={form.mass_g}
                  onInput={(e) => setForm({ ...form, mass_g: e.target.value })} />
              </label>
              <button type="submit" class="button-primary" disabled={busy || p.state === 'closed'}>
                {busy ? 'Attaching…' : 'Attach claim'}
              </button>
              {p.state === 'closed' && (
                <p class="note" style="margin:.5rem 0 0">
                  This period is closed. Corrections require a restatement.
                </p>
              )}
            </form>
          </section>

          <Derivation derivation={p.derivation} />
          <ReadAt at={p.read_at} />
        </>
      )}
    </div>
  );
}

function FigureRow({ label, value, source, emphasis = false }) {
  return (
    <div class="figure-row">
      <dt class="label" style="margin:0">{label}</dt>
      <dd class="figure" style={`margin:0;${emphasis ? 'font-weight:600' : ''}`}>{value}</dd>
      <dd class="note" style="margin:0">{source}</dd>
    </div>
  );
}
