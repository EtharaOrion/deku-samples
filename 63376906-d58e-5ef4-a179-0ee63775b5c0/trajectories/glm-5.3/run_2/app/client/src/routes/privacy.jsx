import { h } from "preact";
import { Reveal, DocMeta } from "../api.jsx";

const rows = [
  ["An enquiry", "24"],
  ["A waste-supply enquiry", "36"],
  ["A polymer enquiry", "36"],
  ["A press enquiry", "12"],
  ["An account and its acts", "120"],
  ["The record", "180"],
];

export default function Privacy() {
  return (
    <div>
      <DocMeta
        title="Privacy — Ravel Materials SAS"
        description="Who receives your data, what it is used for, how long it is kept, and how to have it removed."
      />
      <section class="container narrow">
        <p class="eyebrow">Privacy</p>
        <Reveal as="h1">Privacy</Reveal>
        <p class="body-big">
          Ravel Materials SAS is the controller. Postal address: 14 rue des Façonniers,
          69007 Lyon, France.
        </p>
        <p class="body-regular">
          The address for a rights request is <span class="mono ref">privacy@example.com</span>.
          The disclosure address is <span class="mono ref">security@example.com</span>.
        </p>

        <section class="section">
          <h2>Retention, stated in months for every purpose</h2>
          <div class="tablewrap">
            <table>
              <thead><tr><th>Purpose</th><th class="figure">Retention (months)</th></tr></thead>
              <tbody>
                {rows.map(([p, m]) => (
                  <tr key={p}><td>{p}</td><td class="figure mono">{m}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h2>The operational record is not erased on request</h2>
          <p class="body-regular">
            The operational record names individuals. It is retained under a legal and a
            scheme obligation, for the periods stated above, and it is not erased on
            request. A former employee's contact detail, by contrast, is erased: it is held
            only for as long as the account is live.
          </p>
          <p class="body-regular">
            A person inside the record is referenced by an identifier. The identifier
            resolves to a name through a separate store with its own retention, which is
            shorter than the record's.
          </p>
        </section>

        <section class="section">
          <h2>What an enquiry opens</h2>
          <p class="body-regular">
            A waste-supply enquiry opens a collector record. A polymer enquiry opens a
            conformance record. A press enquiry carries a deadline. Each states who receives
            the data, what it is used for, how long it is kept and how to have it removed —
            at the point of collection, on this page.
          </p>
        </section>
      </section>
    </div>
  );
}
