import { h } from "preact";
import { Link } from "../../api.jsx";
import { useApi, api, Loading, Empty, Banner, fmtG, fmtBP, fmtMg, dateOnly, Words } from "../../api.jsx";
import { useState } from "preact/hooks";
import { ConsoleFrame } from "../console.jsx";

const stepPaths = {
  lot: "/console/certificates/new/lot",
  claim: "/console/certificates/new/claim",
  recipient: "/console/certificates/new/recipient",
  review: "/console/certificates/new/review",
};

function ConditionRow({ cond }) {
  return (
    <div class="condition">
      <span class="grotesk">{cond.satisfied ? "satisfied" : <Words>unsatisfied</Words>}</span>
      <span class="mono ref">{cond.condition}</span>
      <span class="body-regular">
        {cond.satisfied ? "" : `blocked by ${cond.blocking_reference || "the record"}`}
        {!cond.satisfied && cond.blocking_reference && (
          <> — <Link href={`/console/record/lots/${cond.blocking_reference}`}>open the record that would resolve it</Link></>
        )}
      </span>
    </div>
  );
}

export default function Wizard({ step }) {
  const lots = useApi("/lots");
  const [choice, setChoice] = useState({ lot: "", recipient: "CUS-HELIOS" });
  const lot = choice.lot || lots.data?.find((l) => l.disposition === "released")?.reference;
  const preview = useApi(
    lot ? null : null,
    []
  );
  const [pv, setPv] = useState(null);
  const [pvError, setPvError] = useState(null);
  const [password, setPassword] = useState("");
  const [signResult, setSignResult] = useState(null);
  const [signError, setSignError] = useState(null);

  const loadPreview = async (lotRef, recipient) => {
    setPvError(null); setPv(null);
    try {
      const res = await api("/certificates/preview", { method: "POST", body: { lot: lotRef, recipient } });
      setPv(res);
    } catch (err) {
      setPvError(err);
    }
  };

  const lotData = (lots.data || []).find((l) => l.reference === lot);
  const recipient = choice.recipient;

  const sign = async (e) => {
    e.preventDefault();
    setSignError(null);
    try {
      const res = await api("/certificates", {
        method: "POST",
        body: { lot, recipient, password },
      });
      setSignResult(res);
    } catch (err) {
      setSignError(err);
    }
  };

  return (
    <ConsoleFrame title="Sign a certificate" description="Four steps, four addresses, eight conditions each." path="/console/certificates/new">
      <nav class="topnav" aria-label="Wizard steps">
        <Link href={stepPaths.lot} aria-current={step === "lot" ? "page" : null}>1 Lot</Link>
        <Link href={stepPaths.claim} aria-current={step === "claim" ? "page" : null}>2 Claim</Link>
        <Link href={stepPaths.recipient} aria-current={step === "recipient" ? "page" : null}>3 Recipient</Link>
        <Link href={stepPaths.review} aria-current={step === "review" ? "page" : null}>4 Review</Link>
      </nav>

      <section class="section">
        <h2>The eight conditions</h2>
        <p class="body-small">
          The eight are re-checked on the server at the moment of signing. None is waivable
          and no control on this screen dismisses one.
        </p>
        <div class="conditions">
          {(pv?.conditions || []).map((c) => <ConditionRow cond={c} />)}
        </div>
        {pvError && <Banner refusal>The preview failed: {String(pvError.body?.error || pvError.message)}.</Banner>}
        {!pv && !pvError && (
          <p class="body-regular">Choose a lot and press “Check the conditions” to see the eight as they stand.</p>
        )}
        {pv && pv.blocking?.length > 0 && (
          <Banner refusal>
            {pv.blocking.length === 1 ? (
              <>One condition is unsatisfied: <span class="mono ref">{pv.blocking[0].condition}</span>, blocked by{" "}
                <span class="mono ref">{pv.blocking[0].blocking_reference}</span>.{" "}
                <Link href={`/console/record/lots/${pv.blocking[0].blocking_reference}`}>Open the record that would resolve it</Link>.</>
            ) : (
              <>{pv.blocking.length} conditions are unsatisfied: {pv.blocking.map((b) => b.condition).join(", ")}.</>
            )}
          </Banner>
        )}
        {pv && pv.all_satisfied && <Banner>All eight conditions hold as they stand.</Banner>}
      </section>

      {step === "lot" && (
        <section class="section">
          <h2>Step 1 — choose the lot</h2>
          <div class="tablewrap">
            <table>
              <thead><tr><th>Lot</th><th>Site</th><th>Disposition</th><th class="figure">Mass</th><th class="figure">Content</th><th></th></tr></thead>
              <tbody>
                {(lots.data || []).map((l) => (
                  <tr key={l.reference}>
                    <td class="mono ref">{l.reference}</td>
                    <td class="mono ref">{l.site}</td>
                    <td class="grotesk"><Words>{l.disposition}</Words></td>
                    <td class="figure mono">{fmtG(l.mass_g)}</td>
                    <td class="figure mono">{fmtBP(l.content_bp)} ({l.claim_type})</td>
                    <td><button onClick={() => setChoice({ ...choice, lot: l.reference })}>Choose</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="body-regular">Chosen: <span class="mono ref">{lot || "none yet"}</span></p>
          <p class="body-regular"><Link class="btn" href={stepPaths.claim}>Continue to the claim</Link></p>
        </section>
      )}

      {step === "claim" && lotData && (
        <section class="section">
          <h2>Step 2 — the claim</h2>
          <div class="balance-figures">
            <div class="figure-row"><span class="grotesk">Claim type</span><span class="figure mono grotesk">{lotData.claim_type}</span></div>
            <div class="figure-row"><span class="grotesk">Content</span><span class="figure mono">{fmtBP(lotData.content_bp)} ({lotData.claim_type})</span></div>
            <div class="figure-row"><span class="grotesk">Credit attached</span><span class="figure mono">{fmtG(lotData.credit_attached_g)}</span></div>
            <div class="figure-row"><span class="grotesk">Derivation</span><span class="figure mono">{lotData.derivation?.content_bp}</span></div>
          </div>
          <p class="body-regular">
            This material is claimed by mass balance. It is not physically segregated.
          </p>
          <p class="body-regular"><Link class="btn" href={stepPaths.recipient}>Continue to the recipient</Link></p>
        </section>
      )}

      {step === "recipient" && (
        <section class="section">
          <h2>Step 3 — the recipient</h2>
          <div class="field">
            <label for="recipient">Recipient</label>
            <select id="recipient" value={choice.recipient} onChange={(e) => setChoice({ ...choice, recipient: e.target.value })}>
              <option value="CUS-HELIOS">Helios Filaments (CUS-HELIOS)</option>
              <option value="CUS-VANTA">Vanta Technical Weaves (CUS-VANTA)</option>
            </select>
          </div>
          <button onClick={() => loadPreview(lot, choice.recipient)}>Check the conditions</button>
          <p class="body-regular"><Link class="btn" href={stepPaths.review}>Continue to the review</Link></p>
        </section>
      )}

      {step === "review" && (
        <section class="section">
          <h2>Step 4 — the exact document that will be signed</h2>
          <div class="card">
            <h4>The document</h4>
            <pre class="document">
{`RAVEL MATERIALS - RECYCLED POLYMER CERTIFICATE

Certificate number: (issued at signing)
Site: ${lotData?.site ?? ""}
Grade: ${lotData?.grade ?? ""}
Scheme: RCS-2026
Producer registration: REG-RAVEL-0042
Recipient: ${choice.recipient}

MATERIAL
Lot: ${lot || ""}
Lot mass: ${lotData ? fmtG(lotData.mass_g) : ""}
Claim type: ${lotData?.claim_type ?? ""}
Recycled content: ${lotData ? fmtBP(lotData.content_bp) : ""}

CARBON FIGURE
(Attached at signing, with its boundary, method version and uncertainty.)

PERMITTED STATEMENT
This material is claimed by mass balance. It is not physically segregated.
You may not state that this material physically contains recycled content.

PROHIBITED STATEMENT
You may not state that this material physically contains recycled content.

Verify this certificate at ravel.example.com/verify/{number}.`}
            </pre>
            <p class="body-regular">
              Signing is a separate, deliberate act. The recipient will file this document
              with their own regulator.
            </p>
            <form onSubmit={sign} class="stack">
              <div class="field">
                <label for="pw">Re-enter your password to sign</label>
                <input id="pw" type="password" required value={password} onInput={(e) => setPassword(e.target.value)} />
              </div>
              {signError && (
                <Banner refusal>
                  Signing was refused: {String(signError.body?.error || signError.message)}.
                  {signError.body?.failed?.length > 0 && (
                    <> The condition that changed is{" "}
                      <span class="mono ref">{signError.body.failed[0].condition}</span>.</>
                  )}
                </Banner>
              )}
              {signResult && (
                <Banner>
                  Certificate <span class="mono ref">{signResult.number}</span> signed and
                  issued. <Link href={`/console/certificates/${signResult.number}`}>Open it</Link>.
                </Banner>
              )}
              <button class="primary" type="submit">Sign the certificate</button>
            </form>
          </div>
        </section>
      )}
    </ConsoleFrame>
  );
}
