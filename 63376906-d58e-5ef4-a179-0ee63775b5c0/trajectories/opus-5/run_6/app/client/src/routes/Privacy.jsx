import { Reveal, Loading, Empty, useAsync } from '../components/common.jsx';

export default function Privacy() {
  const policy = useAsync(() => fetch('/api/privacy').then((r) => (r.ok ? r.json() : null)), []);
  return (
    <section className="page-narrow section" style={{ paddingTop: '4rem' }}>
      <Reveal as="h1">Privacy</Reveal>
      {policy.loading ? <Loading what="the privacy policy" /> : null}
      {policy.error || !policy.data ? <Empty>The privacy policy could not be read.</Empty> : null}
      {policy.data ? (
        <div className="stack-l" style={{ marginTop: '2rem' }}>
          <div>
            <h2 className="t-h4">Who controls this data</h2>
            <p>
              The controller is <strong>{policy.data.controller}</strong>, at {policy.data.postal_address}.
              This site is operated by Ravel.
            </p>
            <p>
              To exercise a right of access, correction, erasure, restriction, portability or
              objection, write to <span className="mono">{policy.data.rights_address}</span>. To report
              a security issue, write to <span className="mono">{policy.data.disclosure_address}</span>.
            </p>
          </div>

          <div>
            <h2 className="t-h4">How long each thing is kept</h2>
            <p>Every purpose has a stated retention in months.</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th scope="col">Purpose</th><th scope="col" className="num">Retention</th></tr>
                </thead>
                <tbody>
                  {policy.data.retention.map((r) => (
                    <tr key={r.purpose}>
                      <th scope="row" style={{ color: 'var(--ink)', textTransform: 'none', fontFamily: 'var(--font-serif)', letterSpacing: 0, fontSize: 'var(--step-body-small-size)' }}>
                        {r.purpose}
                      </th>
                      <td className="num">{r.months} months</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="t-h4">The operational record</h2>
            <p className="statement">{policy.data.operational_record_statement}</p>
            <p>
              In plain terms: the record of who booked in a batch, who released a lot and who signed a
              certificate names individuals by an identifier, and that identifier resolves to a name
              through a separate store with its own retention. We are required to keep that record
              under both a legal obligation and the requirements of our certification scheme, so we
              cannot erase it on request. A former employee's contact details are a different matter,
              and those we do erase on request.
            </p>
          </div>

          <div>
            <h2 className="t-h4">What we do not do</h2>
            <p>
              We take no payment and store no card details. We store no files in an object store. We
              send mail for exactly four acts: a certificate is signed, a certificate is withdrawn, a
              change notice needs acknowledgement, and an enquiry is received. Nothing else on this
              site or in our console sends you mail.
            </p>
          </div>

          <div>
            <h2 className="t-h4">Verification</h2>
            <p>
              The public verification route answers only whether a certificate exists, its state, its
              dates, its site, its grade, its claim type and its recipient's name. It returns no
              genealogy, no collector, no yield and no carbon breakdown, and it is excluded from
              search indexing, because a certificate's recipient is a customer relationship.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
