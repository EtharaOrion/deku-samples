import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words, Refusal, ContentFigure } from '../ui.jsx';
import SchemeBanner from './SchemeBanner.jsx';

/**
 * There is no input control on this screen at all.
 *
 * Every figure is derived and every figure links to the records it came from.
 * The allocation control below is the one act a claims manager performs here,
 * and it takes a mass and a category — never a percentage.
 */
function Figure({ label, value, derivation, links }) {
  return (
    <div class="figure-row">
      <div>
        <p class="t-label" style="margin:0">{label}</p>
        {derivation ? <p class="t-small" style="margin:0.15rem 0 0;color:var(--muted)">{derivation}</p> : null}
      </div>
      <p class="figure mono" style="margin:0">{value}</p>
      <p class="t-small" style="margin:0">
        {(links || []).map((l) => (
          <><a href={l.href}>{l.text}</a><br /></>
        ))}
      </p>
    </div>
  );
}

export default function Balance({ session, params }) {
  const id = params.id;
  const [tick, setTick] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastAllocation, setLastAllocation] = useState(null);

  const led = useAsync(() => api(`/balance-periods/${id}`), [id, tick]);
  const lots = useAsync(() => api('/lots'), [tick]);

  const isClaims = (session?.roles || []).includes('claims_manager');

  async function allocate(e) {
    e.preventDefault();
    setBusy(true); setError(null); setLastAllocation(null);
    const f = new FormData(e.target);
    try {
      const r = await api(`/balance-periods/${id}/allocations`, {
        body: {
          lot: f.get('lot'),
          category: f.get('category'),
          // A mass in integer grams. No percentage crosses this wire.
          mass_g: Number(f.get('mass_g')),
        },
      });
      setLastAllocation(r);
      setTick((t) => t + 1);
    } catch (err) {
      setError(err);
      // The figures on the screen are unchanged: nothing is re-read on refusal.
    } finally {
      setBusy(false);
    }
  }

  const d = led.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Balance</p>
        <h1 class="t-h3 mono">{id}</h1>
        {d ? (
          <p class="t-big">
            {d.site} · grade {d.grade} · {d.period.from} to {d.period.to} ·{' '}
            <StateWord
              word={d.state === 'closed' ? 'Closed' : 'Open'}
              icon={d.state === 'closed' ? <Icon name="lock" label="Closed period" /> : null}
              heavy={d.state === 'closed'}
            />
          </p>
        ) : null}
        {d && d.read_at ? (
          <p class="t-small" style="color:var(--muted)">
            This read saw the ledger as it stood at <span class="mono">{d.read_at}</span>.
          </p>
        ) : null}
      </div>

      <SchemeBanner />

      {led.loading ? <Loading what="the ledger" /> : null}
      {led.error ? <Empty>This balance period could not be read.</Empty> : null}

      {/* A refused act renders an inline banner naming what was refused and what
          would change it. It sits on the balance surface itself. */}
      {error ? (
        <div class="banner" role="alert">
          <p class="t-eyebrow">Allocation refused</p>
          <p>
            <strong>
              {error.body && error.body.available_g !== undefined
                ? `This allocation is refused. Available: ${Number(error.body.available_g).toLocaleString('en-GB')} g. Requested: ${Number(error.body.requested_g).toLocaleString('en-GB')} g.`
                : (error.body && error.body.message) || error.message}
            </strong>
          </p>
          {error.body && error.body.available_g !== undefined ? (
            <p style="margin-bottom:0">
              No credit moved and the figures below are unchanged. To allocate this much,
              a further credit must first enter the period through a consumption of a claimable
              batch, or the requested mass must come down to the available mass.
            </p>
          ) : null}
        </div>
      ) : null}

      {lastAllocation ? (
        <div class="banner" role="status">
          <p class="t-eyebrow">Allocated</p>
          <p style="margin-bottom:0">
            {grams(lastAllocation.mass_g)} of {words(lastAllocation.category)} claim attached to{' '}
            <a href={`/console/lots/${lastAllocation.lot}`} class="mono">{lastAllocation.lot}</a>.
            That lot now carries{' '}
            <ContentFigure content_bp={lastAllocation.content_bp} claim_type={lastAllocation.claim_type} compact />.
          </p>
        </div>
      ) : null}

      {d ? (
        <>
          <section aria-labelledby="cred">
            <h2 id="cred" class="t-h4">Credits, per category</h2>
            <p class="t-small" style="color:var(--muted)">
              A balance is the sum of its movements and is never held as a total. The two
              categories are never netted against each other.
            </p>
            {['post_consumer', 'pre_consumer'].map((cat) => (
              <div key={cat} style="margin-top:1.5rem">
                <h3 class="t-h4" style="text-transform:capitalize">{words(cat)}</h3>
                <div class="figure-rows">
                  <Figure
                    label="Credits in"
                    value={grams(d[cat].credits_in_g)}
                    derivation="Granted at each consumption of a claimable batch: dry mass times the site's conversion factor, floored."
                    links={d[cat].derivation.filter((x) => x.direction === 'in').map((x) => ({
                      href: `/console/lots`, text: `${x.movement} · ${x.batch || '—'} · ${Number(x.mass_g).toLocaleString('en-GB')} g`,
                    }))}
                  />
                  <Figure
                    label="Credits out"
                    value={grams(d[cat].credits_out_g)}
                    derivation="Attached to a lot, carried forward at a close, or expired at a close."
                    links={d[cat].derivation.filter((x) => ['out', 'carry_forward', 'expiry'].includes(x.direction)).map((x) => ({
                      href: x.lot ? `/console/lots/${x.lot}` : `/console/balance/${id}`,
                      text: `${x.movement} · ${x.lot || words(x.direction)} · ${Number(x.mass_g).toLocaleString('en-GB')} g`,
                    }))}
                  />
                  <Figure
                    label="Credits available"
                    value={grams(d[cat].credits_available_g)}
                    derivation="Credits in, less credits out, less credit that left on a transfer. This is the remaining claimable mass, shown as a mass rather than as a state."
                  />
                  {d[cat].inbound_credit_g ? (
                    <Figure
                      label="Arrived on a transfer"
                      value={grams(d[cat].inbound_credit_g)}
                      derivation="Never a fresh credit. Held on its own line so it is not mistaken for credit that entered at a consumption here."
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="marg" style="margin-top:2.5rem">
            <h2 id="marg" class="t-h4">The invariant's margin</h2>
            <p class="t-small" style="color:var(--muted)">
              Shown as a mass, not as a state.
            </p>
            <div class="figure-rows">
              <Figure label="Post-consumer claimable mass remaining" value={grams(d.post_consumer.credits_available_g)} />
              <Figure label="Pre-consumer claimable mass remaining" value={grams(d.pre_consumer.credits_available_g)} />
              <Figure
                label="Non-claimable input consumed"
                value={grams(d.non_claimable_input_g)}
                derivation="Consumed and processed; carries no credit forward."
              />
            </div>
          </section>

          <section aria-labelledby="counts" style="margin-top:2.5rem">
            <h2 id="counts" class="t-h4">Three counts</h2>
            <p class="t-small" style="color:var(--muted)">
              None of these is a badge to be cleared, and none is rendered in an accent.
            </p>
            <div class="figure-rows">
              <Figure
                label="Overrides this period"
                value={String(d.override_count)}
                derivation={`${d.unreviewed_override_count} of them unreviewed. An unreviewed override blocks signing.`}
              />
              <Figure label="Open restatements" value={String(d.open_restatement_count)} />
              <Figure label="Audit findings past their date" value={String(d.open_finding_count)} />
            </div>
          </section>

          <section aria-labelledby="factors" style="margin-top:2.5rem">
            <h2 id="factors" class="t-h4">Conversion factors in force</h2>
            <div class="table-scroll">
              <table>
                <caption>Each factor is the arithmetic of a stated window, or declares itself provisional.</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col" class="num">Version</th>
                    <th scope="col" class="num">Factor</th>
                    <th scope="col">Window</th>
                    <th scope="col" class="num">In</th>
                    <th scope="col" class="num">Out</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {d.conversion_factors.map((f) => (
                    <tr key={f.reference}>
                      <th scope="row" class="mono">{f.reference}</th>
                      <td class="num">{f.version}</td>
                      <td class="num">{f.factor_bp} bp</td>
                      <td class="mono">{f.derived_from ? `${f.derived_from} → ${f.derived_to}` : 'none'}</td>
                      <td class="num">{f.derived_in_g.toLocaleString('en-GB')}</td>
                      <td class="num">{f.derived_out_g.toLocaleString('en-GB')}</td>
                      <td>
                        {f.provisional ? <StateWord word="Provisional" heavy /> : null}
                        {f.superseded_by ? <StateWord word="Superseded" quiet /> : null}
                        {!f.provisional && !f.superseded_by ? <StateWord word="In force" /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="carry" style="margin-top:2.5rem">
            <h2 id="carry" class="t-h4">The close, and the carry-over</h2>
            <div class="figure-rows">
              <Figure
                label="Carry-over limit"
                value={`${d.carry_over_limit_bp} bp`}
                derivation="Credit still available at the close carries forward only up to this share of the credit that entered the period. The remainder expires."
              />
              <Figure label="Closed on" value={d.closed_on || 'not closed'} />
              <Figure
                label="Cut-off"
                value={d.cut_off || '—'}
                derivation={d.cut_off ? 'A late event-time record effective after this date no longer enters this period.' : null}
              />
              {d.carried_forward_g ? (
                <>
                  <Figure label="Carried forward, post-consumer" value={grams(d.carried_forward_g.post_consumer)} />
                  <Figure label="Expired, post-consumer" value={grams(d.expired_g.post_consumer)} />
                  <Figure label="Carried forward, pre-consumer" value={grams(d.carried_forward_g.pre_consumer)} />
                  <Figure label="Expired, pre-consumer" value={grams(d.expired_g.pre_consumer)} />
                </>
              ) : null}
            </div>
            {d.state === 'closed' ? (
              <p class="banner" style="margin-top:1.5rem">
                <strong>This period is closed. Corrections require a restatement.</strong>
              </p>
            ) : null}
          </section>

          <section aria-labelledby="mv" style="margin-top:2.5rem">
            <h2 id="mv" class="t-h4">Every movement</h2>
            <div class="table-scroll">
              <table>
                <caption>Movements are only ever added. Nothing here is writable.</caption>
                <thead>
                  <tr>
                    <th scope="col">Movement</th>
                    <th scope="col">Direction</th>
                    <th scope="col">Category</th>
                    <th scope="col" class="num">Mass</th>
                    <th scope="col">Against</th>
                    <th scope="col">Effective</th>
                    <th scope="col">Fresh credit</th>
                  </tr>
                </thead>
                <tbody>
                  {d.movements.map((m) => (
                    <tr key={m.reference}>
                      <th scope="row" class="mono">{m.reference}</th>
                      <td>{words(m.direction)}</td>
                      <td>{words(m.category)}</td>
                      <td class="num">{m.mass_g.toLocaleString('en-GB')}</td>
                      <td class="mono">
                        {m.lot ? <a href={`/console/lots/${m.lot}`}>{m.lot}</a> : m.batch || m.origin_site || '—'}
                      </td>
                      <td class="mono">{m.effective_on}</td>
                      <td>{m.fresh_credit ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {isClaims && d.state === 'open' ? (
            <section aria-labelledby="alloc" style="margin-top:3rem" class="sheet">
              <h2 id="alloc" class="t-h4">Allocate claim to a lot</h2>
              <p class="t-small">
                This form takes a mass in integer grams and a category. It does not take a
                percentage: the percentage is computed from the ledger and shown on the lot.
              </p>
              <form onSubmit={allocate}>
                <div class="field">
                  <label class="t-label" for="lot">Lot</label>
                  <select id="lot" name="lot" required>
                    {(lots.data || [])
                      .filter((l) => l.site === d.site)
                      .map((l) => (
                        <option key={l.reference} value={l.reference}>
                          {l.reference} — {grams(l.mass_g)} — {words(l.disposition)}
                        </option>
                      ))}
                  </select>
                </div>
                <div class="field">
                  <label class="t-label" for="category">Category</label>
                  <select id="category" name="category" required>
                    <option value="post_consumer">Post-consumer</option>
                    <option value="pre_consumer">Pre-consumer</option>
                  </select>
                </div>
                <div class="field">
                  <label class="t-label" for="mass_g">Mass, integer grams</label>
                  <input id="mass_g" name="mass_g" type="number" step="1" min="1" required />
                </div>
                <p style="margin-top:1.25rem;margin-bottom:0">
                  <button class="btn" type="submit" disabled={busy}>
                    {busy ? 'Allocating…' : 'Allocate'} <span class="btn-arrow" aria-hidden="true">→</span>
                  </button>
                </p>
              </form>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
