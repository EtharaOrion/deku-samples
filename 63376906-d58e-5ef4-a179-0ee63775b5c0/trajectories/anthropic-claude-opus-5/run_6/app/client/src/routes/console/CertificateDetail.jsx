import { useState } from 'preact/hooks';
import { api, getUser } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, CarbonFigure, useAsync, formatInt, Refusal,
} from '../../components/common.jsx';

export default function CertificateDetail({ number }) {
  const [version, setVersion] = useState(0);
  const cert = useAsync(() => api.get(`/certificates/${number}`), [number, version]);
  const doc = useAsync(() => api.text(`/certificates/${number}/document`), [number, version]);
  const user = getUser();
  const canWithdraw = (user?.roles || []).includes('certificate_signer');

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <p className="label">Certificate</p>
      <h1 className="t-h3 mono">{number}</h1>

      {cert.loading ? <Loading what="this certificate" /> : null}
      {cert.error ? <Empty>This certificate could not be read.</Empty> : null}

      {cert.data ? (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {cert.data.state === 'withdrawn'
              ? <StateWord icon="warning">Withdrawn</StateWord>
              : <StateWord quiet>{cert.data.state}</StateWord>}
            <StateWord quiet>Version {cert.data.version}</StateWord>
            {cert.data.provisional_factor ? <StateWord icon="flag">Provisional conversion factor</StateWord> : null}
          </div>

          {cert.data.state === 'withdrawn' ? (
            <p className="banner statement" role="note">
              This certificate was withdrawn on {cert.data.withdrawn_on}. Reason: {cert.data.withdrawal_reason}.
            </p>
          ) : null}

          <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h2 className="t-h4">The claim</h2>
              <dl className="dl" style={{ marginTop: '1rem' }}>
                <dt>Claim type</dt><dd>{(cert.data.claim_type || '').replace(/_/g, ' ')}</dd>
                <dt>Recycled content</dt>
                <dd><Content contentBp={cert.data.content_bp} claimType={cert.data.claim_type} /></dd>
                <dt>Grade</dt><dd className="mono">{cert.data.grade}</dd>
                <dt>Specification</dt><dd className="mono">{cert.data.specification_version}</dd>
                <dt>Period</dt><dd className="mono">{cert.data.period}</dd>
                <dt>Scheme</dt><dd className="mono">{cert.data.scheme}</dd>
                <dt>Registration</dt><dd className="mono">{cert.data.registration}</dd>
                <dt>Site</dt><dd className="mono">{cert.data.site}</dd>
                <dt>Recipient</dt><dd>{cert.data.recipient_name}</dd>
                <dt>Signer</dt><dd>{cert.data.signer_name} ({cert.data.signer})</dd>
                <dt>Signed at</dt><dd className="mono">{cert.data.signed_at}</dd>
              </dl>
              <p className="label" style={{ marginTop: '1rem' }}>Lots</p>
              <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.35rem 0 0' }}>
                {(cert.data.lots || []).map((l) => (
                  <li key={l.reference}>
                    <Link href={`/console/lots/${l.reference}`} className="ref">{l.reference}</Link>{' '}
                    <span className="mono">{formatInt(l.mass_g)} g</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card">
              <h2 className="t-h4">Carbon</h2>
              <div style={{ marginTop: '1rem' }}>
                <CarbonFigure carbon={cert.data.carbon} />
                {cert.data.carbon ? (
                  <>
                    <p className="label" style={{ marginTop: '1rem' }}>Energy, both figures</p>
                    <dl className="dl">
                      <dt>Location-based</dt><dd className="mono">{formatInt(cert.data.carbon.energy_location_mg_per_kg)} mg/kg</dd>
                      <dt>Market-based</dt><dd className="mono">{formatInt(cert.data.carbon.energy_market_mg_per_kg)} mg/kg</dd>
                      <dt>Primary data share</dt><dd className="mono">{cert.data.primary_share_bp} bp</dd>
                    </dl>
                    <p className="label" style={{ marginTop: '1rem' }}>Breakdown, attached</p>
                    <div className="table-scroll" style={{ marginTop: '0.5rem' }}>
                      <table>
                        <thead><tr><th scope="col">Line</th><th scope="col" className="num">mg/kg</th><th scope="col">Tag</th></tr></thead>
                        <tbody>
                          {(cert.data.carbon.breakdown_attached || []).map((b) => (
                            <tr key={b.line}>
                              <td>{b.line.replace(/_/g, ' ')}</td>
                              <td className="num">{formatInt(b.mg_per_kg)}</td>
                              <td>{b.tag}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <section className="section">
            <h2 className="t-h4">What the recipient may and may not say</h2>
            <div className="grid grid-2" style={{ marginTop: '1rem' }}>
              <div className="card-quiet">
                <p className="label">Permitted</p>
                <p className="statement permitted-statement" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  {cert.data.permitted_statement}
                </p>
              </div>
              <div className="card-quiet">
                <p className="label">Prohibited</p>
                <p className="statement" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                  {cert.data.prohibited_statement}
                </p>
              </div>
            </div>
          </section>

          {/* the internal view carries the deviations and overrides */}
          {(cert.data.deviations || []).length || (cert.data.overrides || []).length ? (
            <section className="section">
              <h2 className="t-h4">Deviations and overrides on these lots</h2>
              <ul className="t-small" style={{ paddingLeft: '1.1rem', marginTop: '0.75rem' }}>
                {(cert.data.deviations || []).map((d) => (
                  <li key={d.reference}>
                    <span className="mono">{d.reference}</span>: {d.state}
                    {d.outcome ? `, ${d.outcome.replace(/_/g, ' ')}` : ''}. {d.detail}
                  </li>
                ))}
                {(cert.data.overrides || []).map((o) => (
                  <li key={o.reference}>
                    <span className="mono">{o.reference}</span>: {o.separation.replace(/_/g, ' ')},{' '}
                    authorised by {o.authorised_by}, {o.reviewed ? 'reviewed' : 'unreviewed'}.
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="section">
            <h2 className="t-h4">The document</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              This is the document at its permanent address. Two reads of the same version return
              identical bytes.{' '}
              <a href={`/api/certificates/${number}/document`} className="t-small">Open the plain text</a>.
            </p>
            {doc.loading ? <Loading what="the document" /> : null}
            {doc.data ? <pre className="document-body">{doc.data}</pre> : null}
          </section>

          <section className="section">
            <h2 className="t-h4">Replay</h2>
            <p className="t-small" style={{ marginTop: '0.5rem' }}>
              Recompute this certificate's figures from the versioned inputs recorded against it.
            </p>
            <Link href={`/console/certificates/${number}/replay`} className="button" style={{ marginTop: '0.75rem' }}>
              Replay this certificate
            </Link>
          </section>

          {canWithdraw && cert.data.state !== 'withdrawn' ? (
            <Withdraw number={number} onDone={() => setVersion((v) => v + 1)} />
          ) : null}

          <p className="t-small" style={{ color: 'var(--muted)', marginTop: '2rem' }}>
            Verify this certificate at ravel.example.com/verify/{number}.{' '}
            <a href={`/verify/${number}`}>Open the public verification answer</a>.
          </p>
        </>
      ) : null}
    </div>
  );
}

// Withdrawal shows its blast radius before confirming.
function Withdraw({ number, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useAsync(
    () => (open ? api.get(`/certificates/${number}/withdrawal-preview`) : Promise.resolve(null)),
    [open, number]
  );

  async function confirm(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.post(`/certificates/${number}/withdraw`, { reason });
      setDone(res);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="section">
        <div className="banner" role="status">
          <div className="banner-title">Withdrawn</div>
          <p className="t-small">{done.withdrawal_statement}</p>
          <p className="t-small">
            {done.notified_recipients.length} recipient
            {done.notified_recipients.length === 1 ? '' : 's'} notified:{' '}
            {done.notified_recipients.map((r) => r.name).join(', ')}.
          </p>
          <p className="t-small" style={{ marginBottom: 0 }}>
            The certificate address still resolves and states the withdrawal. A withdrawal is never a
            deletion.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <h2 className="t-h4">Withdraw this certificate</h2>
      {!open ? (
        <button type="button" className="button" onClick={() => setOpen(true)} style={{ marginTop: '0.75rem' }}>
          Begin a withdrawal
        </button>
      ) : null}

      {open ? (
        <>
          <p className="t-small" style={{ marginTop: '0.75rem' }}>
            A withdrawal is one action with five consequences. Read them, and the lists below, before
            confirming.
          </p>
          {preview.loading ? <Loading what="the blast radius" /> : null}
          {preview.data ? (
            <>
              <ol className="t-small" style={{ paddingLeft: '1.2rem', marginTop: '1rem' }}>
                {preview.data.consequences.map((c) => <li key={c}>{c}</li>)}
              </ol>

              <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
                <div className="card-quiet">
                  {/* recipients by name, not a count */}
                  <p className="label">Recipients who will be notified</p>
                  {preview.data.notified_recipients.length === 0 ? (
                    <p className="t-small" style={{ marginBottom: 0 }}>No recipient is recorded against this certificate.</p>
                  ) : (
                    <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                      {preview.data.notified_recipients.map((r) => (
                        <li key={r.reference}>
                          <strong>{r.name}</strong> at <span className="mono">{r.address}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="card-quiet">
                  {/* the statements that become void, not a count of them */}
                  <p className="label">Statements the recipient must stop making</p>
                  <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                    {preview.data.void_statements.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              </div>

              <div className="grid grid-2" style={{ marginTop: '1rem' }}>
                <div className="card-quiet">
                  <p className="label">Certificates derived from this one</p>
                  {preview.data.derived_certificates.length === 0 ? (
                    <p className="t-small" style={{ marginBottom: 0 }}>No certificate is derived from this one.</p>
                  ) : (
                    <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                      {preview.data.derived_certificates.map((d) => (
                        <li key={d.number}><span className="mono">{d.number}</span>: {d.state}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="card-quiet">
                  <p className="label">The reverse traversal of the underlying batches</p>
                  {preview.data.batch_traversal.length === 0 ? (
                    <p className="t-small" style={{ marginBottom: 0 }}>No batch traversal is recorded.</p>
                  ) : (
                    <ul className="t-small" style={{ paddingLeft: '1.1rem', margin: '0.5rem 0 0' }}>
                      {preview.data.batch_traversal.map((t) => (
                        <li key={t.batch}>
                          <span className="mono">{t.batch}</span> reaches {t.lots.length} lot
                          {t.lots.length === 1 ? '' : 's'} and {t.certificates.length} other certificate
                          {t.certificates.length === 1 ? '' : 's'}
                          {t.certificates.length ? `: ${t.certificates.map((c) => c.number).join(', ')}` : ''}.
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : null}

          <Refusal error={error} title="The withdrawal was refused" />

          <form onSubmit={confirm} style={{ marginTop: '1.5rem', maxWidth: '36rem' }}>
            <label htmlFor="wd-reason" className="label">
              Reason for withdrawal (the only free text on a certificate)
            </label>
            <textarea
              id="wd-reason"
              rows="3"
              value={reason}
              onInput={(e) => setReason(e.currentTarget.value)}
              required
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="submit" className="button button-primary" disabled={busy || !reason}>
                {busy ? 'Withdrawing…' : 'Confirm the withdrawal'}
              </button>
              <button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
