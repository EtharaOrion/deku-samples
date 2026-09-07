import { Loading, StateWord, useAsync } from '../components/common.jsx';

// Public, with no session. The same layout answers a known and an unknown number.
export default function Verify({ number }) {
  const result = useAsync(
    () => fetch(`/api/verify/${encodeURIComponent(number)}`).then((r) => r.json()),
    [number]
  );

  return (
    <section className="page-narrow section" style={{ paddingTop: '4rem' }}>
      <p className="label">Certificate verification</p>
      <h1 className="t-h3 mono" style={{ marginTop: '0.5rem', wordBreak: 'break-all' }}>{number}</h1>

      {result.loading ? <Loading what="this certificate" /> : null}

      {result.data && result.data.found === false ? (
        <div className="card" style={{ marginTop: '2rem' }}>
          <StateWord>No such certificate</StateWord>
          <p style={{ marginTop: '1rem' }}>
            There is no certificate with the number <span className="mono">{number}</span> in this
            register.
          </p>
          <dl className="dl" style={{ marginTop: '1.5rem' }}>
            <dt>Number</dt><dd className="mono">{number}</dd>
            <dt>State</dt><dd>—</dd>
            <dt>Issued on</dt><dd>—</dd>
            <dt>Withdrawn on</dt><dd>—</dd>
            <dt>Site</dt><dd>—</dd>
            <dt>Grade</dt><dd>—</dd>
            <dt>Claim type</dt><dd>—</dd>
            <dt>Recipient</dt><dd>—</dd>
          </dl>
          <p className="t-small" style={{ marginTop: '1.5rem', marginBottom: 0, color: 'var(--muted)' }}>
            Check the number against the document you were given. This route answers for one number at
            a time and cannot be used to list certificates.
          </p>
        </div>
      ) : null}

      {result.data && result.data.found ? (
        <div className="card" style={{ marginTop: '2rem' }}>
          {/* a withdrawn certificate says withdrawn before it shows any figure */}
          {result.data.state === 'withdrawn' ? (
            <>
              <StateWord>Withdrawn</StateWord>
              <p className="t-body-big statement" style={{ marginTop: '1rem' }}>
                This certificate was withdrawn on {result.data.withdrawn_on}.
                Reason: {result.data.withdrawal_reason}.
              </p>
              <p className="t-small">
                A withdrawal is a fact about this document and is never a deletion. This address will
                continue to resolve and to state the withdrawal. There is no replacement to forward
                you to: if the material was recertified, that is a different certificate with its own
                number, which the holder must give you.
              </p>
            </>
          ) : (
            <StateWord quiet>{result.data.state}</StateWord>
          )}

          <dl className="dl" style={{ marginTop: '1.5rem' }}>
            <dt>Number</dt><dd className="mono">{result.data.number}</dd>
            <dt>State</dt><dd>{result.data.state}</dd>
            <dt>Issued on</dt><dd className="mono">{result.data.issued_on || '—'}</dd>
            <dt>Withdrawn on</dt><dd className="mono">{result.data.withdrawn_on || '—'}</dd>
            <dt>Withdrawal reason</dt><dd>{result.data.withdrawal_reason || '—'}</dd>
            <dt>Site</dt><dd className="mono">{result.data.site}</dd>
            <dt>Grade</dt><dd className="mono">{result.data.grade}</dd>
            <dt>Claim type</dt><dd>{(result.data.claim_type || '').replace(/_/g, ' ')}</dd>
            <dt>Recipient</dt><dd>{result.data.recipient_name}</dd>
          </dl>

          <p className="t-small" style={{ marginTop: '1.5rem', marginBottom: 0, color: 'var(--muted)' }}>
            This answer carries no yield figure, no collector, no genealogy and no carbon breakdown.
            Those belong to the record and to the holder of the certificate, not to this route.
          </p>
        </div>
      ) : null}
    </section>
  );
}
