import { h } from "preact";
import { useApi, DocMeta, NoIndex, Loading, Words, fmtBP } from "../api.jsx";

// The verification answer excludes yield, collector, genealogy and carbon
// breakdown. It states a withdrawal plainly and offers no forwarding.
export default function Verify({ number }) {
  const v = useApi(`/verify/${number}`, [number]);
  return (
    <div class="container narrow">
      <DocMeta title={`Verify ${number} — Ravel`} description="Public verification of a Ravel recycled-polymer certificate." />
      <NoIndex />
      <p class="eyebrow">Certificate verification</p>
      <h1>{number}</h1>
      {v.loading ? <Loading /> : !v.data ? (
        <p class="body-big">The verification service could not answer. Try again shortly.</p>
      ) : v.data.found === false ? (
        <section>
          <p class="body-big">There is no such certificate.</p>
          <p class="body-regular">
            No certificate with the number <span class="mono ref">{v.data.number}</span> has
            been issued by Ravel. If you were given this number, ask the sender to confirm
            it before relying on it.
          </p>
        </section>
      ) : (
        <section class="stack">
          {v.data.state === "withdrawn" && (
            <p class="body-big">
              <Words>withdrawn</Words>
            </p>
          )}
          {v.data.state === "withdrawn" ? (
            <p class="body-big">
              This certificate was withdrawn on {v.data.withdrawn_on}. Reason: {v.data.withdrawal_reason}.
            </p>
          ) : (
            <p class="body-big">
              <Words>issued</Words>
            </p>
          )}
          <div class="tablewrap">
            <table>
              <tbody>
                <tr><th>Number</th><td class="mono ref">{v.data.number}</td></tr>
                <tr><th>State</th><td class="grotesk">{v.data.state}</td></tr>
                <tr><th>Issued on</th><td class="mono ref">{v.data.issued_on}</td></tr>
                {v.data.state === "withdrawn" && (
                  <tr><th>Withdrawn on</th><td class="mono ref">{v.data.withdrawn_on}</td></tr>
                )}
                {v.data.state === "withdrawn" && (
                  <tr><th>Reason</th><td>{v.data.withdrawal_reason}</td></tr>
                )}
                <tr><th>Site</th><td>{v.data.site}</td></tr>
                <tr><th>Grade</th><td>{v.data.grade}</td></tr>
                <tr><th>Claim type</th><td class="grotesk">{v.data.claim_type}</td></tr>
                <tr><th>Recycled content</th><td class="figure mono">{fmtBP(v.data.content_bp)} <span class="grotesk">({v.data.claim_type})</span></td></tr>
                <tr><th>Recipient</th><td>{v.data.recipient_name}</td></tr>
              </tbody>
            </table>
          </div>
          <p class="body-regular">
            A mass-balance certificate states that the material may not be described as
            physically containing recycled content.
          </p>
        </section>
      )}
    </div>
  );
}
