import { useState } from 'preact/hooks';
import { api } from '../api.js';
import {
  useAsync, Loading, Empty, StateWord, Icon, grams, words, Refusal,
  ContentFigure, CarbonFigure, EnergyPair,
} from '../ui.jsx';

const CONDITION_TITLE = {
  lot_released: 'The lot is released',
  no_open_deviation: 'No deviation touching it is open',
  no_unreviewed_override: 'No override on it is unreviewed',
  period_closed: 'The bookkeeping period is closed',
  balance_invariant_holds: 'The balance invariant holds with the allocation applied',
  carbon_figure_complete: 'The carbon figure exists with all four components',
  signer_holds_scope: 'The signer held signing scope for that site on the date of signing',
  signer_did_not_enter_data: 'The signer did not enter the data',
};

export default function CertificateDetail({ session, params }) {
  const number = params.number;
  const [tick, setTick] = useState(0);
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const c = useAsync(() => api(`/certificates/${number}`), [number, tick]);
  const doc = useAsync(() => fetch(`/api/certificates/${number}/document`).then((r) => r.text()), [number, tick]);
  const replay = useAsync(() => api(`/certificates/${number}/replay`), [number, tick]);
  const impact = useAsync(
    () => (withdrawing ? api('/batches/BATCH-1001/impact').catch(() => null) : Promise.resolve(null)),
    [withdrawing]
  );

  const canSign = (session?.roles || []).includes('certificate_signer');

  async function withdraw(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api(`/certificates/${number}/withdraw`, { body: { reason } });
      setResult(r);
      setWithdrawing(false);
      setTick((t) => t + 1);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const d = c.data;

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Certificate</p>
        <h1 class="t-h3 mono">{number}</h1>
        {d ? (
          <p class="row" style="align-items:center">
            <StateWord word={words(d.state)} heavy={d.state === 'withdrawn'} />
            {d.provisional_factor ? <StateWord word="Provisional factor" heavy /> : null}
            {(d.deviations || []).filter((x) => x.state === 'open').length ? (
              <StateWord word="Deviation open" heavy />
            ) : null}
          </p>
        ) : null}
      </div>

      {c.loading ? <Loading what="the certificate" /> : null}
      {c.error ? <Empty>This certificate could not be read.</Empty> : null}

      <Refusal error={error} />

      {d && d.state === 'withdrawn' ? (
        <div class="banner" role="alert">
          <p class="t-eyebrow">Withdrawn</p>
          <p style="margin-bottom:0">
            <strong>
              This certificate was withdrawn on {d.withdrawn_on}. Reason: {d.withdrawal_reason}.
            </strong>{' '}
            Withdrawn by {d.withdrawn_by}. It is retained and readable at its address.
          </p>
        </div>
      ) : null}

      {result ? (
        <section class="banner" role="status" aria-labelledby="wr">
          <p class="t-eyebrow" id="wr">Withdrawal complete — five consequences</p>
          <ol style="margin:0;padding-left:1.25rem">
            <li>The state is now <strong>withdrawn</strong>, with the reason, the person and the date.</li>
            <li>
              The recipient was notified by mail:{' '}
              {result.notified_recipients.map((r) => <strong key={r.reference}>{r.name}</strong>)}.
            </li>
            <li>
              {result.void_statements.length} downstream statements are now void and enumerated in
              the notification.
            </li>
            <li>
              {result.derived_certificates.length} certificates derived from this one were
              identified and resolved.
            </li>
            <li>
              The reverse traversal of the underlying batches ran and enumerated{' '}
              {result.batch_traversal.length} batches and every other certificate touching them.
            </li>
          </ol>
        </section>
      ) : null}

      {d ? (
        <>
          <section aria-labelledby="facts">
            <h2 id="facts" class="t-h4">The certificate</h2>
            <dl class="def">
              <dt>Number</dt><dd class="mono">{d.number}</dd>
              <dt>Version</dt><dd class="mono">{d.version}</dd>
              <dt>State</dt><dd>{words(d.state)}</dd>
              <dt>Site</dt><dd class="mono"><a href={`/console/sites/${d.site}`}>{d.site}</a></dd>
              <dt>Grade</dt><dd class="mono">{d.grade}</dd>
              <dt>Lots</dt>
              <dd class="mono">
                {d.lots.map((l) => (
                  <><a href={`/console/lots/${l.reference}`}>{l.reference}</a> — {grams(l.mass_g)}<br /></>
                ))}
              </dd>
              <dt>Specification version</dt><dd class="mono">{d.grade} v{d.specification_version}</dd>
              <dt>Claim type</dt><dd>{words(d.claim_type)}</dd>
              <dt>Recycled content</dt>
              <dd><ContentFigure content_bp={d.content_bp} claim_type={d.claim_type} /></dd>
              <dt>Category split</dt>
              <dd class="mono">
                post-consumer {grams(d.category_split.post_consumer)} · pre-consumer {grams(d.category_split.pre_consumer)}
              </dd>
              <dt>Balance period</dt>
              <dd class="mono"><a href={`/console/balance/${d.period}`}>{d.period}</a></dd>
              <dt>Carbon</dt><dd><CarbonFigure carbon={d.carbon} /></dd>
              <dt>Energy</dt>
              <dd>
                <EnergyPair
                  location={d.carbon.energy_location_mg_per_kg}
                  market={d.carbon.energy_market_mg_per_kg}
                />
              </dd>
              <dt>Primary data share</dt><dd class="mono">{d.primary_share_bp} bp</dd>
              <dt>Scheme</dt><dd class="mono">{d.scheme}</dd>
              <dt>Registration</dt><dd class="mono">{d.registration}</dd>
              <dt>Signer</dt><dd>{d.signer_name} ({d.signer})</dd>
              <dt>Signed at</dt><dd class="mono">{d.signed_at}</dd>
              <dt>Verification</dt>
              <dd><a href={`/verify/${d.number}`}>{d.verification_url}</a></dd>
              <dt>Provisional factor</dt>
              <dd>{d.provisional_factor ? 'Yes — this certificate rests on a provisional conversion factor.' : 'No'}</dd>
            </dl>
          </section>

          <section aria-labelledby="stmt" style="margin-top:2.5rem">
            <h2 id="stmt" class="t-h4">What the recipient may and may not say</h2>
            <div class="sheet permitted-statement">
              <p class="t-eyebrow">Permitted</p>
              <p class="t-big" style="margin-bottom:0">{d.permitted_statement}</p>
            </div>
            <div class="sheet prohibited-statement" style="margin-top:1rem">
              <p class="t-eyebrow">Prohibited</p>
              <p class="t-big" style="margin-bottom:0">{d.prohibited_statement}</p>
            </div>
          </section>

          <section aria-labelledby="cond" style="margin-top:2.5rem">
            <h2 id="cond" class="t-h4">The eight conditions, as they stood at the moment of signing</h2>
            <p class="t-small" style="color:var(--muted)">
              Stored, and never recomputed on read.
            </p>
            <div class="conditions">
              {(d.conditions || []).map((x) => (
                <div class="condition-row" key={x.condition}>
                  <p style="margin:0"><strong>{CONDITION_TITLE[x.condition] || words(x.condition)}</strong></p>
                  <p style="margin:0">{x.detail}</p>
                  <p style="margin:0"><StateWord word={x.satisfied ? 'Satisfied' : 'Blocking'} heavy={!x.satisfied} /></p>
                </div>
              ))}
            </div>
          </section>

          {(d.deviations || []).length ? (
            <section aria-labelledby="dev" style="margin-top:2.5rem">
              <h2 id="dev" class="t-h4">Deviations touching this certificate's lots</h2>
              <p class="t-small" style="color:var(--muted)">
                A deviation travels with every lot it touches and appears on the internal view of
                any certificate issued against that lot.
              </p>
              <ul>
                {d.deviations.map((x) => (
                  <li key={x.reference}>
                    <a href={`/console/deviations/${x.reference}`} class="mono">{x.reference}</a> —{' '}
                    {x.title} — <StateWord word={words(x.state)} heavy={x.state === 'open'} />
                    {x.outcome ? <> — outcome {words(x.outcome)}</> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="replay" style="margin-top:2.5rem">
            <h2 id="replay" class="t-h4">Replay</h2>
            <p class="t-small" style="color:var(--muted)">
              Agreement and disagreement render at identical weight. A disagreement is the finding
              an auditor came for.
            </p>
            {replay.loading ? <Loading what="the replay" /> : null}
            {replay.data ? (
              replay.data.reproducible === false ? (
                <div class="banner">
                  <p class="t-eyebrow">Not reproducible</p>
                  <p style="margin-bottom:0">{replay.data.reason}</p>
                </div>
              ) : (
                <>
                  <p>
                    <StateWord word={replay.data.agrees ? 'Agrees' : 'Differs'} heavy={!replay.data.agrees} />
                  </p>
                  <div class="table-scroll">
                    <table>
                      <caption>What the certificate said, and what recomputation says now.</caption>
                      <thead>
                        <tr>
                          <th scope="col">Figure</th>
                          <th scope="col">Issued</th>
                          <th scope="col">Recomputed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(replay.data.issued).map((k) => (
                          <tr key={k}>
                            <th scope="row">{words(k)}</th>
                            <td class="mono">{String(replay.data.issued[k])}</td>
                            <td class="mono">{String(replay.data.recomputed[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {replay.data.differing_input ? (
                    <p class="banner" style="margin-top:1rem">
                      <strong>The input that differs is {words(replay.data.differing_input.input)}</strong>:
                      issued <span class="mono">{String(replay.data.differing_input.issued)}</span>,
                      recomputed <span class="mono">{String(replay.data.differing_input.recomputed)}</span>.
                    </p>
                  ) : null}
                  <p class="t-small" style="margin-top:1rem">
                    Ran against:{' '}
                    <span class="mono">{JSON.stringify(replay.data.input_versions.resolved || replay.data.input_versions)}</span>
                  </p>
                </>
              )
            ) : null}
          </section>

          <section aria-labelledby="document" style="margin-top:2.5rem">
            <h2 id="document" class="t-h4">The document</h2>
            <p class="t-small no-print" style="color:var(--muted)">
              Plain text, byte-stable, readable without this system. Two reads of the same version
              return identical bytes.{' '}
              <a href={`/api/certificates/${number}/document`}>Fetch the raw bytes.</a>
            </p>
            {doc.loading ? <Loading what="the document" /> : null}
            {doc.data ? <pre class="doc">{doc.data}</pre> : null}
          </section>

          {canSign && d.state !== 'withdrawn' ? (
            <section aria-labelledby="wd" style="margin-top:3rem" class="sheet no-print">
              <h2 id="wd" class="t-h4">Withdraw this certificate</h2>
              {!withdrawing ? (
                <p>
                  <button class="btn btn-quiet" type="button" onClick={() => setWithdrawing(true)}>
                    Begin a withdrawal <span class="btn-arrow" aria-hidden="true">→</span>
                  </button>
                </p>
              ) : (
                <>
                  <p class="banner">
                    <strong>Before you confirm, this is what a withdrawal does.</strong> It is one
                    action with five consequences and it cannot be undone. A withdrawal is never a
                    deletion: the document stays readable at its address and states the withdrawal.
                  </p>
                  <h3 class="t-h4">1. The state changes</h3>
                  <p>
                    <span class="mono">{d.number}</span> becomes <strong>withdrawn</strong>, with
                    your name, your reason and today's date.
                  </p>
                  <h3 class="t-h4">2. These recipients will be notified, by name</h3>
                  <ul>
                    <li>
                      <strong>{d.recipient_name}</strong> <span class="mono">({d.recipient})</span>
                      {' '}— by mail, one recipient, no copies
                    </li>
                  </ul>
                  <h3 class="t-h4">3. These statements the recipient is now obliged to stop making</h3>
                  <ol>
                    <li>{d.permitted_statement}</li>
                    <li>
                      This material carries {(d.content_bp / 100).toFixed(2)} per cent recycled
                      content under {d.scheme}.
                    </li>
                    <li>
                      This material is claimed by {words(d.claim_type)} under {d.scheme},
                      registration {d.registration}.
                    </li>
                    <li>
                      The carbon figure of {d.carbon.value_mg_per_kg} mg CO₂e per kg on{' '}
                      {d.carbon.boundary} under {d.carbon.method_version} applies to this material.
                    </li>
                  </ol>
                  <h3 class="t-h4">4. Every certificate derived from this one is resolved</h3>
                  <p class="t-small">
                    Identified and resolved in the same action, under the three restatement
                    outcomes.
                  </p>
                  <h3 class="t-h4">5. The reverse traversal of the underlying batches runs</h3>
                  <p class="t-small">
                    Every other certificate touching the same batches is enumerated in the same
                    action, so nothing is discovered later.
                  </p>

                  <form onSubmit={withdraw} style="margin-top:1.5rem">
                    <div class="field">
                      <label class="t-label" for="reason">
                        Reason — the only free text on a certificate
                      </label>
                      <textarea
                        id="reason" rows="3" required
                        value={reason} onInput={(e) => setReason(e.target.value)}
                      ></textarea>
                    </div>
                    <p class="row" style="margin-top:1.25rem;margin-bottom:0">
                      <button class="btn" type="submit" disabled={busy || !reason.trim()}>
                        {busy ? 'Withdrawing…' : 'Confirm the withdrawal'}{' '}
                        <span class="btn-arrow" aria-hidden="true">→</span>
                      </button>
                      <button class="btn btn-quiet" type="button" onClick={() => setWithdrawing(false)}>
                        Do not withdraw
                      </button>
                    </p>
                  </form>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
