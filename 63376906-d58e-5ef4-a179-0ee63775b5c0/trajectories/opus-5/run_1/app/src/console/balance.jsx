import { useState } from 'preact/hooks';
import { api } from '../api.js';
import { Link } from '../router.jsx';
import { useFetch } from './console.jsx';
import { State, Empty, Loading, Refusal, Mark, formatInt, formatBp } from '../components/ui.jsx';

// There is no input control on this screen at all. Every figure is derived and
// every figure links to the records it came from.
function CategoryBlock({ name, figures, periodId }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ['Credits in', figures.credits_in_g],
    ['Credits out', figures.credits_out_g],
    ['Credits available', figures.credits_available_g],
  ];
  return (
    <div class="card stack-s">
      <h3 style="font-size:var(--h4-size);line-height:var(--h4-line)">
        {name.replace(/_/g, '-')}
      </h3>
      <dl class="stack-s">
        {rows.map(([label, value]) => (
          <div class="balance-figure" key={label}>
            <dt class="label" style="margin:0">{label}</dt>
            <dd class="balance-figure__value" style="margin:0">{formatInt(value)} g</dd>
          </div>
        ))}
      </dl>
      <p class="note">
        {figures.derivation.rule}. Available is {figures.derivation.credits_available_rule}.
      </p>
      <p>
        <button class="button button--quiet" onClick={() => setOpen(!open)}
                aria-expanded={open ? 'true' : 'false'}>
          {open ? 'Hide the workings' : 'The workings'}
        </button>
      </p>
      {open ? (
        <div class="stack-s">
          <p class="label">Movements in</p>
          {figures.derivation.movements_in.length === 0 ? (
            <p class="note">No credit has entered in this category.</p>
          ) : (
            <ul class="stack-s">
              {figures.derivation.movements_in.map((m) => (
                <li key={m.reference} class="note">
                  <span class="mono">{m.reference}</span> · {m.movement} ·{' '}
                  <span class="mono">{formatInt(m.mass_g)} g</span>
                  {m.batch ? <> · from <Link href={`/console/batches/${m.batch}`}>{m.batch}</Link></> : null}
                  {m.factor_version ? <> · factor <span class="mono">{m.factor_version}</span></> : null}
                </li>
              ))}
            </ul>
          )}
          {figures.derivation.movements_inbound.length ? (
            <>
              <p class="label">Inbound credits, never fresh</p>
              <ul class="stack-s">
                {figures.derivation.movements_inbound.map((m) => (
                  <li key={m.reference} class="note">
                    <span class="mono">{m.reference}</span> ·{' '}
                    <span class="mono">{formatInt(m.mass_g)} g</span> from{' '}
                    <span class="mono">{m.origin_site}</span> · fresh credit: no
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p class="label">Movements out</p>
          {figures.derivation.movements_out.length === 0 ? (
            <p class="note">No claim has been attached in this category.</p>
          ) : (
            <ul class="stack-s">
              {figures.derivation.movements_out.map((m) => (
                <li key={m.reference} class="note">
                  <span class="mono">{m.reference}</span> · {m.movement} ·{' '}
                  <span class="mono">{formatInt(m.mass_g)} g</span>
                  {m.lot ? <> · to <Link href={`/console/lots/${m.lot}/genealogy`}>{m.lot}</Link></> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function BalanceList() {
  const periods = useFetch('/balance-periods');
  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Console</p>
        <h1 style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          The ledger
        </h1>
      </section>
      <section class="section">
        {periods.loading ? <Loading what="the balance periods" /> : null}
        {periods.data && periods.data.length === 0 ? (
          <Empty>There is no balance period yet.</Empty>
        ) : null}
        {periods.data ? (
          <ul class="grid grid--3">
            {periods.data.map((p) => (
              <li class="card stack-s" key={p.id}>
                <p class="mono">
                  <Link href={`/console/balance/${p.id}`}>{p.id}</Link>
                </p>
                <p class="note">{p.site} · {p.grade} · {p.period.from} to {p.period.to}</p>
                <p>
                  {p.state === 'closed'
                    ? <State word="closed" strong><Mark kind="lock" label="" /></State>
                    : <State word="open" />}
                </p>
                <p class="mono note">
                  post-consumer available {formatInt(p.post_consumer.credits_available_g)} g
                </p>
                <p class="mono note">
                  pre-consumer available {formatInt(p.pre_consumer.credits_available_g)} g
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

export function Balance({ id }) {
  const period = useFetch(`/balance-periods/${id}`, [id]);
  const lots = useFetch('/lots');
  const [refusal, setRefusal] = useState(null);
  const [nonce, setNonce] = useState(0);
  const p = period.data;

  // An allocation is a deliberate act taken from the lot register, not a figure
  // typed on this screen: no percentage is ever accepted from a person.
  const allocate = async (lot, category, massG) => {
    setRefusal(null);
    try {
      await api(`/balance-periods/${id}/allocations`, {
        method: 'POST',
        body: { lot, category, mass_g: massG },
      });
      setNonce(nonce + 1);
      window.location.reload();
    } catch (e) {
      setRefusal({ error: e, lot, category, requested: massG });
    }
  };

  return (
    <div class="shell page">
      <section class="section" style="padding-top:2.5rem">
        <p class="eyebrow">Balance period</p>
        <h1 class="mono" style="font-size:var(--h3-size);line-height:var(--h3-line);margin-top:0.5rem">
          {id}
        </h1>
        <p class="note measure" style="margin-top:0.75rem">
          Every figure is derived and every figure links to the records it came from. The
          invariant's margin is shown as a mass.
        </p>
      </section>

      {period.loading ? <Loading what="this balance period" /> : null}
      {period.error ? <Empty>No balance period at this address.</Empty> : null}

      {refusal ? (
        <section class="section" style="padding-top:0">
          <Refusal title="This allocation is refused.">
            <p>
              Available: <span class="mono">{formatInt(refusal.error.body.available_g)} g</span>.
              Requested: <span class="mono">{formatInt(refusal.error.body.requested_g)} g</span>.
            </p>
            <p class="note">
              No credit moved and the figures below are unchanged. To attach this claim, the
              ledger has to hold the credit: consume more claimable feedstock into{' '}
              <span class="mono">{id}</span>, or attach a smaller mass.
            </p>
          </Refusal>
        </section>
      ) : null}

      {p ? (
        <>
          <section class="section">
            <p style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
              <State word={p.state} strong={p.state === 'closed'}>
                {p.state === 'closed' ? <Mark kind="lock" label="" /> : null}
              </State>
              <span class="note">{p.site} · {p.grade} · {p.period.from} to {p.period.to}</span>
            </p>
            {p.state === 'closed' ? (
              <p style="margin-top:0.75rem">
                This period is closed. Corrections require a restatement. Closed on{' '}
                <span class="mono">{p.closed_on}</span>, with a cut-off of{' '}
                <span class="mono">{p.cut_off}</span>.
              </p>
            ) : null}
            <p class="note" style="margin-top:0.5rem">
              Read at <span class="mono">{p.read_at}</span>.
            </p>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Credits, per category
            </h2>
            <p class="note" style="margin-top:0.5rem">The two categories are never netted.</p>
            <div class="grid grid--2" style="margin-top:1rem">
              <CategoryBlock name="post_consumer" figures={p.post_consumer} periodId={id} />
              <CategoryBlock name="pre_consumer" figures={p.pre_consumer} periodId={id} />
            </div>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Three counts, and none is a badge
            </h2>
            <dl class="stack-s" style="margin-top:1rem">
              <div class="balance-figure">
                <dt class="label" style="margin:0">Overrides this period</dt>
                <dd class="balance-figure__value" style="margin:0">{p.override_count}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Open restatements</dt>
                <dd class="balance-figure__value" style="margin:0">{p.open_restatement_count}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Audit findings past their date</dt>
                <dd class="balance-figure__value" style="margin:0">{p.open_finding_count}</dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Non-claimable input</dt>
                <dd class="balance-figure__value" style="margin:0">
                  {formatInt(p.non_claimable_input_g)} g
                </dd>
              </div>
              <div class="balance-figure">
                <dt class="label" style="margin:0">Carry-over limit</dt>
                <dd class="balance-figure__value" style="margin:0">{p.carry_over_limit_bp} bp</dd>
              </div>
            </dl>
            {p.non_claimable_derivation.length ? (
              <ul class="stack-s" style="margin-top:1rem">
                {p.non_claimable_derivation.map((n) => (
                  <li class="note" key={n.batch}>
                    <Link href={`/console/batches/${n.batch}`} class="mono">{n.batch}</Link> ·{' '}
                    <span class="mono">{formatInt(n.mass_g)} g</span> · {n.reason.replace(/_/g, ' ')}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Conversion factors in force
            </h2>
            <div class="scroller" style="margin-top:1rem">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Version</th><th scope="col" class="num">Factor</th>
                    <th scope="col">Derivation window</th><th scope="col" class="num">In</th>
                    <th scope="col" class="num">Out</th><th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {p.conversion_factors.map((f) => (
                    <tr key={f.reference}>
                      <td class="mono">{f.reference} v{f.version}</td>
                      <td class="num">{f.factor_bp} bp</td>
                      <td>{f.derivation_window}</td>
                      <td class="num">{formatInt(f.derived_in_g)} g</td>
                      <td class="num">{formatInt(f.derived_out_g)} g</td>
                      <td>
                        {f.provisional
                          ? <State word="provisional" strong />
                          : <State word="derived" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section class="section">
            <h2 style="font-size:var(--h4-size);line-height:var(--h4-line)">
              Attach claim to a lot
            </h2>
            <p class="note measure" style="margin-top:0.5rem">
              A claim is attached as a mass in grams. No percentage is accepted here, on this route
              or on any other: the percentage is computed from the ledger.
            </p>
            {lots.data ? (
              <ul class="stack" style="margin-top:1rem">
                {lots.data.filter((l) => l.site === p.site).map((l) => (
                  <li class="card stack-s" key={l.reference}>
                    <p class="mono">
                      <Link href={`/console/lots/${l.reference}/genealogy`}>{l.reference}</Link>
                    </p>
                    <p class="note">
                      {formatInt(l.mass_g)} g · <State word={l.disposition} /> · attached{' '}
                      <span class="mono">{formatInt(l.credit_attached_g)} g</span> ·{' '}
                      {l.content_bp} bp ({formatBp(l.content_bp)}), {l.claim_type.replace(/_/g, ' ')}
                    </p>
                    {p.state === 'open' ? (
                      <p style="display:flex;gap:0.5rem;flex-wrap:wrap">
                        <button class="button button--quiet"
                                onClick={() => allocate(l.reference, 'post_consumer',
                                                        p.post_consumer.credits_available_g || 1)}>
                          Attach the available post-consumer credit
                        </button>
                        <button class="button button--quiet"
                                onClick={() => allocate(l.reference, 'post_consumer',
                                                        p.post_consumer.credits_in_g + 40000)}>
                          Attach more than the ledger holds
                        </button>
                      </p>
                    ) : (
                      <p class="note">
                        This period is closed. Corrections require a restatement.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Loading what="the lot register" />}
          </section>
        </>
      ) : null}
    </div>
  );
}
