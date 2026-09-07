import { useState } from 'preact/hooks';
import { api, getUser } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, CarbonFigure, useAsync, formatInt, Refusal,
} from '../../components/common.jsx';

export default function LotDetail({ reference }) {
  const [version, setVersion] = useState(0);
  const lot = useAsync(() => api.get(`/lots/${reference}`), [reference, version]);
  const carbon = useAsync(() => api.get(`/lots/${reference}/carbon`).catch((e) => ({ refused: e })), [reference, version]);
  const user = getUser();
  const canReview = (user?.roles || []).some((r) => ['quality_manager', 'claims_manager'].includes(r));
  const canYield = (user?.roles || []).some((r) => ['plant_operator', 'quality_manager', 'claims_manager', 'lab_analyst', 'auditor'].includes(r));

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Lot</p>
      <h1 className="t-h3 mono">{reference}</h1>

      {lot.loading ? <Loading what="this lot" /> : null}
      {lot.error ? <Empty>This lot could not be read.</Empty> : null}

      {lot.data ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            <StateWord quiet>{lot.data.disposition}</StateWord>
            {lot.data.open_deviation ? <StateWord icon="warning">Open deviation</StateWord> : null}
            {lot.data.unreviewed_override_count ? <StateWord icon="warning">Unreviewed override</StateWord> : null}
            {lot.data.flags.map((f) => <StateWord icon="flag" key={f}>{f.replace(/_/g, ' ')}</StateWord>)}
          </div>

          <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h2 className="t-h4">The lot</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Site</dt><dd className="mono">{lot.data.site}</dd>
                <dt>Grade</dt><dd className="mono">{lot.data.grade}</dd>
                <dt>Mass</dt><dd className="mono">{formatInt(lot.data.mass_g)} g</dd>
                <dt>Produced on</dt><dd className="mono">{lot.data.produced_on}</dd>
                <dt>Specification</dt><dd className="mono">{lot.data.specification_version}</dd>
                <dt>Disposition</dt><dd>{lot.data.disposition} {lot.data.disposition_by ? `by ${lot.data.disposition_by}` : ''}</dd>
                <dt>Claim</dt><dd><Content contentBp={lot.data.content_bp} claimType={lot.data.claim_type} /></dd>
                <dt>Credit attached</dt><dd className="mono">{formatInt(lot.data.credit_attached_g)} g</dd>
              </dl>
              <p className="t-small" style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>{lot.data.derivation}</p>
              <p className="t-small" style={{ marginTop: '1rem' }}>
                <Link href={`/console/lots/${reference}/genealogy`}>Genealogy</Link>
              </p>
            </div>

            <div className="card">
              <h2 className="t-h4">Carbon</h2>
              {carbon.loading ? <Loading what="the carbon figure" /> : null}
              {carbon.data?.refused ? (
                <Refusal error={carbon.data.refused} title="The carbon figure was refused" />
              ) : null}
              {carbon.data && !carbon.data.refused ? (
                <div style={{ marginTop: '1rem' }}>
                  <CarbonFigure carbon={carbon.data} />
                  <p className="label" style={{ marginTop: '1rem' }}>Breakdown</p>
                  <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                    <table>
                      <thead><tr><th scope="col">Line</th><th scope="col" className="num">mg/kg</th><th scope="col">Tag</th></tr></thead>
                      <tbody>
                        {carbon.data.breakdown.map((b) => (
                          <tr key={b.line}>
                            <td>{b.line.replace(/_/g, ' ')}</td>
                            <td className="num">{formatInt(b.mg_per_kg)}</td>
                            <td>{b.tag}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="label" style={{ marginTop: '1rem' }}>Energy, both figures</p>
                  <dl className="dl">
                    <dt>Location-based</dt><dd className="mono">{formatInt(carbon.data.energy_location_mg_per_kg)} mg/kg</dd>
                    <dt>Market-based</dt><dd className="mono">{formatInt(carbon.data.energy_market_mg_per_kg)} mg/kg</dd>
                    <dt>Metered</dt><dd className="mono">{formatInt(carbon.data.metered_kwh)} kWh</dd>
                    <dt>Retired</dt><dd className="mono">{formatInt(carbon.data.retired_kwh)} kWh</dd>
                    <dt>Unmatched</dt><dd className="mono">{formatInt(carbon.data.unmatched_kwh)} kWh</dd>
                    <dt>Primary share</dt><dd className="mono">{carbon.data.primary_share_bp} bp</dd>
                  </dl>
                  {carbon.data.default_led ? (
                    <div style={{ marginTop: '0.5rem' }}><StateWord icon="flag">Default-led</StateWord></div>
                  ) : null}
                  {!carbon.data.cache_valid ? (
                    <div style={{ marginTop: '0.5rem' }}><StateWord icon="warning">Cache invalid; a recomputation is a recorded act</StateWord></div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {lot.data.overrides.length ? (
            <section className="section">
              <h2 className="t-h4">Overrides</h2>
              <p className="t-small" style={{ marginTop: '0.5rem' }}>
                An override is permanent, shows on this lot for its life, and blocks signing until a
                second person reviews it. A review removes nothing.
              </p>
              <div className="stack" style={{ marginTop: '1rem' }}>
                {lot.data.overrides.map((o) => (
                  <div className="card-quiet" key={o.reference}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="mono">{o.reference}</span>
                      {o.reviewed
                        ? <StateWord quiet>Reviewed by {o.reviewed_by}</StateWord>
                        : <StateWord icon="warning">Unreviewed</StateWord>}
                    </div>
                    <p className="t-small statement" style={{ marginTop: '0.5rem' }}>{o.statement}</p>
                    <dl className="dl" style={{ marginTop: '0.5rem' }}>
                      <dt>Separation</dt><dd>{o.separation.replace(/_/g, ' ')}</dd>
                      <dt>Reason</dt><dd>{o.reason}</dd>
                    </dl>
                    {!o.reviewed && canReview ? (
                      <ReviewOverride reference={o.reference} authorisedBy={o.authorised_by} onDone={() => setVersion((v) => v + 1)} />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {lot.data.deviations.length ? (
            <section className="section">
              <h2 className="t-h4">Deviations</h2>
              <div className="stack" style={{ marginTop: '1rem' }}>
                {lot.data.deviations.map((d) => (
                  <div className="card-quiet" key={d.reference}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="mono">{d.reference}</span>
                      {d.state === 'open'
                        ? <StateWord icon="warning">Open</StateWord>
                        : <StateWord quiet>Closed, {(d.outcome || '').replace(/_/g, ' ')}</StateWord>}
                    </div>
                    <p className="t-small" style={{ marginTop: '0.5rem', marginBottom: 0 }}>{d.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {lot.data.test_results.length ? (
            <section className="section">
              <h2 className="t-h4">Test results</h2>
              <div className="table-scroll" style={{ marginTop: '1rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Reference</th><th scope="col">Property</th><th scope="col">Method</th>
                      <th scope="col" className="num">Value</th><th scope="col">Unit</th>
                      <th scope="col" className="num">Uncertainty</th><th scope="col">Entered by</th><th scope="col">Usable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lot.data.test_results.map((t) => (
                      <tr key={t.reference}>
                        <td className="mono">{t.reference}</td>
                        <td>{t.property.replace(/_/g, ' ')}</td>
                        <td className="mono">{t.method}</td>
                        <td className="num">{t.value}</td>
                        <td>{t.unit}</td>
                        <td className="num">{t.uncertainty_bp} bp</td>
                        <td className="t-small">{t.entered_by}</td>
                        <td>
                          {t.usable_for_release
                            ? <StateWord quiet>Usable for release</StateWord>
                            : <StateWord icon="flag">Method mismatch, evidence only</StateWord>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {canYield ? <Yield reference={reference} /> : null}
        </>
      ) : null}
    </div>
  );
}

function ReviewOverride({ reference, authorisedBy, onDone }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const user = getUser();
  const isAuthoriser = String(user?.email).toLowerCase() === String(authorisedBy).toLowerCase();

  async function review() {
    setBusy(true); setError(null);
    try {
      await api.post(`/overrides/${reference}/review`, {});
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <Refusal error={error} title="The review was refused" />
      {isAuthoriser ? (
        <p className="t-small" style={{ marginBottom: 0 }}>
          You authorised this override, so you cannot review it. A second person reviews it.
        </p>
      ) : (
        <button type="button" className="button" onClick={review} disabled={busy}>
          {busy ? 'Reviewing…' : 'Review this override'}
        </button>
      )}
    </div>
  );
}

// A yield figure appears on no certificate and in no verification answer.
function Yield({ reference }) {
  const y = useAsync(() => api.get(`/lots/${reference}/yield`).catch((e) => ({ refused: e })), [reference]);
  if (y.loading) return null;
  if (!y.data || y.data.refused) return null;
  return (
    <section className="section">
      <h2 className="t-h4">Yield</h2>
      <p className="t-small" style={{ marginTop: '0.5rem' }}>{y.data.note}</p>
      <div className="figure-rows" style={{ marginTop: '1rem', maxWidth: '36rem' }}>
        <div className="figure-row"><div>Input mass</div><div className="figure-value">{formatInt(y.data.input_mass_g)} g</div></div>
        <div className="figure-row"><div>Lot mass</div><div className="figure-value">{formatInt(y.data.lot_mass_g)} g</div></div>
        <div className="figure-row"><div>Losses</div><div className="figure-value">{formatInt(y.data.losses_g)} g</div></div>
        <div className="figure-row"><div>Yield</div><div className="figure-value">{y.data.yield_bp} bp</div></div>
      </div>
      <p className="t-small" style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>{y.data.derivation}</p>
    </section>
  );
}
