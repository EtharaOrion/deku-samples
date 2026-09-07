import { api } from '../api.js';
import { useAsync, Loading, Empty, StateWord, words, ContentFigure, Reveal } from '../ui.jsx';
import SchemeBanner from './SchemeBanner.jsx';

export default function Certificates({ session }) {
  const certs = useAsync(() => api('/certificates'));
  const canSign = (session?.roles || []).includes('certificate_signer');

  return (
    <div class="page">
      <div class="console-head">
        <p class="t-eyebrow">Console · Certificates</p>
        <h1 class="t-h3">Issued certificates</h1>
        <p class="t-big">
          The unit of work is the lot; the unit of value is the certificate. Every one is
          immutable, and a withdrawal is never a deletion.
        </p>
        {canSign ? (
          <p class="row">
            <a class="btn" href="/console/certificates/new/lot">
              Sign a certificate <span class="btn-arrow" aria-hidden="true">→</span>
            </a>
          </p>
        ) : null}
      </div>

      <SchemeBanner />

      {certs.loading ? <Loading what="the certificate register" /> : null}
      {certs.error ? <Empty>The certificate register could not be read.</Empty> : null}
      {certs.data && certs.data.length === 0 ? (
        <Empty>No certificate has been signed. There is nothing in the register yet.</Empty>
      ) : null}

      {certs.data && certs.data.length > 0 ? (
        <Reveal>
          <div class="table-scroll">
            <table>
              <caption>{certs.data.length} certificates. A number is never reused.</caption>
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col" class="num">Version</th>
                  <th scope="col">State</th>
                  <th scope="col">Site</th>
                  <th scope="col">Recipient</th>
                  <th scope="col">Claim</th>
                  <th scope="col">Signed</th>
                </tr>
              </thead>
              <tbody>
                {certs.data.map((c) => (
                  <tr key={c.number}>
                    <th scope="row" class="mono">
                      <a href={`/console/certificates/${c.number}`}>{c.number}</a>
                    </th>
                    <td class="num">{c.version}</td>
                    <td>
                      {/* A withdrawn certificate says withdrawn before any figure. */}
                      <StateWord word={words(c.state)} heavy={c.state === 'withdrawn'} />
                      {c.provisional_factor ? <> <StateWord word="Provisional factor" /></> : null}
                    </td>
                    <td class="mono">{c.site}</td>
                    <td>{c.recipient_name}</td>
                    <td>
                      {c.state === 'withdrawn'
                        ? <span class="t-small">Withdrawn on {c.withdrawn_on}</span>
                        : <ContentFigure content_bp={c.content_bp} claim_type={c.claim_type} compact />}
                    </td>
                    <td class="mono t-small">{(c.signed_at || '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}
