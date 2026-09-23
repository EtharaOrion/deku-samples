/**
 * The certificate register, and the restatements open against a period. A
 * withdrawn certificate says withdrawn before it shows any figure.
 */

import type { JSX } from 'preact';
import { RecycledContent } from '../../components/figures';
import { Empty, Loading } from '../../components/status';
import { words } from '../../format';
import type { Identity } from '../../routes';
import { holdsRole, useFetch } from './hooks';
import type { CertificateView, RestatementView } from './artefacts';

function Register(): JSX.Element {
  const certificates = useFetch<CertificateView[]>('/certificates');
  if (certificates.loading) return <Loading what="the certificate register" />;
  if (certificates.error) {
    return <Empty sentence={`The certificate register could not be read: ${certificates.error}.`} />;
  }
  const rows = certificates.data ?? [];
  if (rows.length === 0) return <Empty sentence="No certificates have been issued." />;
  return (
    <div class="scroller">
      <table>
        <caption>Every certificate signed at any site, in the order the sequence issued them.</caption>
        <thead>
          <tr>
            <th scope="col">Number</th>
            <th scope="col">State</th>
            <th scope="col">Site</th>
            <th scope="col">Lots</th>
            <th scope="col">Claim</th>
            <th scope="col">Signer</th>
            <th scope="col">Signed at</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((certificate) => (
            <tr key={certificate.number}>
              <td class="mono">
                <a href={`/console/certificates/${certificate.number}`}>{certificate.number}</a>
              </td>
              <td>{words(certificate.state)}</td>
              <td class="mono">{certificate.site}</td>
              <td class="mono">{certificate.lots.map((lot) => lot.reference).join(', ')}</td>
              <td>
                <RecycledContent
                  content_bp={certificate.content_bp}
                  claim_type={certificate.claim_type}
                  scheme={certificate.scheme}
                />
              </td>
              <td>{certificate.signer}</td>
              <td class="mono">{certificate.signed_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Restatements(): JSX.Element {
  const restatements = useFetch<RestatementView[]>('/restatements');
  if (restatements.loading) return <Loading what="the restatements" />;
  if (restatements.error) {
    return <Empty sentence={`The restatements could not be read: ${restatements.error}.`} />;
  }
  const rows = (restatements.data ?? []).filter((restatement) => restatement.state === 'open');
  if (rows.length === 0) return <Empty sentence="No restatements are open." />;
  return (
    <div class="scroller">
      <table>
        <caption>Each restatement enumerates the certificates issued from its period.</caption>
        <thead>
          <tr>
            <th scope="col">Reference</th>
            <th scope="col">Period</th>
            <th scope="col">State</th>
            <th scope="col">Reason</th>
            <th scope="col">Certificates enumerated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((restatement) => (
            <tr key={restatement.reference}>
              <td class="mono">{restatement.reference}</td>
              <td class="mono">
                <a href={`/console/balance/${restatement.period}`}>{restatement.period}</a>
              </td>
              <td>{words(restatement.state)}</td>
              <td>{restatement.reason}</td>
              <td class="mono">
                {restatement.certificates.length === 0 ? 'none' : restatement.certificates.join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CertificatesScreen({ identity }: { identity: Identity | null }): JSX.Element {
  const maySign = holdsRole(identity, 'certificate_signer');
  return (
    <section class="section">
      <span class="eyebrow">Console</span>
      <h1 class="console-title">Certificates</h1>
      <p>
        A certificate is the unit of value: a document a customer files with their own regulator,
        readable without this system and resolving at its address for as long as it exists. Every
        field on it is derived, and the only free text it carries is a withdrawal reason.
      </p>
      {maySign ? (
        <p>
          <a href="/console/certificates/new/lot">Issue a certificate</a>
        </p>
      ) : (
        <p>Signing a certificate requires the certificate signer role.</p>
      )}

      <h2 class="console-heading">Register</h2>
      <Register />

      <h2 class="console-heading">Restatements</h2>
      <Restatements />
    </section>
  );
}
