import { h } from "preact";
import { Link } from "../../api.jsx";
import { useApi, api, Loading, Empty, Banner, fmtG, fmtBP, fmtMg, dateOnly, Words } from "../../api.jsx";
import { useState } from "preact/hooks";
import { ConsoleFrame } from "../console.jsx";

function CertificateList() {
  const certs = useApi("/certificates");
  return (
    <ConsoleFrame title="Certificates" description="Issued certificates, their state and their recipients." path="/console/certificates">
      {certs.loading ? <Loading /> : certs.data?.length ? (
        <div class="tablewrap">
          <table>
            <thead>
              <tr><th>Number</th><th>State</th><th>Site</th><th>Lot</th><th>Recipient</th><th class="figure">Content</th><th>Claim type</th><th>Signed</th><th>Factor</th></tr>
            </thead>
            <tbody>
              {certs.data.map((c) => (
                <tr key={c.number}>
                  <td><Link class="mono ref" href={`/console/certificates/${c.number}`}>{c.number}</Link></td>
                  <td class="grotesk">{c.state === "withdrawn" ? <Words>withdrawn</Words> : "issued"}</td>
                  <td class="mono ref">{c.site}</td>
                  <td class="mono ref">{c.lot}</td>
                  <td>{c.recipient_name}</td>
                  <td class="figure mono">{fmtBP(c.content_bp)} <span class="grotesk">({c.claim_type})</span></td>
                  <td class="grotesk">{c.claim_type}</td>
                  <td class="mono ref">{dateOnly(c.signed_at)}</td>
                  <td class="grotesk">{c.provisional_factor ? <Words>provisional factor</Words> : "derived"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No certificates have been issued. The first one signed at a site takes the first number in that site's sequence.</Empty>}
      <p class="body-regular" style="margin-top:1.4rem">
        <Link class="btn" href="/console/certificates/new/lot">Begin a certificate</Link>
      </p>
    </ConsoleFrame>
  );
}

function CertificateDetail({ number }) {
  const cert = useApi(`/certificates/${number}`, [number]);
  const doc = useApi(`/certificates/${number}/document`, [number]);
  const replay = useApi(`/certificates/${number}/replay`, [number]);
  const [withdraw, setWithdraw] = useState({ open: false, reason: "" });
  const [wresult, setWresult] = useState(null);
  const [werror, setWerror] = useState(null);

  if (cert.loading) return <ConsoleFrame title="Certificate" description="Certificate detail." path="/console/certificates"><Loading /></ConsoleFrame>;
  if (!cert.data) return <ConsoleFrame title="Certificate" description="Certificate detail." path="/console/certificates"><Empty>There is no such certificate.</Empty></ConsoleFrame>;
  const c = cert.data;

  const doWithdraw = async (e) => {
    e.preventDefault();
    setWerror(null);
    try {
      const res = await api(`/certificates/${number}/withdraw`, { method: "POST", body: { reason: withdraw.reason } });
      setWresult(res);
      setWithdraw({ open: false, reason: "" });
      cert.reload?.();
    } catch (err) {
      setWerror(err);
    }
  };

  return (
    <ConsoleFrame title={c.number} description="One certificate and the conditions it was signed against." path="/console/certificates">
      {c.state === "withdrawn" && (
        <Banner refusal>
          <Words>withdrawn</Words> — This certificate was withdrawn on {dateOnly(c.withdrawn_on)}.
          Reason: {c.withdrawn_reason}. The document stays readable at its address.
        </Banner>
      )}
      <p class="body-big">
        {fmtBP(c.content_bp)} on a {c.claim_type} basis · scheme {c.scheme} · registration{" "}
        <span class="mono ref">{c.registration}</span>
        {c.provisional_factor && <> · <Words>provisional factor</Words></>}
      </p>

      <section class="section">
        <h2>The eight conditions as they stood at signing</h2>
        <div class="conditions">
          {(c.conditions || []).map((cond) => (
            <div class="condition" key={cond.condition}>
              <span class="grotesk">{cond.satisfied ? "satisfied" : <Words>unsatisfied</Words>}</span>
              <span class="mono ref">{cond.condition}</span>
              <span class="body-small">{cond.blocking_reference ? `blocked by ${cond.blocking_reference}` : ""}</span>
            </div>
          ))}
        </div>
        <p class="body-small">
          The eight are stored as they stood at the moment of signing and are never
          recomputed on read.
        </p>
      </section>

      <section class="section">
        <h2>Carbon</h2>
        {c.carbon ? (
          <div>
            <p class="body-big">
              <span class="mono figure">{fmtMg(c.carbon.value_mg_per_kg)}</span>
            </p>
            <p class="body-regular">
              Boundary <span class="grotesk">{c.carbon.boundary}</span> · method version{" "}
              <span class="mono ref">{c.carbon.method_version}</span> · uncertainty{" "}
              <span class="mono figure">{c.carbon.uncertainty_bp} bp</span> · primary share{" "}
              <span class="mono figure">{c.primary_share_bp} bp</span>
            </p>
            <p class="body-small grotesk">
              Lower than the comparator {c.carbon.comparator?.dataset}{" "}
              {c.carbon.comparator?.dataset_year} {c.carbon.comparator?.material} by name.
            </p>
          </div>
        ) : <Empty>No carbon figure is attached to this certificate.</Empty>}
      </section>

      <section class="section">
        <h2>Statements the recipient may and may not make</h2>
        <div class="stack">
          <div class="card"><h4>Permitted</h4><p class="body-regular">{c.permitted_statement}</p></div>
          <div class="card"><h4>Prohibited</h4><p class="body-regular">{c.prohibited_statement}</p></div>
        </div>
      </section>

      <section class="section">
        <h2>Replay</h2>
        {replay.loading ? <Loading /> : replay.data ? (
          <div class="stack">
            <div class="balance-figures">
              <div class="figure-row"><span class="grotesk">Issued content</span><span class="figure mono">{fmtBP(replay.data.issued.content_bp)}</span></div>
              <div class="figure-row"><span class="grotesk">Recomputed content</span><span class="figure mono">{fmtBP(replay.data.recomputed.content_bp)}</span></div>
              <div class="figure-row"><span class="grotesk">Agrees</span><span class="figure mono">{String(replay.data.agrees)}</span></div>
              <div class="figure-row"><span class="grotesk">Reproducible</span><span class="figure mono">{String(replay.data.reproducible)}</span></div>
            </div>
            {replay.data.differing_input && (
              <Banner>
                The input that differs is <span class="mono ref">{replay.data.differing_input.input}</span>:
                issued {replay.data.differing_input.issued_value}, recomputed{" "}
                {replay.data.differing_input.recomputed_value}.
              </Banner>
            )}
            {!replay.data.reproducible && (
              <Banner refusal>Unreproducible: {replay.data.reason}.</Banner>
            )}
            <p class="body-small grotesk">Input versions: {JSON.stringify(replay.data.input_versions)}</p>
          </div>
        ) : <Empty>No replay is available.</Empty>}
      </section>

      <section class="section">
        <h2>The document</h2>
        {doc.loading ? <Loading /> : doc.data != null ? (
          <div>
            <pre class="document">{typeof doc.data === "string" ? doc.data : JSON.stringify(doc.data)}</pre>
            <p class="body-small">
              An issued document is byte-stable: two reads of the same version return
              identical bytes. Verify this certificate at{" "}
              <span class="mono ref">ravel.example.com/verify/{c.number}</span>.
            </p>
          </div>
        ) : <Empty>The document is not available.</Empty>}
      </section>

      {c.state !== "withdrawn" && (
        <section class="section no-print">
          <h2>Withdraw</h2>
          {!withdraw.open ? (
            <div>
              <p class="body-regular">Withdrawal is one action with five consequences.</p>
              <button onClick={() => setWithdraw({ ...withdraw, open: true })}>Begin a withdrawal</button>
            </div>
          ) : (
            <form class="card" onSubmit={doWithdraw}>
              <h3>Before you confirm, this is the blast radius</h3>
              <p class="body-regular">Recipients who will be notified, by name:</p>
              <ul class="body-regular">
                <li>{c.recipient_name} ({c.recipient}, {c.recipient_name})</li>
              </ul>
              <p class="body-regular">Downstream statements the recipient is now obliged to stop making:</p>
              <ul class="body-regular">
                <li>{c.permitted_statement}</li>
                <li>{c.prohibited_statement}</li>
                <li>That the material described in certificate {c.number} carries {fmtBP(c.content_bp)} recycled content on a {c.claim_type} basis.</li>
              </ul>
              <p class="body-regular">Every certificate derived from this one will be identified and resolved, and the reverse traversal of the underlying batches runs so that every other certificate touching them is enumerated in the same action.</p>
              {werror && <Banner refusal>Withdrawal failed: {String(werror.body?.error || werror.message)}.</Banner>}
              {wresult && <Banner>Withdrawn. The certificate address still resolves and states the withdrawal.</Banner>}
              <div class="field">
                <label for="wreason">Reason — the only free text on a certificate</label>
                <textarea id="wreason" rows="3" required value={withdraw.reason} onInput={(e) => setWithdraw({ ...withdraw, reason: e.target.value })}></textarea>
              </div>
              <button class="primary" type="submit">Confirm withdrawal</button>{" "}
              <button type="button" onClick={() => setWithdraw({ ...withdraw, open: false })}>Cancel</button>
            </form>
          )}
        </section>
      )}
    </ConsoleFrame>
  );
}

export default function Certificates({ rest }) {
  const parts = (rest || "").split("/").filter(Boolean);
  if (parts[0] === "new") {
    const Wizard = require_wizard();
    return <Wizard step={parts[1] || "lot"} />;
  }
  if (parts[0]) return <CertificateDetail number={parts[0]} />;
  return <CertificateList />;
}

import Wizard from "./wizard.jsx";
const require_wizard = () => Wizard;
