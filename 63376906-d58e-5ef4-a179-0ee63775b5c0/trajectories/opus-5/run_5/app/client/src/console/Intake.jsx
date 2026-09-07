import { useApi, useMeta, Link, grams, words, dateOf, bp } from '../lib.jsx';
import { Loading, Empty, Word, StateWords, IconWarning } from '../components/Bits.jsx';

export function Intake() {
  useMeta('Intake — Ravel console', 'Feedstock arrival: the batch register with claimability, custody and flags.');
  const batches = useApi('/batches');
  const collectors = useApi('/collectors');

  return (
    <>
      <h1 class="display-2">Intake</h1>
      <p class="note" style="margin-top:0.5rem">
        A batch resolves its claimability against the collector approval in force on its receipt date, never a current
        flag. Every figure is computed on dry mass.
      </p>

      <h2 class="display-2" style="margin-top:2rem">Batches</h2>
      {batches.loading ? <Loading what="the batch register" /> : null}
      {batches.error ? <Empty>The batch register could not be loaded.</Empty> : null}
      {batches.data && !batches.data.length ? <Empty>No batch has been booked in.</Empty> : null}

      <div class="stack" style="margin-top:1.25rem">
        {(batches.data || []).map((b) => (
          <article key={b.reference} class="card">
            <div class="node-head">
              <span class="mono">{b.reference}</span>
              <StateWords flags={b.flags} claimable={b.claimable} />
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {b.collector_name} <span class="mono">({b.collector})</span> · {b.site} · category {words(b.category)} ·
              received {dateOf(b.received_on)}
            </p>
            <div class="scroller" style="margin-top:0.75rem">
              <table>
                <caption class="visually-hidden">The masses recorded for {b.reference}</caption>
                <thead>
                  <tr>
                    <th scope="col" class="num">Gross</th>
                    <th scope="col" class="num">Tare</th>
                    <th scope="col" class="num">Net</th>
                    <th scope="col" class="num">Moisture</th>
                    <th scope="col" class="num">Dry mass</th>
                    <th scope="col" class="num">Accepted</th>
                    <th scope="col" class="num">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="num">{b.gross_g.toLocaleString('en-GB')}</td>
                    <td class="num">{b.tare_g.toLocaleString('en-GB')}</td>
                    <td class="num">{b.net_g.toLocaleString('en-GB')}</td>
                    <td class="num">{b.moisture_bp} bp</td>
                    <td class="num">
                      <strong>{b.dry_mass_g.toLocaleString('en-GB')}</strong>
                    </td>
                    <td class="num">{Number(b.accepted_g).toLocaleString('en-GB')}</td>
                    <td class="num">{Number(b.rejected_g).toLocaleString('en-GB')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="note" style="margin-top:0.5rem">{b.derivation?.dry_mass_g}</p>

            {b.claimable === false ? (
              <div class="banner" role="note">
                <h3>Non-claimable</h3>
                {b.claimable_reason === 'custody_link_missing' ? (
                  <p>This batch cannot be claimed: {b.missing_link}.</p>
                ) : (
                  <p>
                    This collector's approval lapsed on {dateOf(b.approval_valid_to)}. Material received after that date is
                    processed but not claimed.
                  </p>
                )}
                <p class="note">It is processed as non-claimable input and grants no credit at consumption.</p>
              </div>
            ) : null}

            {b.claimable_from ? (
              <p class="note">
                Late custody evidence arrived on {dateOf(b.claimable_from)}, so this batch is claimable forward from that
                date rather than from its receipt date.
              </p>
            ) : null}

            {(b.flags || []).includes('lapsed_calibration') ? (
              <p class="note">
                The weighing device <span class="mono">{b.device}</span> was more than twelve months past its calibration
                on the receipt date. This flag is repeated on every lot this batch reaches.
              </p>
            ) : null}

            <details style="margin-top:0.75rem">
              <summary class="t-label">Composition, contamination and custody</summary>
              <div style="margin-top:0.75rem">
                <p class="t-body-small">
                  <strong>Composition.</strong> {b.composition?.polymer} declared at {b.composition?.fraction_bp} bp on
                  basis {words(b.composition?.basis || 'unknown')}
                  {b.composition?.measured_fraction_bp != null ? (
                    <>
                      , measured at {b.composition.measured_fraction_bp} bp
                      {Math.abs(b.composition.measured_fraction_bp - b.composition.fraction_bp) > 500 ? (
                        <>
                          {' '}— a departure of {Math.abs(b.composition.measured_fraction_bp - b.composition.fraction_bp)} basis points,
                          which stands as a finding against the collector rather than against the plant
                        </>
                      ) : null}
                    </>
                  ) : (
                    ', not yet sampled'
                  )}
                  .
                </p>
                <p class="t-body-small">
                  <strong>Contamination.</strong> non-nylon {b.contamination?.non_nylon_bp} bp, elastane{' '}
                  {b.contamination?.elastane_bp} bp, coatings {b.contamination?.coatings}, colour load{' '}
                  {b.contamination?.colour_load}, foreign matter {b.contamination?.foreign_matter}.
                </p>
                <p class="t-body-small">
                  <strong>Custody.</strong> {b.custody_complete ? 'The chain is complete.' : `Missing: ${(b.missing_links || []).join(', ')}.`}
                </p>
                <ol style="margin-top:0.5rem">
                  {(b.custody || []).map((l, i) => (
                    <li key={i} class="t-body-small">
                      {words(l.kind)} — {l.party || 'no party named'} — {dateOf(l.date)}
                      {l.late ? ` (late evidence, arrived ${dateOf(l.arrived_on)})` : ''}
                    </li>
                  ))}
                </ol>
                <p style="margin-top:0.5rem">
                  <Link href={`/console/record?object=${b.reference}`} class="t-label-small">
                    This batch in the record
                  </Link>
                </p>
              </div>
            </details>
          </article>
        ))}
      </div>

      <h2 class="display-2" style="margin-top:2.5rem">Collectors</h2>
      {collectors.loading ? <Loading what="the collectors" /> : null}
      <div class="stack" style="margin-top:1.25rem">
        {(collectors.data || []).map((c) => (
          <article key={c.reference} class="card">
            <div class="node-head">
              <span class="mono">{c.reference}</span>
              <span class="t-label">{c.name}</span>
            </div>
            <p class="t-body-small" style="margin-top:0.5rem">
              {c.country} · registration <span class="mono">{c.registration}</span> expiring{' '}
              {dateOf(c.registration_expiry)} · scheme {words(c.scheme_status)}
            </p>
            <div class="scroller" style="margin-top:0.75rem">
              <table>
                <caption class="visually-hidden">Approval periods for {c.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">State</th>
                    <th scope="col">Valid from</th>
                    <th scope="col">Valid to</th>
                    <th scope="col">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {c.approval_periods.map((a) => (
                    <tr key={a.reference}>
                      <td>
                        <Word firm={a.state === 'lapsed' || a.state === 'suspended'}>{words(a.state)}</Word>
                        {a.expiring ? <Word firm>Expiring</Word> : null}
                        {a.expired ? <Word firm>Expired</Word> : null}
                      </td>
                      <td class="mono">{dateOf(a.valid_from)}</td>
                      <td class="mono">{dateOf(a.valid_to)}</td>
                      <td>
                        {a.condition ? (
                          <>
                            {a.condition} <span class="note">closing by {dateOf(a.condition_closes_on)}</span>
                          </>
                        ) : (
                          <span class="note">none</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(c.findings || []).length ? (
              <div class="banner" role="note">
                <h3>Findings against this collector</h3>
                {c.findings.map((f) => (
                  <p key={f.reference}>
                    <span class="mono">{f.reference}</span> — {f.detail} Raised {dateOf(f.raised_on)}
                    {f.due_on ? `, due ${dateOf(f.due_on)}` : ''}. State {words(f.state)}.
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
