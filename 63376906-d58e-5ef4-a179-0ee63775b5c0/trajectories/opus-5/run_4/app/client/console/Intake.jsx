import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, Icon, grams, words, Reveal } from '../ui.jsx';

export default function Intake({ session }) {
  const batches = useAsync(() => api('/batches'));
  const collectors = useAsync(() => api('/collectors'));

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Intake</p>
        <h1 class="t-h3">Feedstock arrival</h1>
        <p class="t-big">
          A batch resolves its claimability against the collector approval in force on its receipt
          date, never a current flag. Every figure is computed on dry mass.
        </p>
      </div>

      <section aria-labelledby="b">
        <h2 id="b" class="t-h4">The batch register</h2>
        {batches.loading ? <Loading what="the batch register" /> : null}
        {batches.error ? <Empty>The batch register could not be read.</Empty> : null}
        {batches.data && batches.data.length === 0 ? (
          <Empty>No batch has been booked in. There is nothing in the register yet.</Empty>
        ) : null}
        {batches.data && batches.data.length > 0 ? (
          <Reveal>
            <div class="table-scroll">
              <table>
                <caption>
                  Dry mass is net mass times one minus moisture, floored. Accepted mass plus
                  rejected mass equals delivered mass.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Batch</th>
                    <th scope="col">Collector, as it was named then</th>
                    <th scope="col">Category</th>
                    <th scope="col">Received</th>
                    <th scope="col" class="num">Net</th>
                    <th scope="col" class="num">Moisture</th>
                    <th scope="col" class="num">Dry mass</th>
                    <th scope="col">Claimable</th>
                    <th scope="col">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.data.map((b) => (
                    <tr key={b.reference}>
                      <th scope="row" class="mono">{b.reference}</th>
                      <td>
                        {b.collector_name}<br />
                        <span class="mono t-small" style="color:var(--muted)">{b.collector}</span>
                      </td>
                      <td>{words(b.category)}</td>
                      <td class="mono">{b.received_on}</td>
                      <td class="num">{b.net_g.toLocaleString('en-GB')}</td>
                      <td class="num">{b.moisture_bp} bp</td>
                      <td class="num">{b.dry_mass_g.toLocaleString('en-GB')}</td>
                      <td>
                        {b.claimable
                          ? <StateWord word="Claimable" />
                          : <StateWord word="Non-claimable" heavy icon={<Icon name="warning" label="Warning" />} />}
                        {b.claimable_reason ? (
                          <p class="t-small" style="margin:0.35rem 0 0">{b.claimable_reason_text}</p>
                        ) : null}
                        {b.claimable_from ? (
                          <p class="t-small" style="margin:0.35rem 0 0">
                            Claimable forward from <span class="mono">{b.claimable_from}</span>,
                            the date the late evidence arrived.
                          </p>
                        ) : null}
                      </td>
                      <td>
                        {b.flags.map((f) => (
                          <StateWord key={f.flag} word={f.word} heavy icon={<Icon name="warning" label="Warning" />} />
                        ))}
                        {!b.custody_complete ? (
                          <StateWord word={`Custody incomplete: ${b.custody_missing.join(', ')}`} heavy />
                        ) : null}
                        {b.flags.length === 0 && b.custody_complete ? (
                          <span class="t-small" style="color:var(--muted)">none</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        ) : null}
      </section>

      <section aria-labelledby="c" style="margin-top:3rem">
        <h2 id="c" class="t-h4">Collectors and their approval periods</h2>
        {collectors.loading ? <Loading what="the collectors" /> : null}
        {collectors.data && collectors.data.length === 0 ? (
          <Empty>No collector is recorded.</Empty>
        ) : null}
        {collectors.data ? (
          <div class="grid grid-3">
            {collectors.data.map((c) => (
              <div class="sheet" key={c.reference}>
                <p class="t-eyebrow" style="margin-bottom:0.35rem">{c.reference}</p>
                <h3 class="t-h4">{c.name}</h3>
                <dl class="t-small" style="margin:0 0 1rem">
                  <div class="spread"><dt>Country</dt><dd class="mono" style="margin:0">{c.country}</dd></div>
                  <div class="spread"><dt>Registration</dt><dd class="mono" style="margin:0">{c.registration}</dd></div>
                  <div class="spread"><dt>Expiry</dt><dd class="mono" style="margin:0">{c.registration_expiry}</dd></div>
                  <div class="spread"><dt>Scheme</dt><dd style="margin:0">{words(c.scheme_status)}</dd></div>
                </dl>
                <p class="t-eyebrow" style="margin-bottom:0.35rem">Approval periods</p>
                {c.approval_periods.map((p) => (
                  <p class="t-small" key={p.reference} style="margin:0 0 0.5rem">
                    <StateWord word={words(p.state)} heavy={['lapsed', 'suspended'].includes(p.state)} />{' '}
                    <span class="mono">{p.valid_from} → {p.valid_to}</span>
                    {p.expiring ? <><br /><strong>{p.expiring_note}</strong></> : null}
                    {p.condition ? (
                      <><br />Condition: {p.condition}, closing by <span class="mono">{p.condition_closes_on}</span></>
                    ) : null}
                  </p>
                ))}
                {c.findings.length ? (
                  <>
                    <p class="t-eyebrow" style="margin:1rem 0 0.35rem">Findings</p>
                    {c.findings.map((f) => (
                      <p class="t-small" key={f.reference} style="margin:0 0 0.5rem">
                        <StateWord word={words(f.state)} heavy={f.state === 'open'} />{' '}
                        <span class="mono">{f.reference}</span> — {f.detail}
                        {f.past_due ? <> <strong>Past its date of {f.due_on}.</strong></> : null}
                      </p>
                    ))}
                  </>
                ) : (
                  <p class="t-small" style="color:var(--muted)">No finding stands against this collector.</p>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
