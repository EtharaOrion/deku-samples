import { useState } from 'preact/hooks';
import { api, ApiError, getUser } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, useAsync, formatInt, Refusal,
} from '../../components/common.jsx';

const CATEGORY_LABELS = { post_consumer: 'Post-consumer', pre_consumer: 'Pre-consumer' };

export default function Balance({ id }) {
  const [version, setVersion] = useState(0);
  const period = useAsync(() => api.get(`/balance-periods/${id}`), [id, version]);
  const user = getUser();
  const canAllocate = (user?.roles || []).includes('claims_manager');

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Balance period</p>
      <h1 className="t-h3 mono">{id}</h1>

      {period.loading ? <Loading what="the ledger" /> : null}
      {period.error ? <Empty>This balance period could not be read.</Empty> : null}

      {period.data ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <StateWord quiet={period.data.state === 'open'} icon={period.data.state === 'closed' ? 'lock' : null}>
              {period.data.state}
            </StateWord>
            <StateWord quiet>{period.data.site}</StateWord>
            <StateWord quiet>Grade {period.data.grade}</StateWord>
            <StateWord quiet>{period.data.period.from} to {period.data.period.to}</StateWord>
          </div>

          {period.data.state === 'closed' ? (
            <p className="banner banner-quiet" role="note">
              This period is closed. Corrections require a restatement. It closed on{' '}
              <span className="mono">{period.data.closed_on}</span> with a cut-off of{' '}
              <span className="mono">{period.data.cut_off}</span>, after which a late event-time record
              no longer enters it.
            </p>
          ) : null}

          {/* the invariant's margin is shown as a mass, not as a state */}
          <section className="section">
            <h2 className="t-h4">Credits, per category</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              The two categories are never netted. A balance is the sum of its movements and is never
              held as a total. There is no input control on this screen.
            </p>
            <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
              {Object.entries(period.data.categories).map(([cat, v]) => (
                <div className="card" key={cat}>
                  <h3 className="t-h4">{CATEGORY_LABELS[cat] || cat}</h3>
                  <div className="figure-rows" style={{ marginTop: '1rem' }}>
                    <FigureRow label="Credits in" value={`${formatInt(v.credits_in_g)} g`} note={v.derivation.credits_in_g} />
                    <FigureRow label="Credits out" value={`${formatInt(v.credits_out_g)} g`} note={v.derivation.credits_out_g} />
                    <FigureRow
                      label="Remaining claimable mass"
                      value={`${formatInt(v.credits_available_g)} g`}
                      note={v.derivation.credits_available_g}
                    />
                    <FigureRow
                      label="Inbound credit from another site"
                      value={`${formatInt(v.inbound_credits_g)} g`}
                      note="Never a fresh credit; it names the site it came from."
                    />
                    {period.data.state === 'closed' ? (
                      <>
                        <FigureRow label="Carried forward" value={`${formatInt(v.carried_forward_g)} g`} />
                        <FigureRow label="Expired" value={`${formatInt(v.expired_g)} g`} />
                      </>
                    ) : (
                      <FigureRow
                        label="Carry-over cap at close"
                        value={`${formatInt(v.carry_over_cap_g)} g`}
                        note={`carry_over_limit_bp ${period.data.carry_over_limit_bp} of credits in, floored. The remainder expires.`}
                      />
                    )}
                  </div>

                  {v.inbound_credits.length ? (
                    <div style={{ marginTop: '1rem' }}>
                      <p className="label">Inbound credits</p>
                      <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                        {v.inbound_credits.map((m) => (
                          <li key={m.reference}>
                            <span className="mono">{m.reference}</span>: {formatInt(m.mass_g)} g from{' '}
                            <span className="mono">{m.origin_site}</span> by {m.movement}, not a fresh credit.
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <details style={{ marginTop: '1rem' }}>
                    <summary className="label" style={{ cursor: 'pointer' }}>
                      The movements behind these figures ({v.movements.length})
                    </summary>
                    <div className="table-scroll" style={{ marginTop: '0.75rem' }}>
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Reference</th><th scope="col">Kind</th>
                            <th scope="col">Direction</th><th scope="col" className="num">Mass</th>
                            <th scope="col">Effective</th><th scope="col">From</th>
                          </tr>
                        </thead>
                        <tbody>
                          {v.movements.map((m) => (
                            <tr key={m.id}>
                              <td className="mono">{m.ref}</td>
                              <td>{m.kind.replace(/_/g, ' ')}</td>
                              <td>{m.direction}</td>
                              <td className="num">{formatInt(m.mass_g)} g</td>
                              <td className="mono">{m.effective_on}</td>
                              <td className="t-small">
                                {m.derivation?.batch ? (
                                  <Link href={`/console/batches/${m.derivation.batch}`} className="ref">{m.derivation.batch}</Link>
                                ) : null}
                                {m.lot ? <Link href={`/console/lots/${m.lot}`} className="ref">{m.lot}</Link> : null}
                                {m.derivation?.formula ? <div className="t-small" style={{ color: 'var(--muted)' }}>{m.derivation.formula}</div> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </section>

          {/* three counts sit together and none is a badge to be cleared */}
          <section className="section">
            <h2 className="t-h4">Three counts</h2>
            <div className="figure-rows" style={{ marginTop: '1rem', maxWidth: '40rem' }}>
              <FigureRow label="Overrides this period" value={period.data.override_count} />
              <FigureRow label="Open restatements" value={period.data.open_restatement_count} />
              <FigureRow label="Audit findings past their date" value={period.data.findings_past_date_count} />
              <FigureRow label="Open findings" value={period.data.open_finding_count} />
              <FigureRow label="Non-claimable input" value={`${formatInt(period.data.non_claimable_input_g)} g`} />
            </div>
          </section>

          <section className="section">
            <h2 className="t-h4">Conversion factors in force</h2>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Reference</th><th scope="col" className="num">Factor</th>
                    <th scope="col">Derivation window</th><th scope="col" className="num">In</th>
                    <th scope="col" className="num">Out</th><th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {period.data.conversion_factors.map((f) => (
                    <tr key={f.reference}>
                      <td className="mono">{f.reference}</td>
                      <td className="num">{f.factor_bp} bp</td>
                      <td className="mono">{f.derived_from ? `${f.derived_from} to ${f.derived_to}` : 'no window'}</td>
                      <td className="num">{formatInt(f.derived_in_g)} g</td>
                      <td className="num">{formatInt(f.derived_out_g)} g</td>
                      <td>
                        {f.provisional ? <StateWord icon="flag">Provisional</StateWord> : <StateWord quiet>Derived</StateWord>}
                        {f.superseded ? <> <StateWord quiet>Superseded</StateWord></> : null}
                        <div className="t-small" style={{ color: 'var(--muted)', marginTop: '0.3rem' }}>{f.derivation}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="section">
            <h2 className="t-h4">Lots in this period</h2>
            {period.data.lots.length === 0 ? (
              <Empty>No lots belong to this period.</Empty>
            ) : (
              <div className="table-scroll" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Lot</th><th scope="col" className="num">Mass</th>
                      <th scope="col">Disposition</th><th scope="col">Recycled content</th>
                      <th scope="col" className="num">Credit attached</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.data.lots.map((l) => (
                      <tr key={l.reference}>
                        <td><Link href={`/console/lots/${l.reference}`} className="ref">{l.reference}</Link></td>
                        <td className="num">{formatInt(l.mass_g)} g</td>
                        <td>{l.disposition}</td>
                        <td><Content contentBp={l.content_bp} claimType={l.claim_type} compact /></td>
                        <td className="num">{formatInt(l.credit_attached_g)} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {canAllocate && period.data.state === 'open' ? (
            <Allocate periodId={id} lots={period.data.lots} onDone={() => setVersion((v) => v + 1)} />
          ) : null}

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '2rem' }}>
            Read at {period.data.read_at}. Every figure on this surface is derived; none is writable.
          </p>
        </>
      ) : null}
    </div>
  );
}

function FigureRow({ label, value, note }) {
  return (
    <div className="figure-row">
      <div>
        <div>{label}</div>
        {note ? <div className="t-small" style={{ color: 'var(--muted)' }}>{note}</div> : null}
      </div>
      {/* nothing animates a number as it changes */}
      <div className="figure-value">{value}</div>
    </div>
  );
}

// The allocation control lives beside the ledger, not on it: the balance surface
// itself carries no input. A refusal renders an inline banner here.
function Allocate({ periodId, lots, onDone }) {
  const [lot, setLot] = useState(lots[0]?.reference || '');
  const [category, setCategory] = useState('post_consumer');
  const [mass, setMass] = useState('');
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await api.post(`/balance-periods/${periodId}/allocations`, {
        lot, category, mass_g: Number(mass),
      });
      setOk(res);
      setMass('');
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2 className="t-h4">Allocate claim to a lot</h2>
      <p className="t-small" style={{ marginTop: '0.5rem' }}>
        A mass of credit is attached to a lot. No percentage is accepted here or anywhere else: the
        percentage is computed from the mass attached and the mass of the lot.
      </p>

      <Refusal error={error} title="This allocation is refused" />

      {ok ? (
        <div className="banner banner-quiet" role="status">
          <div className="banner-title">Claim attached</div>
          <p className="t-small" style={{ marginBottom: 0 }}>
            <span className="mono">{ok.reference}</span> attached {formatInt(ok.mass_g)} g to{' '}
            <span className="mono">{ok.lot}</span>.{' '}
            <Content contentBp={ok.content_bp} claimType={ok.claim_type} /> {ok.derivation}
          </p>
        </div>
      ) : null}

      <form onSubmit={submit} className="grid grid-3" style={{ marginTop: '1rem', alignItems: 'end' }}>
        <div>
          <label htmlFor="alloc-lot" className="label">Lot</label>
          <select id="alloc-lot" value={lot} onInput={(e) => setLot(e.currentTarget.value)} required>
            {lots.map((l) => <option key={l.reference} value={l.reference}>{l.reference}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="alloc-cat" className="label">Category</label>
          <select id="alloc-cat" value={category} onInput={(e) => setCategory(e.currentTarget.value)}>
            <option value="post_consumer">Post-consumer</option>
            <option value="pre_consumer">Pre-consumer</option>
          </select>
        </div>
        <div>
          <label htmlFor="alloc-mass" className="label">Mass in grams (integer)</label>
          <input id="alloc-mass" type="number" step="1" min="1" value={mass} onInput={(e) => setMass(e.currentTarget.value)} required />
        </div>
        <div>
          <button type="submit" className="button button-primary" disabled={busy || !mass}>
            {busy ? 'Allocating…' : 'Allocate claim'}
          </button>
        </div>
      </form>
    </section>
  );
}
