import { Reveal, useTitle } from '../ui.jsx';

const RETENTION = [
  ['An enquiry', 24, 'To answer what you asked and to keep a record that we did.'],
  ['A waste-supply enquiry', 36, 'It opens a collector record, which is part of the feedstock chain behind a claim.'],
  ['A polymer enquiry', 36, 'It opens a conformance record against a specification version.'],
  ['A press enquiry', 12, 'To answer inside the deadline and to hold what was said.'],
  ['An account and its acts', 120, 'The scheme requires the acts of a named person to be attributable for ten years.'],
  ['The operational record', 180, 'The scheme and the statute both require it, and an issued figure must stay reproducible.'],
];

export default function Privacy() {
  useTitle('Privacy — What we hold, why, and for how long', 'The controller, the retention in months for every purpose, and the address for a rights request.');

  return (
    <div class="page narrow stack-lg" style="padding-top:3.5rem">
      <Reveal as="section">
        <p class="t-eyebrow">Privacy</p>
        <h1 class="t-h2">What Ravel holds, and for how long</h1>
        <p class="t-big">
          This is the published privacy policy for Ravel. It states plainly who the controller is,
          what each thing is used for, how long it is kept and how to have it removed.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The controller</h2>
        <dl class="def">
          <dt>Controller</dt>
          <dd>Ravel Materials SAS</dd>
          <dt>Postal address</dt>
          <dd>14 rue des Fabriques, 69007 Lyon, France</dd>
          <dt>Rights requests</dt>
          <dd><a href="mailto:privacy@example.com">privacy@example.com</a></dd>
          <dt>Disclosure of a vulnerability</dt>
          <dd><a href="mailto:security@example.com">security@example.com</a></dd>
        </dl>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">Retention, in months, for every purpose</h2>
        <div class="table-scroll">
          <table>
            <caption>Each figure is a number of months from the date the record was made.</caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col" class="num">Months</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map(([what, months, why]) => (
                <tr key={what}>
                  <th scope="row">{what}</th>
                  <td class="num">{months}</td>
                  <td>{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">The operational record names individuals</h2>
        <p>
          The record behind every claim names the person who performed each act: who booked in a
          batch, who entered a test result, who set a disposition, who authorised an override, who
          closed a period and who signed a certificate. That is the point of it. A claim with
          nobody's name on it is not an attestation.
        </p>
        <p>
          <strong>
            The operational record is retained under a legal and scheme obligation and is not
            erased on request.
          </strong>{' '}
          A rights request will not remove an entry from it, because the entry is the evidence
          behind a certificate a customer has filed with their own regulator. A person inside the
          record is referenced by an identifier, and that identifier resolves to a name through a
          separate store with its own retention.
        </p>
        <p>
          A former employee's contact detail <em>is</em> erased on request. The contact store and
          the record are two different things, held for two different reasons, and only one of
          them is under an obligation that outlives the employment.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">What we do not do</h2>
        <p>
          Ravel takes no payment and holds no price, so it stores no payment detail. It stores no
          file in an object store. It sends mail on exactly four acts: a certificate is signed, a
          certificate is withdrawn, a change notice needs acknowledgement, and an enquiry is
          received. Nothing else sends mail, and no mail carries a copy to a second recipient.
        </p>
        <p>
          There is no signup, no password reset and no self-service account creation. Accounts are
          granted, scoped to a site, and carry an end date. Nothing renews silently.
        </p>
      </Reveal>

      <Reveal as="section">
        <h2 class="t-h3">A certificate's recipient</h2>
        <p>
          The public verification route states a certificate's number, state, dates, site, grade,
          claim type and recipient name, and nothing else. It returns no yield, no collector, no
          genealogy and no carbon breakdown, and it is excluded from indexing, because a
          certificate's recipient is a customer relationship rather than a public fact.
        </p>
      </Reveal>
    </div>
  );
}
