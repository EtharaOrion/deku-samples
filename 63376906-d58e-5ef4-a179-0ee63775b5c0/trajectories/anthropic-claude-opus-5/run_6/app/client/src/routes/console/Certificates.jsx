import { api } from '../../lib/api.js';
import { Link } from '../../lib/router.jsx';
import {
  Loading, Empty, StateWord, Content, useAsync, formatInt,
} from '../../components/common.jsx';

export default function Certificates() {
  const certs = useAsync(() => api.get('/certificates'), []);
  const sites = useAsync(() => api.get('/sites'), []);
  const suspended = (sites.data || []).filter((s) => s.certification_state === 'suspended');

  return (
    <div className="page section" style={{ paddingTop: '2rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h1 className="t-h3">Certificates</h1>
        <span className="spacer" />
        <Link href="/console/certificates/new/lot" className="button button-primary">New certificate</Link>
      </div>

      {/* the scheme status banner, where a site's certification is suspended */}
      {suspended.map((s) => (
        <div className="banner" role="alert" key={s.reference}>
          <div className="banner-title">Certification suspended</div>
          <p className="t-small" style={{ marginBottom: 0 }}>
            Certification for <span className="mono">{s.reference}</span> is suspended. Issuing has
            stopped for this site, and the suspension is the blocking condition. This notice is not
            dismissible.
          </p>
        </div>
      ))}

      {certs.loading ? <Loading what="the certificate register" /> : null}
      {certs.error ? <Empty>The certificate register could not be read.</Empty> : null}
      {certs.data && certs.data.length === 0 ? (
        <Empty>No certificates have been issued.</Empty>
      ) : null}

      {certs.data && certs.data.length ? (
        <div className="stack" style={{ marginTop: '2rem' }}>
          {certs.data.map((c) => (
            <article className="card" key={c.number}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* a withdrawn certificate says withdrawn before it shows any figure */}
                {c.state === 'withdrawn'
                  ? <StateWord icon="warning">Withdrawn</StateWord>
                  : <StateWord quiet>{c.state}</StateWord>}
                <Link href={`/console/certificates/${c.number}`} className="ref t-body">{c.number}</Link>
                <span className="t-small" style={{ color: 'var(--muted)' }}>version {c.version}</span>
              </div>

              {c.state === 'withdrawn' ? (
                <p className="t-small statement" style={{ marginTop: '0.75rem' }}>
                  This certificate was withdrawn on {c.withdrawn_on}. Reason: {c.withdrawal_reason}.
                </p>
              ) : null}

              <dl className="dl" style={{ marginTop: '0.75rem' }}>
                <dt>Site</dt><dd className="mono">{c.site}</dd>
                <dt>Recipient</dt><dd>{c.recipient_name}</dd>
                <dt>Claim</dt><dd><Content contentBp={c.content_bp} claimType={c.claim_type} /></dd>
                <dt>Grade</dt><dd className="mono">{c.grade}</dd>
                <dt>Period</dt><dd className="mono">{c.period}</dd>
                <dt>Signed by</dt><dd>{c.signer}</dd>
                <dt>Signed at</dt><dd className="mono">{String(c.signed_at).slice(0, 10)}</dd>
              </dl>

              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {c.provisional_factor ? (
                  <StateWord icon="flag">Rests on a provisional conversion factor</StateWord>
                ) : null}
                {(c.deviations || []).some((d) => d.state === 'open') ? (
                  <StateWord icon="warning">Open deviation on a lot</StateWord>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
